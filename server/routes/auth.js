/**
 * routes/auth.js — updated: owner registration now requires agreedToTerms
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const router = express.Router();

const config = require('../config/config');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Owner = require('../models/Owner');
const Otp = require('../models/Otp');
const { sendVerificationCode, isEmailConfigured, didLastSendFail } = require('../utils/sendEmail');

const googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

async function verifyGoogleToken(credential) {
  if (!googleClient) {
    const err = new Error('Google Sign-In is not configured — add GOOGLE_CLIENT_ID to .env');
    err.statusCode = 503;
    throw err;
  }
  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.googleClientId });
  const payload = ticket.getPayload();
  return { googleId: payload.sub, email: payload.email, name: payload.name, picture: payload.picture };
}

function generateToken(id, role) {
  return jwt.sign({ id, role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function sendAuthResponse(res, statusCode, account, role) {
  const token = generateToken(account._id, role);
  res.cookie('token', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.status(statusCode).json({
    success: true,
    token,
    data: { ...account.toSafeObject(), role },
  });
}

/* ══════════════ OTP ══════════════ */
router.post('/send-otp', async (req, res, next) => {
  try {
    const { email, action, name, role } = req.body;
    if (!email || !action || !role) {
      return res.status(400).json({ success: false, message: 'Email, action and role are required' });
    }
    const Model = role === 'owner' ? Owner : User;
    const existing = await Model.findOne({ email: email.toLowerCase() });
    if (action === 'signup' && existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }
    if (action === 'login' && !existing) {
      return res.status(404).json({ success: false, message: 'No account found with this email' });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await Otp.deleteMany({ email: email.toLowerCase(), action });
    await Otp.create({ email: email.toLowerCase(), code, action });
    await sendVerificationCode(email.toLowerCase(), name || existing?.name, code);
    const emailOk = isEmailConfigured() && !didLastSendFail();
    res.json({
      success: true,
      message: emailOk ? 'Verification code sent' : 'Dev mode — check server console for code',
      devCode: emailOk ? undefined : code,
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════ CUSTOMER ══════════════ */
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, phone, code } = req.body;
    if (!name || !email || !password || !code) {
      return res.status(400).json({ success: false, message: 'Name, email, password and verification code are required' });
    }
    const otp = await Otp.findOne({ email: email.toLowerCase(), code, action: 'signup' });
    if (!otp) return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    await Otp.deleteMany({ email: email.toLowerCase(), action: 'signup' });
    const user = await User.create({ name, email, password, phone });
    sendAuthResponse(res, 201, user, 'user');
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Incorrect email or password' });
    }
    sendAuthResponse(res, 200, user, 'user');
  } catch (err) {
    next(err);
  }
});

router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ success: false, message: 'Missing Google credential' });
    const profile = await verifyGoogleToken(credential);
    let user = await User.findOne({ $or: [{ googleId: profile.googleId }, { email: profile.email.toLowerCase() }] });
    if (user) {
      if (!user.googleId) { user.googleId = profile.googleId; user.picture = user.picture || profile.picture; await user.save(); }
    } else {
      user = await User.create({ name: profile.name, email: profile.email, googleId: profile.googleId, picture: profile.picture });
    }
    sendAuthResponse(res, 200, user, 'user');
  } catch (err) {
    next(err);
  }
});

/* ══════════════ OWNER ══════════════ */
router.post('/owner/register', async (req, res, next) => {
  try {
    const { name, email, password, phone, city, code, agreedToTerms } = req.body;

    // ── TERMS CHECKBOX — must be checked ──────────────────────
    if (!agreedToTerms) {
      return res.status(400).json({
        success: false,
        message: 'You must agree to the Terms & Conditions and Privacy Policy to create a partner account',
      });
    }
    if (!name || !email || !password || !code) {
      return res.status(400).json({ success: false, message: 'Name, email, password and verification code are required' });
    }
    const otp = await Otp.findOne({ email: email.toLowerCase(), code, action: 'signup' });
    if (!otp) return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    const existing = await Owner.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    await Otp.deleteMany({ email: email.toLowerCase(), action: 'signup' });
    const owner = await Owner.create({ name, email, password, phone, city, agreedToTerms: true });
    sendAuthResponse(res, 201, owner, 'owner');
  } catch (err) {
    next(err);
  }
});

router.post('/owner/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });
    const owner = await Owner.findOne({ email: email.toLowerCase() }).select('+password');
    if (!owner || !(await owner.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Incorrect email or password' });
    }
    sendAuthResponse(res, 200, owner, 'owner');
  } catch (err) {
    next(err);
  }
});

router.post('/owner/google', async (req, res, next) => {
  try {
    const { credential, agreedToTerms } = req.body;
    if (!credential) return res.status(400).json({ success: false, message: 'Missing Google credential' });
    const profile = await verifyGoogleToken(credential);
    let owner = await Owner.findOne({ $or: [{ googleId: profile.googleId }, { email: profile.email.toLowerCase() }] });
    if (owner) {
      if (!owner.googleId) { owner.googleId = profile.googleId; owner.picture = profile.picture; await owner.save(); }
    } else {
      if (!agreedToTerms) {
        return res.status(400).json({
          success: false,
          message: 'You must agree to the Terms & Conditions and Privacy Policy to create a partner account',
        });
      }
      owner = await Owner.create({
        name: profile.name, email: profile.email,
        googleId: profile.googleId, picture: profile.picture,
        agreedToTerms: true,
      });
    }
    sendAuthResponse(res, 200, owner, 'owner');
  } catch (err) {
    next(err);
  }
});

/* ══════════════ SHARED ══════════════ */
router.get('/me', protect, async (req, res, next) => {
  try {
    const Model = req.auth.role === 'owner' ? Owner : User;
    const account = await Model.findById(req.auth.id);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
    res.json({ success: true, data: { ...account.toSafeObject(), role: req.auth.role } });
  } catch (err) {
    next(err);
  }
});

router.put('/profile', protect, async (req, res, next) => {
  try {
    const { name, phone, city } = req.body;
    const Model = req.auth.role === 'owner' ? Owner : User;
    const account = await Model.findById(req.auth.id);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    if (name) account.name = name.trim();
    if (phone !== undefined) account.phone = phone.trim();
    if (city !== undefined && req.auth.role === 'owner') account.city = city.trim();

    await account.save();
    res.json({ success: true, data: { ...account.toSafeObject(), role: req.auth.role }, message: 'Profile updated successfully' });
  } catch (err) {
    next(err);
  }
});

router.put('/payout', protect, async (req, res, next) => {
  try {
    if (req.auth.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only owners can update payout details' });
    }
    const { bankAccountHolder, accountNumber, ifsc, upi } = req.body;
    const owner = await Owner.findById(req.auth.id);
    if (!owner) return res.status(404).json({ success: false, message: 'Owner account not found' });

    if (!owner.payout) owner.payout = {};
    if (bankAccountHolder !== undefined) owner.payout.bankAccountHolder = bankAccountHolder.trim();
    if (accountNumber !== undefined) owner.payout.accountNumber = accountNumber.trim();
    if (ifsc !== undefined) owner.payout.ifsc = ifsc.trim().toUpperCase();
    if (upi !== undefined) owner.payout.upi = upi.trim();

    await owner.save();
    res.json({ success: true, data: { ...owner.toSafeObject(), role: 'owner' }, message: 'Payout details saved successfully' });
  } catch (err) {
    next(err);
  }
});

router.get('/wishlist', protect, async (req, res, next) => {
  try {
    if (req.auth.role !== 'user') return res.status(403).json({ success: false, message: 'Only customers have wishlists' });
    const user = await User.findById(req.auth.id).populate('wishlist');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user.wishlist });
  } catch (err) {
    next(err);
  }
});

router.post('/wishlist/toggle/:venueId', protect, async (req, res, next) => {
  try {
    if (req.auth.role !== 'user') return res.status(403).json({ success: false, message: 'Only customers have wishlists' });
    const user = await User.findById(req.auth.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const venueId = req.params.venueId;
    const index = user.wishlist.indexOf(venueId);
    let wishlisted = false;
    if (index === -1) { user.wishlist.push(venueId); wishlisted = true; }
    else { user.wishlist.splice(index, 1); }
    await user.save();
    res.json({ success: true, wishlisted, message: wishlisted ? 'Added to wishlist' : 'Removed from wishlist' });
  } catch (err) {
    next(err);
  }
});

/* ══════════════ PASSWORD RESET ══════════════ */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ success: false, message: 'Email and role are required' });
    }
    const Model = role === 'owner' ? Owner : User;
    const account = await Model.findOne({ email: email.toLowerCase() });
    if (!account) {
      return res.status(404).json({ success: false, message: 'No account found with this email' });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await Otp.deleteMany({ email: email.toLowerCase(), action: 'forgot-password' });
    await Otp.create({ email: email.toLowerCase(), code, action: 'forgot-password' });
    await sendVerificationCode(email.toLowerCase(), account.name, code);
    const emailOk = isEmailConfigured() && !didLastSendFail();
    res.json({
      success: true,
      message: emailOk ? 'Reset code sent to email' : 'Dev mode — check server console for code',
      devCode: emailOk ? undefined : code,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, role, code, password } = req.body;
    if (!email || !role || !code || !password) {
      return res.status(400).json({ success: false, message: 'Email, role, verification code, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const otp = await Otp.findOne({ email: email.toLowerCase(), code, action: 'forgot-password' });
    if (!otp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }
    const Model = role === 'owner' ? Owner : User;
    const account = await Model.findOne({ email: email.toLowerCase() });
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }
    await Otp.deleteMany({ email: email.toLowerCase(), action: 'forgot-password' });
    account.password = password;
    await account.save();
    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out' });
});

module.exports = router;