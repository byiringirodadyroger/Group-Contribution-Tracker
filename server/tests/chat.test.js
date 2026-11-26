const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const mongoose = require('mongoose');
const { Readable } = require('node:stream');

process.env.JWT_SECRET = 'c'.repeat(32);

const ChatMessage = require('../src/models/ChatMessage');
const chatRouter = require('../src/routes/chat');

function getRouteHandler(method, path) {
  const layer = chatRouter.stack.find((item) =>
    item.route && item.route.path === path && item.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} should exist`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

function getUploadMiddleware() {
  const layer = chatRouter.stack.find((item) =>
    item.route && item.route.path === '/group/files');
  assert.ok(layer, 'POST /group/files should exist');
  return layer.route.stack[0].handle;
}

function createMultipartRequest(parts, boundary) {
  const request = Readable.from(parts);
  request.method = 'POST';
  request.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': String(parts.reduce((total, part) => total + part.length, 0))
  };
  return request;
}

function runUploadMiddleware(request) {
  return new Promise((resolve, reject) => {
    const response = createResponse();
    response.json = (payload) => {
      response.payload = payload;
      resolve({ request, response });
      return response;
    };
    getUploadMiddleware()(request, response, (error) => {
      if (error) return reject(error);
      resolve({ request, response });
    });
  });
}

test('uploads accept arbitrary file types and store a sanitized multipart filename', async () => {
  const boundary = 'chat-upload-test';
  const request = createMultipartRequest([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="text"\r\n\r\nHere is my file\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="../unsafe.exe"\r\nContent-Type: application/x-custom\r\n\r\nbinary-data\r\n--${boundary}--\r\n`)
  ], boundary);
  const { request: parsedRequest, response } = await runUploadMiddleware(request);
  try {
    assert.equal(response.statusCode, 200);
    assert.equal(parsedRequest.body.text, 'Here is my file');
    assert.equal(parsedRequest.file.originalname, 'unsafe.exe');
    assert.equal(parsedRequest.file.mimetype, 'application/x-custom');
    assert.equal(parsedRequest.file.size, 11);
  } finally {
    await fs.unlink(parsedRequest.file.path);
  }
});

test('uploads over 50 MB are rejected with HTTP 413', async () => {
  const boundary = 'chat-upload-limit-test';
  const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="large.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const chunk = Buffer.alloc(1024 * 1024, 1);
  const parts = [header, ...Array(51).fill(chunk), footer];
  const request = createMultipartRequest(parts, boundary);
  const { response } = await runUploadMiddleware(request);
  assert.equal(response.statusCode, 413);
  assert.match(response.payload.error, /50 MB or smaller/);
});

test('group message responses include sender and read-receipt IDs', async () => {
  const originalFind = ChatMessage.find;
  const senderId = new mongoose.Types.ObjectId();
  const readerId = new mongoose.Types.ObjectId();
  const messageId = new mongoose.Types.ObjectId();
  const createdAt = new Date();
  ChatMessage.find = (filter) => {
    assert.deepEqual(filter, {
      conversationId: 'group',
      hiddenFor: { $ne: senderId }
    });
    return {
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      populate() { return this; },
      lean: async () => [{
        _id: messageId,
        conversationId: 'group',
        senderId: { _id: senderId, name: 'Roger' },
        text: 'Hello',
        attachment: null,
        readBy: [readerId],
        createdAt
      }]
    };
  };
  try {
    const res = createResponse();
    await getRouteHandler('get', '/group')({
      query: {},
      user: { _id: senderId }
    }, res, (error) => { throw error; });
    assert.deepEqual(res.payload.messages[0], {
      id: messageId.toString(),
      conversationId: 'group',
      sender: { id: senderId.toString(), name: 'Roger' },
      text: 'Hello',
      attachment: null,
      readBy: [readerId.toString()],
      createdAt
    });
  } finally {
    ChatMessage.find = originalFind;
  }
});

test('opening a group chat marks incoming messages read and broadcasts read receipts', async () => {
  const originalFind = ChatMessage.find;
  const originalUpdateMany = ChatMessage.updateMany;
  const userId = new mongoose.Types.ObjectId();
  const messageId = new mongoose.Types.ObjectId();
  let findFilter;
  let update;
  let event;
  ChatMessage.find = (filter) => {
    findFilter = filter;
    return {
      sort() { return this; },
      limit() { return this; },
      select() { return this; },
      lean: async () => [{ _id: messageId }]
    };
  };
  ChatMessage.updateMany = async (...args) => { update = args; };
  try {
    const res = createResponse();
    await getRouteHandler('post', '/group/read')({
      user: { _id: userId },
      app: {
        get: () => ({
          to: (room) => ({ emit: (name, payload) => { event = { room, name, payload }; } })
        })
      }
    }, res, (error) => { throw error; });

    assert.deepEqual(findFilter, {
      conversationId: 'group',
      senderId: { $ne: userId },
      readBy: { $ne: userId },
      hiddenFor: { $ne: userId }
    });
    assert.deepEqual(update[0], { _id: { $in: [messageId] }, readBy: { $ne: userId } });
    assert.deepEqual(update[1], { $addToSet: { readBy: userId } });
    assert.equal(event.room, 'approved-users');
    assert.equal(event.name, 'chat:read');
    assert.deepEqual(event.payload, {
      conversationId: 'group',
      messageIds: [messageId.toString()],
      readerId: userId.toString()
    });
    assert.deepEqual(res.payload.messageIds, [messageId.toString()]);
  } finally {
    ChatMessage.find = originalFind;
    ChatMessage.updateMany = originalUpdateMany;
  }
});

test('a sender can delete their own message for everyone within 15 minutes', async () => {
  const originalFindById = ChatMessage.findById;
  const originalFindOneAndUpdate = ChatMessage.findOneAndUpdate;
  const senderId = new mongoose.Types.ObjectId();
  const messageId = new mongoose.Types.ObjectId();
  let query;
  let event;
  ChatMessage.findById = () => ({
    select() { return this; },
    lean: async () => ({
      conversationId: 'group',
      senderId,
      createdAt: new Date(),
      hiddenFor: []
    })
  });
  ChatMessage.findOneAndUpdate = (value) => {
    query = value;
    return {
      lean: async () => ({
        _id: messageId,
        conversationId: 'group',
        senderId
      })
    };
  };
  try {
    const res = createResponse();
    await getRouteHandler('delete', '/messages/:messageId')({
      params: { messageId: messageId.toString() },
      body: { scope: 'everyone' },
      user: { _id: senderId },
      app: {
        get: () => ({
          to: (room) => ({ emit: (name, payload) => { event = { room, name, payload }; } })
        })
      }
    }, res, (error) => { throw error; });

    assert.equal(query._id, messageId.toString());
    assert.equal(query.senderId, senderId);
    assert.ok(query.createdAt.$gte instanceof Date);
    assert.equal(event.room, 'approved-users');
    assert.equal(event.name, 'chat:deleted');
    assert.equal(event.payload.id, messageId.toString());
    assert.equal(event.payload.conversationId, 'group');
    assert.ok(event.payload.deletedAt);
    assert.deepEqual(res.payload, { id: messageId.toString(), scope: 'everyone' });
  } finally {
    ChatMessage.findById = originalFindById;
    ChatMessage.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('messages older than 15 minutes cannot be deleted for everyone', async () => {
  const originalFindById = ChatMessage.findById;
  const originalFindOneAndDelete = ChatMessage.findOneAndDelete;
  const senderId = new mongoose.Types.ObjectId();
  const messageId = new mongoose.Types.ObjectId();
  let deleteCalled = false;
  ChatMessage.findById = () => ({
    select() { return this; },
    lean: async () => ({
      conversationId: 'group',
      senderId,
      createdAt: new Date(Date.now() - 16 * 60 * 1000),
      hiddenFor: []
    })
  });
  ChatMessage.findOneAndDelete = () => {
    deleteCalled = true;
    return { lean: async () => null };
  };
  try {
    const res = createResponse();
    await getRouteHandler('delete', '/messages/:messageId')({
      params: { messageId: messageId.toString() },
      body: { scope: 'everyone' },
      user: { _id: senderId },
      app: { get: () => { throw new Error('No event should be sent'); } }
    }, res, (error) => { throw error; });
    assert.equal(deleteCalled, false);
    assert.equal(res.statusCode, 403);
    assert.match(res.payload.error, /within 15 minutes/);
  } finally {
    ChatMessage.findById = originalFindById;
    ChatMessage.findOneAndDelete = originalFindOneAndDelete;
  }
});

test('only the sender can delete a message for everyone', async () => {
  const originalFindById = ChatMessage.findById;
  const originalFindOneAndDelete = ChatMessage.findOneAndDelete;
  const senderId = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();
  const messageId = new mongoose.Types.ObjectId();
  let deleteCalled = false;
  ChatMessage.findById = () => ({
    select() { return this; },
    lean: async () => ({
      conversationId: 'group',
      senderId,
      createdAt: new Date(),
      hiddenFor: []
    })
  });
  ChatMessage.findOneAndDelete = () => {
    deleteCalled = true;
    return { lean: async () => null };
  };
  try {
    const res = createResponse();
    await getRouteHandler('delete', '/messages/:messageId')({
      params: { messageId: messageId.toString() },
      body: { scope: 'everyone' },
      user: { _id: otherUserId },
      app: { get: () => { throw new Error('No event should be sent'); } }
    }, res, (error) => { throw error; });
    assert.equal(deleteCalled, false);
    assert.equal(res.statusCode, 403);
  } finally {
    ChatMessage.findById = originalFindById;
    ChatMessage.findOneAndDelete = originalFindOneAndDelete;
  }
});

test('delete for me hides a message for that user and syncs their other sessions', async () => {
  const originalFindById = ChatMessage.findById;
  const originalUpdateOne = ChatMessage.updateOne;
  const userId = new mongoose.Types.ObjectId();
  const senderId = new mongoose.Types.ObjectId();
  const messageId = new mongoose.Types.ObjectId();
  let update;
  let event;
  ChatMessage.findById = () => ({
    select() { return this; },
    lean: async () => ({
      conversationId: 'group',
      senderId,
      createdAt: new Date(),
      hiddenFor: []
    })
  });
  ChatMessage.updateOne = async (...args) => { update = args; };
  try {
    const res = createResponse();
    await getRouteHandler('delete', '/messages/:messageId')({
      params: { messageId: messageId.toString() },
      body: { scope: 'me' },
      user: { _id: userId },
      app: {
        get: () => ({
          to: (room) => ({ emit: (name, payload) => { event = { room, name, payload }; } })
        })
      }
    }, res, (error) => { throw error; });
    assert.deepEqual(update, [
      { _id: messageId.toString(), hiddenFor: { $ne: userId } },
      { $addToSet: { hiddenFor: userId } }
    ]);
    assert.deepEqual(event, {
      room: `user:${userId}`,
      name: 'chat:hidden',
      payload: { id: messageId.toString() }
    });
    assert.deepEqual(res.payload, { id: messageId.toString(), scope: 'me' });
  } finally {
    ChatMessage.findById = originalFindById;
    ChatMessage.updateOne = originalUpdateOne;
  }
});

test('direct message attachments are hidden from users outside the conversation', async () => {
  const originalFindById = ChatMessage.findById;
  const firstUserId = new mongoose.Types.ObjectId();
  const secondUserId = new mongoose.Types.ObjectId();
  const outsiderId = new mongoose.Types.ObjectId();
  const messageId = new mongoose.Types.ObjectId();
  ChatMessage.findById = () => ({
    select() { return this; },
    lean: async () => ({
      conversationId: `direct:${[firstUserId, secondUserId].sort().join(':')}`,
      attachment: {
        fileId: new mongoose.Types.ObjectId(),
        filename: 'report.pdf',
        contentType: 'application/pdf',
        size: 1024
      },
      hiddenFor: []
    })
  });
  try {
    const res = createResponse();
    await getRouteHandler('get', '/attachments/:messageId')({
      params: { messageId: messageId.toString() },
      user: { _id: outsiderId }
    }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.payload, { error: 'Attachment not found' });
  } finally {
    ChatMessage.findById = originalFindById;
  }
});

test('chat messages support file-only messages and require text or an attachment', async () => {
  const senderId = new mongoose.Types.ObjectId();
  const valid = new ChatMessage({
    conversationId: 'group',
    senderId,
    attachment: {
      fileId: new mongoose.Types.ObjectId(),
      filename: 'report.pdf',
      contentType: 'application/pdf',
      size: 1024
    }
  });
  await valid.validate();

  const invalid = new ChatMessage({ conversationId: 'group', senderId, text: '  ' });
  await assert.rejects(invalid.validate(), /A message must contain text or an attachment/);
});
