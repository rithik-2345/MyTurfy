/**
 * Booking.js
 * One document per booking. Stores both the customer and the owner
 * (denormalized from the venue) so the owner portal's "my bookings"
 * query doesn't need to look up the venue first just to filter by owner.
 */

const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    venue: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, index: true },

    date: { type: String, required: [true, 'Booking date is required'] }, // 'YYYY-MM-DD'
    time: { type: String, required: [true, 'Time slot is required'] },    // e.g. '6:00 PM'
    durationHours: { type: Number, default: 1, min: 1 },

    amount: { type: Number, required: true, min: 0 },
    commissionPct: { type: Number, default: 10 },

    status: {
      type: String,
      enum: ['hold', 'upcoming', 'completed', 'cancelled'],
      default: 'hold',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    refundStatus: {
      type: String,
      enum: ['none', 'requested', 'approved', 'rejected'],
      default: 'none',
    },
    refundReason: { type: String },
    refundRejectReason: { type: String },
    refundPct: { type: Number, default: 0 },
    refundAmount: { type: Number, default: 0 },
    ownerCompensation: { type: Number, default: 0 }, // 40% compensation to owner out of unrefunded retained money
    refundRequestedAt: { type: Date },
    cancelledAt: { type: Date, default: null },
    payoutEligible: { type: Boolean, default: false },
    reminder1DaySent: { type: Boolean, default: false },
    reminder1HourSent: { type: Boolean, default: false },

    // Filled in by routes/payments.js in Part 2 once Razorpay confirms.
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpayRefundId: { type: String },

    // ── NEW FEATURES ──────────────────────────────────────────
    courtNumber: { type: Number, default: 1 }, // Specific court/turf selected (1, 2, 3...)
    holdExpiresAt: { type: Date, default: null, index: true }, // 5-minute hold expiry timestamp
    isSplit: { type: Boolean, default: false },
    splitCode: { type: String, default: null, index: true },
    targetPlayers: { type: Number, default: 2 },
    perPersonAmount: { type: Number, default: 0 },
    splitStatus: {
      type: String,
      enum: ['none', 'active', 'completed', 'expired'],
      default: 'none',
    },
    splitExpiresAt: { type: Date, default: null, index: true },
    splitPayments: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        payerName: { type: String },
        payerPhone: { type: String },
        amount: { type: Number },
        tCoinsUsed: { type: Number, default: 0 },
        tCoinsDiscount: { type: Number, default: 0 },
        razorpayPaymentId: { type: String },
        paidAt: { type: Date, default: Date.now },
      },
    ],
    qrCodeData: { type: String, default: null }, // Unique hash for QR ticket scanning
    qrValidated: { type: Boolean, default: false }, // Whether owner has validated the QR code
    qrValidatedAt: { type: Date, default: null }, // When QR code was validated
    qrValidatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', default: null }, // Which owner validated
    verificationOtp: { type: String, default: null }, // OTP for email-based verification
    verificationOtpExpires: { type: Date, default: null }, // OTP expiration time

    // ── T-Coins on this booking ──
    tCoinsUsed: { type: Number, default: 0 },              // Coins redeemed (display value, 10 = ₹1)
    tCoinsDiscount: { type: Number, default: 0 },           // ₹ discount applied (= tCoinsUsed / 10)
    tCoinsEarned: { type: Number, default: 0 },              // Coins earned from this booking (3% × amount × 10)
    tCoinsEarnedCredited: { type: Boolean, default: false }, // Whether earn-back was credited to user wallet
    refundInTCoins: { type: Boolean, default: true },       // Whether refund is processed in T-Coins
    refundCoins: { type: Number, default: 0 },              // T-Coins awarded as refund
  },
  { timestamps: true }
);

// Unique partial index: prevent 2 active (hold/upcoming) bookings for the same slot
bookingSchema.index(
  { venue: 1, date: 1, time: 1, courtNumber: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { status: { $in: ['hold', 'upcoming'] } },
    name: 'unique_active_slot',
  }
);

module.exports = mongoose.model('Booking', bookingSchema);
