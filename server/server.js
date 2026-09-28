/**
 * server.js — updated to start the payout eligibility scheduler
 */

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');

const config = require('./config/config');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { startPayoutScheduler } = require('./utils/payoutScheduler');
const { startReminderScheduler } = require('./utils/reminderScheduler');

const authRoutes    = require('./routes/auth');
const venueRoutes   = require('./routes/venues');
const bookingRoutes = require('./routes/bookings');
const reviewRoutes  = require('./routes/reviews');
const paymentRoutes = require('./routes/payments');
const tcoinsRoutes  = require('./routes/tcoins');
const adminRoutes   = require('./routes/admin');
const Announcement  = require('./models/Announcement');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      origin === 'null' ||
      /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
      /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin) ||
      origin === config.clientUrl
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
const rateLimit = require('express-rate-limit');

// Anti-bot rate limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per 15 mins
  message: { success: false, message: 'Too many requests from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // max 100 login/register attempts per 15 mins
  message: { success: false, message: 'Too many auth attempts from this IP. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20, // max 20 OTP requests per 10 mins
  message: { success: false, message: 'Too many OTP requests. Please wait 10 minutes before requesting again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/auth/send-otp', otpLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/owner/login', authLimiter);
app.use('/api/auth/owner/register', authLimiter);

app.use('/api/auth',     authRoutes);
app.use('/api/venues',   venueRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews',  reviewRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tcoins',   tcoinsRoutes);
app.use('/api/admin',    adminRoutes);

// Public announcement endpoint (no auth)
app.get('/api/announcements/active', async (req, res) => {
  try {
    const now = new Date();
    const anns = await Announcement.find({
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: anns });
  } catch (e) {
    res.json({ success: true, data: [] });
  }
});

app.get('/api/health', async (req, res) => {
  const mongoose = require('mongoose');
  const dbOk = mongoose.connection.readyState === 1;
  const status = dbOk ? 200 : 503;
  res.status(status).json({
    success: dbOk,
    message: dbOk ? 'MyTurfy API is running' : 'Database connection lost',
    env: config.nodeEnv,
    db: dbOk ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
  });
});

const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));
app.use('/api', notFound);
app.use(errorHandler);

function checkIntegrations() {
  console.log('\n==================================================');
  console.log('🏟️  MyTurfy Integration Status:');
  console.log('==================================================');
  console.log('🟢 MongoDB               : CONNECTED');
  console.log(config.razorpay.keyId && config.razorpay.keySecret
    ? `🟢 Razorpay              : PASS` : '🔴 Razorpay              : MISSING (test mode active)');
  console.log(config.cloudinary.cloudName && config.cloudinary.apiKey
    ? `🟢 Cloudinary            : PASS` : '🔴 Cloudinary            : MISSING (URL images only)');
  console.log(config.googleClientId
    ? `🟢 Google Sign-In        : PASS` : '🔴 Google Sign-In        : MISSING');
  const { isEmailConfigured } = require('./utils/sendEmail');
  console.log(isEmailConfigured()
    ? `🟢 Email SMTP            : PASS` : '🔴 Email SMTP            : MISSING (OTPs logged to console)');
  console.log('==================================================\n');
}

async function startServer() {
  await connectDB();
  app.listen(config.port, '0.0.0.0', () => {   // ✅ '0.0.0.0' accepts connections from all devices
    console.log(`🏟️  MyTurfy running on http://localhost:${config.port} [${config.nodeEnv}]`);
    checkIntegrations();
    startPayoutScheduler();
    startReminderScheduler();
  });
}
startServer();

module.exports = app;