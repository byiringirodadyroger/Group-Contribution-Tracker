const express = require('express');
const mongoose = require('mongoose');
const Member = require('../models/Member');
const Payment = require('../models/Payment');
const { authenticate, requireApproved } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireApproved);

router.get('/dashboard', async (req, res, next) => {
  try {
    const [members, totals] = await Promise.all([
      Member.find({ isActive: true }).sort({ name: 1 }).lean(),
      Payment.aggregate([
        { $group: { _id: '$memberId', contributed: { $sum: '$amount' }, paymentCount: { $sum: 1 } } }
      ])
    ]);
    const totalByMember = new Map(totals.map((entry) => [entry._id.toString(), entry]));
    const dashboardMembers = members.map((member) => {
      const total = totalByMember.get(member._id.toString()) || { contributed: 0, paymentCount: 0 };
      return {
        id: member._id,
        name: member.name,
        targetAmount: member.targetAmount,
        contributed: total.contributed,
        paymentCount: total.paymentCount,
        remaining: Math.max(member.targetAmount - total.contributed, 0),
        progressPercent: member.targetAmount
          ? Math.min(100, Math.round((total.contributed / member.targetAmount) * 100))
          : 0
      };
    });
    const totalCollected = dashboardMembers.reduce((sum, member) => sum + member.contributed, 0);
    const targetAmount = dashboardMembers.reduce((sum, member) => sum + member.targetAmount, 0);
    const remainingBalance = Math.max(targetAmount - totalCollected, 0);
    const progressPercentage = targetAmount
      ? Math.min(100, Math.round((totalCollected / targetAmount) * 100))
      : 0;
    const fullyPaidMembers = dashboardMembers.filter((member) => member.contributed >= member.targetAmount).length;
    const contributingMembers = dashboardMembers.filter((member) => member.contributed > 0).length;
    const notContributedMembers = dashboardMembers.filter((member) => member.contributed === 0).length;
    res.json({
      totalCollected,
      remainingBalance,
      progressPercentage,
      fullyPaidMembers,
      contributingMembers,
      notContributedMembers,
      totals: {
        contributed: totalCollected,
        totalCollected,
        targetAmount,
        remaining: remainingBalance,
        remainingBalance,
        progressPercent: progressPercentage,
        progressPercentage,
        fullyPaidMembers,
        contributingMembers,
        notContributedMembers,
        memberCount: dashboardMembers.length
      },
      members: dashboardMembers
    });
  } catch (error) {
    next(error);
  }
});

router.get('/members', async (req, res, next) => {
  try {
    const [members, totals] = await Promise.all([
      Member.find({ isActive: true }).sort({ name: 1 }).lean(),
      Payment.aggregate([
        { $group: { _id: '$memberId', contributed: { $sum: '$amount' }, paymentCount: { $sum: 1 } } }
      ])
    ]);
    const totalsByMember = new Map(totals.map((item) => [item._id.toString(), item]));
    res.json({
      members: members.map((member) => {
        const total = totalsByMember.get(member._id.toString()) || { contributed: 0, paymentCount: 0 };
        return {
          id: member._id,
          name: member.name,
          targetAmount: member.targetAmount,
          contributed: total.contributed,
          paymentCount: total.paymentCount,
          remaining: Math.max(member.targetAmount - total.contributed, 0)
        };
      })
    });
  } catch (error) {
    next(error);
  }
});

router.get('/members/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid member id' });
    }
    const member = await Member.findOne({ _id: req.params.id, isActive: true }).lean();
    if (!member) return res.status(404).json({ error: 'Member not found' });
    const [totals, payments] = await Promise.all([
      Payment.aggregate([
        { $match: { memberId: member._id } },
        { $group: { _id: null, contributed: { $sum: '$amount' }, paymentCount: { $sum: 1 } } }
      ]),
      Payment.find({ memberId: member._id })
        .sort({ paidAt: -1 }).limit(50)
        .populate('memberId', 'name')
        .populate('createdBy', 'name')
        .lean()
    ]);
    const total = totals[0] || { contributed: 0, paymentCount: 0 };
    res.json({
      member: {
        id: member._id,
        name: member.name,
        targetAmount: member.targetAmount,
        contributed: total.contributed,
        paymentCount: total.paymentCount,
        remaining: Math.max(member.targetAmount - total.contributed, 0)
      },
      payments: payments.map((payment) => ({
        id: payment._id,
        member: payment.memberId ? { id: payment.memberId._id, name: payment.memberId.name } : null,
        recordedBy: payment.createdBy ? { id: payment.createdBy._id, name: payment.createdBy.name } : null,
        createdAt: payment.createdAt,
        amount: payment.amount,
        method: payment.method,
        paidAt: payment.paidAt,
        transactionReference: payment.transactionReference,
        note: payment.note
      }))
    });
  } catch (error) {
    next(error);
  }
});

function parseDate(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${label} must be a valid date`);
    error.status = 400;
    throw error;
  }
  return date;
}

router.get('/payments', async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page || '1', 10);
    const pageSize = Number.parseInt(req.query.pageSize || '20', 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return res.status(400).json({ error: 'page must be positive and pageSize must be between 1 and 100' });
    }
    const filter = {};
    if (req.query.memberId) {
      if (!mongoose.isValidObjectId(req.query.memberId)) {
        return res.status(400).json({ error: 'Invalid memberId' });
      }
      filter.memberId = req.query.memberId;
    }
    if (req.query.from || req.query.to) {
      filter.paidAt = {};
      if (req.query.from) filter.paidAt.$gte = parseDate(req.query.from, 'from');
      if (req.query.to) {
        const to = parseDate(req.query.to, 'to');
        if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) to.setUTCHours(23, 59, 59, 999);
        filter.paidAt.$lte = to;
      }
      if (filter.paidAt.$gte && filter.paidAt.$lte && filter.paidAt.$gte > filter.paidAt.$lte) {
        return res.status(400).json({ error: 'from must not be later than to' });
      }
    }
    if (req.query.method) {
      if (!['mtn_mobile_money', 'airtel_money', 'cash', 'bank_transfer', 'other'].includes(req.query.method)) {
        return res.status(400).json({ error: 'Unsupported payment method' });
      }
      filter.method = req.query.method;
    }
    const sortValue = req.query.sort || 'paidAt:desc';
    const sortOptions = {
      'paidAt:asc': { paidAt: 1, _id: 1 },
      'paidAt:desc': { paidAt: -1, _id: -1 },
      'amount:asc': { amount: 1, _id: 1 },
      'amount:desc': { amount: -1, _id: -1 }
    };
    if (!sortOptions[sortValue]) {
      return res.status(400).json({ error: 'sort must be paidAt:asc, paidAt:desc, amount:asc, or amount:desc' });
    }
    const [items, total] = await Promise.all([
      Payment.find(filter).sort(sortOptions[sortValue]).skip((page - 1) * pageSize)
        .limit(pageSize).populate('memberId', 'name').populate('createdBy', 'name').lean(),
      Payment.countDocuments(filter)
    ]);
    res.json({
      payments: items.map((payment) => ({
        id: payment._id,
        member: payment.memberId ? { id: payment.memberId._id, name: payment.memberId.name } : null,
        recordedBy: payment.createdBy ? { id: payment.createdBy._id, name: payment.createdBy.name } : null,
        createdAt: payment.createdAt,
        amount: payment.amount,
        method: payment.method,
        paidAt: payment.paidAt,
        transactionReference: payment.transactionReference,
        note: payment.note
      })),
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
