const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Member = require('../models/Member');
const Payment = require('../models/Payment');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { createNotification } = require('../services/notifications');
const { normalizeName, validateMemberName, isDuplicateKeyError } = require('../utils/validation');

const router = express.Router();
router.use(authenticate, requireAdmin);

function accountView(account) {
  return {
    id: account._id,
    username: account.username,
    name: account.name,
    role: account.role,
    status: account.status,
    member: account.memberId ? {
      id: account.memberId._id || account.memberId,
      name: account.memberId.name
    } : null,
    createdAt: account.createdAt,
    approvedAt: account.approvedAt
  };
}

router.get('/accounts', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) {
      if (!['registered', 'pending', 'active', 'inactive'].includes(req.query.status)) {
        return res.status(400).json({ error: 'status must be registered, pending, active, or inactive' });
      }
      filter.status = req.query.status;
    }
    const accounts = await User.find(filter).populate('memberId', 'name')
      .sort({ createdAt: -1 }).lean();
    res.json({ accounts: accounts.map(accountView) });
  } catch (error) {
    next(error);
  }
});

router.patch('/accounts/:id/approval', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid account id' });
    }
    if (!['active', 'inactive'].includes(body.status)) {
      return res.status(400).json({ error: 'status must be active or inactive' });
    }
    if (req.params.id === req.user._id.toString()) {
      return res.status(403).json({ error: 'Administrators cannot approve or change their own account' });
    }
    const account = await User.findById(req.params.id).populate('memberId');
    if (!account) return res.status(404).json({ error: 'Account not found' });
    if (account.role === 'admin') {
      return res.status(403).json({ error: 'Administrator accounts cannot be changed through member approval' });
    }
    if (body.status === 'active' && !['pending', 'inactive'].includes(account.status)) {
      return res.status(409).json({ error: 'Only pending or inactive member accounts can be activated' });
    }
    account.status = body.status;
    if (body.status === 'active') {
      account.approvedBy = req.user._id;
      account.approvedAt = new Date();
    } else {
      account.approvedBy = null;
      account.approvedAt = null;
    }
    await account.save();
    await createNotification({
      io: req.app.get('io'),
      type: body.status === 'active' ? 'account.approved' : 'account.deactivated',
      title: body.status === 'active' ? 'Member access approved' : 'Member access changed',
      message: body.status === 'active'
        ? `${account.name} was approved to access the group tracker.`
        : `${account.name}'s access was set to inactive.`,
      actorId: req.user._id
    });
    if (account.status !== 'active') {
      req.app.get('io').in(`user:${account._id}`).disconnectSockets(true);
    }
    res.json({ account: accountView(account) });
  } catch (error) {
    next(error);
  }
});

router.patch('/accounts/:id/status', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid account id' });
    }
    if (body.status !== 'inactive') {
      return res.status(400).json({ error: 'Only status=inactive is allowed here; use approval to activate an account' });
    }
    if (req.params.id === req.user._id.toString()) {
      return res.status(403).json({ error: 'Administrators cannot deactivate their own account' });
    }
    const account = await User.findById(req.params.id).populate('memberId');
    if (!account) return res.status(404).json({ error: 'Account not found' });
    if (account.role === 'admin') {
      return res.status(403).json({ error: 'Administrator accounts cannot be deactivated here' });
    }
    account.status = 'inactive';
    account.approvedBy = null;
    account.approvedAt = null;
    await account.save();
    await createNotification({
      io: req.app.get('io'),
      type: 'account.deactivated',
      title: 'Member access changed',
      message: `${account.name}'s access was set to inactive.`,
      actorId: req.user._id
    });
    req.app.get('io').in(`user:${account._id}`).disconnectSockets(true);
    res.json({ account: accountView(account) });
  } catch (error) {
    next(error);
  }
});

router.delete('/accounts/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid account id' });
    }
    if (req.params.id === req.user._id.toString()) {
      return res.status(403).json({ error: 'Administrators cannot delete their own account' });
    }
    const account = await User.findById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    if (account.role === 'admin' || account.status === 'active' ||
        account.status === 'pending' || account.approvedAt) {
      return res.status(403).json({ error: 'Only unrequested or rejected member accounts can be removed' });
    }
    await account.deleteOne();
    await createNotification({
      io: req.app.get('io'),
      type: 'account.removed',
      title: 'Member account removed',
      message: `The unapproved account for ${account.name} was removed.`,
      actorId: req.user._id
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/report', async (req, res, next) => {
  try {
    const [members, totals] = await Promise.all([
      Member.find({ isActive: true }).sort({ name: 1 }).lean(),
      Payment.aggregate([
        { $group: { _id: '$memberId', contributed: { $sum: '$amount' }, paymentCount: { $sum: 1 } } }
      ])
    ]);
    const totalsByMember = new Map(totals.map((entry) => [entry._id.toString(), entry]));
    const reportMembers = members.map((member) => {
      const total = totalsByMember.get(member._id.toString()) || { contributed: 0, paymentCount: 0 };
      const contributed = total.contributed || 0;
      const remaining = Math.max(member.targetAmount - contributed, 0);
      const progressPercent = member.targetAmount
        ? Math.min(100, Math.round((contributed / member.targetAmount) * 100))
        : 0;
      return {
        id: member._id,
        name: member.name,
        targetAmount: member.targetAmount,
        contributed,
        remaining,
        progressPercent,
        paymentCount: total.paymentCount || 0,
        status: contributed >= member.targetAmount ? 'Fully paid' : contributed > 0 ? 'Partially paid' : 'Not started'
      };
    });
    const targetAmount = reportMembers.reduce((sum, member) => sum + member.targetAmount, 0);
    const totalCollected = reportMembers.reduce((sum, member) => sum + member.contributed, 0);
    res.json({
      generatedAt: new Date().toISOString(),
      generatedBy: { id: req.user._id, name: req.user.name },
      summary: {
        memberCount: reportMembers.length,
        targetAmount,
        totalCollected,
        remaining: Math.max(targetAmount - totalCollected, 0),
        progressPercent: targetAmount ? Math.min(100, Math.round((totalCollected / targetAmount) * 100)) : 0
      },
      members: reportMembers
    });
  } catch (error) {
    next(error);
  }
});

router.get('/members', async (req, res, next) => {
  try {
    const members = await Member.find().sort({ name: 1 }).lean();
    res.json({ members: members.map((member) => ({
      id: member._id,
      name: member.name,
      targetAmount: member.targetAmount,
      isActive: member.isActive,
      isAdminMember: member.isAdminMember
    })) });
  } catch (error) {
    next(error);
  }
});

router.post('/members', async (req, res, next) => {
  try {
    const name = typeof (req.body || {}).name === 'string'
      ? req.body.name.trim().replace(/\s+/g, ' ')
      : '';
    if (!validateMemberName(name)) {
      return res.status(400).json({ error: 'Member name must be between 2 and 100 characters' });
    }

    const normalizedName = normalizeName(name);
    if (await Member.exists({ normalizedName })) {
      return res.status(409).json({ error: 'A member with this name already exists' });
    }

    const member = await Member.create({
      name,
      normalizedName,
      targetAmount: 20000,
      isAdminMember: false,
      isActive: true
    });
    await createNotification({
      io: req.app.get('io'),
      type: 'member.created',
      title: 'New group member',
      message: `${req.user.name} added ${member.name} to the group.`,
      actorId: req.user._id
    });
    return res.status(201).json({
      member: {
        id: member._id,
        name: member.name,
        targetAmount: member.targetAmount,
        isActive: member.isActive,
        isAdminMember: member.isAdminMember
      }
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ error: 'A member with this name already exists' });
    }
    return next(error);
  }
});

module.exports = router;
