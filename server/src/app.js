require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const User = require('./models/User');
const { loadConfig } = require('./config/env');
const { restrictClientIp, restrictMutationOrigins } = require('./middleware/origin');
const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');
const chatRoutes = require('./routes/chat');

const config = loadConfig();
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST']
  },
  allowRequest(request, callback) {
    const origin = request.headers.origin;
    callback(null, !origin || config.corsOrigins.includes(origin));
  }
});

app.set('io', io);
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Setup-Secret']
}));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(restrictClientIp);
app.use(restrictMutationOrigins);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts; try again later' }
});
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/request-access', authLimiter);
app.use('/api/auth/setup', rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many setup attempts; try again later' }
}));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});
app.use('/api/auth', authRoutes);
app.use('/api', dataRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chat', chatRoutes);

const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/api') {
    return next();
  }
  const indexPath = path.join(clientDist, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return res.status(503).json({
      error: 'Frontend is not available. Rebuild the client and redeploy.'
    });
  }
  return res.sendFile(indexPath);
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.status && error.status < 500) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: error.message });
  }
  if (error.name === 'CastError' || error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid request data' });
  }
  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
});

io.use(async (socket, next) => {
  try {
    const rawCookie = socket.handshake.headers.cookie || '';
    const tokenPart = rawCookie.split(';').map((part) => part.trim())
      .find((part) => part.startsWith('access_token='));
    if (!tokenPart) return next(new Error('Authentication required'));
    const token = decodeURIComponent(tokenPart.slice('access_token='.length));
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub).populate('memberId');
    if (!user || user.status !== 'active' || !user.memberId || !user.memberId.isActive ||
        payload.version !== user.tokenVersion) {
      return next(new Error('Active approved account required'));
    }
    socket.data.userId = user._id.toString();
    socket.data.expiresAt = payload.exp ? payload.exp * 1000 : Date.now();
    next();
  } catch (error) {
    next(new Error('Authentication required'));
  }
});
io.on('connection', (socket) => {
  socket.join('approved-users');
  socket.join(`user:${socket.data.userId}`);
  let expiryTimer;
  const disconnectAtExpiry = () => {
    const remaining = socket.data.expiresAt - Date.now();
    if (remaining <= 0) return socket.disconnect(true);
    expiryTimer = setTimeout(disconnectAtExpiry, Math.min(remaining, 2147483647));
  };
  disconnectAtExpiry();
  socket.on('disconnect', () => clearTimeout(expiryTimer));
});

module.exports = { app, httpServer, io };
