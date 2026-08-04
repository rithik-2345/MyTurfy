/**
 * routes/bookings.js
 * Key changes:
 * 1. GET /slots — now respects venue.specs.turfs (number of courts).
 *    A time slot is only "fully booked" when bookings for that hour
 *    equal or exceed the number of turfs. So if a venue has 2 courts
 *    and only 1 booking exists for 6 PM, that slot stays available.
 * 2. POST /:id/request-refund — customer emails both the turf owner
 *    AND myturfy@gmail.com requesting a refund. Either party can
 *    approve via the dashboard, which triggers an actual Razorpay refund.
 * 3. POST /:id/approve-refund — owner OR admin approves the refund.
 * 4. Payout eligibility: a booking only becomes "payout eligible"
 *    after its slot time has passed AND no refund was filed.
 */

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const isOwner = require('../middleware/isOwner');
const Booking = require('../models/Booking');
const Venue = require('../models/Venue');
const User = require('../models/User');
const { sendRefundRequestEmail, sendRefundApprovedEmail, sendRefundRejectedEmail } = require('../utils/sendEmail');

/* ─────────────────────────────────────────────────────
   HELPER — count how many bookings exist for a given
   hour slot. Excludes cancelled or expired 5-min holds.
───────────────────────────────────────────────────── */
async function getHourBookingCounts(venueId, date, courtNumber = null) {
  const now = new Date();

  // Auto-expire active split bookings whose splitExpiresAt has passed
  await Booking.updateMany(
    { isSplit: true, splitStatus: 'active', splitExpiresAt: { $lte: now } },
    { $set: { splitStatus: 'expired', status: 'cancelled' } }
  );

  // Auto-expire 5-min holds whose holdExpiresAt has passed
  await Booking.updateMany(
    { status: 'hold', holdExpiresAt: { $lte: now } },
    { $set: { status: 'cancelled' } }
  );

  const query = {
    venue: venueId,
    date,
    status: { $ne: 'cancelled' },
    $or: [
      { paymentStatus: 'paid' },
      { status: 'hold', holdExpiresAt: { $gt: now } },
      { isSplit: true, splitStatus: 'active', splitExpiresAt: { $gt: now } },
    ],
  };

  if (courtNumber) {
    query.courtNumber = Number(courtNumber);
  }

  const bookings = await Booking.find(query).select('time durationHours courtNumber');

  const counts = new Map(); // hour → number of concurrent bookings
  bookings.forEach(b => {
    const startH = parseInt((b.time || '0').split(':')[0], 10);
    if (!isNaN(startH)) {
      for (let i = 0; i < (b.durationHours || 1); i++) {
        const h = startH + i;
        counts.set(h, (counts.get(h) || 0) + 1);
      }
    }
  });
  return counts;
}

/* ══════════════════════════════════════
   PUBLIC — booked hours for a venue on a date
   GET /api/bookings/slots?venueId=X&date=YYYY-MM-DD&courtNumber=1
   ══════════════════════════════════════ */
router.get('/slots', async (req, res, next) => {
  try {
    const { venueId, date, courtNumber } = req.query;
    if (!venueId || !date) return res.json({ success: true, data: [] });

    const venue = await Venue.findById(venueId).select('specs.turfs openHour closeHour closedDates isActive');
    if (!venue || !venue.isActive) return res.json({ success: true, data: [] });

    if ((venue.closedDates || []).includes(date)) {
      const allHours = [];
      for (let h = venue.openHour; h < venue.closeHour; h++) allHours.push(h);
      return res.json({ success: true, data: allHours, closedDate: true });
    }

    const turfsCount = venue.specs?.turfs || 1;
    const hourCounts = await getHourBookingCounts(venueId, date, courtNumber);

    // If courtNumber specified, threshold is 1 (that specific court is booked or free)
    const threshold = courtNumber ? 1 : turfsCount;
    const fullyBookedHours = [];
    hourCounts.forEach((count, hour) => {
      if (count >= threshold) fullyBookedHours.push(hour);
    });

    res.json({ success: true, data: fullyBookedHours, turfsCount });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   5-MINUTE SLOT HOLD — BookMyShow Style
   POST /api/bookings/hold-slot
   ══════════════════════════════════════ */
router.post('/hold-slot', protect, async (req, res, next) => {
  try {
    const { venueId, date, time, durationHours = 1, courtNumber = 1 } = req.body;
    if (!venueId || !date || !time) {
      return res.status(400).json({ success: false, message: 'venueId, date and time are required' });
    }

    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    const hourCounts = await getHourBookingCounts(venueId, date, courtNumber);
    const startH = parseInt(time.split(':')[0], 10);
    for (let i = 0; i < durationHours; i++) {
      if ((hourCounts.get(startH + i) || 0) >= 1) {
        return res.status(400).json({
          success: false,
          message: `Court ${courtNumber} at ${startH + i}:00 is currently being booked or held by another user.`,
        });
      }
    }

    // Set 5-minute hold lock
    const holdExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const crypto = require('crypto');
    const qrCodeData = crypto.randomBytes(8).toString('hex');
    const splitCode = 'SPLIT-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const booking = await Booking.create({
      customer: req.auth.id,
      venue: venue._id,
      owner: venue.owner,
      date,
      time,
      durationHours,
      courtNumber: Number(courtNumber),
      amount: venue.price * durationHours,
      status: 'hold',
      paymentStatus: 'pending',
      holdExpiresAt,
      qrCodeData,
      splitCode,
    });

    res.json({
      success: true,
      data: {
        bookingId: booking._id,
        holdExpiresAt,
        amount: booking.amount,
        courtNumber: booking.courtNumber,
        splitCode: booking.splitCode,
        message: 'Slot held for 5 minutes. Complete payment to finalize booking.',
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   LIVE MATCH TICKET & COUNTDOWN — Swiggy Style
   GET /api/bookings/live-ticket
   ══════════════════════════════════════ */
router.get('/live-ticket', protect, async (req, res, next) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const booking = await Booking.findOne({
      customer: req.auth.id,
      status: 'upcoming',
      paymentStatus: 'paid',
      date: { $gte: todayStr },
    })
      .populate('venue', 'name location images sport lat lng')
      .sort({ date: 1, time: 1 });

    if (!booking) {
      return res.json({ success: true, data: null });
    }

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   CUSTOMER — my bookings
   GET /api/bookings/mine
   ══════════════════════════════════════ */
router.get('/mine', protect, async (req, res, next) => {
  try {
    if (req.auth.role === 'owner') {
      return res.status(403).json({ success: false, message: 'This endpoint is for customer accounts' });
    }

    const now = new Date();
    // Auto-expire active split bookings whose splitExpiresAt has passed
    await Booking.updateMany(
      { isSplit: true, splitStatus: 'active', splitExpiresAt: { $lte: now } },
      { $set: { splitStatus: 'expired', status: 'cancelled' } }
    );
    // Auto-expire 5-min holds whose holdExpiresAt has passed
    await Booking.updateMany(
      { status: 'hold', holdExpiresAt: { $lte: now } },
      { $set: { status: 'cancelled' } }
    );

    const user = await User.findById(req.auth.id);
    const filter = {
      $or: [
        { customer: req.auth.id },
      ],
    };
    if (user && user.phone) {
      filter.$or.push({ 'splitPayments.payerPhone': user.phone });
    }

    const bookings = await Booking.find(filter)
      .populate('venue', 'name location images sport')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: bookings.length, data: bookings });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   OWNER — all bookings across their venues
   GET /api/bookings/owner?venueId=&status=
   ══════════════════════════════════════ */
router.get('/owner', protect, isOwner, async (req, res, next) => {
  try {
    const { venueId, status } = req.query;
    const filter = { owner: req.auth.id, status: { $ne: 'hold' } }; // Exclude temporary holds from owner portal!
    if (venueId && venueId !== 'all') filter.venue = venueId;
    if (status && status !== 'all') filter.status = status;

    const bookings = await Booking.find(filter)
      .populate('venue', 'name')
      .populate('customer', 'name phone email')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: bookings.length, data: bookings });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   RELEASE HOLD — instantly discard an unpaid hold booking
   DELETE /api/bookings/:id/release-hold
   When payment is cancelled/dismissed, the hold booking is
   completely deleted so the slot is immediately available.
   ══════════════════════════════════════ */
router.delete('/:id/release-hold', protect, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Only the customer who created the hold can release it
    if (booking.customer.toString() !== req.auth.id) {
      return res.status(403).json({ success: false, message: 'You are not authorized to release this hold' });
    }

    // Only allow releasing unpaid hold bookings — paid bookings must go through cancel/refund
    if (booking.status !== 'hold' || booking.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Only unpaid hold bookings can be released' });
    }

    // Completely delete the hold booking so the slot is instantly free
    await Booking.findByIdAndDelete(booking._id);

    res.json({ success: true, message: 'Hold released — slot is now available for others.' });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   CANCEL — customer or owner
   PATCH /api/bookings/:id/cancel
   ══════════════════════════════════════ */
router.patch('/:id/cancel', protect, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('venue', 'name location')
      .populate('customer', 'name email');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const isTheCustomer = req.auth.role === 'user' && booking.customer._id.toString() === req.auth.id;
    const isTheOwner    = req.auth.role === 'owner' && booking.owner.toString() === req.auth.id;
    if (!isTheCustomer && !isTheOwner) {
      return res.status(403).json({ success: false, message: 'You are not authorized to cancel this booking' });
    }
    // Allow customers to cancel both 'hold' and 'upcoming' bookings
    if (!isTheOwner && booking.status !== 'upcoming' && booking.status !== 'hold') {
      return res.status(400).json({ success: false, message: `Cannot cancel a ${booking.status} booking` });
    }

    // If it's an unpaid hold, delete it entirely for instant slot release
    if (booking.status === 'hold' && booking.paymentStatus !== 'paid') {
      await Booking.findByIdAndDelete(booking._id);
      return res.json({ success: true, data: { _id: booking._id, status: 'cancelled' }, message: 'Hold discarded — slot released.' });
    }

    booking.status = 'cancelled';
    booking.holdExpiresAt = null;
    if (booking.isSplit) {
      booking.splitStatus = 'expired';
      booking.splitExpiresAt = null;
    }
    await booking.save();

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────
   HELPER — calculate tiered refund percentage based on
   time remaining before booked slot start time.
   ≥ 24h: 100%, 12–24h: 75%, 6–12h: 50%, 1–6h: 25%, < 1h: 10%, Past: 0%
───────────────────────────────────────────────────── */
function calculateRefundTier(dateStr, timeStr) {
  try {
    if (!dateStr || !timeStr) return 0;
    const [year, month, day] = dateStr.split('-').map(Number);
    let hour = 0, minute = 0;

    if (timeStr.includes(':')) {
      const parts = timeStr.trim().split(':');
      hour = parseInt(parts[0], 10);
      const minPart = parts[1] || '0';
      minute = parseInt(minPart, 10);

      if (timeStr.toLowerCase().includes('pm') && hour < 12) {
        hour += 12;
      } else if (timeStr.toLowerCase().includes('am') && hour === 12) {
        hour = 0;
      }
    } else {
      hour = parseInt(timeStr, 10);
    }

    const slotTime = new Date(year, month - 1, day, hour, minute, 0, 0);
    const now = new Date();

    const diffMs = slotTime.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours >= 24) return 100;
    if (diffHours >= 12) return 75;
    if (diffHours >= 6) return 50;
    if (diffHours >= 2) return 25;
    return 0; // Less than 2 hours before slot or past
  } catch (err) {
    console.error('Error calculating refund tier:', err.message);
    return 0;
  }
}

/* ══════════════════════════════════════
   REFUND PREVIEW — preview refund tier for a booking
   GET /api/bookings/:id/refund-preview
   ══════════════════════════════════════ */
router.get('/:id/refund-preview', protect, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const pct = calculateRefundTier(booking.date, booking.time);
    const refundAmount = Math.round((booking.amount * pct) / 100);

    res.json({
      success: true,
      data: {
        bookingId: booking._id,
        bookingAmount: booking.amount,
        refundPct: pct,
        refundAmount,
        date: booking.date,
        time: booking.time,
      },
    });
  } catch (err) {
    next(err);
  }
});

const config = require('../config/config');
const MYTURFY_SUPPORT_EMAIL = 'myturfy@gmail.com';

async function checkAdminAuth(req) {
  if (req.headers['x-admin-secret'] && req.headers['x-admin-secret'] === config.jwtSecret) {
    return true;
  }
  if (req.auth) {
    if (req.auth.role === 'admin') return true;
    const user = await User.findById(req.auth.id);
    if (user && (user.role === 'admin' || user.email === MYTURFY_SUPPORT_EMAIL || user.email === config.email.user)) {
      return true;
    }
  }
  return false;
}

/* ══════════════════════════════════════
   REFUND REQUEST — customer requests a refund
   POST /api/bookings/:id/request-refund
   Note: Booking status STAYS 'upcoming' (slot remains reserved)
   until Admin reviews and approves the request.
   ══════════════════════════════════════ */
router.post('/:id/request-refund', protect, async (req, res, next) => {
  try {
    if (req.auth.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Only customers can request refunds' });
    }

    const booking = await Booking.findById(req.params.id)
      .populate('venue', 'name location')
      .populate('customer', 'name email phone')
      .populate('owner', 'name email');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.customer._id.toString() !== req.auth.id) {
      return res.status(403).json({ success: false, message: 'This is not your booking' });
    }
    if (booking.refundStatus === 'requested' || booking.refundStatus === 'approved') {
      return res.status(400).json({ success: false, message: 'A refund has already been requested for this booking' });
    }

    const { reason } = req.body;
    const pct = calculateRefundTier(booking.date, booking.time);
    const refundAmount = Math.round((booking.amount * pct) / 100);

    // Keep booking.status = 'upcoming' so the court slot remains reserved while under review!
    booking.refundStatus = 'requested';
    booking.refundReason = reason || 'Customer requested slot cancellation & refund';
    booking.refundPct = pct;
    booking.refundAmount = refundAmount;
    booking.refundRequestedAt = new Date();
    await booking.save();

    // Send email alert directly to MyTurfy Admin support & copy customer
    await sendRefundRequestEmail(booking, booking.refundReason, pct, refundAmount);

    res.json({
      success: true,
      data: booking,
      message: `Refund request submitted for ${pct}% (₹${refundAmount}). Sent to MyTurfy Admin (${MYTURFY_SUPPORT_EMAIL}) for review. Your slot remains reserved.`,
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   APPROVE REFUND — MyTurfy Admin ONLY approves
   POST /api/bookings/:id/approve-refund
   Note: Changes status to 'cancelled' (releases slot) and refunds customer.
   ══════════════════════════════════════ */
router.post('/:id/approve-refund', protect, async (req, res, next) => {
  try {
    const isAdmin = await checkAdminAuth(req);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: `Only MyTurfy Admin support (${MYTURFY_SUPPORT_EMAIL}) can approve refund requests.`,
      });
    }

    const booking = await Booking.findById(req.params.id)
      .populate('customer', 'name email')
      .populate('venue', 'name')
      .populate('owner', 'name email');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.refundStatus !== 'requested') {
      return res.status(400).json({ success: false, message: 'No pending refund request for this booking' });
    }

    const refundPaise = (booking.refundAmount || 0) * 100;

    // Trigger Razorpay refund if payment was made via Razorpay and refundPaise > 0
    if (booking.razorpayPaymentId && refundPaise > 0) {
      try {
        const Razorpay = require('razorpay');
        const config = require('../config/config');
        const razorpayConfigured = !!(config.razorpay.keyId && config.razorpay.keySecret);
        if (razorpayConfigured) {
          const razorpay = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
          await razorpay.payments.refund(booking.razorpayPaymentId, {
            amount: refundPaise,
            speed: 'optimum',
            notes: { reason: booking.refundReason || 'Customer refund request approved by Admin' },
          });
        }
      } catch (rzpErr) {
        console.error('Razorpay refund failed:', rzpErr.message);
        return res.status(500).json({ success: false, message: 'Refund initiation failed: ' + rzpErr.message });
      }
    }

    // 50% Owner compensation out of non-refunded retained amount
    const unrefunded = Math.max(0, booking.amount - (booking.refundAmount || 0));
    const ownerCompensation = Math.round(unrefunded * 0.5);

    booking.refundStatus = 'approved';
    booking.status = 'cancelled'; // NOW the slot is freed!
    booking.paymentStatus = 'refunded';
    booking.ownerCompensation = ownerCompensation;
    booking.payoutEligible = ownerCompensation > 0;
    await booking.save();

    await sendRefundApprovedEmail(booking);

    res.json({
      success: true,
      data: booking,
      message: `Refund of ${booking.refundPct}% (₹${booking.refundAmount}) approved and processed by Admin. Slot released.`,
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   REJECT REFUND — MyTurfy Admin ONLY rejects
   POST /api/bookings/:id/reject-refund
   Note: Booking status STAYS 'upcoming' (customer keeps slot).
   ══════════════════════════════════════ */
router.post('/:id/reject-refund', protect, async (req, res, next) => {
  try {
    const isAdmin = await checkAdminAuth(req);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: `Only MyTurfy Admin support (${MYTURFY_SUPPORT_EMAIL}) can reject refund requests.`,
      });
    }

    const booking = await Booking.findById(req.params.id)
      .populate('customer', 'name email')
      .populate('venue', 'name')
      .populate('owner', 'name email');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.refundStatus !== 'requested') {
      return res.status(400).json({ success: false, message: 'No pending refund request' });
    }

    const { reason } = req.body;
    booking.refundStatus = 'rejected';
    booking.refundRejectReason = reason || 'Declined by MyTurfy Admin support';
    // booking.status remains 'upcoming' so the customer keeps their booked slot!
    await booking.save();

    await sendRefundRejectedEmail(booking, reason);

    res.json({
      success: true,
      data: booking,
      message: 'Refund request rejected by Admin. Slot remains reserved for customer.',
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   PAYOUT ELIGIBLE — bookings ready to pay out to owner
   Only bookings where:
   - status = completed
   - paymentStatus = paid
   - refundStatus != requested/approved
   - slot date+time has passed
   - payoutEligible = true
   GET /api/bookings/payout-eligible (owner only)
   ══════════════════════════════════════ */
router.get('/payout-eligible', protect, isOwner, async (req, res, next) => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentHour = now.getHours();

    const bookings = await Booking.find({
      owner: req.auth.id,
      status: { $ne: 'cancelled' },
      paymentStatus: 'paid',
      refundStatus: { $nin: ['requested', 'approved'] },
      payoutEligible: true,
    }).populate('venue', 'name').populate('customer', 'name');

    // Further filter: slot time must have passed
    const eligible = bookings.filter(b => {
      if (b.date < todayStr) return true;
      if (b.date === todayStr) {
        const slotHour = parseInt((b.time || '0').split(':')[0], 10);
        return slotHour + (b.durationHours || 1) <= currentHour;
      }
      return false;
    });

    res.json({ success: true, count: eligible.length, data: eligible });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   QR CODE VALIDATION — Owner validates customer QR code
   POST /api/bookings/validate-qr
   ══════════════════════════════════════ */
router.post('/validate-qr', protect, isOwner, async (req, res, next) => {
  try {
    const { qrCodeData } = req.body;
    if (!qrCodeData) {
      return res.status(400).json({ success: false, message: 'QR code data is required' });
    }

    const booking = await Booking.findOne({ qrCodeData })
      .populate('venue', 'name owner')
      .populate('customer', 'name email');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Invalid QR code - booking not found' });
    }

    // Verify this booking belongs to the owner's venue
    if (booking.owner.toString() !== req.auth.id) {
      return res.status(403).json({ success: false, message: 'This booking is not for your venue' });
    }

    // Check if already validated
    if (booking.qrValidated) {
      return res.status(400).json({ success: false, message: 'QR code already validated' });
    }

    // Check if booking is paid
    if (booking.paymentStatus !== 'paid') {
      return res.status(400).json({ success: false, message: 'Booking payment is not completed' });
    }

    // Check if booking is still upcoming
    if (booking.status !== 'upcoming') {
      return res.status(400).json({ success: false, message: `Booking is ${booking.status}, cannot validate` });
    }

    // Mark QR as validated
    booking.qrValidated = true;
    booking.qrValidatedAt = new Date();
    booking.qrValidatedBy = req.auth.id;
    booking.status = 'completed';
    booking.payoutEligible = true; // Make eligible for immediate payout
    await booking.save();

    res.json({
      success: true,
      data: {
        bookingId: booking._id,
        customerName: booking.customer.name,
        venueName: booking.venue.name,
        amount: booking.amount,
        validatedAt: booking.qrValidatedAt,
        message: 'QR code validated successfully. Booking marked as completed and payout eligible.',
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   EMAIL VERIFICATION — Send OTP to customer for booking validation
   POST /api/bookings/send-verification-otp
   ══════════════════════════════════════ */
router.post('/send-verification-otp', protect, isOwner, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Customer email is required' });
    }


    const customer = await User.findOne({ email });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found with this email' });
    }

    // Find upcoming booking for this customer at owner's venue
    const booking = await Booking.findOne({
      customer: customer._id,
      owner: req.auth.id,
      status: 'upcoming',
      paymentStatus: 'paid',
      qrValidated: false,
    }).populate('venue', 'name').sort({ date: 1, time: 1 });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'No upcoming paid booking found for this customer at your venue' });
    }

    // Generate OTP
    const crypto = require('crypto');
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP in booking temporarily
    booking.verificationOtp = otp;
    booking.verificationOtpExpires = otpExpires;
    await booking.save();

    // Send OTP email
    const nodemailer = require('nodemailer');
    const config = require('../config/config');
    const transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: { user: config.email.user, pass: config.email.pass },
    });

    await transporter.sendMail({
      from: config.email.user,
      to: email,
      subject: 'MyTurfy - Booking Verification Code',
      text: `Your verification code for booking at ${booking.venue.name} is: ${otp}\n\nThis code is valid for 10 minutes. Share this code with the venue owner to verify your booking.`,
    });

    res.json({
      success: true,
      message: 'Verification code sent to customer email',
      devCode: process.env.NODE_ENV !== 'production' ? otp : undefined,
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   EMAIL VERIFICATION — Verify OTP and validate booking
   POST /api/bookings/verify-otp
   ══════════════════════════════════════ */
router.post('/verify-otp', protect, isOwner, async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }


    const customer = await User.findOne({ email });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Find booking with matching OTP
    const booking = await Booking.findOne({
      customer: customer._id,
      owner: req.auth.id,
      verificationOtp: otp,
      verificationOtpExpires: { $gt: new Date() },
    }).populate('venue', 'name').populate('customer', 'name email');

    if (!booking) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    // Check if already validated
    if (booking.qrValidated) {
      return res.status(400).json({ success: false, message: 'Booking already validated' });
    }

    // Mark as validated
    booking.qrValidated = true;
    booking.qrValidatedAt = new Date();
    booking.qrValidatedBy = req.auth.id;
    booking.status = 'completed';
    booking.payoutEligible = true;
    booking.verificationOtp = undefined;
    booking.verificationOtpExpires = undefined;
    await booking.save();

    res.json({
      success: true,
      data: {
        bookingId: booking._id,
        customerName: booking.customer.name,
        venueName: booking.venue.name,
        amount: booking.amount,
        validatedAt: booking.qrValidatedAt,
        message: 'Booking verified成功. Marked as completed and payout eligible.',
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   OFFLINE BOOKING (owner creates walk-in booking)
   POST /api/bookings/offline
   ══════════════════════════════════════ */
router.post('/offline', protect, isOwner, async (req, res, next) => {
  try {
    const { venueId, date, time, durationHours = 1, customerName, customerPhone } = req.body;
    if (!venueId || !date || !time) {
      return res.status(400).json({ success: false, message: 'venueId, date and time are required' });
    }

    const venue = await Venue.findOne({ _id: venueId, owner: req.auth.id });
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found or you do not own it' });

    // Check turfs-aware availability
    const hourCounts = await getHourBookingCounts(venueId, date);
    const turfsCount = venue.specs?.turfs || 1;
    const startH = parseInt(time.split(':')[0], 10);
    for (let i = 0; i < durationHours; i++) {
      if ((hourCounts.get(startH + i) || 0) >= turfsCount) {
        return res.status(400).json({ success: false, message: `Time slot ${startH + i}:00 is fully booked across all ${turfsCount} court(s)` });
      }
    }


    const phoneClean = (customerPhone || '').replace(/\s+/g, '');
    const dummyEmail = phoneClean
      ? `offline_${phoneClean}@myturfy.com`.toLowerCase()
      : `offline_${Date.now()}@myturfy.com`;

    let user = await User.findOne({ email: dummyEmail });
    if (!user) {
      user = await User.create({
        name: customerName || 'Walk-in Customer',
        email: dummyEmail,
        phone: customerPhone || undefined,
        password: 'offline-placeholder',
      });
    }

    const booking = await Booking.create({
      customer: user._id,
      venue: venue._id,
      owner: req.auth.id,
      date, time, durationHours,
      amount: venue.price * durationHours,
      status: 'upcoming',
      paymentStatus: 'paid',
      payoutEligible: false, // offline bookings — payout handled separately
    });

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

module.exports = router;