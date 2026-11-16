const bcrypt = require('bcryptjs');
const Member = require('../models/Member');
const User = require('../models/User');
const SetupState = require('../models/SetupState');
const { getFixedMembers } = require('../config/fixedMembers');
const {
  normalizeName,
  normalizeUsername,
  validatePassword,
  validateLoginIdentifier
} = require('../utils/validation');

async function bootstrap({ username, password, memberNames }) {
  const adminUsername = username || 'roger';
  if (!validateLoginIdentifier(adminUsername)) {
    const error = new Error('Admin login must be a valid username or email address');
    error.status = 400;
    throw error;
  }
  if (!validatePassword(password)) {
    const error = new Error('Password must be 10-128 characters');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(memberNames) || memberNames.length !== 7) {
    const error = new Error('Exactly seven member names are required for setup');
    error.status = 400;
    throw error;
  }
  const normalizedMembers = memberNames.map((name) => normalizeName(name));
  if (normalizedMembers.some((name) => !name) || new Set(normalizedMembers).size !== normalizedMembers.length) {
    const error = new Error('Each seeded member name must be unique and non-empty');
    error.status = 400;
    throw error;
  }

  if (await SetupState.exists({ _id: 'initial-setup' }) ||
      await User.exists({}) ||
      await Member.exists({})) {
    const error = new Error('Initial setup has already been run or the database is not empty');
    error.status = 409;
    throw error;
  }

  try {
    await SetupState.create({ _id: 'initial-setup', status: 'initializing' });
  } catch (error) {
    if (error.code === 11000) {
      const conflict = new Error('Initial setup has already been run');
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }

  let createdMembers = [];
  const memberData = getFixedMembers(memberNames);
  try {
    createdMembers = await Member.insertMany(memberData, { ordered: true });
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await User.create({
      username: normalizeUsername(adminUsername),
      name: createdMembers[0].name,
      normalizedName: normalizeName(createdMembers[0].name),
      passwordHash,
      role: 'admin',
      status: 'active',
      memberId: createdMembers[0]._id,
      approvedAt: new Date()
    });
    await SetupState.updateOne(
      { _id: 'initial-setup' },
      { $set: { status: 'complete', completedAt: new Date() } }
    );
    return { admin, members: createdMembers };
  } catch (error) {
    await User.deleteMany({ memberId: { $in: createdMembers.map((member) => member._id) } }).catch(() => {});
    await Member.deleteMany({
      $or: [
        { _id: { $in: createdMembers.map((member) => member._id) } },
        { normalizedName: { $in: memberData.map((member) => member.normalizedName) } }
      ]
    }).catch(() => {});
    await SetupState.deleteOne({ _id: 'initial-setup', status: 'initializing' }).catch(() => {});
    throw error;
  }
}

module.exports = { bootstrap };
