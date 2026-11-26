const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, lowercase: true, trim: true },
  email: { type: String, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, required: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'member'], required: true, default: 'member' },
  status: {
    type: String,
    enum: ['registered', 'pending', 'active', 'inactive'],
    required: true,
    default: 'registered'
  },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  tokenVersion: { type: Number, default: 0 },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true });

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ memberId: 1 }, { unique: true });
userSchema.index({ status: 1, role: 1 });

module.exports = mongoose.model('User', userSchema);
