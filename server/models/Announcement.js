const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title:   { type: String, required: [true, 'Title is required'], trim: true },
    message: { type: String, required: [true, 'Message is required'], trim: true },
    type: {
      type: String,
      enum: ['info', 'warning', 'promo', 'maintenance'],
      default: 'info',
    },
    isActive:  { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },  // null = no expiry
  },
  { timestamps: true }
);

module.exports = mongoose.model('Announcement', announcementSchema);
