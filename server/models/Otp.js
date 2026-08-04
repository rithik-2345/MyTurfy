const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  code: { type: String, required: true },
  action: { type: String, enum: ['signup', 'login', 'forgot-password'], required: true },
  createdAt: { type: Date, default: Date.now, expires: 1200 } // 20 minutes TTL
});

module.exports = mongoose.model('Otp', otpSchema);
