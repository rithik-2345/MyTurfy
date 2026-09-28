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
/* ══════════════════════════════════════
   POST REVIEW — Customers & Admins
   POST /api/reviews
   ══════════════════════════════════════ */
router.post('/', protect, async (req, res, next) => {
  try {
    const isAdmin = req.auth.role === 'admin';
    if (!isAdmin && req.auth.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Only registered customers and admins can leave reviews' });
    }
    const { venueId, rating, text, bookingId, adminBadge } = req.body;
    if (!venueId || !rating || !text) {
      return res.status(400).json({ success: false, message: 'venueId, rating and text are required' });
    }

    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    let linkedBookingId = null;

    if (!isAdmin) {
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

      const existingReview = await Review.findOne({ customer: req.auth.id, venue: venue._id, isAdminReview: { $ne: true } });
      if (existingReview) {
        return res.status(400).json({ success: false, message: 'You have already rated/reviewed this venue' });
      }
      linkedBookingId = bookingId || hasBooking._id;
    }

    const review = await Review.create({
      customer: isAdmin ? null : req.auth.id,
      venue: venue._id,
      owner: venue.owner,
      booking: linkedBookingId,
      rating: Number(rating),
      text: text.trim(),
      isAdminReview: isAdmin,
      adminAuthorName: isAdmin ? (req.auth.name || 'MyTurfy Official Admin') : null,
      authorBadge: isAdmin ? (adminBadge || 'Official MyTurfy Verified Review') : null,
    });

    // Keep the venue's displayed rating/reviewsCount in sync automatically.
    const stats = await Review.aggregate([
      { $match: { venue: venue._id } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    venue.rating = stats[0] ? +stats[0].avg.toFixed(1) : venue.rating;
    venue.reviewsCount = stats[0] ? stats[0].count : venue.reviewsCount;
    await venue.save();

    res.status(201).json({ success: true, data: review, message: isAdmin ? 'Admin review published successfully!' : 'Review submitted!' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'You have already rated/reviewed this venue' });
    }
    next(err);
  }
});

/* ══════════════════════════════════════
   OWNER — all reviews across their venues (owner-portal.js reviews list)
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
   UPDATE REVIEW — Author or Admin
   PUT /api/reviews/:id
   ══════════════════════════════════════ */
router.put('/:id', protect, async (req, res, next) => {
  try {
    const isAdmin = req.auth.role === 'admin';
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    if (!isAdmin && review.customer?.toString() !== req.auth.id) {
      return res.status(403).json({ success: false, message: 'You can only edit your own review' });
    }

    const { rating, text, adminBadge } = req.body;
    if (rating) review.rating = Number(rating);
    if (text !== undefined) review.text = text.trim();
    if (isAdmin && adminBadge !== undefined) review.authorBadge = adminBadge;
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
   DELETE REVIEW — Author or Admin
   DELETE /api/reviews/:id
   ══════════════════════════════════════ */
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const isAdmin = req.auth.role === 'admin';
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    if (!isAdmin && review.customer?.toString() !== req.auth.id) {
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
