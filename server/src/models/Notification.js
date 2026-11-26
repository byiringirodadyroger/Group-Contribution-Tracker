const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'account.registered',
      'access.requested',
      'account.approved',
      'account.deactivated',
      'account.removed',
      'member.created',
      'payment.created',
      'payment.updated',
      'payment.deleted'
    ],
    required: true
  },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 500 },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
