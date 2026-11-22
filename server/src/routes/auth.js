const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const Member = require('../models/Member');
const PasswordResetToken = require('../models/PasswordResetToken');
const User = require('../models/User');
const SetupState = require('../models/SetupState');
const { authenticate, getToken } = require('../middleware/auth');
const { bootstrap } = require('../services/bootstrap');
const { sendPasswordResetEmail } = require('../services/email');
const { loadConfig } = require('../config/env');
const {
  normalizeName,
  normalizeUsername,
  validateUsername,
  validateLoginIdentifier,
  validatePassword,
  isDuplicateKeyError
} = require('../utils/validation');

const router = express.Router();
const config = loadConfig();
const cookieName = 'access_token';
const passwordResetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

function publicUser(user) {
  return {
    id: user._id,
    username: user.username,
    name: user.name,
    role: user.role,
    status: user.status,
    member: user.memberId ? {
      id: user.memberId._id || user.memberId,
      name: user.memberId.name || user.name
    } : null
  };
}

function setAuthCookie(res, user) {
  const token = jwt.sign({
    sub: user._id.toString(),
    version: user.tokenVersion
  }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
  res.cookie(cookieName, token, config.cookie);
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, username, password, memberId, memberName } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100 ||
        !validateUsername(username) || !validatePassword(password)) {
      return res.status(400).json({
        error: 'Provide a name (2-100 characters), valid username, and password (10-128 characters)'
      });
    }
    if (!memberId && (typeof memberName !== 'string' || !memberName.trim())) {
      return res.status(400).json({ error: 'memberId or memberName is required' });
    }
    if (memberName !== undefined && typeof memberName !== 'string') {
      return res.status(400).json({ error: 'memberName must be a string' });
    }
    if (memberName !== undefined && !memberName.trim()) {
      return res.status(400).json({ error: 'memberName cannot be empty' });
    }
    let member;
    if (memberId) {
      if (!mongoose.isValidObjectId(memberId)) {
        return res.status(400).json({ error: 'Invalid memberId' });
      }
      member = await Member.findById(memberId);
      if (memberName && member && normalizeName(memberName) !== member.normalizedName) {
        return res.status(400).json({ error: 'memberId and memberName do not match' });
      }
    } else {
      member = await Member.findOne({ normalizedName: normalizeName(memberName) });
    }
    if (!member || !member.isActive) {
      return res.status(400).json({ error: 'Choose an available group member' });
    }
    if (member.isAdminMember) {
      return res.status(403).json({ error: 'The administrator account cannot be self-registered' });
    }
    if (normalizeName(name) !== member.normalizedName) {
      return res.status(400).json({ error: 'Your name must match the selected group member' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username: normalizeUsername(username),
      name: member.name,
      normalizedName: member.normalizedName,
      passwordHash,
      role: 'member',
      status: 'registered',
      memberId: member._id
    });
    return res.status(201).json({
      message: 'Account created. Sign in and request access before administrator approval.',
      account: publicUser(user)
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ error: 'Username is taken or this member already has an account' });
    }
    next(error);
  }
});

router.get('/registration-options', async (req, res, next) => {
  try {
    const claimed = await User.distinct('memberId');
    const members = await Member.find({
      isActive: true,
      isAdminMember: false,
      _id: { $nin: claimed }
    }).select('_id name targetAmount').sort({ name: 1 }).lean();
    res.json({ members });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' ||
        !validateLoginIdentifier(username) || !password) {
      return res.status(400).json({ error: 'A valid username or email address and password are required' });
    }
    const user = await User.findOne({ username: normalizeUsername(username) })
      .select('+passwordHash')
      .populate('memberId');
    const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (user.status === 'inactive' || !user.memberId || !user.memberId.isActive) {
      const message = 'Your account is inactive';
      return res.status(403).json({ error: message });
    }
    user.lastLoginAt = new Date();
    await user.save();
    setAuthCookie(res, user);
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', passwordResetRequestLimiter, async (req, res, next) => {
  try {
    const email = typeof (req.body || {}).email === 'string' ? req.body.email.trim() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }

    if (!config.smtp.host || !config.smtp.user || !config.smtp.password || !config.smtp.from) {
      return res.status(503).json({ error: 'Password reset email is not configured' });
    }

    const user = await User.findOne({ username: normalizeUsername(email) });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await PasswordResetToken.deleteMany({ userId: user._id });
      await PasswordResetToken.create({
        userId: user._id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      });
      try {
        await sendPasswordResetEmail({ config, email: user.username, token });
      } catch (error) {
        await PasswordResetToken.deleteOne({ tokenHash });
        console.error('Unable to send password reset email:', error.message);
      }
    }

    res.json({
      message: 'If an account exists for that email, password reset instructions will be sent.'
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', passwordResetLimiter, async (req, res, next) => {
  try {
    const { token, newPassword } = req.body || {};
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token) ||
        !validatePassword(newPassword)) {
      return res.status(400).json({ error: 'The reset link is invalid or expired' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetToken = await PasswordResetToken.findOneAndUpdate(
      { tokenHash, expiresAt: { $gt: new Date() }, usedAt: null },
      { $set: { usedAt: new Date() } },
      { new: true }
    );
    if (!resetToken) {
      return res.status(400).json({ error: 'The reset link is invalid or expired' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const user = await User.findByIdAndUpdate(
      resetToken.userId,
      { $set: { passwordHash }, $inc: { tokenVersion: 1 } },
      { new: true }
    );
    await PasswordResetToken.deleteMany({ userId: resetToken.userId });
    if (!user) {
      return res.status(400).json({ error: 'The reset link is invalid or expired' });
    }
    req.app.get('io').in(`user:${user._id}`).disconnectSockets(true);
    res.clearCookie(cookieName, { ...config.cookie, maxAge: undefined });
    res.json({ message: 'Password reset. Sign in with your new password.' });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res) => {
  const token = getToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (payload.sub) req.app.get('io').in(`user:${payload.sub}`).disconnectSockets(true);
    } catch (error) {
      // The cookie is cleared even when the session token is expired or invalid.
    }
  }
  res.clearCookie(cookieName, { ...config.cookie, maxAge: undefined });
  res.status(204).end();
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/request-access', authenticate, async (req, res, next) => {
  try {
    if (req.user.status === 'pending') {
      return res.status(409).json({ error: 'Access request is already pending', user: publicUser(req.user) });
    }
    if (req.user.status === 'active') {
      return res.status(409).json({ error: 'Account already has access', user: publicUser(req.user) });
    }
    if (req.user.status !== 'registered') {
      return res.status(403).json({ error: 'This account cannot request access' });
    }
    req.user.status = 'pending';
    await req.user.save();
    res.status(200).json({
      message: 'Access request submitted for administrator approval',
      user: publicUser(req.user)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !validatePassword(newPassword)) {
      return res.status(400).json({ error: 'Current password and a valid new password are required' });
    }
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return res.status(400).json({ error: 'New password must differ from the current password' });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.tokenVersion += 1;
    await user.save();
    req.app.get('io').in(`user:${user._id}`).disconnectSockets(true);
    res.clearCookie(cookieName, { ...config.cookie, maxAge: undefined });
    res.json({ message: 'Password changed. Please sign in again.' });
  } catch (error) {
    next(error);
  }
});

router.post('/setup/bootstrap', async (req, res, next) => {
  try {
    if (!config.setupSecret) {
      return res.status(503).json({ error: 'Initial setup is disabled because no setup secret is configured' });
    }
    const provided = req.get('x-setup-secret') || '';
    const expected = Buffer.from(config.setupSecret);
    const actual = Buffer.from(provided);
    const crypto = require('node:crypto');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      return res.status(403).json({ error: 'Invalid setup secret' });
    }
    if (await SetupState.exists({ _id: 'initial-setup', status: 'complete' })) {
      return res.status(409).json({ error: 'Initial setup has already been completed' });
    }
    const { admin, members } = await bootstrap({
      username: (req.body || {}).username,
      password: (req.body || {}).adminPassword,
      memberNames: config.memberNames
    });
    res.status(201).json({
      message: 'Initial setup completed',
      admin: { id: admin._id, username: admin.username, name: admin.name, role: admin.role },
      members: members.map((member) => ({ id: member._id, name: member.name, targetAmount: member.targetAmount }))
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) return res.status(409).json({ error: 'Initial setup conflict' });
    next(error);
  }
});

module.exports = router;
