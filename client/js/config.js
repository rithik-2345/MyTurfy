/**
 * client/js/config.js
 * ─────────────────────────────────────────────────────────────────
 * Public, non-secret config values needed in the browser.
 * These are safe to expose in frontend code (that's how Google's own
 * docs say to use them) — unlike your .env file, this one IS meant
 * to ship to the browser, so never put real secrets in here.
 *
 * Load this file FIRST, before auth.js/api.js/script.js, on every page.
 * ─────────────────────────────────────────────────────────────────
 */

// From: console.cloud.google.com → APIs & Services → Credentials
//       → OAuth 2.0 Client IDs → (your Web application client)
window.GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

// From: console.cloud.google.com → APIs & Services → Credentials
//       → Create API Key → restrict it to "Maps JavaScript API"
// Leave as-is to skip the embedded map — venues.html shows a friendly
// "map view needs a Maps API key" message instead of crashing.
window.GOOGLE_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';

window.CONFIG_READY = {
  google: window.GOOGLE_CLIENT_ID && !window.GOOGLE_CLIENT_ID.startsWith('YOUR_'),
  maps:   window.GOOGLE_MAPS_API_KEY && !window.GOOGLE_MAPS_API_KEY.startsWith('YOUR_'),
};
