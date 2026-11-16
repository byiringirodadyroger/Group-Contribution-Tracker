const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
  amount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  method: {
    type: String,
    enum: ['mtn_mobile_money', 'airtel_money', 'cash', 'bank_transfer', 'other'],
    required: true
  },
  paidAt: { type: Date, required: true, default: Date.now },
  transactionReference: { type: String, trim: true, default: '' },
  idempotencyKey: { type: String, trim: true, required: true },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

paymentSchema.index({ idempotencyKey: 1 }, { unique: true });
paymentSchema.index(
  { transactionReference: 1 },
  { unique: true, partialFilterExpression: { transactionReference: { $type: 'string', $gt: '' } } }
);
paymentSchema.index({ paidAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
