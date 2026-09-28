/**
 * utils/reminderScheduler.js
 * Checks upcoming paid bookings and sends customer reminder emails
 * 24 hours (1 day) and 1 hour before slot start time.
 */

const Booking = require('../models/Booking');
const { sendBookingReminderToCustomer } = require('./sendEmail');

function parseBookingTime(dateStr, timeStr) {
  try {
    if (!dateStr || !timeStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    let hour = 0, minute = 0;

    const timeMatch = String(timeStr).match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
      minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const isPM = timeMatch[3] && timeMatch[3].toUpperCase() === 'PM';
      const isAM = timeMatch[3] && timeMatch[3].toUpperCase() === 'AM';
      if (isPM && hour < 12) hour += 12;
      if (isAM && hour === 12) hour = 0;
    } else {
      hour = parseInt(timeStr, 10);
    }
    return new Date(year, month - 1, day, hour, minute, 0, 0);
  } catch (err) {
    console.error('Error parsing booking time:', err.message);
    return null;
  }
}

async function sendBookingReminders() {
  try {
    const now = new Date();
    const bookings = await Booking.find({
      status: 'upcoming',
      paymentStatus: 'paid',
      refundStatus: { $nin: ['requested', 'approved'] },
      $or: [
        { reminder1DaySent: { $ne: true } },
        { reminder1HourSent: { $ne: true } }
      ]
    }).populate('venue').populate('customer');

    for (const booking of bookings) {
      if (!booking.customer || !booking.venue) continue;

      const slotTime = parseBookingTime(booking.date, booking.time);
      if (!slotTime) continue;

      const diffMs = slotTime.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      // 1 day (24 hours) reminder: booking starts in 12 to 26 hours
      if (diffHours > 12 && diffHours <= 26 && !booking.reminder1DaySent) {
        await sendBookingReminderToCustomer(booking.customer, booking.venue, booking, '1 day');
        booking.reminder1DaySent = true;
        await booking.save();
      }

      // 1 hour reminder: booking starts in 0 to 1.5 hours
      if (diffHours > 0 && diffHours <= 1.5 && !booking.reminder1HourSent) {
        await sendBookingReminderToCustomer(booking.customer, booking.venue, booking, '1 hour');
        booking.reminder1HourSent = true;
        await booking.save();
      }
    }
  } catch (err) {
    console.error('Reminder scheduler error:', err.message);
  }
}

function startReminderScheduler() {
  // Run once on startup
  sendBookingReminders();
  // Run every 5 minutes
  setInterval(sendBookingReminders, 5 * 60 * 1000);
  console.log('⏰ Booking reminder scheduler started (runs every 5 minutes)');
}

module.exports = { startReminderScheduler, sendBookingReminders, parseBookingTime };
