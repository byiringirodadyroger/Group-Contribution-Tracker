const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config/env');

const keys = [
  'JWT_SECRET',
  'NODE_ENV',
  'PORT',
  'REGULAR_MEMBER_NAMES',
  'COOKIE_SAME_SITE',
  'COOKIE_SECURE',
  'BOOTSTRAP_SETUP_SECRET',
  'ALLOWED_IPS',
  'ALLOWED_IP',
  'APP_IP',
  'SERVER_IP'
];

function withEnvironment(values, callback) {
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      process.env[key] = values[key];
    } else {
      delete process.env[key];
    }
  }
  try {
    return callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('configures the six required member profiles by default', () => {
  withEnvironment({ JWT_SECRET: 's'.repeat(32) }, () => {
    assert.deepEqual(loadConfig().memberNames, [
      'Roger', 'Jean Bosco', 'Ildebrand', 'Vivant', 'Shema', 'Renne Shaffy'
    ]);
  });
});

test('rejects six regular names because Roger is included in the six-member total', () => {
  withEnvironment({
    JWT_SECRET: 's'.repeat(32),
    REGULAR_MEMBER_NAMES: 'Jean Bosco,Ildebrand,Vivant,Shema,Renne,Shaffy'
  }, () => {
    assert.throws(loadConfig, /must contain five names/);
  });
});

test('accepts a trusted IP allowlist for inbound requests', () => {
  withEnvironment({
    JWT_SECRET: 's'.repeat(32),
    ALLOWED_IPS: '127.0.0.1, 203.0.113.8\n198.51.100.12'
  }, () => {
    assert.deepEqual(loadConfig().allowedIps, ['127.0.0.1', '203.0.113.8', '198.51.100.12']);
  });
});
