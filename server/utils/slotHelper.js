/**
 * utils/slotHelper.js
 * Centralized helpers for:
 * 1. Time parsing (robust 12-hour/24-hour string conversion)
 * 2. Auto-expiring past holds and past split bookings
 * 3. Concurrent slot availability verification (turf capacity, court assignment, operating hours, owner blocks)
 * 4. Hour-by-hour booking counts
 */

const Booking = require('../models/Booking');
const Venue = require('../models/Venue');

const User = require('../models/User');
const TCoinsLedger = require('../models/TCoinsLedger');
const config = require('../config/config');
const Razorpay = require('razorpay');

const razorpayConfigured = !!(config.razorpay?.keyId && config.razorpay?.keySecret);
const razorpay = razorpayConfigured
  ? new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret })
  : null;

/**
 * Robust helper to parse any time string format into 24-hour integer (0–23).
 * Examples:
 *   "6:00 PM"  -> 18
 *   "06:00 PM" -> 18
 *   "12:00 PM" -> 12
 *   "12:00 AM" -> 0
 *   "1:00 AM"  -> 1
 *   "18:00"    -> 18
 *   "6"        -> 6
 */
function parseTimeTo24Hour(timeStr) {
  if (!timeStr) return 0;
  const str = String(timeStr).trim();
  const match = str.match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
  if (!match) {
    const parsed = parseInt(str, 10);
    return isNaN(parsed) ? 0 : parsed;
  }
  let h = parseInt(match[1], 10);
  const isPM = match[3] && match[3].toUpperCase() === 'PM';
  const isAM = match[3] && match[3].toUpperCase() === 'AM';
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h;
}

/**
 * Format 24-hour integer (0-23) to readable 12-hour string (e.g. 18 -> "6:00 PM")
 */
function formatHourToString(hourInt) {
  const h = Number(hourInt);
  if (isNaN(h)) return '';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:00 ${suffix}`;
}

/**
 * Auto-expires holds and active split bookings whose expiry timestamps have passed.
 */
async function autoExpireHoldsAndSplits() {
  const now = new Date();

  // ── Expire active split bookings WITH proper refund processing ──
  const expiredSplits = await Booking.find({
    isSplit: true,
    splitStatus: 'active',
    splitExpiresAt: { $lte: now },
  });

  for (const booking of expiredSplits) {
    try {
      booking.splitStatus = 'expired';
      booking.status = 'cancelled';

      // Process refunds for each payer who already paid
      if (booking.splitPayments && booking.splitPayments.length > 0) {
        for (const payment of booking.splitPayments) {
          // 1. Issue 100% Razorpay INR refund for this payer's share
          if (razorpayConfigured && payment.razorpayPaymentId) {
            try {
              await razorpay.payments.refund(payment.razorpayPaymentId, {
                speed: 'optimum',
                notes: {
                  reason: 'Split booking timer expired — 100% automatic refund',
                  splitCode: booking.splitCode,
                  payerName: payment.payerName || '',
                },
              });
              console.log(`✅ Split expiry refund issued for ${payment.payerName} (${payment.razorpayPaymentId})`);  
            } catch (rzpErr) {
              console.error(`❌ Split expiry Razorpay refund failed for ${payment.razorpayPaymentId}:`, rzpErr.message);
            }
          }

          // 2. Restore T-Coins that this payer used (reverse_redeem)
          if (payment.tCoinsUsed > 0 && payment.user) {
            try {
              const payerUser = await User.findById(payment.user);
              if (payerUser) {
                payerUser.tCoins = (payerUser.tCoins || 0) + payment.tCoinsUsed;
                await payerUser.save();
                await TCoinsLedger.create({
                  user: payerUser._id,
                  booking: booking._id,
                  type: 'reverse_redeem',
                  amount: payment.tCoinsUsed,
                  rupeesEquivalent: payment.tCoinsDiscount || Math.floor(payment.tCoinsUsed / 10),
                  balanceAfter: payerUser.tCoins,
                  description: `Restored ${payment.tCoinsUsed} T-Coins — split booking timer expired`,
                });
              }
            } catch (coinErr) {
              console.error(`❌ T-Coins reverse_redeem failed for user ${payment.user}:`, coinErr.message);
            }
          }

          // 3. Reverse earned cashback T-Coins for this payer
          if (payment.user) {
            try {
              const payerUser = await User.findById(payment.user);
              if (payerUser && payment.amount > 0) {
                // Calculate cashback that was earned on this share (3% default)
                const cashbackPct = 3; // Use default; exact tier lookup not critical for reversal
                const cashbackCoins = Math.round((payment.amount || 0) * (cashbackPct / 100) * 10);
                if (cashbackCoins > 0) {
                  payerUser.tCoins = Math.max(0, (payerUser.tCoins || 0) - cashbackCoins);
                  payerUser.tCoinsLifetime = Math.max(0, (payerUser.tCoinsLifetime || 0) - cashbackCoins);
                  await payerUser.save();
                  await TCoinsLedger.create({
                    user: payerUser._id,
                    booking: booking._id,
                    type: 'reverse_earn',
                    amount: -cashbackCoins,
                    rupeesEquivalent: -Math.round((payment.amount || 0) * (cashbackPct / 100)),
                    balanceAfter: payerUser.tCoins,
                    description: `Reversed ${cashbackCoins} earned T-Coins — split booking timer expired`,
                  });
                }
              }
            } catch (earnErr) {
              console.error(`❌ Cashback reversal failed for user ${payment.user}:`, earnErr.message);
            }
          }
        }
      }

      await booking.save();
    } catch (err) {
      console.error(`❌ Error processing expired split booking ${booking._id}:`, err.message);
      // Still mark as expired even if refund fails
      try {
        await Booking.findByIdAndUpdate(booking._id, { splitStatus: 'expired', status: 'cancelled' });
      } catch (_) {}
    }
  }

  // ── Expire 3-minute solo holds (no payment was made, so no refund needed) ──
  await Booking.updateMany(
    { status: 'hold', holdExpiresAt: { $lte: now } },
    { $set: { status: 'cancelled' } }
  );
}

/**
 * Returns a Map of (hour -> number of active concurrent bookings) for a venue and date.
 */
async function getHourBookingCounts(venueId, date, courtNumber = null) {
  await autoExpireHoldsAndSplits();
  const now = new Date();

  const query = {
    venue: venueId,
    date,
    status: { $ne: 'cancelled' },
    $or: [
      { paymentStatus: 'paid', status: { $in: ['upcoming', 'completed'] } },
      { status: 'hold', holdExpiresAt: { $gt: now } },
      { isSplit: true, splitStatus: 'active', splitExpiresAt: { $gt: now } },
    ],
  };

  if (courtNumber) {
    query.courtNumber = Number(courtNumber);
  }

  const bookings = await Booking.find(query).select('time durationHours courtNumber');

  const counts = new Map();
  bookings.forEach(b => {
    const startH = parseTimeTo24Hour(b.time);
    const dur = b.durationHours || 1;
    for (let i = 0; i < dur; i++) {
      const h = startH + i;
      counts.set(h, (counts.get(h) || 0) + 1);
    }
  });

  return counts;
}

/**
 * Checks if a slot is available for booking.
 * Returns { available: boolean, reason?: string, venue?: Object, startH?: number }
 */
async function checkSlotAvailability({
  venueId,
  date,
  time,
  durationHours = 1,
  courtNumber = 1,
  excludeBookingId = null,
}) {
  const now = new Date();

  // 1. Auto-expire holds/splits past their deadlines
  await autoExpireHoldsAndSplits();

  // 2. Fetch venue
  const venue = await Venue.findById(venueId).populate('owner', 'name email');
  if (!venue || !venue.isActive) {
    return { available: false, reason: 'Venue is currently inactive or not available for bookings.' };
  }

  // 3. Check closed dates
  if ((venue.closedDates || []).includes(date)) {
    return { available: false, reason: 'The venue is closed on this selected date.' };
  }

  const startH = parseTimeTo24Hour(time);
  const dur = Math.max(1, Number(durationHours) || 1);
  const courtNum = Math.max(1, Number(courtNumber) || 1);

  // 4. Operating hours check
  const openHour = venue.openHour ?? 6;
  const closeHour = venue.closeHour ?? 22;
  if (startH < openHour || (startH + dur) > closeHour) {
    const closeLabel = formatHourToString(closeHour);
    const startLabel = formatHourToString(startH);
    return {
      available: false,
      reason: `Venue closes at ${closeLabel}. Booking starting at ${startLabel} (${dur} hr) exceeds closing time.`,
      venue,
      startH,
    };
  }

  // 5. Check owner-blocked hours
  const blockedEntry = (venue.blockedSlots || []).find(s => s.date === date);
  if (blockedEntry && blockedEntry.hours && blockedEntry.hours.length > 0) {
    for (let i = 0; i < dur; i++) {
      const checkH = startH + i;
      if (blockedEntry.hours.includes(checkH)) {
        return {
          available: false,
          reason: `Slot at ${formatHourToString(checkH)} has been blocked by the venue owner.`,
          venue,
          startH,
        };
      }
    }
  }

  // 6. Check active conflicting bookings
  const query = {
    venue: venue._id,
    date,
    status: { $ne: 'cancelled' },
    $or: [
      { paymentStatus: 'paid', status: { $in: ['upcoming', 'completed'] } },
      { status: 'hold', holdExpiresAt: { $gt: now } },
      { isSplit: true, splitStatus: 'active', splitExpiresAt: { $gt: now } },
    ],
  };

  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const existingBookings = await Booking.find(query).select('time durationHours courtNumber status paymentStatus');
  const turfsCount = venue.specs?.turfs || 1;

  for (let i = 0; i < dur; i++) {
    const checkH = startH + i;
    const hourLabel = formatHourToString(checkH);

    // Check specific court conflict
    const courtConflict = existingBookings.find(b => {
      const bCourt = b.courtNumber || 1;
      if (bCourt !== courtNum) return false;
      const bStart = parseTimeTo24Hour(b.time);
      const bDur = b.durationHours || 1;
      return checkH >= bStart && checkH < (bStart + bDur);
    });

    if (courtConflict) {
      return {
        available: false,
        reason: `Court ${courtNum} at ${hourLabel} has already been reserved or booked by another customer.`,
        venue,
        startH,
      };
    }

    // Check total venue courts capacity
    const activeCountAtHour = existingBookings.filter(b => {
      const bStart = parseTimeTo24Hour(b.time);
      const bDur = b.durationHours || 1;
      return checkH >= bStart && checkH < (bStart + bDur);
    }).length;

    if (activeCountAtHour >= turfsCount) {
      return {
        available: false,
        reason: `All ${turfsCount} court(s) at ${hourLabel} are already fully booked.`,
        venue,
        startH,
      };
    }
  }

  return { available: true, venue, startH };
}

module.exports = {
  parseTimeTo24Hour,
  formatHourToString,
  autoExpireHoldsAndSplits,
  getHourBookingCounts,
  checkSlotAvailability,
};
