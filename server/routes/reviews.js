/**
 * routes/reviews.js
 * Customers leave reviews, owners can reply — mirrors the reply box
 * already built into owner-portal.js. Every new review also recomputes
 * the venue's average rating, so Venue.rating always stays accurate
 * without you having to update it by hand anywhere else.
 */

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const isOwner = require('../middleware/isOwner');
const Review = require('../models/Review');
const Venue = require('../models/Venue');
const Booking = require('../models/Booking');

/* ══════════════════════════════════════
   PUBLIC — all reviews for one venue (venue-detail.html)
   GET /api/reviews/venue/:venueId
   ══════════════════════════════════════ */
router.get('/venue/:venueId', async (req, res, next) => {
  try {
    const reviews = await Review.find({ venue: req.params.venueId })
      .populate('customer', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: reviews.length, data: reviews });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   CUSTOMER — leave a review
   POST /api/reviews
   ══════════════════════════════════════ */
router.post('/', protect, async (req, res, next) => {
  try {
    if (req.auth.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Only customers can leave reviews' });
    }
    const { venueId, rating, text, bookingId } = req.body;
    if (!venueId || !rating || !text) {
      return res.status(400).json({ success: false, message: 'venueId, rating and text are required' });
    }

    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    // Verify customer has completed at least 1 paid booking at this venue
    const hasBooking = await Booking.findOne({
      customer: req.auth.id,
      venue: venue._id,
      paymentStatus: 'paid',
      status: { $in: ['upcoming', 'completed'] },
    });

    if (!hasBooking) {
      return res.status(400).json({
        success: false,
        message: 'You must have completed at least one paid booking at this venue to write a review.',
      });
    }

    const existingReview = await Review.findOne({ customer: req.auth.id, venue: venue._id });
    if (existingReview) {
      return res.status(400).json({ success: false, message: 'You have already rated/reviewed this venue' });
    }

    const review = await Review.create({
      customer: req.auth.id,
      venue: venue._id,
      owner: venue.owner,
      booking: bookingId || hasBooking._id,
      rating: Number(rating),
      text: text.trim(),
    });

    // Keep the venue's displayed rating/reviewsCount in sync automatically.
    const stats = await Review.aggregate([
      { $match: { venue: venue._id } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    venue.rating = stats[0] ? +stats[0].avg.toFixed(1) : venue.rating;
    venue.reviewsCount = stats[0] ? stats[0].count : venue.reviewsCount;
    await venue.save();

    res.status(201).json({ success: true, data: review });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'You have already rated/reviewed this venue' });
    }
    next(err);
  }
});

/* ══════════════════════════════════════
   OWNER — all reviews across their venues (owner-portal.js reviews list)
   GET /api/reviews/owner
   ══════════════════════════════════════ */
router.get('/owner', protect, isOwner, async (req, res, next) => {
  try {
    const reviews = await Review.find({ owner: req.auth.id })
      .populate('customer', 'name')
      .populate('venue', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: reviews.length, data: reviews });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   OWNER — reply to a review on one of their venues
   PATCH /api/reviews/:id/reply
   ══════════════════════════════════════ */
router.patch('/:id/reply', protect, isOwner, async (req, res, next) => {
  try {
    const { reply } = req.body;
    if (!reply || !reply.trim()) {
      return res.status(400).json({ success: false, message: 'Reply text is required' });
    }
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    if (review.owner.toString() !== req.auth.id) {
      return res.status(403).json({ success: false, message: 'You do not own the venue this review belongs to' });
    }
    review.reply = reply.trim();
    review.repliedAt = new Date();
    await review.save();
    res.json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   CUSTOMER — update their own review
   PUT /api/reviews/:id
   ══════════════════════════════════════ */
router.put('/:id', protect, async (req, res, next) => {
  try {
    if (req.auth.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Only customer accounts can edit reviews' });
    }
    const { rating, text } = req.body;
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    if (review.customer.toString() !== req.auth.id) {
      return res.status(403).json({ success: false, message: 'You can only edit your own review' });
    }

    if (rating) review.rating = rating;
    if (text !== undefined) review.text = text.trim();
    await review.save();

    // Recalculate venue rating
    const venue = await Venue.findById(review.venue);
    if (venue) {
      const stats = await Review.aggregate([
        { $match: { venue: venue._id } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]);
      venue.rating = stats[0] ? +stats[0].avg.toFixed(1) : 5.0;
      venue.reviewsCount = stats[0] ? stats[0].count : 0;
      await venue.save();
    }

    res.json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   CUSTOMER — delete their own review
   DELETE /api/reviews/:id
   ══════════════════════════════════════ */
router.delete('/:id', protect, async (req, res, next) => {
  try {
    if (req.auth.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Only customer accounts can delete reviews' });
    }
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    if (review.customer.toString() !== req.auth.id) {
      return res.status(403).json({ success: false, message: 'You can only delete your own review' });
    }

    const venueId = review.venue;
    await review.deleteOne();

    // Recalculate venue rating
    const venue = await Venue.findById(venueId);
    if (venue) {
      const stats = await Review.aggregate([
        { $match: { venue: venue._id } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]);
      venue.rating = stats[0] ? +stats[0].avg.toFixed(1) : 5.0;
      venue.reviewsCount = stats[0] ? stats[0].count : 0;
      await venue.save();
    }

    res.json({ success: true, message: 'Review deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
