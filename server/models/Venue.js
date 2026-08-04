/**
 * Venue.js
 * Venue model — stores all venue details including owner-set
 * availability (open/close hours per day and closed dates).
 */

const mongoose = require('mongoose');

const venueSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Owner',
      required: true,
      index: true,
    },

    name: { type: String, required: [true, 'Venue name is required'], trim: true },
    sport: {
      type: String,
      required: true,
      enum: ['Football', 'Cricket', 'Basketball', 'Pickleball', 'Bowling', 'Pool', 'Badminton', 'Tennis'],
    },
    location: { type: String, required: [true, 'Location is required'], trim: true },
    description: { type: String, trim: true, default: '' },
    lat: { type: Number, default: null, min: -90, max: 90 },
    lng: { type: Number, default: null, min: -180, max: 180 },
    price: { type: Number, required: [true, 'Price per hour is required'], min: 0 },

    specs: {
      length:    { type: Number, required: true, min: 0 },
      breadth:   { type: Number, required: true, min: 0 },
      height:    { type: Number, default: 0, min: 0 },
      condition: { type: String, trim: true, default: 'Standard condition' },
      tools:     { type: String, trim: true, default: 'Not specified' },
      turfs:     { type: Number, default: 1, min: 1 },
    },

    tags:  [{ type: String, enum: ['floodlights', 'parking', 'changing', 'cafeteria', 'ac', 'shower', 'wifi'] }],
    slots: [{ type: String, enum: ['morning', 'afternoon', 'evening', 'night'] }],

    // ── Availability ─────────────────────────────────────────────
    // openHour / closeHour: 0-23 integers (owner sets "6 AM to 10 PM" → 6/22)
    openHour:  { type: Number, default: 6,  min: 0, max: 23 },
    closeHour: { type: Number, default: 22, min: 1, max: 24 },

    // closedDates: array of 'YYYY-MM-DD' strings the owner marks as closed
    closedDates: { type: [String], default: [] },

    images: {
      type: [String],
      validate: {
        validator: (arr) => arr.length <= 10,
        message: 'Provide up to 10 image URLs',
      },
      default: [],
    },

    rating:       { type: Number, default: 4.5, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0 },
    isActive:     { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

venueSchema.virtual('area').get(function () {
  return +(this.specs.length * this.specs.breadth).toFixed(1);
});
venueSchema.virtual('volume').get(function () {
  return +(this.area * this.specs.height).toFixed(1);
});

venueSchema.index({ name: 'text', location: 'text', sport: 'text', tags: 'text' });

module.exports = mongoose.model('Venue', venueSchema);
