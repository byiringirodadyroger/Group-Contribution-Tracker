const express = require('express');
const mongoose = require('mongoose');
const Member = require('../models/Member');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const { authenticate, requireApproved, requireAdmin } = require('../middleware/auth');
const { createNotification } = require('../services/notifications');
const { validatePositiveRwf, isDuplicateKeyError } = require('../utils/validation');

const router = express.Router();
router.use(authenticate, requireApproved);
const paymentMethods = ['mtn_mobile_money', 'airtel_money', 'cash', 'bank_transfer', 'other'];

function paymentSnapshot(payment) {
  return {
    memberId: payment.memberId.toString(),
    amount: payment.amount,
    method: payment.method,
    paidAt: payment.paidAt,
    transactionReference: payment.transactionReference || '',
    idempotencyKey: payment.idempotencyKey,
    note: payment.note || ''
  };
}

function validatePaymentFields(body, creating) {
  if (body.amount !== undefined && !validatePositiveRwf(body.amount)) {
    return 'amount must be a positive whole number of RWF';
  }
  if (body.method !== undefined && !paymentMethods.includes(body.method)) {
    return `method must be one of: ${paymentMethods.join(', ')}`;
  }
  if (body.memberId !== undefined && !mongoose.isValidObjectId(body.memberId)) {
    return 'memberId is invalid';
  }
  if (body.paidAt !== undefined &&
      (typeof body.paidAt !== 'string' || !body.paidAt.trim() ||
       Number.isNaN(new Date(body.paidAt).getTime()))) {
    return 'paidAt must be a valid date string';
  }
  if (body.transactionReference !== undefined &&
      (typeof body.transactionReference !== 'string' || body.transactionReference.trim().length > 120)) {
    return 'transactionReference must be at most 120 characters';
  }
  if (body.note !== undefined && (typeof body.note !== 'string' || body.note.trim().length > 500)) {
    return 'note must be at most 500 characters';
  }
  if (creating && (body.amount === undefined || body.method === undefined || body.memberId === undefined)) {
    return 'memberId, amount, and method are required';
  }
  return null;
}

async function ensureActiveMember(memberId) {
  const member = await Member.findOne({ _id: memberId, isActive: true });
  if (!member) {
    const error = new Error('Active member not found');
    error.status = 400;
    throw error;
  }
  return member;
}

function responsePayment(payment) {
  return {
    id: payment._id,
    member: payment.memberId ? {
      id: payment.memberId._id || payment.memberId.id,
      name: payment.memberId.name
    } : null,
    recordedBy: payment.recordedBy ? {
      id: payment.recordedBy._id || payment.recordedBy.id,
      name: payment.recordedBy.name
    } : null,
    createdAt: payment.createdAt,
    amount: payment.amount,
    method: payment.method,
    paidAt: payment.paidAt,
    transactionReference: payment.transactionReference,
    note: payment.note
  };
}

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};
    const validationError = validatePaymentFields(body, true);
    if (validationError) return res.status(400).json({ error: validationError });
    const idempotencyKey = req.get('Idempotency-Key');
    if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8 ||
        idempotencyKey.trim().length > 128) {
      return res.status(400).json({ error: 'An Idempotency-Key of 8-128 characters is required' });
    }
    await ensureActiveMember(body.memberId);
    const payment = new Payment({
      memberId: body.memberId,
      amount: body.amount,
      method: body.method,
      paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
      transactionReference: (body.transactionReference || '').trim(),
      idempotencyKey: idempotencyKey.trim(),
      note: (body.note || '').trim(),
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
    await payment.save();
    await AuditLog.create({
      actorId: req.user._id,
      action: 'payment.created',
      paymentId: payment._id,
      before: null,
      after: paymentSnapshot(payment)
    });
    const populated = await Payment.findById(payment._id)
      .populate('memberId', 'name')
      .populate('createdBy', 'name')
      .lean();
    populated.recordedBy = populated.createdBy;
    req.app.get('io').to('approved-users').emit('payment:created', responsePayment(populated));
    await createNotification({
      io: req.app.get('io'),
      type: 'payment.created',
      title: 'Contribution recorded',
      message: `${req.user.name} recorded RWF ${populated.amount} for ${populated.memberId.name}.`,
      actorId: req.user._id
    });
    res.status(201).json({ payment: responsePayment(populated) });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ error: 'Idempotency key or transaction reference already exists' });
    }
    next(error);
  }
});

router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid payment id' });
    }
    const body = req.body || {};
    const validationError = validatePaymentFields(body, false);
    if (validationError) return res.status(400).json({ error: validationError });
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    const before = paymentSnapshot(payment);
    if (body.memberId !== undefined) {
      await ensureActiveMember(body.memberId);
      payment.memberId = body.memberId;
    }
    for (const field of ['amount', 'method', 'note']) {
      if (body[field] !== undefined) {
        payment[field] = field === 'note' ? body[field].trim() : body[field];
      }
    }
    if (body.paidAt !== undefined) payment.paidAt = new Date(body.paidAt);
    if (body.transactionReference !== undefined) {
      payment.transactionReference = body.transactionReference.trim();
    }
    payment.updatedBy = req.user._id;
    await payment.save();
    await AuditLog.create({
      actorId: req.user._id,
      action: 'payment.updated',
      paymentId: payment._id,
      before,
      after: paymentSnapshot(payment)
    });
    const populated = await Payment.findById(payment._id)
      .populate('memberId', 'name')
      .populate('createdBy', 'name')
      .lean();
    populated.recordedBy = populated.createdBy;
    req.app.get('io').to('approved-users').emit('payment:updated', responsePayment(populated));
    await createNotification({
      io: req.app.get('io'),
      type: 'payment.updated',
      title: 'Contribution updated',
      message: `${req.user.name} updated the RWF ${populated.amount} contribution for ${populated.memberId.name}.`,
      actorId: req.user._id
    });
    res.json({ payment: responsePayment(populated) });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ error: 'Transaction reference already exists' });
    }
    next(error);
  }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid payment id' });
    }
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    const before = paymentSnapshot(payment);
    const member = await Member.findById(payment.memberId).select('name');
    await payment.deleteOne();
    await AuditLog.create({
      actorId: req.user._id,
      action: 'payment.deleted',
      paymentId: payment._id,
      before,
      after: null
    });
    req.app.get('io').to('approved-users').emit('payment:deleted', { id: payment._id });
    await createNotification({
      io: req.app.get('io'),
      type: 'payment.deleted',
      title: 'Contribution removed',
      message: `${req.user.name} removed a RWF ${before.amount} contribution${member ? ` for ${member.name}` : ''}.`,
      actorId: req.user._id
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
