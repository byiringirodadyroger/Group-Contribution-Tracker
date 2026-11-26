const express = require('express');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { authenticate, requireApproved } = require('../middleware/auth');
const { notificationView } = require('../services/notifications');

const router = express.Router();
router.use(authenticate, requireApproved);

router.get('/', async (req, res, next) => {
  try {
    const userId = req.user._id;
    const [notifications, unreadCount] = await Promise.all([
      Notification.find().sort({ createdAt: -1 }).limit(50).lean(),
      Notification.countDocuments({ readBy: { $ne: userId } })
    ]);
    const userIdString = userId.toString();
    res.json({
      notifications: notifications.map((notification) => notificationView(
        notification,
        (notification.readBy || []).some((readerId) => readerId.toString() === userIdString)
      )),
      unreadCount
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    await Notification.updateMany(
      { readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
    req.app.get('io').to(`user:${req.user._id}`).emit('notifications:read-all');
    res.json({ unreadCount: 0 });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid notification id' });
    }
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { readBy: req.user._id } },
      { new: true }
    ).lean();
    if (!notification) return res.status(404).json({ error: 'Notification not found' });

    req.app.get('io').to(`user:${req.user._id}`).emit('notification:read', {
      id: notification._id.toString()
    });
    res.json({ notification: notificationView(notification, true) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
