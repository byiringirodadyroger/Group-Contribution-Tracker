const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeName,
  normalizeUsername,
  validateUsername,
  validateLoginIdentifier,
  validatePassword,
  validateMemberName,
  validatePositiveRwf,
  isDuplicateKeyError
} = require('../src/utils/validation');
const { getFixedMembers } = require('../src/config/fixedMembers');
const mongoose = require('mongoose');
const Payment = require('../src/models/Payment');

test('normalizes names and usernames consistently', () => {
  assert.equal(normalizeName('  Member   One '), 'member one');
  assert.equal(normalizeUsername('  ROGER '), 'roger');
});

test('validates account identifiers and passwords', () => {
  assert.equal(validateUsername('member.1'), true);
  assert.equal(validateUsername('x'), false);
  assert.equal(validateUsername('bad name'), false);
  assert.equal(validateLoginIdentifier('member.1'), true);
  assert.equal(validateLoginIdentifier('byiringirodadyroger@gmail.com'), true);
  assert.equal(validateLoginIdentifier('not-an-email@'), false);
  assert.equal(validateLoginIdentifier(`a@${'b'.repeat(250)}.com`), false);
  assert.equal(validatePassword('long-enough-password'), true);
  assert.equal(validatePassword('short'), false);
  assert.equal(validatePassword('x'.repeat(129)), false);
});

test('validates names for administrator-created member profiles', () => {
  assert.equal(validateMemberName('New Member'), true);
  assert.equal(validateMemberName('  New   Member  '), true);
  assert.equal(validateMemberName(' '), false);
  assert.equal(validateMemberName('A'), false);
  assert.equal(validateMemberName('x'.repeat(101)), false);
  assert.equal(validateMemberName(null), false);
});

test('accepts only positive safe integer RWF amounts', () => {
  assert.equal(validatePositiveRwf(1), true);
  assert.equal(validatePositiveRwf(20000), true);
  assert.equal(validatePositiveRwf(0), false);
  assert.equal(validatePositiveRwf(-1), false);
  assert.equal(validatePositiveRwf(1.5), false);
  assert.equal(validatePositiveRwf(Number.MAX_SAFE_INTEGER + 1), false);
});

test('seeds seven fixed members with 20,000 RWF targets and only Roger marked admin', () => {
  const members = getFixedMembers([
    'Roger', 'Jean Bosco', 'Ildebrand', 'Vivant', 'Shema', 'Renne', 'Shaffy'
  ]);
  assert.equal(members.length, 7);
  assert.ok(members.every((member) => member.targetAmount === 20000));
  assert.deepEqual(members.filter((member) => member.isAdminMember).map((member) => member.name), ['Roger']);
  assert.deepEqual(members.map((member) => member.name), [
    'Roger', 'Jean Bosco', 'Ildebrand', 'Vivant', 'Shema', 'Renne', 'Shaffy'
  ]);
});

test('recognizes Mongo duplicate-key errors', () => {
  assert.equal(isDuplicateKeyError({ code: 11000 }), true);
  assert.equal(isDuplicateKeyError({ code: 42 }), false);
  assert.equal(isDuplicateKeyError(null), false);
});

test('payment schema rejects fractional RWF and indexes idempotency and transaction references', async () => {
  for (const method of ['mtn_mobile_money', 'airtel_money', 'cash', 'bank_transfer', 'other']) {
    const validPayment = new Payment({
      memberId: new mongoose.Types.ObjectId(),
      amount: 25,
      method,
      idempotencyKey: `payment-test-${method}`,
      createdBy: new mongoose.Types.ObjectId(),
      updatedBy: new mongoose.Types.ObjectId()
    });
    await assert.doesNotReject(validPayment.validate());
  }
  const fractionalPayment = new Payment({
    memberId: new mongoose.Types.ObjectId(),
    amount: 25.5,
    method: 'cash',
    idempotencyKey: 'payment-test-fraction',
    createdBy: new mongoose.Types.ObjectId(),
    updatedBy: new mongoose.Types.ObjectId()
  });
  await assert.rejects(fractionalPayment.validate(), (error) => Boolean(error.errors.amount));

  const invalidMethodPayment = new Payment({
    memberId: new mongoose.Types.ObjectId(),
    amount: 25,
    method: 'mobile_money',
    idempotencyKey: 'payment-test-invalid-method',
    createdBy: new mongoose.Types.ObjectId(),
    updatedBy: new mongoose.Types.ObjectId()
  });
  await assert.rejects(invalidMethodPayment.validate(), (error) => Boolean(error.errors.method));

  const indexes = Payment.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.idempotencyKey === 1 && options.unique));
  assert.ok(indexes.some(([keys, options]) =>
    keys.transactionReference === 1 && options.unique && options.partialFilterExpression));
});

test('member target is fixed and cannot be changed through Mongoose updates', () => {
  const Member = require('../src/models/Member');
  assert.equal(Member.schema.path('targetAmount').options.immutable, true);
  assert.equal(Member.schema.path('targetAmount').defaultValue, 20000);
});

test('accounts support registered, pending, active, and inactive states with registered default', async () => {
  const User = require('../src/models/User');
  const statuses = User.schema.path('status').enumValues;
  assert.deepEqual(statuses, ['registered', 'pending', 'active', 'inactive']);
  const user = new User({
    username: 'new-member',
    name: 'Jean Bosco',
    normalizedName: 'jean bosco',
    passwordHash: 'bcrypt-hash',
    memberId: new mongoose.Types.ObjectId()
  });
  assert.equal(user.status, 'registered');
  await assert.doesNotReject(user.validate());
  user.status = 'pending';
  await assert.doesNotReject(user.validate());
});

test('admin deactivation clears approval metadata for previously approved accounts', async () => {
  process.env.JWT_SECRET = 'a'.repeat(32);
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/group-tracker-test';
  process.env.CORS_ORIGINS = 'http://localhost:5173';
  const adminRouter = require('../src/routes/admin');
  const User = require('../src/models/User');
  const accountId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId('111111111111111111111111');
  const routeLayer = adminRouter.stack.find((layer) => layer.route && layer.route.path === '/accounts/:id/status');
  assert.ok(routeLayer);
  const handler = routeLayer.route.stack[0].handle;
  const account = {
    _id: accountId,
    role: 'member',
    status: 'active',
    approvedBy: adminId,
    approvedAt: new Date('2024-01-01T00:00:00.000Z'),
    populate() {
      return this;
    },
    save: async function save() {
      this.saved = true;
      return this;
    }
  };
  User.findById = () => ({ populate: () => account });
  const req = {
    params: { id: accountId.toString() },
    body: { status: 'inactive' },
    user: { _id: adminId },
    app: {
      get: () => ({
        in: () => ({ disconnectSockets: () => {} })
      })
    }
  };
  const res = {
    statusCode: 200,
    json(payload) {
      this.payload = payload;
      return payload;
    }
  };
  await handler(req, res, () => {});
  assert.equal(account.status, 'inactive');
  assert.equal(account.approvedBy, null);
  assert.equal(account.approvedAt, null);
});
