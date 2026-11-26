const Notification = require('../models/Notification');

function notificationView(notification, isRead = false) {
  return {
    id: notification._id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    createdAt: notification.createdAt,
    isRead
  };
}

async function createNotification({ io, type, title, message, actorId }) {
  const notification = await Notification.create({ type, title, message, actorId });
  const view = notificationView(notification);
  io.to('approved-users').emit('notification:new', view);
  return view;
}

module.exports = { createNotification, notificationView };
