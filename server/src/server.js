require('dotenv').config();
const { app, httpServer } = require('./app');
const { loadConfig } = require('./config/env');
const { connectDatabase } = require('./db/connect');

async function start() {
  const config = loadConfig();
  await connectDatabase(config.mongoUri);
  httpServer.listen(config.port, () => {
    console.log(`Group Contribution Tracker API listening on port ${config.port}`);
  });
}

start().catch((error) => {
  console.error('Unable to start API:', error.message);
  if (error.reason?.servers) {
    for (const [host, desc] of error.reason.servers) {
      console.error(`  -> ${host}:`, desc.error?.message || desc.error);
    }
  }
  process.exitCode = 1;
});

async function shutdown() {
  httpServer.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
