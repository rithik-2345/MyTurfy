/**
 * routes/venues.js
 * Public browsing (list/search/filter/sort + single-venue detail) plus
 * owner-only venue management. This is what your frontend now calls
 * instead of reading data.js.
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();

const { protect } = require('../middleware/auth');
const isOwner = require('../middleware/isOwner');
const Venue = require('../models/Venue');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const { uploadImageBuffer, deleteImageByUrl } = require('../utils/uploadImage');

// Uploaded photos are kept in memory only long enough to stream them to
// Cloudinary — never written to disk on the server.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per image
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
});

/* ══════════════════════════════════════
   PUBLIC — list venues (search/filter/sort/paginate)
   GET /api/venues?sport=Football&q=arena&maxPrice=1000&minRating=4
       &minArea=500&minHeight=6&facilities=floodlights,parking
       &sort=price-low&page=1&limit=20
   ══════════════════════════════════════ */
router.get('/', async (req, res, next) => {
  try {
    const {
      sport, q, maxPrice, minRating, minArea, minHeight,
      facilities, sort = 'relevance', page = 1, limit = 20,
    } = req.query;

    const match = { isActive: true };

    if (sport && sport.toLowerCase() !== 'all') {
      match.sport = new RegExp(`^${sport}$`, 'i');
    }
    if (q) {
      // Same "match name/location/sport/tags" behaviour your old
      // client-side searchVenueList() helper had — just server-side now.
      const regex = new RegExp(q, 'i');
      match.$or = [{ name: regex }, { location: regex }, { sport: regex }, { tags: regex }];
    }
    if (maxPrice) match.price = { $lte: Number(maxPrice) };
    if (minRating) match.rating = { $gte: Number(minRating) };
    if (minHeight) match['specs.height'] = { $gte: Number(minHeight) };
    if (facilities) {
      const list = String(facilities).split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) match.tags = { $all: list };
    }

    const pipeline = [
      { $match: match },
      {
        // area/volume aren't stored fields (they're derived from
        // length × breadth × height) — computed here so they can be
        // filtered and sorted on just like any real field.
        $addFields: {
          area: { $round: [{ $multiply: ['$specs.length', '$specs.breadth'] }, 1] },
          volume: { $round: [{ $multiply: [{ $multiply: ['$specs.length', '$specs.breadth'] }, '$specs.height'] }, 1] },
        },
      },
    ];

    if (minArea) pipeline.push({ $match: { area: { $gte: Number(minArea) } } });

    const sortMap = {
      relevance: { rating: -1, createdAt: -1 },
      'price-low': { price: 1 },
      'price-high': { price: -1 },
      rating: { rating: -1 },
      'area-large': { area: -1 },
      'area-small': { area: 1 },
      'height-tall': { 'specs.height': -1 },
      'height-short': { 'specs.height': 1 },
    };

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));

    // $facet runs the "give me page 2" branch and the "how many total
    // matches are there" branch in a single database round trip.
    pipeline.push({
      $facet: {
        data: [
          { $sort: sortMap[sort] || sortMap.relevance },
          { $skip: (pageNum - 1) * limitNum },
          { $limit: limitNum },
        ],
        totalCount: [{ $count: 'count' }],
      },
    });

    const [result] = await Venue.aggregate(pipeline);
    const output = result || { data: [], totalCount: [] };
    const total = output.totalCount[0]?.count || 0;

    res.json({
      success: true,
      count: output.data.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      data: output.data,
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   OWNER — venues belonging to the logged-in owner (owner-portal "My Venues")
   GET /api/venues/owner/mine
   ══════════════════════════════════════ */
router.get('/owner/mine', protect, isOwner, async (req, res, next) => {
  try {
    const venues = await Venue.find({ owner: req.auth.id }).sort({ createdAt: -1 });
    res.json({ success: true, count: venues.length, data: venues });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   OWNER — upload one venue photo, get back a Cloudinary URL
   POST /api/venues/upload-image   (multipart/form-data, field name "image")
   ══════════════════════════════════════ */
router.post('/upload-image', protect, isOwner, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }
    const url = await uploadImageBuffer(req.file.buffer);
    res.json({ success: true, url });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   PUBLIC — single venue (venue-detail.html)
   GET /api/venues/:id
   ══════════════════════════════════════ */
router.get('/:id', async (req, res, next) => {
  try {
    const venue = await Venue.findOne({ _id: req.params.id, isActive: true });
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }
    res.json({ success: true, data: venue }); // area/volume included automatically (schema virtuals)
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   OWNER — create a venue
   POST /api/venues
   ══════════════════════════════════════ */
router.post('/', protect, isOwner, async (req, res, next) => {
  try {
    const { name, sport, location, price, specs, tags, slots, images, description, lat, lng, openHour, closeHour, closedDates } = req.body;
    if (!name || !sport || !location || !price || !specs) {
      return res.status(400).json({ success: false, message: 'Name, sport, location, price and specs are required' });
    }
    const SPORT_DEFAULTS = {
      Football: 'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=800&q=80',
      Cricket:  'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&q=80',
      Basketball: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',
      Pickleball: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80',
      Bowling: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800&q=80',
      Pool:    'https://images.unsplash.com/photo-1599058917765-a780eda07a3e?w=800&q=80',
      Badminton: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80',
      Tennis: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80',
    };
    const finalImages = (images && images.length) ? images : [SPORT_DEFAULTS[sport] || SPORT_DEFAULTS.Football];
    const venue = await Venue.create({
      owner: req.auth.id,
      name, sport, location, price, specs,
      description: description || '',
      tags: tags || [],
      slots: slots || [],
      images: finalImages,
      lat: lat || null,
      lng: lng || null,
      openHour: openHour ?? 6,
      closeHour: closeHour ?? 22,
      closedDates: closedDates || [],
    });
    res.status(201).json({ success: true, data: venue });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   OWNER — update a venue they own
   PUT /api/venues/:id
   ══════════════════════════════════════ */
router.put('/:id', protect, isOwner, async (req, res, next) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });
    if (venue.owner.toString() !== req.auth.id) {
      return res.status(403).json({ success: false, message: 'You do not own this venue' });
    }

    // Delete removed images from Cloudinary cloud storage
    if (req.body.images !== undefined) {
      const oldImages = venue.images || [];
      const newImages = req.body.images || [];
      const toDelete = oldImages.filter(img => !newImages.includes(img));
      toDelete.forEach(img => {
        deleteImageByUrl(img).catch(e => console.error('Cloudinary delete error:', e.message));
      });
    }

    const editable = ['name', 'sport', 'location', 'price', 'specs', 'tags', 'slots', 'images', 'isActive', 'description', 'lat', 'lng', 'openHour', 'closeHour', 'closedDates'];
    editable.forEach((field) => {
      if (req.body[field] !== undefined) venue[field] = req.body[field];
    });

    await venue.save(); // re-runs schema validation on the updated document
    res.json({ success: true, data: venue });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   OWNER — delete a venue they own (cascades to its bookings/reviews)
   DELETE /api/venues/:id
   ══════════════════════════════════════ */
router.delete('/:id', protect, isOwner, async (req, res, next) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });
    if (venue.owner.toString() !== req.auth.id) {
      return res.status(403).json({ success: false, message: 'You do not own this venue' });
    }

    // Delete all associated images from Cloudinary cloud storage
    const images = venue.images || [];
    images.forEach(img => {
      deleteImageByUrl(img).catch(e => console.error('Cloudinary delete error:', e.message));
    });

    await Promise.all([
      Booking.deleteMany({ venue: venue._id }),
      Review.deleteMany({ venue: venue._id }),
      venue.deleteOne(),
    ]);

    res.json({ success: true, message: 'Venue and its bookings/reviews removed' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
