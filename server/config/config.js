/**
 * config.js
 * Central place that reads process.env and exposes it as one clean object.
 * Every other file imports FROM here instead of touching process.env
 * directly — so if a variable name ever changes, you only fix it once.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5000',

  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/myturfy',

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  googleClientId: process.env.GOOGLE_CLIENT_ID,

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM || 'MyTurfy <no-reply@myturfy.com>',
  },

  platformCommissionPct: Number(process.env.PLATFORM_COMMISSION_PCT || 10),
};

// Fail fast on deploy rather than silently running with missing secrets.
if (config.nodeEnv === 'production') {
  ['jwtSecret', 'mongoUri'].forEach((key) => {
    if (!config[key]) {
      throw new Error(`Missing required config: ${key}. Check your .env file.`);
    }
  });
}

module.exports = config;
