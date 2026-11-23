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
  'SERVER_IP',
  'CORS_ORIGINS',
  'RENDER_EXTERNAL_URL',
  'PUBLIC_APP_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM'
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
      'Roger', 'Jean Bosco', 'Ildebrand', 'Vivant', 'Shema', 'Renne'
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

test('includes the Render external URL in allowed CORS origins', () => {
  withEnvironment({
    JWT_SECRET: 's'.repeat(32),
    CORS_ORIGINS: 'https://old.example.com',
    RENDER_EXTERNAL_URL: 'https://group-contribution-tracker.onrender.com'
  }, () => {
    assert.deepEqual(loadConfig().corsOrigins, [
      'https://old.example.com',
      'https://group-contribution-tracker.onrender.com'
    ]);
  });
});

test('configures SMTP and the public reset-link origin', () => {
  withEnvironment({
    JWT_SECRET: 's'.repeat(32),
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'admin@example.com',
    SMTP_PASS: 'private-app-password',
    SMTP_FROM: 'Group Tracker <admin@example.com>',
    PUBLIC_APP_URL: 'https://tracker.example.com/'
  }, () => {
    const config = loadConfig();
    assert.deepEqual(config.smtp, {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      user: 'admin@example.com',
      password: 'private-app-password',
      from: 'Group Tracker <admin@example.com>'
    });
    assert.equal(config.publicAppUrl, 'https://tracker.example.com');
  });
});
