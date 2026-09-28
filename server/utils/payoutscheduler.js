/**
 * utils/payoutScheduler.js
 * Runs once per hour (called from server.js).
 * Finds all upcoming bookings whose slot date+time has now passed,
 * have no active refund request, and marks them payoutEligible = true.
 *
 * This is the key piece of the escrow flow:
 *   Payment comes in → held in YOUR Razorpay/bank account
 *   Slot time passes + no refund → payoutEligible = true
 *   You then pay the owner manually or via Razorpay Route
 *
 * In production, replace setInterval with a proper cron job
 * (node-cron or a Railway/Render cron service).
 */

const Booking = require('../models/Booking');

async function markPayoutEligibleBookings() {
  try {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentHour = now.getHours();

    // Find upcoming bookings that might have passed
    const candidates = await Booking.find({
      status: 'upcoming',
      paymentStatus: 'paid',
      payoutEligible: false,
      refundStatus: { $nin: ['requested', 'approved'] },
    }).select('date time durationHours');

    const toMark = candidates.filter(b => {
      // If date is before today — definitely passed
      if (b.date < todayStr) return true;
      // If date is today — check if the slot end hour has passed
      if (b.date === todayStr) {
        const slotEndHour = parseInt((b.time || '0').split(':')[0], 10) + (b.durationHours || 1);
        return slotEndHour <= currentHour;
      }
      return false;
    });

    if (toMark.length > 0) {
      const ids = toMark.map(b => b._id);
      await Booking.updateMany(
        { _id: { $in: ids } },
        { $set: { status: 'completed', payoutEligible: true } }
      );
      console.log(`💰 Payout scheduler: ${toMark.length} booking(s) marked payout-eligible`);
    }
  } catch (err) {
    console.error('Payout scheduler error:', err.message);
  }
}

function startPayoutScheduler() {
  // Run once immediately on startup to catch any missed bookings
  markPayoutEligibleBookings();
  // Then run every hour
  setInterval(markPayoutEligibleBookings, 60 * 60 * 1000);
  console.log('⏰ Payout eligibility scheduler started (runs every hour)');
}

module.exports = { startPayoutScheduler, markPayoutEligibleBookings };