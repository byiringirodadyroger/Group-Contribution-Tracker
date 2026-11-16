const mongoose = require('mongoose');

async function connectDatabase(uri) {
  if (!uri) throw new Error('MONGODB_URI must be configured');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { autoIndex: true });
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  return mongoose.connection;
}

module.exports = { connectDatabase };
