const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, required: true, unique: true, index: true },
  targetAmount: { type: Number, required: true, min: 1, default: 20000, immutable: true },
  isAdminMember: { type: Boolean, default: false, immutable: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

memberSchema.index({ isAdminMember: 1 });

module.exports = mongoose.model('Member', memberSchema);
