const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'e'.repeat(32);

const bcrypt = require('bcryptjs');
const authRouter = require('../src/routes/auth');
const Member = require('../src/models/Member');
const Notification = require('../src/models/Notification');
const User = require('../src/models/User');

function getRouteHandler(method, path) {
  const layer = authRouter.stack.find((item) =>
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
    },
    cookie(name, value) {
      this.cookieSet = { name, value };
      return this;
    }
  };
}

test('registration accepts an email as username and normalizes an optional email', async () => {
  const originalFindById = Member.findById;
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  const originalHash = bcrypt.hash;
  const originalNotificationCreate = Notification.create;
  const memberId = new mongoose.Types.ObjectId();
  const member = {
    _id: memberId,
    name: 'Jean Bosco',
    normalizedName: 'jean bosco',
    isActive: true,
    isAdminMember: false
  };
  let createdUser;
  Member.findById = async () => member;
  User.findOne = async () => null;
  bcrypt.hash = async () => 'bcrypt-hash';
  Notification.create = async (value) => ({
    ...value,
    _id: new mongoose.Types.ObjectId(),
    createdAt: new Date(),
    readBy: []
  });
  User.create = async (value) => {
    createdUser = value;
    return { ...value, _id: new mongoose.Types.ObjectId(), memberId: member };
  };
  try {
    const res = createResponse();
    await getRouteHandler('post', '/register')({
      body: {
        name: 'Jean Bosco',
        username: ' Jean.Bosco+login@Example.com ',
        email: '  Jean.Bosco@Example.com ',
        password: 'a-safe-password',
        memberId: memberId.toString()
      },
      app: { get: () => ({ to: () => ({ emit: () => {} }) }) }
    }, res, (error) => { throw error; });

    assert.equal(res.statusCode, 201);
    assert.equal(createdUser.username, 'jean.bosco+login@example.com');
    assert.equal(createdUser.email, 'jean.bosco@example.com');
    assert.equal(res.payload.account.username, 'jean.bosco+login@example.com');
    assert.equal(res.payload.account.email, 'jean.bosco@example.com');
  } finally {
    Member.findById = originalFindById;
    User.findOne = originalFindOne;
    User.create = originalCreate;
    bcrypt.hash = originalHash;
    Notification.create = originalNotificationCreate;
  }
});

test('login accepts an email address while retaining identifier normalization', async () => {
  const originalFindOne = User.findOne;
  const originalCompare = bcrypt.compare;
  const user = {
    _id: new mongoose.Types.ObjectId(),
    username: 'jean-bosco',
    email: 'jean.bosco@example.com',
    name: 'Jean Bosco',
    role: 'member',
    status: 'active',
    tokenVersion: 0,
    memberId: {
      _id: new mongoose.Types.ObjectId(),
      name: 'Jean Bosco',
      isActive: true
    },
    save: async () => {}
  };
  let query;
  User.findOne = (value) => {
    query = value;
    return { select: () => ({ populate: async () => user }) };
  };
  bcrypt.compare = async () => true;
  try {
    const res = createResponse();
    await getRouteHandler('post', '/login')({
      body: { username: ' Jean.Bosco@Example.com ', password: 'a-safe-password' }
    }, res, (error) => { throw error; });

    assert.deepEqual(query, {
      $or: [
        { username: 'jean.bosco@example.com' },
        { email: 'jean.bosco@example.com' }
      ]
    });
    assert.equal(res.payload.user.email, 'jean.bosco@example.com');
    assert.equal(res.cookieSet.name, 'access_token');
  } finally {
    User.findOne = originalFindOne;
    bcrypt.compare = originalCompare;
  }
});
