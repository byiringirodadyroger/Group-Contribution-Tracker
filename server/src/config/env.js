const parseBoolean = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
};

const requiredSecret = (key) => {
  const value = process.env[key];
  if (!value || value.length < 32) {
    throw new Error(`${key} must be set to at least 32 characters`);
  }
  return value;
};

const parseCsvList = (value) => (value || '')
  .split(/[\n,]/)
  .map((entry) => entry.trim())
  .filter(Boolean);

function loadConfig() {
  const port = Number.parseInt(process.env.PORT || '4000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const sameSite = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
  if (!['strict', 'lax', 'none'].includes(sameSite)) {
    throw new Error('COOKIE_SAME_SITE must be strict, lax, or none');
  }

  const cookieSecure = parseBoolean(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production');
  if (sameSite === 'none' && !cookieSecure) {
    throw new Error('COOKIE_SECURE must be true when COOKIE_SAME_SITE is none');
  }
  const setupSecret = process.env.BOOTSTRAP_SETUP_SECRET;
  if (setupSecret && setupSecret.length < 32) {
    throw new Error('BOOTSTRAP_SETUP_SECRET must be at least 32 characters when set');
  }

  const regularNames = (process.env.REGULAR_MEMBER_NAMES ||
    'Jean Bosco,Ildebrand,Vivant,Shema,Renne Shaffy')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (regularNames.length !== 5 || regularNames.some((name) => name.toLowerCase() === 'roger')) {
    throw new Error('REGULAR_MEMBER_NAMES must contain five names and must not include Roger');
  }
  const normalizedNames = ['Roger', ...regularNames].map((name) => name.trim().replace(/\s+/g, ' ').toLowerCase());
  if (new Set(normalizedNames).size !== 6) {
    throw new Error('REGULAR_MEMBER_NAMES must be unique');
  }

  const allowedIps = Array.from(new Set([
    ...parseCsvList(process.env.ALLOWED_IPS),
    ...parseCsvList(process.env.ALLOWED_IP),
    ...parseCsvList(process.env.APP_IP),
    ...parseCsvList(process.env.SERVER_IP)
  ])).map((ip) => ip.trim());
  const corsOrigins = Array.from(new Set([
    ...parseCsvList(process.env.CORS_ORIGINS),
    process.env.RENDER_EXTERNAL_URL
  ].filter(Boolean).map((origin) => origin.trim().replace(/\/+$/, ''))));

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port,
    mongoUri: process.env.MONGODB_URI,
    jwtSecret: requiredSecret('JWT_SECRET'),
    setupSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
    cookie: {
      httpOnly: true,
      secure: cookieSecure,
      sameSite,
      path: '/',
      ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {})
    },
    corsOrigins: corsOrigins.length > 0 ? corsOrigins : ['http://localhost:5173'],
    allowedIps,
    memberNames: ['Roger', ...regularNames]
  };
}

module.exports = { loadConfig };
