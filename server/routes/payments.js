/**
 * routes/payments.js
 * Comprehensive payment processing with:
 * 1. Post-payment slot availability check to prevent double bookings.
 * 2. Automatic 100% real-money Razorpay refund on late payment / slot taken conflicts.
 * 3. Restoring redeemed T-Coins and notifying customers via email.
 * 4. Payout eligibility tracking & split payments.
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
const TCoinsLedger = require('../models/TCoinsLedger');
const { getCashbackPct } = require('./tcoins');
const {
  sendBookingConfirmationToCustomer,
  sendNewBookingAlertToOwner,
  sendLatePaymentRefundEmail,
} = require('../utils/sendEmail');
const {
  parseTimeTo24Hour,
  formatHourToString,
  autoExpireHoldsAndSplits,
  checkSlotAvailability,
  getHourBookingCounts,
} = require('../utils/slotHelper');

const razorpayConfigured = !!(config.razorpay.keyId && config.razorpay.keySecret);
const razorpay = razorpayConfigured
  ? new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret })
  : null;

async function notifyBoth(venue, booking, customer) {
  sendBookingConfirmationToCustomer(customer, venue, booking).catch(e => console.error('Customer email failed:', e.message));
  sendNewBookingAlertToOwner(venue.owner, venue, booking, customer).catch(e => console.error('Owner email failed:', e.message));
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
    const { venueId, date, time, durationHours = 1, courtNumber = 1, bookingId, tCoinsToUse = 0 } = req.body;

    let booking = null;
    if (bookingId) {
      booking = await Booking.findById(bookingId);
    }

    const vId = booking ? booking.venue : venueId;
    const venue = await Venue.findOne({ _id: vId, isActive: true }).populate('owner', 'name email');
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    const bDate = booking ? booking.date : date;
    const bTime = booking ? booking.time : time;
    const bDur = booking ? (booking.durationHours || 1) : (durationHours || 1);
    const bCourt = booking ? (booking.courtNumber || 1) : (courtNumber || 1);
    const amount = venue.price * bDur;

    // Check slot availability before creating order
    const availability = await checkSlotAvailability({
      venueId: venue._id,
      date: bDate,
      time: bTime,
      durationHours: bDur,
      courtNumber: bCourt,
      excludeBookingId: booking ? booking._id : null,
    });

    if (!availability.available) {
      return res.status(400).json({
        success: false,
        message: availability.reason || 'This slot is currently unavailable or booked by another user.',
      });
    }

    // Handle T-Coins — VALIDATE ONLY (actual deduction happens in /verify)
    // Solo Booking Rule: Max 70% of user coins & Max 20% of total price
    let tCoinsValidated = 0;
    let tCoinsDiscount = 0;

    if (tCoinsToUse && Number(tCoinsToUse) > 0) {
      const requestedCoins = Math.floor(Number(tCoinsToUse));
      const user = await User.findById(req.auth.id);
      if (user) {
        const maxByBalance = Math.floor((user.tCoins || 0) * 0.70);
        const maxByOrder = Math.floor(amount * 0.20 * 10); // 10 coins = ₹1
        const allowedCoins = Math.min(requestedCoins, maxByBalance, maxByOrder);

        if (allowedCoins > 0) {
          tCoinsValidated = allowedCoins;
          tCoinsDiscount = Math.floor(allowedCoins / 10);
        }
      }
    }

    const finalPayableAmount = Math.max(1, amount - tCoinsDiscount);

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
        amount: finalPayableAmount * 100,
        currency: 'INR',
        receipt: `rcp_${venue._id.toString().slice(-12)}_${Date.now()}`,
        notes: {
          venueId: String(venue._id),
          customerId: req.auth.id,
          date: bDate,
          time: bTime,
          courtNumber: String(bCourt),
          bookingId: booking ? String(booking._id) : '',
          tCoinsUsed: tCoinsValidated,
          tCoinsDiscount,
        },
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
      tCoinsDiscount,
      tCoinsValidated,
      finalPayableAmount,
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════
   STEP 2 — Verify payment + double booking check + auto-refund
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
      tCoinsUsed = 0, tCoinsDiscount = 0,
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

    // ── PAYMENT REPLAY GUARD ──
    const existingPayment = await Booking.findOne({ razorpayPaymentId: razorpay_payment_id });
    if (existingPayment) {
      return res.status(409).json({
        success: false,
        message: 'This payment has already been processed.',
      });
    }

    let booking = null;
    if (bookingId) {
      booking = await Booking.findById(bookingId);
    }

    const targetVenueId = booking ? booking.venue : venueId;
    const targetDate = booking ? booking.date : date;
    const targetTime = booking ? booking.time : time;
    const targetDuration = booking ? (booking.durationHours || 1) : (durationHours || 1);
    const targetCourtNumber = booking ? (booking.courtNumber || 1) : (courtNumber || 1);

    // ── SERVER-SIDE HOLD EXPIRY GUARD ──
    // If the booking hold has already expired or been cancelled, reject payment and auto-refund
    if (booking) {
      const holdExpired = booking.status === 'cancelled' ||
        (booking.holdExpiresAt && new Date(booking.holdExpiresAt) < new Date());
      if (holdExpired) {
        // Issue immediate 100% Razorpay refund
        let refundId = null;
        if (razorpayConfigured && razorpay_payment_id) {
          try {
            const refundResult = await razorpay.payments.refund(razorpay_payment_id, {
              speed: 'optimum',
              notes: { reason: 'Hold timer expired before payment completed. Auto-refund.' },
            });
            refundId = refundResult?.id || null;
            console.log(`✅ Hold-expired auto-refund: ${refundId} for payment ${razorpay_payment_id}`);
          } catch (rzpErr) {
            console.error('❌ Hold-expired auto-refund failed:', rzpErr.message);
          }
        }

        // Restore T-Coins if any were passed
        const coinsToRestore = Math.floor(Number(tCoinsUsed) || 0);
        if (coinsToRestore > 0) {
          const coinUser = await User.findById(req.auth.id);
          if (coinUser) {
            coinUser.tCoins = (coinUser.tCoins || 0) + coinsToRestore;
            await coinUser.save();
            await TCoinsLedger.create({
              user: coinUser._id,
              booking: booking._id,
              type: 'reverse_redeem',
              amount: coinsToRestore,
              rupeesEquivalent: Math.floor(coinsToRestore / 10),
              balanceAfter: coinUser.tCoins,
              description: `Restored ${coinsToRestore} T-Coins — hold timer expired before payment`,
            });
          }
        }

        // Mark booking
        booking.status = 'cancelled';
        booking.paymentStatus = 'refunded';
        booking.refundStatus = 'approved';
        booking.refundPct = 100;
        booking.razorpayOrderId = razorpay_order_id;
        booking.razorpayPaymentId = razorpay_payment_id;
        if (refundId) booking.razorpayRefundId = refundId;
        booking.holdExpiresAt = null;
        await booking.save();

        const customer = await User.findById(req.auth.id);
        sendLatePaymentRefundEmail(customer, { name: 'Venue' }, booking, 0, 'Hold timer expired').catch(() => {});

        return res.status(409).json({
          success: false,
          refunded: true,
          reason: 'Hold timer expired before payment was completed.',
          message: 'Your 3-minute reservation hold expired. A 100% refund has been automatically initiated to your original payment source (3-7 business days).',
        });
      }
    }

    const venue = await Venue.findById(targetVenueId).populate('owner', 'name email');
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    // ── POST-PAYMENT SLOT AVAILABILITY CHECK ──
    // Checks if another player has taken/confirmed the slot or if operating constraints apply
    const availability = await checkSlotAvailability({
      venueId: targetVenueId,
      date: targetDate,
      time: targetTime,
      durationHours: targetDuration,
      courtNumber: targetCourtNumber,
      excludeBookingId: booking ? booking._id : null,
    });

    // ── CASE A: SLOT IS NO LONGER AVAILABLE (Double booking prevented -> 100% Real Money Refund) ──
    if (!availability.available) {
      let paidRupees = null;

      if (razorpayConfigured && razorpay_payment_id) {
        try {
          const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
          if (paymentDetails && paymentDetails.amount) {
            paidRupees = Math.round(paymentDetails.amount / 100);
          }
        } catch (fetchErr) {
          console.error('Error fetching Razorpay payment amount for refund:', fetchErr.message);
        }
      }

      if (!paidRupees || paidRupees <= 0) {
        const baseAmt = (venue.price || 0) * targetDuration;
        paidRupees = Math.max(1, baseAmt - (tCoinsDiscount || 0));
      }

      // 1. Process 100% Real Money Refund via Razorpay Gateway
      let razorpayRefundId = null;
      let razorpayRefundSuccess = false;

      if (razorpayConfigured && razorpay_payment_id) {
        try {
          const refundResult = await razorpay.payments.refund(razorpay_payment_id, {
            speed: 'optimum',
            notes: {
              reason: 'Late payment - slot hold expired and slot was booked by another user. Full 100% refund.',
              bookingId: booking ? String(booking._id) : '',
              venueId: String(targetVenueId),
              date: String(targetDate),
              time: String(targetTime),
              courtNumber: String(targetCourtNumber),
            },
          });
          razorpayRefundId = refundResult?.id || null;
          razorpayRefundSuccess = true;
          console.log(`✅ Late payment auto-refund issued: ${razorpayRefundId} (₹${paidRupees}) for payment ${razorpay_payment_id}`);
        } catch (rzpErr) {
          console.error('❌ Razorpay auto-refund on expired slot failed:', rzpErr.message);
        }
      }

      const refundReason = availability.reason || 'Late payment: 3-minute reservation hold expired and slot was booked by another player before payment completion';

      // 2. Mark booking as cancelled & refunded in MongoDB
      if (booking) {
        booking.status = 'cancelled';
        booking.paymentStatus = 'refunded';
        booking.refundStatus = 'approved';
        booking.refundPct = 100;
        booking.refundAmount = paidRupees;
        booking.refundInTCoins = false; // Real money refund
        booking.refundReason = refundReason;
        booking.razorpayOrderId = razorpay_order_id;
        booking.razorpayPaymentId = razorpay_payment_id;
        if (razorpayRefundId) booking.razorpayRefundId = razorpayRefundId;
        booking.holdExpiresAt = null;
        await booking.save();
      } else {
        booking = await Booking.create({
          customer: req.auth.id,
          venue: targetVenueId,
          owner: venue.owner?._id || venue.owner,
          date: targetDate,
          time: targetTime,
          durationHours: targetDuration,
          courtNumber: Number(targetCourtNumber),
          amount: venue.price * targetDuration,
          status: 'cancelled',
          paymentStatus: 'refunded',
          refundStatus: 'approved',
          refundPct: 100,
          refundAmount: paidRupees,
          refundInTCoins: false,
          refundReason,
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          razorpayRefundId,
        });
      }

      // 3. Restore any redeemed T-Coins back to customer wallet
      const coinsToRestore = Math.floor(Number(tCoinsUsed) || (booking?.tCoinsUsed || 0));
      if (coinsToRestore > 0) {
        const coinUser = await User.findById(req.auth.id);
        if (coinUser) {
          coinUser.tCoins = (coinUser.tCoins || 0) + coinsToRestore;
          await coinUser.save();
          await TCoinsLedger.create({
            user: coinUser._id,
            booking: booking._id,
            type: 'reverse_redeem',
            amount: coinsToRestore,
            rupeesEquivalent: Math.floor(coinsToRestore / 10),
            balanceAfter: coinUser.tCoins,
            description: `Restored ${coinsToRestore} T-Coins — slot expired and booked by another user`,
          });
        }
      }

      // 4. Send email notification to user
      const customerUser = await User.findById(req.auth.id);
      sendLatePaymentRefundEmail(customerUser, venue, booking, paidRupees, refundReason).catch(e =>
        console.error('Late refund email error:', e.message)
      );

      // 5. Return informative 409 response
      return res.status(409).json({
        success: false,
        refunded: true,
        refundAmount: paidRupees,
        refundId: razorpayRefundId,
        reason: refundReason,
        message: `Your 3-minute reservation hold expired and this slot was booked by another customer. A full 100% refund of ₹${paidRupees.toLocaleString('en-IN')} has been automatically initiated to your original bank account / payment source and will reflect within 3-7 business days.`,
      });
    }

    // ── CASE B: SLOT IS AVAILABLE (Confirm booking cleanly) ──
    if (booking) {
      booking.status = 'upcoming';
      booking.paymentStatus = 'paid';
      booking.payoutEligible = false;
      booking.holdExpiresAt = null;
      booking.razorpayOrderId = razorpay_order_id;
      booking.razorpayPaymentId = razorpay_payment_id;

      // Actually deduct T-Coins now that payment is confirmed
      if (Number(tCoinsUsed) > 0) {
        const coinUser = await User.findById(req.auth.id);
        if (coinUser) {
          const coinsToDeduct = Math.min(Number(tCoinsUsed), coinUser.tCoins || 0);
          const discount = Math.floor(coinsToDeduct / 10);
          if (coinsToDeduct > 0) {
            const deductResult = await User.updateOne(
              { _id: coinUser._id, tCoins: { $gte: coinsToDeduct } },
              { $inc: { tCoins: -coinsToDeduct } }
            );
            if (deductResult.modifiedCount === 0) {
              return res.status(409).json({ success: false, message: 'T-Coins balance changed, please retry.' });
            }
            const updatedUser = await User.findById(coinUser._id);
            await TCoinsLedger.create({
              user: coinUser._id,
              booking: booking._id,
              type: 'redeem',
              amount: -coinsToDeduct,
              rupeesEquivalent: -discount,
              balanceAfter: updatedUser.tCoins,
              description: `Applied ${coinsToDeduct} T-Coins (₹${discount} off)`,
            });
            booking.tCoinsUsed = coinsToDeduct;
            booking.tCoinsDiscount = discount;
          }
        }
      }
      await booking.save();
    } else {
      booking = await Booking.create({
        customer: req.auth.id,
        venue: venue._id,
        owner: venue.owner?._id || venue.owner,
        date: targetDate,
        time: targetTime,
        durationHours: targetDuration,
        courtNumber: Number(targetCourtNumber),
        amount: venue.price * targetDuration,
        commissionPct: venue.commissionPct || config.platformCommissionPct,
        status: 'upcoming',
        paymentStatus: 'paid',
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        payoutEligible: false,
        tCoinsUsed: 0,
        tCoinsDiscount: 0,
        qrCodeData: crypto.randomBytes(8).toString('hex'),
      });

      if (Number(tCoinsUsed) > 0 && booking) {
        const coinUser = await User.findById(req.auth.id);
        if (coinUser) {
          const coinsToDeduct = Math.min(Number(tCoinsUsed), coinUser.tCoins || 0);
          const discount = Math.floor(coinsToDeduct / 10);
          if (coinsToDeduct > 0) {
            const deductResult = await User.updateOne(
              { _id: coinUser._id, tCoins: { $gte: coinsToDeduct } },
              { $inc: { tCoins: -coinsToDeduct } }
            );
            if (deductResult.modifiedCount === 0) {
              return res.status(409).json({ success: false, message: 'T-Coins balance changed, please retry.' });
            }
            const updatedUser = await User.findById(coinUser._id);
            await TCoinsLedger.create({
              user: coinUser._id,
              booking: booking._id,
              type: 'redeem',
              amount: -coinsToDeduct,
              rupeesEquivalent: -discount,
              balanceAfter: updatedUser.tCoins,
              description: `Applied ${coinsToDeduct} T-Coins (₹${discount} off)`,
            });
            booking.tCoinsUsed = coinsToDeduct;
            booking.tCoinsDiscount = discount;
            await booking.save();
          }
        }
      }
    }

    // Award tier-based cashback T-Coins for the completed booking
    const customerUser = await User.findById(booking.customer);
    const cashbackPct = customerUser ? getCashbackPct(customerUser) : 3;
    const coinsEarned = Math.round(booking.amount * (cashbackPct / 100) * 10);
    if (coinsEarned > 0 && !booking.tCoinsEarnedCredited) {
      booking.tCoinsEarned = coinsEarned;
      booking.tCoinsEarnedCredited = true;
      await booking.save();

      if (customerUser) {
        customerUser.tCoins = (customerUser.tCoins || 0) + coinsEarned;
        customerUser.tCoinsLifetime = (customerUser.tCoinsLifetime || 0) + coinsEarned;
        await customerUser.save();

        await TCoinsLedger.create({
          user: customerUser._id,
          booking: booking._id,
          type: 'earn',
          amount: coinsEarned,
          rupeesEquivalent: Math.round(booking.amount * (cashbackPct / 100)),
          balanceAfter: customerUser.tCoins,
          description: `Earned ${coinsEarned} T-Coins (${cashbackPct}% cashback)`,
        });
      }
    }

    const venueObj = await Venue.findById(booking.venue).populate('owner', 'name email');
    const customer = await User.findById(req.auth.id);
    notifyBoth(venueObj, booking, customer);

    res.status(201).json({
      success: true,
      data: booking,
      coinsEarned,
      message: `🎉 Booking confirmed! Court ${booking.courtNumber || 1} at ${venueObj?.name || 'Venue'} booked for ${booking.date} at ${booking.time}.`,
    });
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
    const booking = await Booking.findOne({ splitCode })
      .populate('venue', 'name sport location images price owner')
      .populate('customer', 'name phone email');

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

    const totalTCoinsUsed = (booking.splitPayments || []).reduce((sum, p) => sum + (p.tCoinsUsed || 0), 0);
    const totalTCoinsDiscount = (booking.splitPayments || []).reduce((sum, p) => sum + (p.tCoinsDiscount || 0), 0);
    const maxGroupTCoinsCap = Math.floor(booking.amount * 0.10 * 10); // 10% of total cost in T-Coins
    const maxGroupDiscountCap = Math.floor(booking.amount * 0.10); // 10% of total cost in ₹
    const remainingGroupTCoinsCap = Math.max(0, maxGroupTCoinsCap - totalTCoinsUsed);
    const remainingGroupDiscountCap = Math.max(0, maxGroupDiscountCap - totalTCoinsDiscount);

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
        totalTCoinsUsed,
        totalTCoinsDiscount,
        maxGroupTCoinsCap,
        maxGroupDiscountCap,
        remainingGroupTCoinsCap,
        remainingGroupDiscountCap,
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

    // Check slot availability
    const availability = await checkSlotAvailability({
      venueId: venue._id,
      date,
      time,
      durationHours,
      courtNumber,
    });

    if (!availability.available) {
      return res.status(400).json({
        success: false,
        message: availability.reason || 'This slot is currently unavailable or booked by another user.',
      });
    }

    const totalAmount = venue.price * durationHours;
    const playersCount = Math.max(2, Math.min(20, Number(targetPlayers)));
    const perPersonAmount = Math.ceil(totalAmount / playersCount);
    const splitCode = 'SPLIT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const holdExpiresAt = new Date(Date.now() + 3 * 60 * 1000);
    const splitExpiresAt = new Date(Date.now() + 3 * 60 * 1000);
    const qrCodeData = crypto.randomBytes(8).toString('hex');
    const user = await User.findById(req.auth.id);
    const bookerName = payerName || user?.name || 'Booker';

    // Create split booking document in pending state
    const booking = await Booking.create({
      customer: req.auth.id,
      venue: venue._id,
      owner: venue.owner?._id || venue.owner,
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
      holdExpiresAt,
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

async function getOptionalAuthUser(req) {
  if (req.auth?.id) {
    try { return await User.findById(req.auth.id); } catch (_) {}
  }
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.jwtSecret);
      if (decoded?.id) return await User.findById(decoded.id);
    } catch (_) {}
  }
  return null;
}

// 3. POST /api/payments/create-split-share-order (Teammate Order Creation)
router.post('/create-split-share-order', async (req, res, next) => {
  try {
    const { splitCode, customAmount, tCoinsToUse = 0 } = req.body;
    if (!splitCode) return res.status(400).json({ success: false, message: 'splitCode is required' });

    const booking = await Booking.findOne({ splitCode: splitCode.toUpperCase() });
    if (!booking) return res.status(404).json({ success: false, message: 'Split booking not found' });

    if (booking.splitStatus === 'completed') {
      return res.status(400).json({ success: false, message: 'This split booking is already 100% paid and confirmed!' });
    }

    const now = new Date();
    if (booking.splitExpiresAt && new Date(booking.splitExpiresAt) < now) {
      booking.splitStatus = 'expired';
      booking.status = 'cancelled';
      await booking.save();
      return res.status(400).json({ success: false, message: 'This split booking link has expired.' });
    }

    // Check slot availability
    const availability = await checkSlotAvailability({
      venueId: booking.venue,
      date: booking.date,
      time: booking.time,
      durationHours: booking.durationHours,
      courtNumber: booking.courtNumber,
      excludeBookingId: booking._id,
    });

    if (!availability.available) {
      return res.status(400).json({
        success: false,
        message: availability.reason || 'This slot was booked by another user after expiry.',
      });
    }

    const currentPaid = (booking.splitPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const remainingNeeded = booking.amount - currentPaid;
    if (remainingNeeded <= 0) {
      return res.status(400).json({ success: false, message: 'This booking is already fully paid.' });
    }

    let requestedAmount = Number(customAmount);
    if (!requestedAmount || isNaN(requestedAmount) || requestedAmount <= 0) {
      requestedAmount = booking.perPersonAmount || remainingNeeded;
    }
    const shareAmount = Math.min(requestedAmount, remainingNeeded);
    if (shareAmount < 1) {
      return res.status(400).json({ success: false, message: 'Payment amount must be at least ₹1.' });
    }

    // T-Coins validation for Group Split Share:
    // 1. Each individual can spend at most 50% of their total coins
    // 2. Total payment of ALL players in group booking using T-Coins <= 10% of total match cost
    let tCoinsValidated = 0;
    let tCoinsDiscount = 0;

    const totalCoinsUsedSoFar = (booking.splitPayments || []).reduce((sum, p) => sum + (p.tCoinsUsed || 0), 0);
    const maxGroupCoinsAllowed = Math.floor(booking.amount * 0.10 * 10);
    const remainingGroupCoinsPool = Math.max(0, maxGroupCoinsAllowed - totalCoinsUsedSoFar);

    const user = await getOptionalAuthUser(req);
    if (user && tCoinsToUse && Number(tCoinsToUse) > 0) {
      const requestedCoins = Math.floor(Number(tCoinsToUse));
      const maxByBalance = Math.floor((user.tCoins || 0) * 0.50);
      const maxByShare = Math.floor(shareAmount * 10);
      const allowedCoins = Math.min(requestedCoins, maxByBalance, remainingGroupCoinsPool, maxByShare);

      if (allowedCoins > 0) {
        tCoinsValidated = allowedCoins;
        tCoinsDiscount = Math.floor(allowedCoins / 10);
      }
    }

    const finalShareAmount = Math.max(1, shareAmount - tCoinsDiscount);

    if (!razorpayConfigured) {
      return res.status(400).json({
        success: false,
        message: 'Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your server .env file.',
      });
    }

    let order;
    try {
      order = await razorpay.orders.create({
        amount: finalShareAmount * 100,
        currency: 'INR',
        receipt: `tm_${booking._id.toString().slice(-12)}_${Date.now()}`,
        notes: {
          bookingId: String(booking._id),
          splitCode: booking.splitCode,
          shareAmount: String(shareAmount),
          tCoinsUsed: String(tCoinsValidated),
          tCoinsDiscount: String(tCoinsDiscount),
        },
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
      tCoinsDiscount,
      tCoinsValidated,
      finalShareAmount,
    });
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/payments/pay-split-share (Teammate Share Verification + Double Booking Guard)
router.post('/pay-split-share', async (req, res, next) => {
  try {
    const {
      splitCode, payerName, payerPhone,
      razorpay_order_id, razorpay_payment_id, razorpay_signature,
      customAmount, tCoinsUsed = 0, tCoinsDiscount = 0,
    } = req.body;

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

    // ── Check slot availability ──
    const availability = await checkSlotAvailability({
      venueId: booking.venue?._id || booking.venue,
      date: booking.date,
      time: booking.time,
      durationHours: booking.durationHours,
      courtNumber: booking.courtNumber,
      excludeBookingId: booking._id,
    });

    const now = new Date();
    const isExpired = (booking.splitExpiresAt && new Date(booking.splitExpiresAt) < now) || booking.splitStatus === 'expired' || booking.status === 'cancelled';

    // If slot was taken by someone else:
    if (!availability.available || (isExpired && !availability.available)) {
      if (booking.splitStatus !== 'expired') {
        booking.splitStatus = 'expired';
        booking.status = 'cancelled';
        await booking.save();
      }

      // Auto-refund this teammate's payment
      if (razorpayConfigured && razorpay_payment_id) {
        try {
          await razorpay.payments.refund(razorpay_payment_id, {
            notes: { reason: 'Split match expired and slot booked by another user. Teammate share refunded.' },
          });
        } catch (rzpErr) {
          console.error('Auto-refund on expired split share failed:', rzpErr.message);
        }
      }

      return res.status(409).json({
        success: false,
        refunded: true,
        message: 'This split booking expired and the slot was taken by another user. Your payment has been refunded back to your bank account / payment source.',
      });
    }

    const currentPaid = (booking.splitPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const remainingNeeded = booking.amount - currentPaid;

    let shareAmount = 0;
    const coinsUsedNum = Math.floor(Number(tCoinsUsed) || 0);
    const coinsDiscountNum = Math.floor(Number(tCoinsDiscount) || 0);

    if (razorpayConfigured) {
      try {
        const order = await razorpay.orders.fetch(razorpay_order_id);
        if (order && order.amount) {
          const paidRupees = Math.round(order.amount / 100);
          const orderShare = order.notes?.shareAmount ? parseInt(order.notes.shareAmount, 10) : null;
          shareAmount = orderShare || (paidRupees + coinsDiscountNum);
        }
      } catch (err) {
        console.error('Error fetching Razorpay order amount:', err.message);
      }
    }
    if (!shareAmount || shareAmount <= 0) {
      const requestedAmount = Number(customAmount);
      if (requestedAmount && !isNaN(requestedAmount) && requestedAmount > 0) {
        shareAmount = Math.min(requestedAmount, remainingNeeded);
      } else {
        shareAmount = Math.min(booking.perPersonAmount || remainingNeeded, remainingNeeded);
      }
    }
    shareAmount = Math.min(shareAmount, remainingNeeded);

    // Identify user if logged in
    const user = await getOptionalAuthUser(req);

    // Group booking T-Coins validation
    const totalCoinsUsedSoFar = (booking.splitPayments || []).reduce((sum, p) => sum + (p.tCoinsUsed || 0), 0);
    const maxGroupCoinsAllowed = Math.floor(booking.amount * 0.10 * 10);
    const remainingGroupCoinsPool = Math.max(0, maxGroupCoinsAllowed - totalCoinsUsedSoFar);

    let actualCoinsToUse = 0;
    let actualCoinsDiscount = 0;

    if (user && coinsUsedNum > 0) {
      const maxByBalance = Math.floor((user.tCoins || 0) * 0.50);
      const maxByShare = Math.floor(shareAmount * 10);
      actualCoinsToUse = Math.min(coinsUsedNum, maxByBalance, remainingGroupCoinsPool, maxByShare, user.tCoins || 0);
      actualCoinsDiscount = Math.floor(actualCoinsToUse / 10);

      if (actualCoinsToUse > 0) {
        user.tCoins = Math.max(0, (user.tCoins || 0) - actualCoinsToUse);
        await user.save();
        await TCoinsLedger.create({
          user: user._id,
          booking: booking._id,
          type: 'redeem',
          amount: -actualCoinsToUse,
          rupeesEquivalent: -actualCoinsDiscount,
          balanceAfter: user.tCoins,
          description: `Applied ${actualCoinsToUse} T-Coins (₹${actualCoinsDiscount} off split share)`,
        });
      }
    }

    booking.splitPayments.push({
      user: user ? user._id : null,
      payerName: payerName.trim(),
      payerPhone: payerPhone ? payerPhone.trim() : '',
      amount: shareAmount,
      tCoinsUsed: actualCoinsToUse,
      tCoinsDiscount: actualCoinsDiscount,
      razorpayPaymentId: razorpay_payment_id,
      paidAt: new Date(),
    });

    // Award tier-based cashback on this share to the paying user
    let shareCashbackCoins = 0;
    if (user && shareAmount > 0) {
      const shareCashbackPct = getCashbackPct(user);
      shareCashbackCoins = Math.round(shareAmount * (shareCashbackPct / 100) * 10);
      if (shareCashbackCoins > 0) {
        user.tCoins = (user.tCoins || 0) + shareCashbackCoins;
        user.tCoinsLifetime = (user.tCoinsLifetime || 0) + shareCashbackCoins;
        await user.save();
        await TCoinsLedger.create({
          user: user._id,
          booking: booking._id,
          type: 'earn',
          amount: shareCashbackCoins,
          rupeesEquivalent: Math.round(shareAmount * (shareCashbackPct / 100)),
          balanceAfter: user.tCoins,
          description: `Earned ${shareCashbackCoins} T-Coins (${shareCashbackPct}% cashback on split share)`,
        });
      }
    }

    const newTotalPaid = booking.splitPayments.reduce((sum, p) => sum + p.amount, 0);

    // If this is the first (booker's) payment, extend window for teammates to 7 minutes
    if (booking.splitPayments.length === 1) {
      booking.splitExpiresAt = new Date(Date.now() + 7 * 60 * 1000);
      booking.holdExpiresAt = null;
    }

    if (newTotalPaid >= booking.amount) {
      booking.splitStatus = 'completed';
      booking.paymentStatus = 'paid';
      booking.status = 'upcoming';
      booking.payoutEligible = false;
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
      coinsEarned: shareCashbackCoins,
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