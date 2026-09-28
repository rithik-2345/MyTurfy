/**
 * User.js
 * A CUSTOMER account — the person booking venues (not the owner).
 * Passwords are never stored in plain text: the pre-save hook below
 * hashes them automatically every time a User is created or updated.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [function () { return !this.googleId; }, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    googleId: { type: String, default: null, index: true, sparse: true },
    picture: { type: String, default: null },
    phone: { type: String, trim: true, unique: true, sparse: true },
    role: { type: String, default: 'user' },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Venue' }],
    // ── T-Coins Loyalty Wallet ──
    tCoins: { type: Number, default: 0, min: 0 },           // Current available T-Coins (display value, 10 = ₹1)
    tCoinsLifetime: { type: Number, default: 0, min: 0 },    // Total earned all-time (for tier calculation)
    tCoinsTier: {
      type: String,
      enum: ['rookie', 'regular', 'champion', 'legend'],
      default: 'rookie',
    },
    tCoinsStreak: { type: Number, default: 0 },               // Consecutive weeks with a completed booking
    tCoinsLastBookingWeek: { type: String, default: null },   // ISO week string e.g. "2026-W33"

    // ── Admin blocklist ──
    isBlocked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;   // early exit — no next() needed in async hooks
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  // Mongoose 9: async hooks resolve automatically — do NOT call next()
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  if (!this.password) return Promise.resolve(false); // Google-only account — no password to compare
  return bcrypt.compare(candidatePassword, this.password);
};

// Strips the password before sending a user object back in an API response.
userSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
