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
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    // select:false means this field is left out of query results by
    // default — you must explicitly .select('+password') to fetch it,
    // e.g. during login.
    password: {
      type: String,
      // Google-authenticated accounts never set a password — they log
      // in via Google every time, so it's only required when there's
      // no googleId on the account.
      required: [function () { return !this.googleId; }, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    // Set when the account was created (or later linked) via "Sign in
    // with Google" — null for accounts that only ever used email/password.
    googleId: { type: String, default: null, index: true, sparse: true },
    picture: { type: String, default: null }, // profile photo URL from Google, if signed in that way
    phone: { type: String, trim: true },
    role: { type: String, default: 'user' },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Venue' }],
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
