/**
 * utils/sendEmail.js — updated with refund email templates
 */

const nodemailer = require('nodemailer');
const config = require('../config/config');

const MYTURFY_SUPPORT_EMAIL = 'myturfy@gmail.com';

function isEmailConfigured() {
  const u = config.email.user;
  const p = config.email.pass;
  if (!u || !p) return false;
  if (u.includes('yourgmail') || p.startsWith('your_gmail') || p.startsWith('your-gmail')) return false;
  return true;
}

let transporter = null;
let lastSendFailed = false;

function getTransporter() {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: config.email.user, pass: config.email.pass },
    });
  }
  return transporter;
}

function didLastSendFail() { return lastSendFailed; }

async function sendEmail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`✉️  [email skipped — real EMAIL credentials not configured] "${subject}" → ${to}`);
    lastSendFailed = true;
    return;
  }
  try {
    await t.sendMail({ from: config.email.from, to, subject, html });
    console.log(`✅ Email sent: "${subject}" → ${to}`);
    lastSendFailed = false;
  } catch (err) {
    console.error(`❌ Email FAILED: "${subject}" → ${to}: ${err.message}`);
    lastSendFailed = true;
  }
}

/* ─── Standard email templates ─── */

async function sendBookingConfirmationToCustomer(customer, venue, booking) {
  await sendEmail({
    to: customer.email,
    subject: `Booking confirmed — ${venue.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8f5e9;border-radius:14px;overflow:hidden;border:1px solid rgba(0,200,83,.2)">
        <div style="background:#00c853;padding:20px 28px">
          <h2 style="margin:0;font-size:22px;color:#04140a">🎉 Booking Confirmed!</h2>
        </div>
        <div style="padding:24px 28px">
          <p>Hi <strong>${customer.name}</strong>,</p>
          <p>Your booking at <strong>${venue.name}</strong> is confirmed.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#111a14;border-radius:10px;overflow:hidden">
            <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Date</td><td style="padding:10px 16px;font-weight:600">${booking.date}</td></tr>
            <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Time</td><td style="padding:10px 16px;font-weight:600">${booking.time}</td></tr>
            <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Duration</td><td style="padding:10px 16px;font-weight:600">${booking.durationHours} hour(s)</td></tr>
            <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Amount Paid</td><td style="padding:10px 16px;font-weight:600;color:#00c853">₹${booking.amount}</td></tr>
            <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Location</td><td style="padding:10px 16px;font-weight:600">${venue.location}</td></tr>
          </table>
          <p style="font-size:12px;color:#7aad82">Need to cancel? Log into MyTurfy and request a refund before your slot time. Refunds are subject to venue owner approval.</p>
          <p style="margin-top:20px">See you on the field! 🏟️<br><strong>— The MyTurfy Team</strong></p>
        </div>
      </div>`,
  });
}

async function sendNewBookingAlertToOwner(owner, venue, booking, customer) {
  await sendEmail({
    to: owner.email,
    subject: `New booking — ${venue.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8f5e9;border-radius:14px;overflow:hidden;border:1px solid rgba(0,200,83,.2)">
        <div style="background:#00c853;padding:20px 28px">
          <h2 style="margin:0;font-size:22px;color:#04140a">💰 New Booking!</h2>
        </div>
        <div style="padding:24px 28px">
          <p>Hi <strong>${owner.name}</strong>,</p>
          <p><strong>${customer.name}</strong> just booked <strong>${venue.name}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#111a14;border-radius:10px">
            <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Date</td><td style="padding:10px 16px;font-weight:600">${booking.date}</td></tr>
            <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Time</td><td style="padding:10px 16px;font-weight:600">${booking.time}</td></tr>
            <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Amount</td><td style="padding:10px 16px;font-weight:600;color:#00c853">₹${booking.amount}</td></tr>
            <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Customer Phone</td><td style="padding:10px 16px;font-weight:600">${customer.phone || 'Not provided'}</td></tr>
          </table>
          <p style="font-size:12px;color:#7aad82">Note: Payment is held by MyTurfy until after your slot time completes with no refund request.</p>
          <p><strong>— MyTurfy Partner Team</strong></p>
        </div>
      </div>`,
  });
}

/* ─── REFUND EMAIL TEMPLATES ─── */

async function sendRefundRequestEmail(booking, reason, refundPct = 100, refundAmount = booking.amount) {
  const customerName = booking.customer?.name || 'Customer';
  const venueName = booking.venue?.name || 'Venue';
  const totalAmount = booking.amount;

  // 1. Email to Admin Support (myturfy@gmail.com)
  const adminHtml = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8f5e9;border-radius:14px;overflow:hidden;border:1px solid rgba(239,83,80,.3)">
      <div style="background:#ef5350;padding:20px 28px">
        <h2 style="margin:0;font-size:22px;color:#fff">⚠️ Admin Alert: Refund Requested (${refundPct}%)</h2>
      </div>
      <div style="padding:24px 28px">
        <p><strong>${customerName}</strong> has requested a refund for their booking at <strong>${venueName}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#111a14;border-radius:10px">
          <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Booking ID</td><td style="padding:10px 16px;font-weight:600">${booking._id}</td></tr>
          <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Booking Date &amp; Time</td><td style="padding:10px 16px;font-weight:600">${booking.date} at ${booking.time}</td></tr>
          <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Original Amount</td><td style="padding:10px 16px;font-weight:600">₹${totalAmount}</td></tr>
          <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Calculated Policy Refund</td><td style="padding:10px 16px;font-weight:600;color:#ef5350">${refundPct}% (₹${refundAmount})</td></tr>
          <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Customer Reason</td><td style="padding:10px 16px">${reason || 'No reason provided'}</td></tr>
        </table>
        <div style="background:rgba(239,83,80,.1);border:1px solid rgba(239,83,80,.3);border-radius:10px;padding:16px;margin:16px 0">
          <p style="margin:0;font-size:13px"><strong>Admin Action Required:</strong> As MyTurfy Admin, review and approve or reject this request. Note: The customer's slot remains reserved ('upcoming') until you approve or reject.</p>
        </div>
        <p><strong>— MyTurfy System Alert</strong></p>
      </div>
    </div>`;

  await sendEmail({
    to: MYTURFY_SUPPORT_EMAIL,
    subject: `[Admin Action] Refund Request (${refundPct}% - ₹${refundAmount}) for ${venueName}`,
    html: adminHtml,
  });

  // 2. Email to Customer
  if (booking.customer?.email) {
    const customerHtml = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8f5e9;border-radius:14px;overflow:hidden;border:1px solid rgba(255,152,0,.3)">
        <div style="background:#ff9800;padding:20px 28px">
          <h2 style="margin:0;font-size:22px;color:#04140a">⏳ Refund Request Under Admin Review</h2>
        </div>
        <div style="padding:24px 28px">
          <p>Hi <strong>${customerName}</strong>,</p>
          <p>Your refund request for your booking at <strong>${venueName}</strong> on ${booking.date} at ${booking.time} has been submitted to MyTurfy Admin support for review.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#111a14;border-radius:10px">
            <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Eligible Refund Policy Tier</td><td style="padding:10px 16px;font-weight:600;color:#ff9800">${refundPct}% (₹${refundAmount})</td></tr>
            <tr><td style="padding:10px 16px;color:#7aad82;font-size:13px">Slot Status</td><td style="padding:10px 16px;font-weight:600;color:#00c853">Reserved / Active</td></tr>
          </table>
          <p style="font-size:13px;color:#7aad82">Note: Your slot remains locked and reserved for you while MyTurfy Admin reviews your request. You will be notified by email once a decision is made.</p>
          <p><strong>— The MyTurfy Support Team</strong></p>
        </div>
      </div>`;

    await sendEmail({
      to: booking.customer.email,
      subject: `Refund Request Submitted — ${venueName}`,
      html: customerHtml,
    });
  }
}

async function sendRefundApprovedEmail(booking) {
  const pct = booking.refundPct || 100;
  const amount = booking.refundAmount || booking.amount;
  await sendEmail({
    to: booking.customer?.email,
    subject: `Refund Approved — ${pct}% (₹${amount}) returning to your account`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8f5e9;border-radius:14px;overflow:hidden;border:1px solid rgba(0,200,83,.2)">
        <div style="background:#00c853;padding:20px 28px">
          <h2 style="margin:0;font-size:22px;color:#04140a">✅ Refund Approved (${pct}%)!</h2>
        </div>
        <div style="padding:24px 28px">
          <p>Hi <strong>${booking.customer?.name}</strong>,</p>
          <p>Your refund of <strong style="color:#00c853">${pct}% (₹${amount})</strong> for your booking at <strong>${booking.venue?.name}</strong> has been approved.</p>
          <p>The amount will be credited back to your original payment method within <strong>5–7 business days</strong>.</p>
          <p style="font-size:12px;color:#7aad82">Booking reference: ${booking._id}</p>
          <p><strong>— The MyTurfy Team</strong></p>
        </div>
      </div>`,
  });
}

async function sendRefundRejectedEmail(booking, reason) {
  await sendEmail({
    to: booking.customer?.email,
    subject: `Refund Request Update — ${booking.venue?.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8f5e9;border-radius:14px;overflow:hidden;border:1px solid rgba(255,160,0,.3)">
        <div style="background:#ff9800;padding:20px 28px">
          <h2 style="margin:0;font-size:22px;color:#04140a">❌ Refund Request Declined</h2>
        </div>
        <div style="padding:24px 28px">
          <p>Hi <strong>${booking.customer?.name}</strong>,</p>
          <p>Your refund request for the booking at <strong>${booking.venue?.name}</strong> on ${booking.date} at ${booking.time} has been declined by MyTurfy Admin support.</p>
          ${reason ? `<p><strong>Reason given:</strong> ${reason}</p>` : ''}
          <div style="background:rgba(255,152,0,.1);border:1px solid rgba(255,152,0,.3);border-radius:10px;padding:16px;margin:16px 0">
            <p style="margin:0;font-size:13px">If you believe this decision is unfair, you can escalate to MyTurfy support by emailing <a href="mailto:${MYTURFY_SUPPORT_EMAIL}" style="color:#00c853">${MYTURFY_SUPPORT_EMAIL}</a> with your booking reference: <strong>${booking._id}</strong>.</p>
          </div>
          <p><strong>— The MyTurfy Team</strong></p>
        </div>
      </div>`,
  });
}

async function sendVerificationCode(email, name, code) {
  console.log(`\n🔑 [OTP] email: ${email} | code: ${code}\n`);
  await sendEmail({
    to: email,
    subject: `Verify your email — MyTurfy`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#0a0f0d;color:#e8f5e9;border-radius:12px;border:1px solid rgba(0,200,83,.2)">
        <h2 style="color:#00c853;font-size:24px">Verify your email 🔒</h2>
        <p>Hi ${name || 'User'},</p>
        <p>Your 6-digit verification code:</p>
        <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#00c853;background:#111a14;padding:16px;border-radius:10px;text-align:center;margin:20px 0;border:1px solid rgba(0,200,83,.2)">${code}</div>
        <p style="font-size:12px;color:#7aad82">Valid for 20 minutes. If you didn't request this, ignore this email.</p>
        <p><strong style="color:#00c853">— The MyTurfy Team</strong></p>
      </div>`,
  });
}

module.exports = {
  sendEmail,
  sendBookingConfirmationToCustomer,
  sendNewBookingAlertToOwner,
  sendRefundRequestEmail,
  sendRefundApprovedEmail,
  sendRefundRejectedEmail,
  sendVerificationCode,
  isEmailConfigured,
  didLastSendFail,
};