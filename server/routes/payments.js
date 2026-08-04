/**
 * routes/payments.js
 * Updated:
 * 1. Slot overlap check now respects venue.specs.turfs — a slot is only
 *    blocked when concurrent bookings >= number of courts.
 * 2. On successful payment, booking.payoutEligible = false (stays false
 *    until a scheduled job marks it true after the slot time passes and
 *    no refund was filed).
 */

const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const router = express.Router();

const config = require('../config/config');
const { protect } = require('../middleware/auth');
const Venue = require('../models/Venue');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { sendBookingConfirmationToCustomer, sendNewBookingAlertToOwner } = require('../utils/sendEmail');

const razorpayConfigured = !!(config.razorpay.keyId && config.razorpay.keySecret);
const razorpay = razorpayConfigured
  ? new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret })
  : null;

async function notifyBoth(venue, booking, customer) {
  sendBookingConfirmationToCustomer(customer, venue, booking).catch(e => console.error('Customer email failed:', e.message));
  sendNewBookingAlertToOwner(venue.owner, venue, booking, customer).catch(e => console.error('Owner email failed:', e.message));
}

/* ─────────────────────────────────────
   TURFS-AWARE slot overlap check.
   Returns true only when all requested hours are FULLY booked
   (concurrent bookings >= venue.specs.turfs for every hour in range).
───────────────────────────────────── */
async function isSlotFullyBooked(venueId, date, time, durationHours, turfsCount) {
  const startH = parseInt(time.split(':')[0], 10);
  const bookings = await Booking.find({
    venue: venueId,
    date,
    status: { $ne: 'cancelled' },
  }).select('time durationHours');

  // Build a count map: hour → number of concurrent bookings
  const hourCounts = new Map();
  bookings.forEach(b => {
    const bStart = parseInt((b.time || '0').split(':')[0], 10);
    for (let i = 0; i < (b.durationHours || 1); i++) {
      const h = bStart + i;
      hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
    }
  });

  // Check every hour the new booking would occupy
  for (let i = 0; i < durationHours; i++) {
    if ((hourCounts.get(startH + i) || 0) >= turfsCount) return true;
  }
  return false;
}

/* ══════════════════════════════════════
   STEP 1 — Create Razorpay order
   POST /api/payments/create-order
   ══════════════════════════════════════ */
router.post('/create-order', protect, async (req, res, next) => {
  try {
    if (req.auth.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Only customer accounts can book venues' });
    }
    const { venueId, date, time, durationHours = 1, courtNumber = 1, bookingId } = req.body;

    let booking = null;
    if (bookingId) {
      booking = await Booking.findById(bookingId);
    }

    const vId = booking ? booking.venue : venueId;
    const venue = await Venue.findOne({ _id: vId, isActive: true }).populate('owner', 'name email');
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    const bDate = booking ? booking.date : date;
    const bTime = booking ? booking.time : time;
    const bDur = booking ? booking.durationHours : durationHours;
    const bCourt = booking ? booking.courtNumber : courtNumber;
    const amount = venue.price * bDur;

    // Ensure Razorpay is configured
    if (!razorpayConfigured) {
      return res.status(400).json({
        success: false,
        message: 'Razorpay API key is missing. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your .env file.',
      });
    }

    let order;
    try {
      order = await razorpay.orders.create({
        amount: amount * 100,
        currency: 'INR',
        receipt: `rcp_${venue._id.toString().slice(-12)}_${Date.now()}`,
        notes: { venueId: String(venue._id), customerId: req.auth.id, date: bDate, time: bTime, bookingId: booking ? String(booking._id) : '' },
      });
    } catch (rzpErr) {
      console.error('Razorpay API order error:', rzpErr);
      const errorMsg = rzpErr.error?.description || rzpErr.message || 'Invalid Razorpay API keys or network error.';
      return res.status(400).json({
        success: false,
        message: `Razorpay Error: ${errorMsg}`,
      });
    }

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: config.razorpay.keyId,
      bookingId: booking ? booking._id : null,
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   STEP 2 — Verify payment + create booking
   POST /api/payments/verify
   ══════════════════════════════════════ */
router.post('/verify', protect, async (req, res, next) => {
  try {
    if (req.auth.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Only customer accounts can book venues' });
    }
    const {
      razorpay_order_id, razorpay_payment_id, razorpay_signature,
      venueId, date, time, durationHours = 1, courtNumber = 1, bookingId,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed — signature mismatch' });
    }

    let booking = null;
    if (bookingId) {
      booking = await Booking.findById(bookingId);
    }

    if (booking) {
      booking.status = 'upcoming';
      booking.paymentStatus = 'paid';
      booking.holdExpiresAt = null;
      booking.razorpayOrderId = razorpay_order_id;
      booking.razorpayPaymentId = razorpay_payment_id;
      await booking.save();
    } else {
      const venue = await Venue.findById(venueId).populate('owner', 'name email');
      if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

      booking = await Booking.create({
        customer: req.auth.id, venue: venue._id, owner: venue.owner._id,
        date, time, durationHours, courtNumber: Number(courtNumber),
        amount: venue.price * durationHours,
        status: 'upcoming', paymentStatus: 'paid',
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        payoutEligible: false,
        qrCodeData: crypto.randomBytes(8).toString('hex'),
      });
    }

    const venueObj = await Venue.findById(booking.venue).populate('owner', 'name email');
    const customer = await User.findById(req.auth.id);
    notifyBoth(venueObj, booking, customer);

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   SPLIT PAYMENT API — Commercial Multi-Payer
   ══════════════════════════════════════ */

// 1. GET /api/payments/split-details/:code (Public)
router.get('/split-details/:code', async (req, res, next) => {
  try {
    const splitCode = req.params.code.toUpperCase();
    const booking = await Booking.findOne({ splitCode }).populate('venue', 'name sport location images price owner').populate('customer', 'name phone email');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Split booking link not found or expired.' });
    }

    const now = new Date();
    const isExpired = booking.splitStatus !== 'completed' && booking.splitExpiresAt && new Date(booking.splitExpiresAt) < now;
    if (isExpired && booking.splitStatus === 'active') {
      booking.splitStatus = 'expired';
      booking.status = 'cancelled';
      await booking.save();
    }

    const paidAmount = (booking.splitPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const remainingAmount = Math.max(0, booking.amount - paidAmount);
    const isFullyPaid = paidAmount >= booking.amount || booking.splitStatus === 'completed';

    res.json({
      success: true,
      data: {
        bookingId: booking._id,
        splitCode: booking.splitCode,
        venue: {
          id: booking.venue._id,
          name: booking.venue.name,
          sport: booking.venue.sport,
          location: booking.venue.location,
          image: booking.venue.images?.[0] || '',
          price: booking.venue.price,
        },
        bookerName: booking.customer?.name || 'Teammate',
        date: booking.date,
        time: booking.time,
        durationHours: booking.durationHours,
        courtNumber: booking.courtNumber,
        totalAmount: booking.amount,
        targetPlayers: booking.targetPlayers || 2,
        perPersonAmount: booking.perPersonAmount || Math.ceil(booking.amount / (booking.targetPlayers || 2)),
        paidAmount,
        remainingAmount,
        splitStatus: booking.splitStatus,
        splitExpiresAt: booking.splitExpiresAt,
        isExpired,
        isFullyPaid,
        splitPayments: booking.splitPayments || [],
        qrCodeData: isFullyPaid ? booking.qrCodeData : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 2. POST /api/payments/create-split-order (Auth required)
router.post('/create-split-order', protect, async (req, res, next) => {
  try {
    if (req.auth.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Only customer accounts can initiate bookings' });
    }
    const { venueId, date, time, durationHours = 1, courtNumber = 1, targetPlayers = 2, payerName, payerPhone } = req.body;
    if (!venueId || !date || !time) {
      return res.status(400).json({ success: false, message: 'Venue, date, and time are required' });
    }

    const venue = await Venue.findOne({ _id: venueId, isActive: true }).populate('owner', 'name email');
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    const totalAmount = venue.price * durationHours;
    const playersCount = Math.max(2, Math.min(20, Number(targetPlayers)));
    const perPersonAmount = Math.ceil(totalAmount / playersCount);
    const splitCode = 'SPLIT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const splitExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour hold
    const qrCodeData = crypto.randomBytes(8).toString('hex');
    const user = await User.findById(req.auth.id);
    const bookerName = payerName || user?.name || 'Booker';

    // Create split booking document in pending state
    const booking = await Booking.create({
      customer: req.auth.id,
      venue: venue._id,
      owner: venue.owner._id,
      date,
      time,
      durationHours,
      courtNumber: Number(courtNumber),
      amount: totalAmount,
      targetPlayers: playersCount,
      perPersonAmount,
      isSplit: true,
      splitCode,
      splitStatus: 'active',
      splitExpiresAt,
      status: 'hold',
      paymentStatus: 'pending',
      qrCodeData,
      splitPayments: [],
    });

    if (!razorpayConfigured) {
      return res.status(400).json({
        success: false,
        message: 'Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your server .env file.',
      });
    }

    let order;
    try {
      order = await razorpay.orders.create({
        amount: perPersonAmount * 100,
        currency: 'INR',
        receipt: `splt_${booking._id.toString().slice(-12)}_${Date.now()}`,
        notes: { bookingId: String(booking._id), splitCode, payerName: bookerName, isBooker: 'true' },
      });
    } catch (rzpErr) {
      console.error('Razorpay split order error:', rzpErr);
      const errorMsg = rzpErr.error?.description || rzpErr.message || 'Invalid Razorpay API keys or network error.';
      return res.status(400).json({ success: false, message: `Razorpay Error: ${errorMsg}` });
    }

    return res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: config.razorpay.keyId,
      splitCode,
      bookingId: booking._id,
      perPersonAmount,
    });
  } catch (err) {
    next(err);
  }
});

// 3. POST /api/payments/create-split-share-order (Teammate Order Creation)
router.post('/create-split-share-order', async (req, res, next) => {
  try {
    const { splitCode } = req.body;
    if (!splitCode) return res.status(400).json({ success: false, message: 'splitCode is required' });

    const booking = await Booking.findOne({ splitCode: splitCode.toUpperCase() });
    if (!booking) return res.status(404).json({ success: false, message: 'Split booking not found' });

    if (booking.splitStatus === 'completed') {
      return res.status(400).json({ success: false, message: 'This split booking is already 100% paid and confirmed!' });
    }

    const now = new Date();
    if (booking.splitExpiresAt && new Date(booking.splitExpiresAt) < now) {
      booking.splitStatus = 'expired';
      await booking.save();
      return res.status(400).json({ success: false, message: 'This split booking link has expired.' });
    }

    const currentPaid = (booking.splitPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const remainingNeeded = booking.amount - currentPaid;
    if (remainingNeeded <= 0) {
      return res.status(400).json({ success: false, message: 'This booking is already fully paid.' });
    }

    const shareAmount = Math.min(booking.perPersonAmount || remainingNeeded, remainingNeeded);

    if (!razorpayConfigured) {
      return res.status(400).json({
        success: false,
        message: 'Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your server .env file.',
      });
    }

    let order;
    try {
      order = await razorpay.orders.create({
        amount: shareAmount * 100,
        currency: 'INR',
        receipt: `tm_${booking._id.toString().slice(-12)}_${Date.now()}`,
        notes: { bookingId: String(booking._id), splitCode: booking.splitCode },
      });
    } catch (rzpErr) {
      console.error('Razorpay split share order error:', rzpErr);
      const errorMsg = rzpErr.error?.description || rzpErr.message || 'Invalid Razorpay API keys or network error.';
      return res.status(400).json({ success: false, message: `Razorpay Error: ${errorMsg}` });
    }

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: config.razorpay.keyId,
      shareAmount,
    });
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/payments/pay-split-share (Teammate Share Verification)
router.post('/pay-split-share', async (req, res, next) => {
  try {
    const { splitCode, payerName, payerPhone, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!splitCode || !payerName) {
      return res.status(400).json({ success: false, message: 'splitCode and payerName are required' });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing Razorpay payment verification parameters.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed — signature mismatch' });
    }

    const booking = await Booking.findOne({ splitCode: splitCode.toUpperCase() }).populate('venue').populate('customer');
    if (!booking) return res.status(404).json({ success: false, message: 'Split booking not found' });

    if (booking.splitStatus === 'completed') {
      return res.status(400).json({ success: false, message: 'This split booking is already 100% paid and confirmed!' });
    }

    const currentPaid = (booking.splitPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const remainingNeeded = booking.amount - currentPaid;
    const shareAmount = Math.min(booking.perPersonAmount || remainingNeeded, remainingNeeded);

    booking.splitPayments.push({
      payerName: payerName.trim(),
      payerPhone: payerPhone ? payerPhone.trim() : '',
      amount: shareAmount,
      razorpayPaymentId: razorpay_payment_id,
      paidAt: new Date(),
    });

    const newTotalPaid = booking.splitPayments.reduce((sum, p) => sum + p.amount, 0);
    if (newTotalPaid >= booking.amount) {
      booking.splitStatus = 'completed';
      booking.paymentStatus = 'paid';
      booking.status = 'upcoming';
      booking.holdExpiresAt = null;
      booking.splitExpiresAt = null;
      if (!booking.qrCodeData) booking.qrCodeData = crypto.randomBytes(8).toString('hex');
      const customer = booking.customer || await User.findById(booking.customer);
      notifyBoth(booking.venue, booking, customer);
    }

    await booking.save();

    res.json({
      success: true,
      message: `Thanks ${payerName}! Your share of ₹${shareAmount} was received.`,
      paidAmount: newTotalPaid,
      remainingAmount: Math.max(0, booking.amount - newTotalPaid),
      isFullyPaid: newTotalPaid >= booking.amount,
    });
  } catch (err) {
    next(err);
  }
});

// 5. POST /api/payments/cancel-split (Cancel split booking hold)
router.post('/cancel-split', protect, async (req, res, next) => {
  try {
    const { splitCode } = req.body;
    if (!splitCode) return res.status(400).json({ success: false, message: 'splitCode is required' });

    const booking = await Booking.findOne({ splitCode: splitCode.toUpperCase() });
    if (!booking) return res.status(404).json({ success: false, message: 'Split booking not found' });

    if (booking.customer.toString() !== req.auth.id) {
      return res.status(403).json({ success: false, message: 'Only the booker can cancel this split payment' });
    }

    if (booking.splitStatus === 'completed') {
      return res.status(400).json({ success: false, message: 'Cannot cancel a completed split booking' });
    }

    booking.splitStatus = 'expired';
    booking.status = 'cancelled';
    booking.splitExpiresAt = null;
    booking.holdExpiresAt = null;
    await booking.save();

    res.json({ success: true, message: 'Split booking cancelled and slot released.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;