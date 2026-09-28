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

/* ── INSTANT THEME BOOTSTRAP (Prevents flash of wrong theme) ── */
(function() {
  try {
    const savedTheme = localStorage.getItem('turfy_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  } catch (_) {}
})();

/* ── GLOBAL THEME MANAGER ── */
window.ThemeManager = {
  getTheme() {
    try {
      return localStorage.getItem('turfy_theme') || 'dark';
    } catch (_) {
      return 'dark';
    }
  },
  setTheme(theme) {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    try {
      localStorage.setItem('turfy_theme', nextTheme);
    } catch (_) {}
    this.updateUI(nextTheme);
  },
  toggle() {
    const current = this.getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  },
  updateUI(theme) {
    const isLight = theme === 'light';
    document.querySelectorAll('#themeToggleBtn, .btn-theme-toggle').forEach(btn => {
      btn.innerHTML = isLight ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
      btn.setAttribute('title', isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode');
      btn.setAttribute('aria-label', isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode');
    });
    document.querySelectorAll('#menuThemeToggle, [data-action="toggle-theme"]').forEach(item => {
      const textSpan = item.querySelector('span');
      const icon = item.querySelector('i');
      if (textSpan) textSpan.textContent = isLight ? 'Dark Mode' : 'Light Mode';
      if (icon) icon.className = isLight ? 'fas fa-moon' : 'fas fa-sun';
    });
  },
  init() {
    const theme = this.getTheme();
    document.documentElement.setAttribute('data-theme', theme);

    // If navbar exists but no theme button, auto-inject into .nav-actions
    const navActions = document.querySelector('.nav-actions');
    if (navActions && !document.querySelector('#themeToggleBtn, .btn-theme-toggle')) {
      const btn = document.createElement('button');
      btn.className = 'btn-theme-toggle';
      btn.id = 'themeToggleBtn';
      btn.setAttribute('aria-label', 'Toggle Light / Dark Theme');
      btn.setAttribute('title', theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode');
      btn.innerHTML = theme === 'light' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
      btn.style.cssText = 'order: 2;';
      const ref = navActions.querySelector('#signinBtn, #tcoinBtn, .btn-signin') || navActions.firstChild;
      navActions.insertBefore(btn, ref);
    }

    this.updateUI(theme);
  }
};

// Global click event delegation for theme toggling (handles all static & dynamically created elements)
document.addEventListener('click', (e) => {
  const toggleEl = e.target.closest('#themeToggleBtn, .btn-theme-toggle, #menuThemeToggle, [data-action="toggle-theme"]');
  if (toggleEl) {
    e.preventDefault();
    e.stopPropagation();
    window.ThemeManager.toggle();
  }
});

// Storage event listener to sync across tabs
window.addEventListener('storage', (e) => {
  if (e.key === 'turfy_theme' && e.newValue) {
    document.documentElement.setAttribute('data-theme', e.newValue);
    if (window.ThemeManager) {
      window.ThemeManager.updateUI(e.newValue);
    }
  }
});

// Initialize theme UI as soon as DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.ThemeManager.init());
} else {
  window.ThemeManager.init();
}
