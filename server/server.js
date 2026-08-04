/**
 * server.js — updated to start the payout eligibility scheduler
 */

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const config = require('./config/config');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { startPayoutScheduler } = require('./utils/payoutScheduler');

const authRoutes    = require('./routes/auth');
const venueRoutes   = require('./routes/venues');
const bookingRoutes = require('./routes/bookings');
const reviewRoutes  = require('./routes/reviews');
const paymentRoutes = require('./routes/payments');

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      origin === 'null' ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('192.168.') ||   // ✅ hotspot/LAN devices
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
if (config.nodeEnv !== 'production') app.use(morgan('dev'));

app.use('/api/auth',     authRoutes);
app.use('/api/venues',   venueRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews',  reviewRoutes);
app.use('/api/payments', paymentRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'MyTurfy API is running', env: config.nodeEnv });
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
  });
}
startServer();

module.exports = app;