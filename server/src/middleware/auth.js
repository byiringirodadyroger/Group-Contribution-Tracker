const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { loadConfig } = require('../config/env');

const config = loadConfig();

function getToken(req) {
  if (req.cookies && req.cookies.access_token) return req.cookies.access_token;
  const authorization = req.get('authorization') || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
}

async function authenticate(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub).populate('memberId');
    if (!user || !['registered', 'pending', 'active'].includes(user.status) ||
        !user.memberId || !user.memberId.isActive ||
        payload.version !== user.tokenVersion) {
      return res.status(401).json({ error: 'Account is inactive or unavailable' });
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next(error);
  }
}

function requireApproved(req, res, next) {
  if (req.user && req.user.status === 'active') return next();
  return res.status(403).json({ error: 'Administrator approval is required to access group features' });
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin' && req.user.status === 'active') return next();
  return res.status(403).json({ error: 'Administrator access required' });
}

module.exports = { authenticate, requireApproved, requireAdmin, getToken };
