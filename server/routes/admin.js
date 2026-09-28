/**
 * routes/admin.js
 * Super-admin API — every endpoint is protected by protect + isAdmin.
 * Provides full platform oversight: users, owners, venues, bookings,
 * reviews, promo codes, announcements, blocked slots, analytics, audit log.
 */

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const User = require('../models/User');
const Owner = require('../models/Owner');
const Venue = require('../models/Venue');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const TCoinsLedger = require('../models/TCoinsLedger');
const PromoCode = require('../models/PromoCode');
const Announcement = require('../models/Announcement');
const AdminAuditLog = require('../models/AdminAuditLog');

// All routes below require admin auth
router.use(protect, isAdmin);

// Helper: log admin action
async function auditLog(action, targetType, targetId, details) {
  try {
    await AdminAuditLog.create({ action, targetType, targetId, details });
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

/* ═══════════════════════════════════════════
   DASHBOARD STATS
═══════════════════════════════════════════ */
router.get('/stats', async (req, res, next) => {
  try {
    const [totalUsers, totalOwners, totalVenues, totalBookings, totalCancellations, totalRefunds] = await Promise.all([
      User.countDocuments(),
      Owner.countDocuments(),
      Venue.countDocuments(),
      Booking.countDocuments({ status: { $ne: 'cancelled' } }),
      Booking.countDocuments({ status: 'cancelled' }),
      Booking.countDocuments({ paymentStatus: 'refunded' }),
    ]);

    const blockedUsers = await User.countDocuments({ isBlocked: true });
    const blockedOwners = await Owner.countDocuments({ isBlocked: true });
    const sponsoredVenues = await Venue.countDocuments({ isSponsored: true });
    const activeVenues = await Venue.countDocuments({ isActive: true });

    // Calculate total owner-blocked hours across all venues
    const allVenues = await Venue.find().select('blockedSlots').lean();
    const totalOwnerBlockedSlots = allVenues.reduce((sum, v) => {
      const slots = v.blockedSlots || [];
      return sum + slots.reduce((sSum, s) => sSum + (s.hours ? s.hours.length : 0), 0);
    }, 0);

    // Total revenue
    const revenueResult = await Booking.aggregate([
      { $match: { paymentStatus: 'paid', status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;

    // Bookings per day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const bookingsPerDay = await Booking.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, status: { $ne: 'cancelled' } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, revenue: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]);

    // Bookings by sport
    const bookingsBySport = await Booking.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $lookup: { from: 'venues', localField: 'venue', foreignField: '_id', as: 'v' } },
      { $unwind: '$v' },
      { $group: { _id: '$v.sport', count: { $sum: 1 }, revenue: { $sum: '$amount' } } },
      { $sort: { count: -1 } },
    ]);

    // Top 10 venues by bookings
    const topVenues = await Booking.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: '$venue', count: { $sum: 1 }, revenue: { $sum: '$amount' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'venues', localField: '_id', foreignField: '_id', as: 'v' } },
      { $unwind: '$v' },
      { $project: { name: '$v.name', sport: '$v.sport', location: '$v.location', count: 1, revenue: 1 } },
    ]);

    // User growth (last 30 days)
    const userGrowth = await User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Recent bookings (last 5)
    const recentBookings = await Booking.find({ status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('customer', 'name email')
      .populate('venue', 'name sport');

    res.json({
      success: true,
      data: {
        totalUsers, totalOwners, totalVenues, totalBookings, totalRevenue,
        totalCancellations, totalRefunds, totalOwnerBlockedSlots,
        blockedUsers, blockedOwners, sponsoredVenues, activeVenues,
        bookingsPerDay, bookingsBySport, topVenues, userGrowth, recentBookings,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   CSV EXPORT
═══════════════════════════════════════════ */
router.get('/export/:type', async (req, res, next) => {
  try {
    const { type } = req.params;
    let csv = '';

    if (type === 'users') {
      const users = await User.find().lean();
      csv = 'Name,Email,Phone,Tier,T-Coins,Blocked,Joined\n';
      users.forEach(u => {
        csv += `"${u.name}","${u.email || ''}","${u.phone || ''}","${u.tCoinsTier || 'rookie'}",${u.tCoins || 0},${u.isBlocked || false},"${u.createdAt}"\n`;
      });
    } else if (type === 'owners') {
      const owners = await Owner.find().lean();
      csv = 'Name,Email,Phone,City,Verified,Blocked,Joined\n';
      owners.forEach(o => {
        csv += `"${o.name}","${o.email || ''}","${o.phone || ''}","${o.city || ''}",${o.isVerified},${o.isBlocked || false},"${o.createdAt}"\n`;
      });
    } else if (type === 'venues') {
      const venues = await Venue.find().populate('owner', 'name').lean();
      csv = 'Name,Sport,Location,Price,Rating,Turfs,Commission%,Sponsored,Active,Owner\n';
      venues.forEach(v => {
        csv += `"${v.name}","${v.sport}","${v.location}",${v.price},${v.rating},${v.specs?.turfs || 1},${v.commissionPct || 10},${v.isSponsored || false},${v.isActive},"${v.owner?.name || ''}"\n`;
      });
    } else if (type === 'bookings') {
      const bookings = await Booking.find().populate('customer', 'name email').populate('venue', 'name sport').lean();
      csv = 'Date,Time,Customer,Venue,Sport,Amount,Commission%,Status,Payment\n';
      bookings.forEach(b => {
        csv += `"${b.date}","${b.time}","${b.customer?.name || ''}","${b.venue?.name || ''}","${b.venue?.sport || ''}",${b.amount},${b.commissionPct || 10},"${b.status}","${b.paymentStatus}"\n`;
      });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid export type' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_export_${Date.now()}.csv`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   USERS
═══════════════════════════════════════════ */
router.get('/users', async (req, res, next) => {
  try {
    const { search, blocked, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }
    if (blocked === 'true') filter.isBlocked = true;
    else if (blocked === 'false') filter.isBlocked = { $ne: true };

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((Math.max(1, +page) - 1) * +limit)
      .limit(Math.min(100, +limit))
      .lean();

    // Attach cancellation and refund counts for each user
    const userIds = users.map(u => u._id);
    const [cancelStats, refundStats] = await Promise.all([
      Booking.aggregate([
        { $match: { customer: { $in: userIds }, status: 'cancelled' } },
        { $group: { _id: '$customer', count: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { customer: { $in: userIds }, paymentStatus: 'refunded' } },
        { $group: { _id: '$customer', count: { $sum: 1 }, totalRefunded: { $sum: '$refundAmount' } } },
      ]),
    ]);

    const cancelMap = {};
    cancelStats.forEach(c => { cancelMap[c._id.toString()] = c.count; });
    const refundMap = {};
    refundStats.forEach(r => { refundMap[r._id.toString()] = { count: r.count, total: r.totalRefunded }; });

    users.forEach(u => {
      u.cancellationCount = cancelMap[u._id.toString()] || 0;
      u.refundCount = refundMap[u._id.toString()]?.count || 0;
      u.totalRefunded = refundMap[u._id.toString()]?.total || 0;
    });

    res.json({ success: true, total, page: +page, data: users });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const [bookings, reviews, tcoins] = await Promise.all([
      Booking.find({ customer: user._id }).populate('venue', 'name sport location').sort({ createdAt: -1 }).lean(),
      Review.find({ customer: user._id }).populate('venue', 'name sport').sort({ createdAt: -1 }).lean(),
      TCoinsLedger.find({ user: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);

    const cancellationCount = bookings.filter(b => b.status === 'cancelled').length;
    const refundCount = bookings.filter(b => b.paymentStatus === 'refunded').length;
    const totalRefunded = bookings.filter(b => b.paymentStatus === 'refunded').reduce((s, b) => s + (b.refundAmount || b.amount || 0), 0);

    res.json({ success: true, data: { ...user, bookings, reviews, tcoins, cancellationCount, refundCount, totalRefunded } });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id/block', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.isBlocked = !user.isBlocked;
    await user.save();

    await auditLog(
      user.isBlocked ? 'block_user' : 'unblock_user',
      'user', user._id,
      `${user.isBlocked ? 'Blocked' : 'Unblocked'} user: ${user.name} (${user.email})`
    );

    res.json({ success: true, data: user, message: user.isBlocked ? 'User blocked' : 'User unblocked' });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await Promise.all([
      Booking.deleteMany({ customer: user._id }),
      Review.deleteMany({ customer: user._id }),
      TCoinsLedger.deleteMany({ user: user._id }),
      user.deleteOne(),
    ]);

    await auditLog('delete_user', 'user', user._id, `Deleted user: ${user.name} (${user.email})`);
    res.json({ success: true, message: 'User and related data deleted' });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   OWNERS
═══════════════════════════════════════════ */
router.get('/owners', async (req, res, next) => {
  try {
    const { search, blocked, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }, { city: regex }];
    }
    if (blocked === 'true') filter.isBlocked = true;
    else if (blocked === 'false') filter.isBlocked = { $ne: true };

    const total = await Owner.countDocuments(filter);
    const owners = await Owner.find(filter)
      .sort({ createdAt: -1 })
      .skip((Math.max(1, +page) - 1) * +limit)
      .limit(Math.min(100, +limit))
      .lean();

    // Attach venue count, cancellation count, and total blocked slot hours for each owner
    const ownerIds = owners.map(o => o._id);
    const [venuesList, ownerCancelStats] = await Promise.all([
      Venue.find({ owner: { $in: ownerIds } }).select('owner blockedSlots').lean(),
      Booking.aggregate([
        { $match: { owner: { $in: ownerIds }, status: 'cancelled' } },
        { $group: { _id: '$owner', count: { $sum: 1 } } },
      ]),
    ]);

    const cancelMap = {};
    ownerCancelStats.forEach(c => { cancelMap[c._id.toString()] = c.count; });

    const venueMap = {};
    const blockedMap = {};
    venuesList.forEach(v => {
      const oId = v.owner?.toString();
      if (oId) {
        venueMap[oId] = (venueMap[oId] || 0) + 1;
        const blockedEntries = v.blockedSlots || [];
        const totalBlockedHours = blockedEntries.reduce((sum, s) => sum + (s.hours ? s.hours.length : 0), 0);
        blockedMap[oId] = (blockedMap[oId] || 0) + totalBlockedHours;
      }
    });

    owners.forEach(o => {
      const oId = o._id.toString();
      o.venueCount = venueMap[oId] || 0;
      o.cancellationCount = cancelMap[oId] || 0;
      o.totalBlockedHours = blockedMap[oId] || 0;
    });

    res.json({ success: true, total, page: +page, data: owners });
  } catch (err) {
    next(err);
  }
});

router.get('/owners/:id', async (req, res, next) => {
  try {
    const owner = await Owner.findById(req.params.id).lean();
    if (!owner) return res.status(404).json({ success: false, message: 'Owner not found' });

    const [venues, bookings] = await Promise.all([
      Venue.find({ owner: owner._id }).lean(),
      Booking.find({ owner: owner._id }).populate('customer', 'name email').populate('venue', 'name sport').sort({ createdAt: -1 }).lean(),
    ]);

    const totalBlockedHours = venues.reduce((sum, v) => {
      const blockedEntries = v.blockedSlots || [];
      return sum + blockedEntries.reduce((sSum, s) => sSum + (s.hours ? s.hours.length : 0), 0);
    }, 0);
    const cancellationCount = bookings.filter(b => b.status === 'cancelled').length;

    res.json({ success: true, data: { ...owner, venues, bookings, totalBlockedHours, cancellationCount } });
  } catch (err) {
    next(err);
  }
});

router.patch('/owners/:id/block', async (req, res, next) => {
  try {
    const owner = await Owner.findById(req.params.id);
    if (!owner) return res.status(404).json({ success: false, message: 'Owner not found' });

    owner.isBlocked = !owner.isBlocked;
    await owner.save();

    await auditLog(
      owner.isBlocked ? 'block_owner' : 'unblock_owner',
      'owner', owner._id,
      `${owner.isBlocked ? 'Blocked' : 'Unblocked'} owner: ${owner.name} (${owner.email})`
    );

    res.json({ success: true, data: owner, message: owner.isBlocked ? 'Owner blocked' : 'Owner unblocked' });
  } catch (err) {
    next(err);
  }
});

router.patch('/owners/:id/verify', async (req, res, next) => {
  try {
    const owner = await Owner.findById(req.params.id);
    if (!owner) return res.status(404).json({ success: false, message: 'Owner not found' });

    owner.isVerified = !owner.isVerified;
    await owner.save();

    await auditLog(
      owner.isVerified ? 'verify_owner' : 'unverify_owner',
      'owner', owner._id,
      `${owner.isVerified ? 'Verified' : 'Unverified'} owner: ${owner.name}`
    );

    res.json({ success: true, data: owner, message: owner.isVerified ? 'Owner verified' : 'Owner unverified' });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   VENUES
═══════════════════════════════════════════ */
router.get('/venues', async (req, res, next) => {
  try {
    const { search, sport, sponsored, active, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ name: regex }, { location: regex }];
    }
    if (sport && sport !== 'all') filter.sport = sport;
    if (sponsored === 'true') filter.isSponsored = true;
    if (active === 'true') filter.isActive = true;
    else if (active === 'false') filter.isActive = false;

    const total = await Venue.countDocuments(filter);
    const venues = await Venue.find(filter)
      .populate('owner', 'name email city')
      .sort({ isSponsored: -1, createdAt: -1 })
      .skip((Math.max(1, +page) - 1) * +limit)
      .limit(Math.min(100, +limit))
      .lean();

    const venueIds = venues.map(v => v._id);
    const cancelStats = await Booking.aggregate([
      { $match: { venue: { $in: venueIds }, status: 'cancelled' } },
      { $group: { _id: '$venue', count: { $sum: 1 } } },
    ]);
    const cancelMap = {};
    cancelStats.forEach(c => { cancelMap[c._id.toString()] = c.count; });

    venues.forEach(v => {
      v.cancellationCount = cancelMap[v._id.toString()] || 0;
      const blockedEntries = v.blockedSlots || [];
      v.blockedHoursCount = blockedEntries.reduce((sum, s) => sum + (s.hours ? s.hours.length : 0), 0);
    });

    res.json({ success: true, total, page: +page, data: venues });
  } catch (err) {
    next(err);
  }
});

router.get('/venues/:id', async (req, res, next) => {
  try {
    const venue = await Venue.findById(req.params.id).populate('owner', 'name email phone city isVerified').lean();
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    const [bookings, reviews] = await Promise.all([
      Booking.find({ venue: venue._id }).populate('customer', 'name email').sort({ createdAt: -1 }).limit(100).lean(),
      Review.find({ venue: venue._id }).populate('customer', 'name email').sort({ createdAt: -1 }).lean(),
    ]);

    // Revenue stats
    const paidBookings = bookings.filter(b => b.paymentStatus === 'paid' && b.status !== 'cancelled');
    const totalRevenue = paidBookings.reduce((s, b) => s + (b.amount || 0), 0);
    const platformCut = Math.round(totalRevenue * ((venue.commissionPct || 10) / 100));
    const ownerShare = totalRevenue - platformCut;

    res.json({
      success: true,
      data: {
        ...venue, bookings, reviews,
        stats: { totalBookings: paidBookings.length, totalRevenue, platformCut, ownerShare },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/venues/:id/sponsor', async (req, res, next) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    venue.isSponsored = !venue.isSponsored;
    await venue.save();

    await auditLog(
      venue.isSponsored ? 'sponsor_venue' : 'unsponsor_venue',
      'venue', venue._id,
      `${venue.isSponsored ? 'Sponsored' : 'Unsponsored'} venue: ${venue.name}`
    );

    res.json({ success: true, data: venue, message: venue.isSponsored ? 'Venue sponsored' : 'Venue unsponsored' });
  } catch (err) {
    next(err);
  }
});

router.patch('/venues/:id/commission', async (req, res, next) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    const pct = Number(req.body.commissionPct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ success: false, message: 'Commission must be 0-100' });
    }
    const oldPct = venue.commissionPct;
    venue.commissionPct = pct;
    await venue.save();

    await auditLog('change_commission', 'venue', venue._id,
      `Changed commission for ${venue.name}: ${oldPct}% → ${pct}%`);

    res.json({ success: true, data: venue, message: `Commission updated to ${pct}%` });
  } catch (err) {
    next(err);
  }
});

router.patch('/venues/:id/convenience-fee', async (req, res, next) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    const fee = Number(req.body.convenienceFee);
    if (isNaN(fee) || fee < 0) {
      return res.status(400).json({ success: false, message: 'Fee must be ≥ 0' });
    }
    venue.convenienceFee = fee;
    await venue.save();

    await auditLog('change_convenience_fee', 'venue', venue._id,
      `Changed convenience fee for ${venue.name}: ₹${fee}`);

    res.json({ success: true, data: venue, message: `Convenience fee updated to ₹${fee}` });
  } catch (err) {
    next(err);
  }
});

router.patch('/venues/:id/toggle-active', async (req, res, next) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    venue.isActive = !venue.isActive;
    await venue.save();

    await auditLog('toggle_venue_active', 'venue', venue._id,
      `${venue.isActive ? 'Activated' : 'Deactivated'} venue: ${venue.name}`);

    res.json({ success: true, data: venue, message: venue.isActive ? 'Venue activated' : 'Venue deactivated' });
  } catch (err) {
    next(err);
  }
});

router.put('/venues/:id', async (req, res, next) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    const editable = ['name', 'sport', 'location', 'price', 'specs', 'tags', 'slots', 'images',
      'isActive', 'description', 'lat', 'lng', 'openHour', 'closeHour', 'closedDates',
      'blockedSlots', 'isSponsored', 'commissionPct', 'convenienceFee', 'adminNotes'];
    editable.forEach(field => {
      if (req.body[field] !== undefined) venue[field] = req.body[field];
    });

    await venue.save();
    res.json({ success: true, data: venue, message: 'Venue updated' });
  } catch (err) {
    next(err);
  }
});

router.patch('/venues/:id/notes', async (req, res, next) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    venue.adminNotes = req.body.adminNotes || '';
    await venue.save();
    res.json({ success: true, data: venue });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   BOOKINGS
═══════════════════════════════════════════ */
router.get('/bookings', async (req, res, next) => {
  try {
    const { status, dateFrom, dateTo, venueId, userId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (venueId) filter.venue = venueId;
    if (userId) filter.customer = userId;
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }

    const total = await Booking.countDocuments(filter);
    const bookings = await Booking.find(filter)
      .populate('customer', 'name email phone')
      .populate('venue', 'name sport location commissionPct')
      .populate('owner', 'name email')
      .sort({ createdAt: -1 })
      .skip((Math.max(1, +page) - 1) * +limit)
      .limit(Math.min(100, +limit))
      .lean();

    res.json({ success: true, total, page: +page, data: bookings });
  } catch (err) {
    next(err);
  }
});

router.post('/bookings/:id/force-refund', async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('customer', 'name email');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const refundAmount = booking.amount;

    // ── 1. Attempt real money refund via Razorpay ──
    const config = require('../config/config');
    let razorpayRefunded = false;
    let razorpayRefundId = null;

    if (booking.razorpayPaymentId && config.razorpay.keyId && config.razorpay.keySecret) {
      try {
        const Razorpay = require('razorpay');
        const razorpay = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
        const refundResult = await razorpay.payments.refund(booking.razorpayPaymentId, {
          amount: refundAmount * 100, // Razorpay expects paise
          notes: { reason: 'Admin force refund', bookingId: booking._id.toString() },
        });
        razorpayRefunded = true;
        razorpayRefundId = refundResult.id;
      } catch (rzpErr) {
        console.error('Razorpay refund failed:', rzpErr.message);
        // Continue — mark as refunded even if Razorpay call fails (admin can handle manually)
      }
    }

    // ── 2. Update booking status ──
    booking.refundStatus = 'approved';
    booking.status = 'cancelled';
    booking.paymentStatus = 'refunded';
    booking.refundPct = 100;
    booking.refundAmount = refundAmount;
    booking.refundInTCoins = false; // Real money refund, NOT T-Coins
    if (razorpayRefundId) booking.razorpayRefundId = razorpayRefundId;

    // ── 3. Reverse earned T-Coins (claw back 3% cashback) ──
    const customerUser = booking.customer?._id
      ? await User.findById(booking.customer._id)
      : await User.findById(booking.customer);

    if (customerUser) {
      const coinsToReverse = booking.tCoinsEarned || (booking.paymentStatus === 'paid' ? Math.round(booking.amount * 0.03 * 10) : 0);
      if (coinsToReverse > 0 && (booking.tCoinsEarnedCredited || booking.tCoinsEarned > 0)) {
        customerUser.tCoins = Math.max(0, (customerUser.tCoins || 0) - coinsToReverse);
        customerUser.tCoinsLifetime = Math.max(0, (customerUser.tCoinsLifetime || 0) - coinsToReverse);
        booking.tCoinsEarnedCredited = false;
        await TCoinsLedger.create({
          user: customerUser._id,
          booking: booking._id,
          type: 'reverse_earn',
          amount: -coinsToReverse,
          rupeesEquivalent: -Math.round(coinsToReverse / 10),
          balanceAfter: customerUser.tCoins,
          description: `Reversed ${coinsToReverse} earned T-Coins — admin force refund`,
        });
      }

      // ── 4. Return used T-Coins back to wallet ──
      if (booking.tCoinsUsed > 0) {
        customerUser.tCoins = (customerUser.tCoins || 0) + booking.tCoinsUsed;
        await TCoinsLedger.create({
          user: customerUser._id,
          booking: booking._id,
          type: 'reverse_redeem',
          amount: booking.tCoinsUsed,
          rupeesEquivalent: Math.round(booking.tCoinsUsed / 10),
          balanceAfter: customerUser.tCoins,
          description: `Refunded ${booking.tCoinsUsed} used T-Coins — admin force refund`,
        });
      }

      await customerUser.save();
    }

    await booking.save();

    await auditLog('force_refund', 'booking', booking._id,
      `Admin force-refunded ₹${refundAmount} real money${razorpayRefunded ? ' (Razorpay refund: ' + razorpayRefundId + ')' : ' (manual refund)'} for venue ${booking.venue}`);

    res.json({
      success: true,
      data: booking,
      message: `₹${refundAmount} refunded${razorpayRefunded ? ' via Razorpay' : ' (marked for manual refund)'}. Earned T-Coins reversed, used T-Coins returned.`,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/bookings/:id/status', async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const { status } = req.body;
    if (!['hold', 'upcoming', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    booking.status = status;
    await booking.save();

    await auditLog('change_booking_status', 'booking', booking._id,
      `Changed booking status to ${status}`);

    res.json({ success: true, data: booking, message: `Booking status changed to ${status}` });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   REVIEWS
═══════════════════════════════════════════ */
router.get('/reviews', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const total = await Review.countDocuments();
    const reviews = await Review.find()
      .populate('customer', 'name email')
      .populate('venue', 'name sport')
      .sort({ createdAt: -1 })
      .skip((Math.max(1, +page) - 1) * +limit)
      .limit(Math.min(100, +limit))
      .lean();

    res.json({ success: true, total, page: +page, data: reviews });
  } catch (err) {
    next(err);
  }
});

router.post('/reviews', async (req, res, next) => {
  try {
    const { venueId, rating, text, authorBadge, authorName } = req.body;
    if (!venueId || !rating || !text) {
      return res.status(400).json({ success: false, message: 'venueId, rating, and text are required' });
    }
    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    const review = await Review.create({
      venue: venue._id,
      owner: venue.owner,
      customer: null,
      rating: Number(rating),
      text: text.trim(),
      isAdminReview: true,
      adminAuthorName: authorName || 'MyTurfy Official Admin',
      authorBadge: authorBadge || 'Official MyTurfy Admin Review',
    });

    // Recalculate venue rating
    const stats = await Review.aggregate([
      { $match: { venue: venue._id } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    venue.rating = stats[0] ? +stats[0].avg.toFixed(1) : venue.rating;
    venue.reviewsCount = stats[0] ? stats[0].count : venue.reviewsCount;
    await venue.save();

    await auditLog('create_admin_review', 'venue', venue._id, `Admin posted official review for ${venue.name}`);

    res.status(201).json({ success: true, data: review, message: 'Admin review published successfully!' });
  } catch (err) {
    next(err);
  }
});

router.delete('/reviews/:id', async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    const venueId = review.venue;
    await review.deleteOne();

    // Recalculate venue rating
    const remaining = await Review.find({ venue: venueId });
    const venue = await Venue.findById(venueId);
    if (venue) {
      if (remaining.length === 0) {
        venue.rating = 4.5;
        venue.reviewsCount = 0;
      } else {
        venue.rating = +(remaining.reduce((s, r) => s + r.rating, 0) / remaining.length).toFixed(1);
        venue.reviewsCount = remaining.length;
      }
      await venue.save();
    }

    await auditLog('delete_review', 'review', review._id, `Deleted review by ${review.customer}`);

    res.json({ success: true, message: 'Review deleted and rating recalculated' });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   PROMO CODES
═══════════════════════════════════════════ */
router.get('/promos', async (req, res, next) => {
  try {
    const promos = await PromoCode.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: promos });
  } catch (err) {
    next(err);
  }
});

router.post('/promos', async (req, res, next) => {
  try {
    const promo = await PromoCode.create(req.body);
    await auditLog('create_promo', 'promo', promo._id, `Created promo: ${promo.code}`);
    res.status(201).json({ success: true, data: promo });
  } catch (err) {
    next(err);
  }
});

router.put('/promos/:id', async (req, res, next) => {
  try {
    const promo = await PromoCode.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!promo) return res.status(404).json({ success: false, message: 'Promo not found' });
    await auditLog('edit_promo', 'promo', promo._id, `Edited promo: ${promo.code}`);
    res.json({ success: true, data: promo });
  } catch (err) {
    next(err);
  }
});

router.delete('/promos/:id', async (req, res, next) => {
  try {
    const promo = await PromoCode.findByIdAndDelete(req.params.id);
    if (!promo) return res.status(404).json({ success: false, message: 'Promo not found' });
    await auditLog('delete_promo', 'promo', promo._id, `Deleted promo: ${promo.code}`);
    res.json({ success: true, message: 'Promo deleted' });
  } catch (err) {
    next(err);
  }
});

router.patch('/promos/:id/toggle', async (req, res, next) => {
  try {
    const promo = await PromoCode.findById(req.params.id);
    if (!promo) return res.status(404).json({ success: false, message: 'Promo not found' });
    promo.isActive = !promo.isActive;
    await promo.save();
    await auditLog('toggle_promo', 'promo', promo._id, `${promo.isActive ? 'Enabled' : 'Disabled'} promo: ${promo.code}`);
    res.json({ success: true, data: promo });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   ANNOUNCEMENTS
═══════════════════════════════════════════ */
router.get('/announcements', async (req, res, next) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: announcements });
  } catch (err) {
    next(err);
  }
});

router.post('/announcements', async (req, res, next) => {
  try {
    const ann = await Announcement.create(req.body);
    await auditLog('create_announcement', 'announcement', ann._id, `Created announcement: ${ann.title}`);
    res.status(201).json({ success: true, data: ann });
  } catch (err) {
    next(err);
  }
});

router.delete('/announcements/:id', async (req, res, next) => {
  try {
    const ann = await Announcement.findByIdAndDelete(req.params.id);
    if (!ann) return res.status(404).json({ success: false, message: 'Announcement not found' });
    await auditLog('delete_announcement', 'announcement', ann._id, `Deleted announcement: ${ann.title}`);
    res.json({ success: true, message: 'Announcement deleted' });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   BLOCKED SLOTS (owner-set, read-only for admin)
═══════════════════════════════════════════ */
router.get('/blocked-slots', async (req, res, next) => {
  try {
    const venues = await Venue.find({ 'blockedSlots.0': { $exists: true } })
      .select('name sport location blockedSlots owner')
      .populate('owner', 'name email')
      .lean();
    res.json({ success: true, data: venues });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   AUDIT LOG
═══════════════════════════════════════════ */
router.get('/audit-log', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const total = await AdminAuditLog.countDocuments();
    const logs = await AdminAuditLog.find()
      .sort({ createdAt: -1 })
      .skip((Math.max(1, +page) - 1) * +limit)
      .limit(Math.min(100, +limit))
      .lean();
    res.json({ success: true, total, page: +page, data: logs });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   PUBLIC — Active announcements (no auth needed)
   This is mounted separately in server.js
═══════════════════════════════════════════ */

module.exports = router;
