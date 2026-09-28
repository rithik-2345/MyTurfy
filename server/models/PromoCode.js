const mongoose = require('mongoose');

const promoCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Promo code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    discountType: {
      type: String,
      enum: ['flat', 'percent'],
      required: true,
    },
    discountValue: { type: Number, required: true, min: 0 },  // ₹ for flat, % for percent
    minOrder:      { type: Number, default: 0, min: 0 },      // Min booking amount to apply
    maxDiscount:   { type: Number, default: 0, min: 0 },      // Cap for percent type (0 = no cap)
    maxUses:       { type: Number, default: 0, min: 0 },      // Total uses allowed (0 = unlimited)
    usedCount:     { type: Number, default: 0, min: 0 },      // Times used so far
    expiresAt:     { type: Date, default: null },              // null = never expires
    isActive:      { type: Boolean, default: true },
    applicableSports: { type: [String], default: [] },         // empty = all sports
    applicableVenues: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Venue' }], // empty = all venues
  },
  { timestamps: true }
);

module.exports = mongoose.model('PromoCode', promoCodeSchema);
