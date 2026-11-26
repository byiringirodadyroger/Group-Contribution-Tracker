const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  filename: { type: String, required: true, maxlength: 255 },
  contentType: { type: String, required: true, maxlength: 150 },
  size: { type: Number, required: true, min: 0 }
}, { _id: false });

const chatMessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, maxlength: 100 },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, trim: true, maxlength: 2000 },
  attachment: { type: attachmentSchema },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  hiddenFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deletedAt: { type: Date, default: null },
  editedAt: { type: Date, default: null }
}, { timestamps: true });

chatMessageSchema.pre('validate', function validateTextOrAttachment(next) {
  if (!this.text && !this.attachment) {
    this.invalidate('text', 'A message must contain text or an attachment');
  }
  next();
});

chatMessageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
