const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');

process.env.JWT_SECRET = 'p'.repeat(32);
process.env.PUBLIC_APP_URL = 'https://tracker.example.com';
process.env.SMTP_HOST = 'smtp.example.com';
process.env.SMTP_USER = 'sender@example.com';
process.env.SMTP_PASS = 'smtp-test-password';
process.env.SMTP_FROM = 'sender@example.com';

const authRouter = require('../src/routes/auth');
const PasswordResetToken = require('../src/models/PasswordResetToken');
const User = require('../src/models/User');

function getRouteHandler(path) {
  const layer = authRouter.stack.find((item) => item.route && item.route.path === path);
  assert.ok(layer, `route ${path} should exist`);
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
    },
    clearCookie() {
      this.cookieCleared = true;
      return this;
    }
  };
}

test('forgot password responds identically when no account matches the email', async () => {
  const originalFindOne = User.findOne;
  let query;
  User.findOne = async (value) => {
    query = value;
    return null;
  };
  try {
    const req = { body: { email: ' Admin@Example.com ' } };
    const res = createResponse();
    await getRouteHandler('/forgot-password')(req, res, (error) => {
      throw error;
    });
    assert.deepEqual(query, {
      $or: [
        { username: 'admin@example.com' },
        { email: 'admin@example.com' }
      ]
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.payload.message, /If an account exists/);
  } finally {
    User.findOne = originalFindOne;
  }
});

test('forgot password finds a separate stored email and sends the reset link there', async () => {
  const originalFindOne = User.findOne;
  const originalDeleteMany = PasswordResetToken.deleteMany;
  const originalCreate = PasswordResetToken.create;
  const originalCreateTransport = nodemailer.createTransport;
  let query;
  let message;
  User.findOne = async (value) => {
    query = value;
    return { _id: 'user-id', username: 'member-name', email: 'member@example.com' };
  };
  PasswordResetToken.deleteMany = async () => ({ deletedCount: 0 });
  PasswordResetToken.create = async (value) => value;
  nodemailer.createTransport = () => ({
    sendMail: async (value) => { message = value; }
  });
  try {
    await getRouteHandler('/forgot-password')(
      { body: { email: 'member@example.com' } },
      createResponse(),
      (error) => { throw error; }
    );
    assert.deepEqual(query, {
      $or: [
        { username: 'member@example.com' },
        { email: 'member@example.com' }
      ]
    });
    assert.equal(message.to, 'member@example.com');
  } finally {
    User.findOne = originalFindOne;
    PasswordResetToken.deleteMany = originalDeleteMany;
    PasswordResetToken.create = originalCreate;
    nodemailer.createTransport = originalCreateTransport;
  }
});

test('forgot password emails a one-hour link and stores only its token hash', async () => {
  const originalFindOne = User.findOne;
  const originalDeleteMany = PasswordResetToken.deleteMany;
  const originalCreate = PasswordResetToken.create;
  const originalCreateTransport = nodemailer.createTransport;
  const userId = 'user-id';
  const created = [];
  let message;
  User.findOne = async () => ({ _id: userId, username: 'admin@example.com' });
  PasswordResetToken.deleteMany = async () => ({ deletedCount: 0 });
  PasswordResetToken.create = async (value) => {
    created.push(value);
    return value;
  };
  nodemailer.createTransport = () => ({
    sendMail: async (value) => { message = value; }
  });
  try {
    const res = createResponse();
    await getRouteHandler('/forgot-password')(
      { body: { email: 'admin@example.com' } },
      res,
      (error) => { throw error; }
    );
    const link = message.text.match(/https:\/\/\S+/)[0];
    const token = new URL(link).searchParams.get('token');
    assert.equal(message.to, 'admin@example.com');
    assert.equal(new URL(link).origin, 'https://tracker.example.com');
    assert.equal(created.length, 1);
    assert.equal(created[0].userId, userId);
    assert.equal(
      created[0].tokenHash,
      crypto.createHash('sha256').update(token).digest('hex')
    );
    assert.ok(created[0].expiresAt.getTime() > Date.now() + 59 * 60 * 1000);
    assert.ok(created[0].expiresAt.getTime() <= Date.now() + 60 * 60 * 1000);
    assert.match(res.payload.message, /If an account exists/);
  } finally {
    User.findOne = originalFindOne;
    PasswordResetToken.deleteMany = originalDeleteMany;
    PasswordResetToken.create = originalCreate;
    nodemailer.createTransport = originalCreateTransport;
  }
});

test('reset password consumes a valid token, changes the hash, and invalidates sessions', async () => {
  const originalFindOneAndUpdate = PasswordResetToken.findOneAndUpdate;
  const originalDeleteMany = PasswordResetToken.deleteMany;
  const originalFindByIdAndUpdate = User.findByIdAndUpdate;
  let tokenQuery;
  let userUpdate;
  let disconnectedUser;
  PasswordResetToken.findOneAndUpdate = async (query) => {
    tokenQuery = query;
    return { userId: 'user-id' };
  };
  PasswordResetToken.deleteMany = async () => ({ deletedCount: 1 });
  User.findByIdAndUpdate = async (id, update) => {
    userUpdate = { id, update };
    return { _id: id };
  };
  try {
    const req = {
      body: { token: 'a'.repeat(64), newPassword: 'a-safe-new-password' },
      app: {
        get: () => ({
          in: (room) => ({
            disconnectSockets: () => { disconnectedUser = room; }
          })
        })
      }
    };
    const res = createResponse();
    await getRouteHandler('/reset-password')(req, res, (error) => {
      throw error;
    });
    assert.equal(tokenQuery.tokenHash.length, 64);
    assert.ok(tokenQuery.expiresAt.$gt instanceof Date);
    assert.equal(tokenQuery.usedAt, null);
    assert.equal(userUpdate.id, 'user-id');
    assert.match(userUpdate.update.$set.passwordHash, /^\$2[aby]\$/);
    assert.equal(userUpdate.update.$inc.tokenVersion, 1);
    assert.equal(disconnectedUser, 'user:user-id');
    assert.equal(res.cookieCleared, true);
    assert.equal(res.statusCode, 200);
  } finally {
    PasswordResetToken.findOneAndUpdate = originalFindOneAndUpdate;
    PasswordResetToken.deleteMany = originalDeleteMany;
    User.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});
