const { loadConfig } = require('../config/env');

const allowedOrigins = new Set(loadConfig().corsOrigins);

function restrictMutationOrigins(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Origin is not allowed' });
  }
  next();
}

module.exports = { restrictMutationOrigins };
