const mongoose = require('mongoose');

const setupStateSchema = new mongoose.Schema({
  _id: { type: String, default: 'initial-setup' },
  status: { type: String, enum: ['initializing', 'complete'], required: true },
  completedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('SetupState', setupStateSchema);
