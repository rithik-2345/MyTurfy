/**
 * client/js/api.js
 * ─────────────────────────────────────────────────────────────────
 * Single place for every HTTP call to the backend.
 * Every other frontend file (script.js, venues.js, etc.) imports
 * these functions instead of calling fetch() directly or reading
 * data.js / localStorage.
 *
 * HOW IT WORKS:
 *   const venues = await API.venues.list({ sport:'Football' });
 *   const venue  = await API.venues.get(id);
 *   const token  = await API.auth.loginCustomer(email, pw);
 *
 * On error the functions throw a plain Error with the server's
 * human-readable message, so callers can just do:
 *   try { ... } catch(e) { toast(e.message, true); }
 * ─────────────────────────────────────────────────────────────────
 */

const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.startsWith('192.168.');
const API_BASE = (window.location.protocol === 'file:' || (isLocalHost && window.location.port !== '5000'))
  ? `http://${window.location.hostname || 'localhost'}:5000/api`
  : '/api';

/* ─────────────────────────────────────
   CORE FETCH WRAPPER
───────────────────────────────────── */
async function request(method, path, body = null, requiresAuth = false) {
  const headers = { 'Content-Type': 'application/json' };

  if (requiresAuth) {
    const token = Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, options);
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('Network error — please check your internet connection and try again.');
    }
    throw err;
  }
  const data = await res.json().catch(() => ({ success: false, message: res.statusText }));

  if (!data.success) {
    // Token expired → clear it so the user is asked to log in again
    if (res.status === 401) Auth.clearToken();
    const err = new Error(data.message || 'Something went wrong');
    if (data.notFound) err.notFound = true;
    throw err;
  }
  return data;
}

/* ─────────────────────────────────────
   AUTH — customers + owners
───────────────────────────────────── */
const authAPI = {
  sendOtp: (email, action, name = '', role = 'user', phone = undefined) =>
    request('POST', '/auth/send-otp', { email, phone, action, name, role }),

  registerCustomer: (name, email, password, phone, code) =>
    request('POST', '/auth/register', { name, email, password, phone, code }),

  loginCustomer: (email, password, code, phone = undefined) =>
    request('POST', '/auth/login', { email, phone, password, code }),

  googleLoginCustomer: (credential) =>
    request('POST', '/auth/google', { credential }),

  registerOwner: (name, email, password, phone, city, code, agreedToTerms) =>
    request('POST', '/auth/owner/register', { name, email, password, phone, city, code, agreedToTerms }),

  loginOwner: (email, password, code) =>
    request('POST', '/auth/owner/login', { email, password, code }),

  googleLoginOwner: (credential, agreedToTerms) =>
    request('POST', '/auth/owner/google', { credential, agreedToTerms }),

  forgotPassword: (email, role) =>
    request('POST', '/auth/forgot-password', { email, role }),

  resetPassword: (email, role, code, password) =>
    request('POST', '/auth/reset-password', { email, role, code, password }),

  me: () => request('GET', '/auth/me', null, true),

  updateProfile: (profileData) => request('PUT', '/auth/profile', profileData, true),

  updatePayout: (payoutData) => request('PUT', '/auth/payout', payoutData, true),

  logout: () => request('POST', '/auth/logout', null, true),

  getWishlist: () => request('GET', '/auth/wishlist', null, true),

  toggleWishlist: (venueId) => request('POST', `/auth/wishlist/toggle/${venueId}`, null, true),
};

/* ─────────────────────────────────────
   VENUES
───────────────────────────────────── */
const venuesAPI = {
  /**
   * List venues — all filters, sort, search, pagination as query params.
   * @param {Object} opts  e.g. { sport:'Football', q:'surat', sort:'price-low', page:1 }
   */
  list: (opts = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined && v !== ''))
    ).toString();
    return request('GET', `/venues${qs ? '?' + qs : ''}`);
  },

  get: (id) => request('GET', `/venues/${id}`),

  publicStats: () => request('GET', '/venues/public-stats'),

  mine: () => request('GET', '/venues/owner/mine', null, true),

  create: (venueData) => request('POST', '/venues', venueData, true),

  update: (id, venueData) => request('PUT', `/venues/${id}`, venueData, true),

  delete: (id) => request('DELETE', `/venues/${id}`, null, true),

  /** Owner-only: set which hours are blocked on a specific date */
  blockSlots: (id, date, hours) => request('PATCH', `/venues/${id}/block-slots`, { date, hours }, true),

  /** Upload a single photo — returns { url } with the Cloudinary URL */
  uploadImage: async (file) => {
    const token = Auth.getToken();
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`${API_BASE}/venues/upload-image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json().catch(() => ({ success: false }));
    if (!data.success) throw new Error(data.message || 'Image upload failed');
    return data;
  },
};

/* ─────────────────────────────────────
   BOOKINGS
───────────────────────────────────── */
const bookingsAPI = {
  mine: () => request('GET', '/bookings/mine', null, true),

  ownerList: (venueId = 'all', status = 'all') =>
    request('GET', `/bookings/owner?venueId=${venueId}&status=${status}`, null, true),

  cancel: (id) => request('PATCH', `/bookings/${id}/cancel`, null, true),

  releaseHold: (id) => request('DELETE', `/bookings/${id}/release-hold`, null, true),

  requestRefund: (id, reason) =>
    request('POST', `/bookings/${id}/request-refund`, { reason }, true),

  refundPreview: (id) =>
    request('GET', `/bookings/${id}/refund-preview`, null, true),

  approveRefund: (id) =>
    request('POST', `/bookings/${id}/approve-refund`, null, true),

  rejectRefund: (id, reason) =>
    request('POST', `/bookings/${id}/reject-refund`, { reason }, true),

  createOffline: (venueId, date, time, durationHours, customerName, customerPhone) =>
    request('POST', '/bookings/offline', { venueId, date, time, durationHours, customerName, customerPhone }, true),

  /** Public — returns array of booked hour integers (0-23) for a venue on a date */
  getBookedSlots: (venueId, date, courtNumber = null) =>
    request('GET', `/bookings/slots?venueId=${venueId}&date=${date}${courtNumber ? '&courtNumber=' + courtNumber : ''}`),

  holdSlot: (venueId, date, time, durationHours = 1, courtNumber = 1) =>
    request('POST', '/bookings/hold-slot', { venueId, date, time, durationHours, courtNumber }, true),

  getLiveTicket: () => request('GET', '/bookings/live-ticket', null, true),

  validateQr: (qrCodeData) =>
    request('POST', '/bookings/validate-qr', { qrCodeData }, true),

  sendVerificationOtp: (email) =>
    request('POST', '/bookings/send-verification-otp', { email }, true),

  verifyOtp: (email, otp) =>
    request('POST', '/bookings/verify-otp', { email, otp }, true),
};

/* ─────────────────────────────────────
   PAYMENTS (Razorpay)
───────────────────────────────────── */
const paymentsAPI = {
  createOrder: (venueId, date, time, durationHours = 1, courtNumber = 1, bookingId = null, tCoinsToUse = 0) =>
    request('POST', '/payments/create-order', { venueId, date, time, durationHours, courtNumber, bookingId, tCoinsToUse }, true),

  verify: (payload) =>
    request('POST', '/payments/verify', payload, true),

  createSplitOrder: (venueId, date, time, durationHours = 1, courtNumber = 1, targetPlayers = 2, payerName = '', payerPhone = '', tCoinsToUse = 0) =>
    request('POST', '/payments/create-split-order', { venueId, date, time, durationHours, courtNumber, targetPlayers, payerName, payerPhone, tCoinsToUse }, true),

  getSplitDetails: (splitCode) =>
    request('GET', `/payments/split-details/${splitCode}`),

  createSplitShareOrder: (splitCode, customAmount = null, tCoinsToUse = 0) =>
    request('POST', '/payments/create-split-share-order', { splitCode, customAmount, tCoinsToUse }),

  paySplitShare: (payload) =>
    request('POST', '/payments/pay-split-share', payload),

  cancelSplit: (splitCode) =>
    request('POST', '/payments/cancel-split', { splitCode }, true),
};

/* ─────────────────────────────────────
   REVIEWS
───────────────────────────────────── */
const reviewsAPI = {
  forVenue: (venueId) => request('GET', `/reviews/venue/${venueId}`),

  create: (venueId, rating, text, bookingId) =>
    request('POST', '/reviews', { venueId, rating, text, bookingId }, true),

  update: (reviewId, rating, text) =>
    request('PUT', `/reviews/${reviewId}`, { rating, text }, true),

  delete: (reviewId) =>
    request('DELETE', `/reviews/${reviewId}`, null, true),

  ownerList: () => request('GET', '/reviews/owner', null, true),

  reply: (reviewId, reply) =>
    request('PATCH', `/reviews/${reviewId}/reply`, { reply }, true),
};

/* ─────────────────────────────────────
   T-COINS LOYALTY
───────────────────────────────────── */
const tcoinsAPI = {
  balance: () => request('GET', '/tcoins/balance', null, true),
  calculate: (bookingAmount, isGroup = false, splitCode = null, totalBookingAmount = null) =>
    request('POST', '/tcoins/calculate', { bookingAmount, isGroup, splitCode, totalBookingAmount }, true),
};

/* ─────────────────────────────────────
   EXPORT as a single global object
   (no ES module bundler needed — just a plain script tag)
───────────────────────────────────── */
window.API = {
  auth: authAPI,
  venues: venuesAPI,
  bookings: bookingsAPI,
  payments: paymentsAPI,
  reviews: reviewsAPI,
  tcoins: tcoinsAPI,
};
