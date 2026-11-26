const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'n'.repeat(32);

const Notification = require('../src/models/Notification');
const notificationsRouter = require('../src/routes/notifications');
const { createNotification } = require('../src/services/notifications');

function getRouteHandler(method, path) {
  const layer = notificationsRouter.stack.find((item) =>
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
    }
  };
}

test('notification creation stores an event and broadcasts it to all approved users', async () => {
  const originalCreate = Notification.create;
  const actorId = new mongoose.Types.ObjectId();
  const notificationId = new mongoose.Types.ObjectId();
  const createdAt = new Date();
  let created;
  let emitted;
  Notification.create = async (value) => {
    created = value;
    return { ...value, _id: notificationId, createdAt };
  };
  try {
    await createNotification({
      io: { to: (room) => ({ emit: (event, payload) => { emitted = { room, event, payload }; } }) },
      type: 'payment.created',
      title: 'Contribution recorded',
      message: 'A member recorded a contribution.',
      actorId
    });

    assert.equal(created.actorId, actorId);
    assert.equal(emitted.room, 'approved-users');
    assert.equal(emitted.event, 'notification:new');
    assert.equal(emitted.payload.id, notificationId);
    assert.equal(emitted.payload.isRead, false);
  } finally {
    Notification.create = originalCreate;
  }
});

test('notification list returns each user read state and the unread total', async () => {
  const originalFind = Notification.find;
  const originalCountDocuments = Notification.countDocuments;
  const userId = new mongoose.Types.ObjectId();
  const notification = {
    _id: new mongoose.Types.ObjectId(),
    type: 'member.created',
    title: 'New group member',
    message: 'A new member joined.',
    createdAt: new Date(),
    readBy: [userId]
  };
  Notification.find = () => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () => [notification]
  });
  Notification.countDocuments = async () => 3;
  try {
    const res = createResponse();
    await getRouteHandler('get', '/')({ user: { _id: userId } }, res, (error) => { throw error; });
    assert.equal(res.payload.notifications[0].isRead, true);
    assert.equal(res.payload.unreadCount, 3);
  } finally {
    Notification.find = originalFind;
    Notification.countDocuments = originalCountDocuments;
  }
});

test('mark-one-read stores the per-user state and syncs connected sessions', async () => {
  const originalFindByIdAndUpdate = Notification.findByIdAndUpdate;
  const userId = new mongoose.Types.ObjectId();
  const notificationId = new mongoose.Types.ObjectId();
  let update;
  let event;
  const notification = {
    _id: notificationId,
    type: 'payment.created',
    title: 'Contribution recorded',
    message: 'A member recorded a contribution.',
    createdAt: new Date(),
    readBy: [userId]
  };
  Notification.findByIdAndUpdate = (...args) => {
    update = args;
    return { lean: async () => notification };
  };
  try {
    const res = createResponse();
    await getRouteHandler('patch', '/:id/read')({
      params: { id: notificationId.toString() },
      user: { _id: userId },
      app: {
        get: () => ({
          to: (room) => ({ emit: (name, payload) => { event = { room, name, payload }; } })
        })
      }
    }, res, (error) => { throw error; });
    assert.equal(update[0], notificationId.toString());
    assert.deepEqual(update[1], { $addToSet: { readBy: userId } });
    assert.deepEqual(event, {
      room: `user:${userId}`,
      name: 'notification:read',
      payload: { id: notificationId.toString() }
    });
    assert.equal(res.payload.notification.isRead, true);
  } finally {
    Notification.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test('mark-all-read updates the current user and syncs their connected sessions', async () => {
  const originalUpdateMany = Notification.updateMany;
  const userId = new mongoose.Types.ObjectId();
  let update;
  let event;
  Notification.updateMany = async (...args) => { update = args; };
  try {
    const res = createResponse();
    await getRouteHandler('patch', '/read-all')({
      user: { _id: userId },
      app: {
        get: () => ({
          to: (room) => ({ emit: (name) => { event = { room, name }; } })
        })
      }
    }, res, (error) => { throw error; });
    assert.deepEqual(update[0], { readBy: { $ne: userId } });
    assert.deepEqual(update[1], { $addToSet: { readBy: userId } });
    assert.deepEqual(event, { room: `user:${userId}`, name: 'notifications:read-all' });
    assert.equal(res.payload.unreadCount, 0);
  } finally {
    Notification.updateMany = originalUpdateMany;
  }
});
