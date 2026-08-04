/**
 * Review.js
 * A customer review of a venue, with an optional owner reply — mirrors
 * the reply box already built into owner-portal.js.
 */

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    venue: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }, // optional: ties review to a real visit

    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true, trim: true, maxlength: 1000 },

    reply: { type: String, trim: true, maxlength: 1000, default: null },
    repliedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reviewSchema.index({ customer: 1, venue: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
