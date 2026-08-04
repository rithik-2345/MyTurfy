/**
 * Owner.js — updated with agreedToTerms required field.
 * An owner CANNOT create an account unless they explicitly check the
 * Terms & Privacy Policy checkbox in the registration form.
 * This provides a legal audit trail that they accepted your terms.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ownerSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Business/owner name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
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
    picture:  { type: String, default: null },
    phone:    { type: String, trim: true },
    city:     { type: String, trim: true },

    payout: {
      bankAccountHolder: { type: String, trim: true },
      accountNumber:     { type: String, trim: true },
      ifsc:              { type: String, trim: true, uppercase: true },
      upi:               { type: String, trim: true },
    },

    // ── LEGAL ───────────────────────────────────────────────────
    // Must be true before the account is created.
    // Stored with timestamp so you have a legal audit trail.
    agreedToTerms: {
      type: Boolean,
      required: [true, 'You must agree to the Terms & Conditions and Privacy Policy to create a partner account'],
      validate: {
        validator: (v) => v === true,
        message: 'You must agree to the Terms & Conditions and Privacy Policy',
      },
    },
    agreedToTermsAt: { type: Date, default: null },

    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ownerSchema.pre('save', async function () {
  if (this.isModified('password') && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  // Record the timestamp when they agreed to terms (on first save)
  if (this.isNew && this.agreedToTerms && !this.agreedToTermsAt) {
    this.agreedToTermsAt = new Date();
  }
});

ownerSchema.methods.comparePassword = function (candidatePassword) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidatePassword, this.password);
};

ownerSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('Owner', ownerSchema);