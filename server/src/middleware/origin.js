const { loadConfig } = require('../config/env');

const config = loadConfig();
const allowedOrigins = new Set(config.corsOrigins);
const allowedIps = new Set(config.allowedIps);

function normalizeIpValue(ipAddress) {
  const value = String(ipAddress || '').trim();
  if (!value) return '';
  const candidate = value.split(',')[0].trim();
  if (candidate.startsWith('::ffff:')) {
    const mapped = candidate.slice(7);
    return /^\d+\.\d+\.\d+\.\d+$/.test(mapped) ? mapped : candidate;
  }
  return candidate;
}

function getRequestIp(req) {
  return normalizeIpValue(req.ip || req.socket?.remoteAddress || '');
}

function restrictClientIp(req, res, next) {
  if (allowedIps.size === 0) return next();

  const requestIp = getRequestIp(req);
  const allowed = requestIp && (
    allowedIps.has(requestIp) ||
    allowedIps.has(`::ffff:${requestIp}`) ||
    allowedIps.has(`::ffff:${requestIp}`.slice(7))
  );

  if (!allowed) {
    return res.status(403).json({ error: 'IP address is not allowed' });
  }

  return next();
}

function restrictMutationOrigins(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Origin is not allowed' });
  }
  next();
}

module.exports = { restrictMutationOrigins, restrictClientIp };
