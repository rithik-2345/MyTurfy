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
const TCoinsLedger = require('../models/TCoinsLedger');
const { sendEmail, sendRefundRequestEmail, sendRefundApprovedEmail, sendRefundRejectedEmail } = require('../utils/sendEmail');
const { getCashbackPct } = require('./tcoins');
const config = require('../config/config');
const Razorpay = require('razorpay');

const razorpayConfiguredBookings = !!(config.razorpay?.keyId && config.razorpay?.keySecret);
const razorpayBookings = razorpayConfiguredBookings
  ? new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret })
  : null;
const {
  parseTimeTo24Hour,
  formatHourToString,
  autoExpireHoldsAndSplits,
  getHourBookingCounts,
  checkSlotAvailability,
} = require('../utils/slotHelper');

/* ══════════════════════════════════════
   PUBLIC — booked hours for a venue on a date
   GET /api/bookings/slots?venueId=X&date=YYYY-MM-DD&courtNumber=1
   ══════════════════════════════════════ */
router.get('/slots', async (req, res, next) => {
  try {
    const { venueId, date, courtNumber } = req.query;
    if (!venueId || !date) return res.json({ success: true, data: [] });

    const venue = await Venue.findById(venueId).select('specs.turfs openHour closeHour closedDates blockedSlots isActive');
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

    // Add owner-blocked hours (silently unavailable — same as booked)
    const blockedEntry = (venue.blockedSlots || []).find(s => s.date === date);
    if (blockedEntry && blockedEntry.hours && blockedEntry.hours.length > 0) {
      blockedEntry.hours.forEach(h => {
        if (!fullyBookedHours.includes(h)) fullyBookedHours.push(h);
      });
    }

    res.json({ success: true, data: fullyBookedHours, turfsCount });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   3-MINUTE SLOT HOLD — BookMyShow Style
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

    // Validate past dates & time
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (date < todayStr) {
      return res.status(400).json({ success: false, message: 'Booking for past dates is not allowed.' });
    }

    const startH = parseTimeTo24Hour(time);
    if (date === todayStr && startH <= now.getHours()) {
      return res.status(400).json({ success: false, message: 'This time slot has already passed today.' });
    }

    // Check slot availability
    const availability = await checkSlotAvailability({
      venueId,
      date,
      time,
      durationHours,
      courtNumber,
    });

    if (!availability.available) {
      return res.status(400).json({
        success: false,
        message: availability.reason || 'This time slot is currently unavailable or being booked by another user.',
      });
    }

    // Set 3-minute hold lock for solo bookings
    const holdExpiresAt = new Date(Date.now() + 3 * 60 * 1000);
    const crypto = require('crypto');
    const qrCodeData = crypto.randomBytes(8).toString('hex');
    const splitCode = 'SPLIT-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const booking = await Booking.create({
      customer: req.auth.id,
      venue: venue._id,
      owner: venue.owner,
      date,
      time,
      durationHours: Number(durationHours) || 1,
      courtNumber: Number(courtNumber) || 1,
      amount: venue.price * (Number(durationHours) || 1),
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
        message: 'Slot held for 3 minutes. Complete payment to finalize booking.',
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
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

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
    // TIME-BASED AUTO-COMPLETE: mark paid upcoming bookings as completed once their date has passed
    await Booking.updateMany(
      { status: 'upcoming', paymentStatus: 'paid', date: { $lt: todayStr }, refundStatus: { $nin: ['requested'] } },
      { $set: { status: 'completed', payoutEligible: true } }
    );
    // Also auto-complete for today if the slot hour has passed
    const nowHour = now.getHours();
    const upcomingToday = await Booking.find({ status: 'upcoming', paymentStatus: 'paid', date: todayStr });
    for (const b of upcomingToday) {
      const slotH = parseTimeTo24Hour(b.time);
      if (slotH + (b.durationHours || 1) <= nowHour) {
        await Booking.findByIdAndUpdate(b._id, { status: 'completed', payoutEligible: true });
      }
    }

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
      .populate('venue', 'name location images sport');

    // Sort by increasing slot time (chronological)
    bookings.sort((a, b) => {
      const getSlotMs = (item) => {
        try {
          const [y, m, d] = (item.date || '').split('-').map(Number);
          let h = 0, min = 0;
          if (item.time) {
            const match = item.time.match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
            if (match) {
              h = parseInt(match[1], 10);
              min = parseInt(match[2] || '0', 10);
              const isPM = match[3] && match[3].toUpperCase() === 'PM';
              const isAM = match[3] && match[3].toUpperCase() === 'AM';
              if (isPM && h < 12) h += 12;
              if (isAM && h === 12) h = 0;
            }
          }
          return new Date(y, m - 1, d, h, min, 0).getTime() || 0;
        } catch (_) {
          return 0;
        }
      };
      return getSlotMs(a) - getSlotMs(b);
    });

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
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // TIME-BASED AUTO-COMPLETE: mark paid upcoming bookings as completed once their date has passed
    await Booking.updateMany(
      { owner: req.auth.id, status: 'upcoming', paymentStatus: 'paid', date: { $lt: todayStr }, refundStatus: { $nin: ['requested'] } },
      { $set: { status: 'completed', payoutEligible: true } }
    );
    // Also auto-complete for today if the slot hour has passed
    const nowHour = now.getHours();
    const upcomingToday = await Booking.find({ owner: req.auth.id, status: 'upcoming', paymentStatus: 'paid', date: todayStr });
    for (const b of upcomingToday) {
      const slotH = parseTimeTo24Hour(b.time);
      if (slotH + (b.durationHours || 1) <= nowHour) {
        await Booking.findByIdAndUpdate(b._id, { status: 'completed', payoutEligible: true });
      }
    }

    const { venueId, status } = req.query;
    const filter = { owner: req.auth.id, status: { $ne: 'hold' } }; // Exclude temporary holds from owner portal!
    if (venueId && venueId !== 'all') filter.venue = venueId;
    if (status && status !== 'all') filter.status = status;

    const rawBookings = await Booking.find(filter)
      .populate('venue', 'name')
      .populate('customer', 'name') // DO NOT expose phone/email to owners
      .sort({ createdAt: -1 });

    // Strip any contact info — only show first name and booking details
    const bookings = rawBookings.map(b => {
      const obj = b.toObject();
      if (obj.customer) {
        obj.customer = { _id: obj.customer._id, name: obj.customer.name };
      }
      return obj;
    });

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

    // Refund any T-Coins that were locked for this hold
    if (booking.tCoinsUsed > 0) {
      const user = await User.findById(booking.customer);
      if (user) {
        user.tCoins = (user.tCoins || 0) + booking.tCoinsUsed;
        await user.save();
        await TCoinsLedger.create({
          user: user._id,
          booking: booking._id,
          type: 'reverse_redeem',
          amount: booking.tCoinsUsed,
          rupeesEquivalent: booking.tCoinsDiscount || (booking.tCoinsUsed / 10),
          balanceAfter: user.tCoins,
          description: `Refunded ${booking.tCoinsUsed} T-Coins — slot hold released`,
        });
      }
    }

    // Completely delete the hold booking so the slot is instantly free
    await Booking.findByIdAndDelete(booking._id);

    res.json({ success: true, message: 'Hold released — slot is now available for others.' });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────
   HELPER — calculate refund tier info
   - MUST be requested >= 24 hours before match slot time
   - <= 2 hrs since booking: 95% refund (5% platform fee, 0% owner)
   - 2 to 12 hrs since booking: 75% refund (15% platform fee, 10% owner)
   - 12 to 24 hrs since booking: 50% refund (30% platform fee, 20% owner)
   - > 24 hrs since booking OR < 24 hrs before match: 0% refund
───────────────────────────────────────────────────── */
function getRefundTierInfo(createdAt, dateStr, timeStr) {
  const now = new Date();

  let matchHour = 0;
  if (timeStr) {
    const timeMatch = timeStr.match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const isPM = timeMatch[3] && timeMatch[3].toUpperCase() === 'PM';
      const isAM = timeMatch[3] && timeMatch[3].toUpperCase() === 'AM';
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      matchHour = h;
    }
  }

  const [yyyy, mm, dd] = (dateStr || '').split('-').map(Number);
  const matchDateTime = new Date(yyyy, mm - 1, dd, matchHour, 0, 0);
  const hoursUntilMatch = (matchDateTime - now) / (1000 * 60 * 60);

  if (hoursUntilMatch <= 0) {
    return {
      canCancel: false,
      refundPct: 0,
      ownerPct: 0,
      message: 'Cannot cancel a match slot that has already started or passed.',
    };
  }

  if (hoursUntilMatch < 24) {
    return {
      canCancel: false,
      refundPct: 0,
      ownerPct: 0,
      message: 'Cannot cancel booking: Match is starting within 24 hours (cancellations are only permitted at least 24 hours before match start).',
    };
  }

  const hoursSinceBooking = (now - new Date(createdAt)) / (1000 * 60 * 60);

  if (hoursSinceBooking <= 2) {
    return {
      canCancel: true,
      refundPct: 95,
      ownerPct: 0,
      message: '95% refund — cancelled within 2 hours of booking.',
    };
  } else if (hoursSinceBooking <= 12) {
    return {
      canCancel: true,
      refundPct: 75,
      ownerPct: 10,
      message: '75% refund — cancelled within 12 hours of booking (10% owner compensation).',
    };
  } else if (hoursSinceBooking <= 24) {
    return {
      canCancel: true,
      refundPct: 50,
      ownerPct: 20,
      message: '50% refund — cancelled between 12 to 24 hours of booking (20% owner compensation).',
    };
  } else {
    return {
      canCancel: false,
      refundPct: 0,
      ownerPct: 0,
      message: 'No refund available — cancellation window (more than 24 hours after making booking) has passed.',
    };
  }
}

async function getMonthlyUserCancellationCount(userId) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const count = await Booking.countDocuments({
    customer: userId,
    status: 'cancelled',
    paymentStatus: { $in: ['paid', 'refunded'] },
    $or: [
      { cancelledAt: { $gte: startOfMonth } },
      { updatedAt: { $gte: startOfMonth } },
    ],
  });
  return count;
}

/* ══════════════════════════════════════
   CANCEL — customer/booker only (owners cannot cancel bookings)
   PATCH /api/bookings/:id/cancel
   ══════════════════════════════════════ */
router.patch('/:id/cancel', protect, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('venue', 'name location')
      .populate('customer', 'name email phone');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const customerId = (booking.customer?._id || booking.customer)?.toString();
    const isTheCustomer = req.auth.role === 'user' && customerId === req.auth.id;
    if (!isTheCustomer) {
      return res.status(403).json({
        success: false,
        message: booking.isSplit
          ? 'Only the team organizer (booker) who created this group booking can cancel it.'
          : 'Only the customer who made the booking can request cancellation.',
      });
    }

    // If it's an unpaid hold, delete it entirely for instant slot release
    if (booking.status === 'hold' && booking.paymentStatus !== 'paid') {
      if (booking.tCoinsUsed > 0) {
        const user = await User.findById(booking.customer);
        if (user) {
          user.tCoins = (user.tCoins || 0) + booking.tCoinsUsed;
          await user.save();
          await TCoinsLedger.create({
            user: user._id,
            booking: booking._id,
            type: 'reverse_redeem',
            amount: booking.tCoinsUsed,
            rupeesEquivalent: booking.tCoinsDiscount || (booking.tCoinsUsed / 10),
            balanceAfter: user.tCoins,
            description: `Refunded ${booking.tCoinsUsed} T-Coins — hold cancelled`,
          });
        }
      }
      await Booking.findByIdAndDelete(booking._id);
      return res.json({ success: true, data: { _id: booking._id, status: 'cancelled' }, message: 'Hold discarded — slot released.' });
    }

    if (booking.status !== 'upcoming') {
      return res.status(400).json({ success: false, message: `Cannot cancel a ${booking.status} booking` });
    }

    // Check monthly cancellation limit (max 2 per month)
    const monthlyCount = await getMonthlyUserCancellationCount(req.auth.id);
    if (monthlyCount >= 2) {
      return res.status(400).json({
        success: false,
        message: 'Monthly cancellation limit reached: You are allowed to cancel a maximum of 2 bookings per month.',
      });
    }

    const tier = getRefundTierInfo(booking.createdAt, booking.date, booking.time);
    if (!tier.canCancel) {
      return res.status(400).json({ success: false, message: tier.message });
    }

    const refundAmount = Math.round((booking.amount * tier.refundPct) / 100);
    const ownerCompensation = Math.round((booking.amount * tier.ownerPct) / 100);
    const totalRefundCoins = Math.round(refundAmount * 10); // 10 coins = ₹1

    // ── NOTE: NO REAL MONEY/RAZORPAY GATEWAY REFUND.
    // Instead, award 100% equivalent T-Coins directly to user wallets! ──

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.paymentStatus = refundAmount > 0 ? 'refunded' : booking.paymentStatus;
    booking.refundStatus = tier.refundPct > 0 ? 'approved' : 'none';
    booking.refundPct = tier.refundPct;
    booking.refundAmount = refundAmount;
    booking.refundInTCoins = !booking.isSplit; // Solo: T-Coins refund | Split: Real INR refund
    booking.refundCoins = totalRefundCoins;
    booking.ownerCompensation = ownerCompensation;
    booking.payoutEligible = ownerCompensation > 0;
    booking.holdExpiresAt = null;
    if (booking.isSplit) {
      booking.splitStatus = 'expired';
      booking.splitExpiresAt = null;
    }

    // ── Distribute Real INR Refund & Reverse Cashback / Used Coins for Split Bookings ──
    if (booking.isSplit && booking.splitPayments && booking.splitPayments.length > 0) {
      // Group Booking: Process each teammate/payer with REAL Razorpay INR refund (not phantom T-Coins)
      for (const p of booking.splitPayments) {
        // 1. Issue real Razorpay INR refund for this payer's share (tier-based %)
        if (razorpayConfiguredBookings && p.razorpayPaymentId) {
          const payerShareRefund = Math.round((p.amount || 0) * (tier.refundPct / 100));
          if (payerShareRefund > 0) {
            try {
              const paidPaise = payerShareRefund * 100; // Razorpay uses paise
              await razorpayBookings.payments.refund(p.razorpayPaymentId, {
                amount: paidPaise,
                speed: 'optimum',
                notes: {
                  reason: `Group booking cancelled — ${tier.refundPct}% refund per cancellation policy`,
                  splitCode: booking.splitCode,
                  payerName: p.payerName || '',
                },
              });
              console.log(`✅ Split cancel refund: ₹${payerShareRefund} (${tier.refundPct}%) for ${p.payerName} (${p.razorpayPaymentId})`);
            } catch (rzpErr) {
              console.error(`❌ Split cancel Razorpay refund failed for ${p.razorpayPaymentId}:`, rzpErr.message);
            }
          }
        }

        // 2. Find payer user for T-Coins operations
        let payerUser = null;
        if (p.user) {
          payerUser = await User.findById(p.user);
        }
        if (!payerUser && p.payerPhone) {
          payerUser = await User.findOne({ phone: p.payerPhone });
        }
        if (!payerUser) {
          payerUser = await User.findById(booking.customer?._id || booking.customer);
        }

        if (payerUser) {
          // NOTE: No phantom T-Coins refund! The INR refund above handles the real money.
          // We only handle T-Coins that were actually used/earned.

          // 3. Reverse earned cashback on share
          const payerCashbackPct = getCashbackPct(payerUser);
          const shareCashback = Math.round((p.amount || 0) * (payerCashbackPct / 100) * 10);
          if (shareCashback > 0) {
            payerUser.tCoins = Math.max(0, (payerUser.tCoins || 0) - shareCashback);
            payerUser.tCoinsLifetime = Math.max(0, (payerUser.tCoinsLifetime || 0) - shareCashback);
            await TCoinsLedger.create({
              user: payerUser._id,
              booking: booking._id,
              type: 'reverse_earn',
              amount: -shareCashback,
              rupeesEquivalent: -Math.round((p.amount || 0) * (payerCashbackPct / 100)),
              balanceAfter: payerUser.tCoins,
              description: `Reversed ${shareCashback} earned T-Coins — group booking cancelled`,
            });
          }

          // 4. Return actually-used T-Coins for this share (100% refund of coins used)
          if (p.tCoinsUsed > 0) {
            payerUser.tCoins = (payerUser.tCoins || 0) + p.tCoinsUsed;
            await TCoinsLedger.create({
              user: payerUser._id,
              booking: booking._id,
              type: 'reverse_redeem',
              amount: p.tCoinsUsed,
              rupeesEquivalent: p.tCoinsDiscount || (p.tCoinsUsed / 10),
              balanceAfter: payerUser.tCoins,
              description: `Refunded 100% (${p.tCoinsUsed}) used T-Coins — group booking cancelled`,
            });
          }

          await payerUser.save();
        }
      }
    } else {
      // Solo Booking: Process single customer wallet
      const customerUser = await User.findById(booking.customer?._id || booking.customer);
      if (customerUser) {
        // 1. Credit T-Coins policy refund
        if (totalRefundCoins > 0) {
          customerUser.tCoins = (customerUser.tCoins || 0) + totalRefundCoins;
          await TCoinsLedger.create({
            user: customerUser._id,
            booking: booking._id,
            type: 'refund',
            amount: totalRefundCoins,
            rupeesEquivalent: refundAmount,
            balanceAfter: customerUser.tCoins,
            description: `Refund of ₹${refundAmount} (${tier.refundPct}%) credited as ${totalRefundCoins} T-Coins for cancelled booking`,
          });
        }

        // 2. Reverse earned cashback coins
        const customerCashbackPct = getCashbackPct(customerUser);
        const coinsToReverse = booking.tCoinsEarned || (booking.paymentStatus === 'paid' ? Math.round(booking.amount * (customerCashbackPct / 100) * 10) : 0);
        if (coinsToReverse > 0 && (booking.tCoinsEarnedCredited || booking.tCoinsEarned > 0)) {
          customerUser.tCoins = Math.max(0, (customerUser.tCoins || 0) - coinsToReverse);
          customerUser.tCoinsLifetime = Math.max(0, (customerUser.tCoinsLifetime || 0) - coinsToReverse);
          booking.tCoinsEarnedCredited = false;
          await TCoinsLedger.create({
            user: customerUser._id,
            booking: booking._id,
            type: 'reverse_earn',
            amount: -coinsToReverse,
            rupeesEquivalent: -(Math.round(coinsToReverse / 10)),
            balanceAfter: customerUser.tCoins,
            description: `Reversed ${coinsToReverse} earned T-Coins — booking cancelled`,
          });
        }

        // 3. 100% refund used coins back to wallet
        if (booking.tCoinsUsed > 0) {
          customerUser.tCoins = (customerUser.tCoins || 0) + booking.tCoinsUsed;
          await TCoinsLedger.create({
            user: customerUser._id,
            booking: booking._id,
            type: 'reverse_redeem',
            amount: booking.tCoinsUsed,
            rupeesEquivalent: booking.tCoinsDiscount || (booking.tCoinsUsed / 10),
            balanceAfter: customerUser.tCoins,
            description: `Refunded 100% (${booking.tCoinsUsed}) used T-Coins — booking cancelled`,
          });
        }

        await customerUser.save();
      }
    }

    await booking.save();

    res.json({
      success: true,
      message: `${tier.refundPct}% refund credited as ${totalRefundCoins.toLocaleString('en-IN')} T-Coins (₹${refundAmount}) to your MyTurfy wallet.`,
      data: {
        bookingId: booking._id,
        status: 'cancelled',
        refundPct: tier.refundPct,
        refundAmount,
        refundCoins: totalRefundCoins,
        originalAmount: booking.amount,
        ownerCompensation,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   REFUND PREVIEW — preview refund tier for a booking
   GET /api/bookings/:id/refund-preview
   ══════════════════════════════════════ */
router.get('/:id/refund-preview', protect, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const monthlyCount = await getMonthlyUserCancellationCount(req.auth.id);
    if (monthlyCount >= 2) {
      return res.json({
        success: true,
        data: {
          bookingId: booking._id,
          bookingAmount: booking.amount,
          refundPct: 0,
          refundAmount: 0,
          refundCoins: 0,
          canCancel: false,
          isSplit: !!booking.isSplit,
          message: 'Monthly cancellation limit reached: You are allowed to cancel a maximum of 2 bookings per month.',
          date: booking.date,
          time: booking.time,
        },
      });
    }

    const tier = getRefundTierInfo(booking.createdAt, booking.date, booking.time);
    const refundAmount = Math.round((booking.amount * tier.refundPct) / 100);
    const refundCoins = Math.round(refundAmount * 10); // 10 coins = ₹1

    res.json({
      success: true,
      data: {
        bookingId: booking._id,
        bookingAmount: booking.amount,
        refundPct: tier.refundPct,
        refundAmount,
        refundCoins,
        canCancel: tier.canCancel,
        isSplit: !!booking.isSplit,
        message: tier.canCancel
          ? `${tier.refundPct}% refund (${refundCoins.toLocaleString('en-IN')} T-Coins = ₹${refundAmount}) will be credited to your MyTurfy wallet.`
          : tier.message,
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

    const monthlyCount = await getMonthlyUserCancellationCount(req.auth.id);
    if (monthlyCount >= 2) {
      return res.status(400).json({
        success: false,
        message: 'Monthly cancellation limit reached: You are allowed to cancel a maximum of 2 bookings per month.',
      });
    }

    const { reason } = req.body;
    const tier = getRefundTierInfo(booking.createdAt, booking.date, booking.time);
    if (!tier.canCancel) {
      return res.status(400).json({ success: false, message: tier.message });
    }

    const pct = tier.refundPct;
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

    // 40% Owner compensation out of non-refunded retained amount
    const unrefunded = Math.max(0, booking.amount - (booking.refundAmount || 0));
    const ownerCompensation = Math.round(unrefunded * 0.40);
    const totalRefundCoins = Math.round((booking.refundAmount || 0) * 10);

    booking.refundStatus = 'approved';
    booking.status = 'cancelled'; // NOW the slot is freed!
    booking.paymentStatus = 'refunded';
    booking.refundInTCoins = true;
    booking.refundCoins = totalRefundCoins;
    booking.ownerCompensation = ownerCompensation;
    booking.payoutEligible = ownerCompensation > 0;

    // ── T-Coins Credit & Reversal on Admin Refund ──
    const refundCustomer = await User.findById(booking.customer._id || booking.customer);
    if (refundCustomer) {
      // 1. Credit Policy Refund as T-Coins
      if (totalRefundCoins > 0) {
        refundCustomer.tCoins = (refundCustomer.tCoins || 0) + totalRefundCoins;
        await TCoinsLedger.create({
          user: refundCustomer._id,
          booking: booking._id,
          type: 'refund',
          amount: totalRefundCoins,
          rupeesEquivalent: booking.refundAmount || 0,
          balanceAfter: refundCustomer.tCoins,
          description: `Admin approved refund of ₹${booking.refundAmount} (${booking.refundPct}%) credited as ${totalRefundCoins} T-Coins`,
        });
      }

      // 2. Reverse earned T-Coins (claw back 3% cashback)
      if (booking.tCoinsEarned > 0 && booking.tCoinsEarnedCredited) {
        refundCustomer.tCoins = Math.max(0, (refundCustomer.tCoins || 0) - booking.tCoinsEarned);
        refundCustomer.tCoinsLifetime = Math.max(0, (refundCustomer.tCoinsLifetime || 0) - booking.tCoinsEarned);
        await TCoinsLedger.create({
          user: refundCustomer._id,
          booking: booking._id,
          type: 'reverse_earn',
          amount: -booking.tCoinsEarned,
          rupeesEquivalent: -Math.round(booking.tCoinsEarned / 10),
          balanceAfter: refundCustomer.tCoins,
          description: `Reversed ${booking.tCoinsEarned} T-Coins (refund approved)`,
        });
        booking.tCoinsEarnedCredited = false;
      }

      // 3. Refund redeemed T-Coins (give back coins used for discount)
      if (booking.tCoinsUsed > 0) {
        refundCustomer.tCoins = (refundCustomer.tCoins || 0) + booking.tCoinsUsed;
        await TCoinsLedger.create({
          user: refundCustomer._id,
          booking: booking._id,
          type: 'reverse_redeem',
          amount: booking.tCoinsUsed,
          rupeesEquivalent: Math.round(booking.tCoinsUsed / 10),
          balanceAfter: refundCustomer.tCoins,
          description: `Refunded ${booking.tCoinsUsed} T-Coins (discount reversed)`,
        });
      }

      await refundCustomer.save();
    }

    await booking.save();

    await sendRefundApprovedEmail(booking);

    res.json({
      success: true,
      data: booking,
      message: `Refund of ${booking.refundPct}% (₹${booking.refundAmount} = ${totalRefundCoins} T-Coins) approved and credited to customer's wallet by Admin. Slot released.`,
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
    const bookings = await Booking.find({
      owner: req.auth.id,
      status: { $ne: 'cancelled' },
      paymentStatus: 'paid',
      refundStatus: { $nin: ['requested', 'approved'] },
      payoutEligible: true,
    }).populate('venue', 'name').populate('customer', 'name');

    res.json({ success: true, count: bookings.length, data: bookings });
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

    // Mark QR as validated — identity check only; status stays 'upcoming' until time-based auto-complete
    booking.qrValidated = true;
    booking.qrValidatedAt = new Date();
    booking.qrValidatedBy = req.auth.id;
    // NOTE: status remains 'upcoming'; time-based auto-complete will mark it 'completed'
    await booking.save();

    res.json({
      success: true,
      data: {
        bookingId: booking._id,
        customerName: booking.customer.name,
        venueName: booking.venue.name,
        amount: booking.amount,
        validatedAt: booking.qrValidatedAt,
        message: 'QR identity verified successfully. Customer is authenticated for this slot.',
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

    const cleanEmail = email.toLowerCase().trim();
    const customer = await User.findOne({ email: cleanEmail });
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

    // Send OTP email via central sendEmail helper
    await sendEmail({
      to: cleanEmail,
      subject: 'MyTurfy - Booking Verification Code',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#0a0f0d;color:#e8f5e9;border-radius:12px;border:1px solid rgba(0,200,83,.2)">
          <h2 style="color:#00c853;font-size:24px">Booking Verification Code 🏟️</h2>
          <p>Your verification code for booking at <strong>${booking.venue.name}</strong> is:</p>
          <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#00c853;background:#111a14;padding:16px;border-radius:10px;text-align:center;margin:20px 0;border:1px solid rgba(0,200,83,.2)">${otp}</div>
          <p style="font-size:12px;color:#7aad82">Valid for 10 minutes. Share this code with the venue manager to verify your entry.</p>
        </div>`,
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

    const cleanEmail = email.toLowerCase().trim();
    const customer = await User.findOne({ email: cleanEmail });
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

    // Mark as identity-verified — status stays 'upcoming'; time-based auto-complete handles completion
    booking.qrValidated = true;
    booking.qrValidatedAt = new Date();
    booking.qrValidatedBy = req.auth.id;
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
        message: 'Customer identity verified. Booking is confirmed for this slot.',
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;