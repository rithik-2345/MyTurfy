/**
 * Review.js
 * A customer review of a venue, with an optional owner reply — mirrors
 * the reply box already built into owner-portal.js.
 */

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },
    venue: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null }, // optional: ties review to a real visit

    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true, trim: true, maxlength: 1000 },

    isAdminReview: { type: Boolean, default: false },
    adminAuthorName: { type: String, default: null },
    authorBadge: { type: String, default: null }, // e.g. "Official MyTurfy Review" or "Verified Admin"

    reply: { type: String, trim: true, maxlength: 1000, default: null },
    repliedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reviewSchema.index(
  { customer: 1, venue: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { customer: { $type: 'objectId' }, isAdminReview: { $ne: true } },
  }
);

module.exports = mongoose.model('Review', reviewSchema);
