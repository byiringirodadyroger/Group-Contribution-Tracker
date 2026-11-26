const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const mongoose = require('mongoose');
const multer = require('multer');
const os = require('node:os');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const { authenticate, requireApproved } = require('../middleware/auth');

const router = express.Router();
const pageSize = 50;
const deleteForEveryoneWindowMs = 15 * 60 * 1000;
const maxAttachmentSize = 50 * 1024 * 1024;
const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename(req, file, callback) {
      callback(null, crypto.randomBytes(16).toString('hex'));
    }
  }),
  limits: { fileSize: maxAttachmentSize, files: 1, fields: 1, fieldSize: 8192 }
});
router.use(authenticate, requireApproved);

function handleAttachmentUpload(req, res, next) {
  attachmentUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        error: error.code === 'LIMIT_FILE_SIZE'
          ? 'Attachments must be 50 MB or smaller'
          : 'Invalid attachment upload'
      });
    }
    return next(error);
  });
}

function getAttachmentBucket() {
  if (!mongoose.connection.db) throw new Error('Database connection is unavailable');
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'chatAttachments' });
}

function safeFilename(filename) {
  return path.basename(filename.replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 255) || 'attachment';
}

async function saveAttachment(file) {
  const bucket = getAttachmentBucket();
  const filename = safeFilename(file.originalname);
  const uploadStream = bucket.openUploadStream(filename, {
    metadata: { contentType: file.mimetype || 'application/octet-stream' }
  });
  await pipeline(fs.createReadStream(file.path), uploadStream);
  return {
    fileId: uploadStream.id,
    filename,
    contentType: file.mimetype || 'application/octet-stream',
    size: file.size
  };
}

async function removeTemporaryFile(file) {
  if (!file) return;
  try {
    await fs.promises.unlink(file.path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function deleteGridFsFile(fileId) {
  await getAttachmentBucket().delete(fileId);
}

function getConversationId(userId, recipientId) {
  return `direct:${[userId.toString(), recipientId.toString()].sort().join(':')}`;
}

function messageView(message) {
  const sender = message.senderId;
  return {
    id: message._id.toString(),
    conversationId: message.conversationId,
    sender: {
      id: (sender._id || sender).toString(),
      name: sender.name || 'Member'
    },
    text: message.text,
    attachment: message.attachment ? {
      filename: message.attachment.filename,
      contentType: message.attachment.contentType,
      size: message.attachment.size
    } : null,
    readBy: (message.readBy || []).map((userId) => (userId._id || userId).toString()),
    createdAt: message.createdAt,
    ...(message.editedAt ? { editedAt: message.editedAt } : {}),
    ...(message.deletedAt ? { deletedAt: message.deletedAt } : {})
  };
}

function getConversationParticipants(conversationId) {
  if (!conversationId.startsWith('direct:')) return [];
  return conversationId.slice('direct:'.length).split(':');
}

function userCanAccessConversation(userId, conversationId) {
  if (conversationId === 'group') return true;
  const participants = getConversationParticipants(conversationId);
  return participants.length === 2 &&
    participants.every((participant) => mongoose.isValidObjectId(participant)) &&
    participants.includes(userId.toString());
}

function emitConversation(io, conversationId, event, payload) {
  if (conversationId === 'group') {
    io.to('approved-users').emit(event, payload);
    return;
  }
  const [firstUserId, secondUserId] = getConversationParticipants(conversationId);
  io.to(`user:${firstUserId}`).to(`user:${secondUserId}`).emit(event, payload);
}

async function markConversationRead(req, res, conversationId) {
  const messages = await ChatMessage.find({
    conversationId,
    senderId: { $ne: req.user._id },
    readBy: { $ne: req.user._id },
    hiddenFor: { $ne: req.user._id }
  }).sort({ createdAt: -1, _id: -1 }).limit(pageSize).select('_id').lean();
  const messageIds = messages.map((message) => message._id.toString());
  if (messageIds.length) {
    await ChatMessage.updateMany(
      { _id: { $in: messages.map((message) => message._id) }, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
    emitConversation(req.app.get('io'), conversationId, 'chat:read', {
      conversationId,
      messageIds,
      readerId: req.user._id.toString()
    });
  }
  res.json({ messageIds });
}

function parsePage(value) {
  const page = Number.parseInt(value || '1', 10);
  if (!Number.isSafeInteger(page) || page < 1 || page > 500) return null;
  return page;
}

async function loadMessages(conversationId, page, userId) {
  const messages = await ChatMessage.find({ conversationId, hiddenFor: { $ne: userId } })
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize + 1)
    .populate('senderId', 'name')
    .lean();
  const hasMore = messages.length > pageSize;
  return {
    messages: messages.slice(0, pageSize).reverse().map(messageView),
    hasMore
  };
}

async function findActiveMember(userId) {
  if (!mongoose.isValidObjectId(userId)) return null;
  const user = await User.findOne({ _id: userId, status: 'active' }).populate('memberId');
  return user && user.memberId && user.memberId.isActive ? user : null;
}

router.get('/contacts', async (req, res, next) => {
  try {
    const users = await User.find({
      _id: { $ne: req.user._id },
      status: 'active'
    }).select('name role memberId').populate('memberId', 'isActive').sort({ name: 1 }).lean();
    res.json({
      contacts: users.filter((user) => user.memberId && user.memberId.isActive)
        .map((user) => ({ id: user._id, name: user.name, role: user.role }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/group', async (req, res, next) => {
  try {
    const page = parsePage(req.query.page);
    if (!page) return res.status(400).json({ error: 'page must be between 1 and 500' });
    res.json(await loadMessages('group', page, req.user._id));
  } catch (error) {
    next(error);
  }
});

router.post('/group/read', async (req, res, next) => {
  try {
    await markConversationRead(req, res, 'group');
  } catch (error) {
    next(error);
  }
});

router.post('/group', async (req, res, next) => {
  try {
    const text = typeof (req.body || {}).text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 2000) {
      return res.status(400).json({ error: 'Message must contain 1-2000 characters' });
    }
    const message = await ChatMessage.create({
      conversationId: 'group',
      senderId: req.user._id,
      text
    });
    await message.populate('senderId', 'name');
    const view = messageView(message);
    req.app.get('io').to('approved-users').emit('chat:message', view);
    res.status(201).json({ message: view });
  } catch (error) {
    next(error);
  }
});

router.post('/group/files', handleAttachmentUpload, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a file to send' });
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (text.length > 2000) return res.status(400).json({ error: 'Message text cannot exceed 2000 characters' });
    let attachment;
    let messageSaved = false;
    try {
      attachment = await saveAttachment(req.file);
      const message = await ChatMessage.create({
        conversationId: 'group',
        senderId: req.user._id,
        text,
        attachment
      });
      messageSaved = true;
      await message.populate('senderId', 'name');
      const view = messageView(message);
      req.app.get('io').to('approved-users').emit('chat:message', view);
      return res.status(201).json({ message: view });
    } catch (error) {
      if (attachment && !messageSaved) await deleteGridFsFile(attachment.fileId);
      throw error;
    }
  } catch (error) {
    next(error);
  } finally {
    try {
      await removeTemporaryFile(req.file);
    } catch (cleanupError) {
      next(cleanupError);
    }
  }
});

router.get('/direct/:userId', async (req, res, next) => {
  try {
    const page = parsePage(req.query.page);
    if (!page) return res.status(400).json({ error: 'page must be between 1 and 500' });
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot open a direct chat with yourself' });
    }
    const recipient = await findActiveMember(req.params.userId);
    if (!recipient) return res.status(404).json({ error: 'Member not found' });
    res.json(await loadMessages(getConversationId(req.user._id, recipient._id), page, req.user._id));
  } catch (error) {
    next(error);
  }
});

router.post('/direct/:userId', async (req, res, next) => {
  try {
    const text = typeof (req.body || {}).text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 2000) {
      return res.status(400).json({ error: 'Message must contain 1-2000 characters' });
    }
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot send a direct message to yourself' });
    }
    const recipient = await findActiveMember(req.params.userId);
    if (!recipient) return res.status(404).json({ error: 'Member not found' });

    const message = await ChatMessage.create({
      conversationId: getConversationId(req.user._id, recipient._id),
      senderId: req.user._id,
      text
    });
    await message.populate('senderId', 'name');
    const view = messageView(message);
    const io = req.app.get('io');
    io.to(`user:${req.user._id}`).to(`user:${recipient._id}`).emit('chat:message', view);
    res.status(201).json({ message: view });
  } catch (error) {
    next(error);
  }
});

router.post('/direct/:userId/files', handleAttachmentUpload, async (req, res, next) => {
  try {
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot send a direct message to yourself' });
    }
    const recipient = await findActiveMember(req.params.userId);
    if (!recipient) return res.status(404).json({ error: 'Member not found' });
    if (!req.file) return res.status(400).json({ error: 'Choose a file to send' });
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (text.length > 2000) return res.status(400).json({ error: 'Message text cannot exceed 2000 characters' });
    const conversationId = getConversationId(req.user._id, recipient._id);
    let attachment;
    let messageSaved = false;
    try {
      attachment = await saveAttachment(req.file);
      const message = await ChatMessage.create({
        conversationId,
        senderId: req.user._id,
        text,
        attachment
      });
      messageSaved = true;
      await message.populate('senderId', 'name');
      const view = messageView(message);
      emitConversation(req.app.get('io'), conversationId, 'chat:message', view);
      return res.status(201).json({ message: view });
    } catch (error) {
      if (attachment && !messageSaved) await deleteGridFsFile(attachment.fileId);
      throw error;
    }
  } catch (error) {
    next(error);
  } finally {
    try {
      await removeTemporaryFile(req.file);
    } catch (cleanupError) {
      next(cleanupError);
    }
  }
});

router.post('/direct/:userId/read', async (req, res, next) => {
  try {
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot open a direct chat with yourself' });
    }
    const recipient = await findActiveMember(req.params.userId);
    if (!recipient) return res.status(404).json({ error: 'Member not found' });
    await markConversationRead(req, res, getConversationId(req.user._id, recipient._id));
  } catch (error) {
    next(error);
  }
});

router.get('/attachments/:messageId', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.messageId)) {
      return res.status(404).json({ error: 'Message not found' });
    }
    const userId = req.user._id.toString();
    const message = await ChatMessage.findById(req.params.messageId)
      .select('conversationId attachment hiddenFor').lean();
    if (!message || !message.attachment || !userCanAccessConversation(userId, message.conversationId) ||
        (message.hiddenFor || []).some((hiddenId) => hiddenId.toString() === userId)) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    const bucket = getAttachmentBucket();
    const [file] = await bucket.find({ _id: message.attachment.fileId }).limit(1).toArray();
    if (!file) return res.status(404).json({ error: 'Attachment not found' });
    res.attachment(message.attachment.filename);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    const download = bucket.openDownloadStream(message.attachment.fileId);
    download.on('error', (error) => {
      if (!res.headersSent) return next(error);
      res.destroy(error);
    });
    download.pipe(res);
  } catch (error) {
    next(error);
  }
});

router.patch('/messages/:messageId', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.messageId)) {
      return res.status(404).json({ error: 'Message not found' });
    }
    const text = typeof (req.body || {}).text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 2000) {
      return res.status(400).json({ error: 'Message must contain 1-2000 characters' });
    }
    const message = await ChatMessage.findById(req.params.messageId);
    if (!message || !userCanAccessConversation(req.user._id.toString(), message.conversationId) ||
        (message.hiddenFor || []).some((hiddenId) => hiddenId.toString() === req.user._id.toString())) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (message.senderId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the sender can edit this message' });
    }
    if (message.deletedAt) {
      return res.status(409).json({ error: 'Deleted messages cannot be edited' });
    }
    const editBefore = new Date(Date.now() - deleteForEveryoneWindowMs);
    if (message.createdAt < editBefore) {
      return res.status(403).json({ error: 'Messages can only be edited within 15 minutes' });
    }
    message.text = text;
    message.editedAt = new Date();
    await message.save();
    await message.populate('senderId', 'name');
    const view = messageView(message);
    emitConversation(req.app.get('io'), message.conversationId, 'chat:edited', view);
    res.json({ message: view });
  } catch (error) {
    next(error);
  }
});

router.delete('/messages/:messageId', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.messageId)) {
      return res.status(404).json({ error: 'Message not found' });
    }
    const scope = (req.body || {}).scope;
    if (scope !== 'me' && scope !== 'everyone') {
      return res.status(400).json({ error: 'Choose whether to delete the message for you or everyone' });
    }
    const messageId = req.params.messageId;
    const userId = req.user._id.toString();
    const message = await ChatMessage.findById(messageId)
      .select('conversationId senderId createdAt attachment hiddenFor').lean();
    if (!message || !userCanAccessConversation(userId, message.conversationId) ||
        (message.hiddenFor || []).some((hiddenId) => hiddenId.toString() === userId)) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (scope === 'me') {
      await ChatMessage.updateOne(
        { _id: messageId, hiddenFor: { $ne: req.user._id } },
        { $addToSet: { hiddenFor: req.user._id } }
      );
      req.app.get('io').to(`user:${userId}`).emit('chat:hidden', { id: messageId });
      return res.json({ id: messageId, scope });
    }

    if (message.senderId.toString() !== userId) {
      return res.status(403).json({ error: 'Only the sender can delete a message for everyone' });
    }
    const deleteBefore = new Date(Date.now() - deleteForEveryoneWindowMs);
    if (message.createdAt < deleteBefore) {
      return res.status(403).json({ error: 'Messages can only be deleted for everyone within 15 minutes' });
    }
    const deletedAt = new Date();
    const deletedMessage = await ChatMessage.findOneAndUpdate(
      {
        _id: messageId,
        senderId: req.user._id,
        createdAt: { $gte: deleteBefore },
        deletedAt: null
      },
      {
        $set: { text: '', attachment: undefined, deletedAt }
      },
      { new: true }
    ).lean();
    if (!deletedMessage) {
      return res.status(403).json({ error: 'Messages can only be deleted for everyone within 15 minutes' });
    }
    emitConversation(req.app.get('io'), message.conversationId, 'chat:deleted', {
      id: messageId,
      conversationId: message.conversationId,
      deletedAt: deletedAt.toISOString()
    });
    if (deletedMessage.attachment) await deleteGridFsFile(deletedMessage.attachment.fileId);
    res.json({ id: messageId, scope });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
