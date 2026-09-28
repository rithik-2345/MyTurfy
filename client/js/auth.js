/**
 * client/js/auth.js
 * ─────────────────────────────────────────────────────────────────
 * Manages the logged-in session on the BROWSER side.
 * Think of this as the front-of-house that api.js's security
 * middleware talks to — api.js checks wristbands, auth.js hands
 * them out (and takes them back on logout).
 *
 * Exposes a global `Auth` object used by every page:
 *   Auth.isLoggedIn()      → true/false
 *   Auth.getToken()        → JWT string (or null)
 *   Auth.getUser()         → { name, email, role, ... } (or null)
 *   Auth.saveSession(token, user)  → call after a successful login
 *   Auth.clearToken()      → call on logout or 401
 *   Auth.requireAuth()     → redirects to index.html if not logged in
 *
 * Load this file BEFORE api.js on every HTML page.
 * ─────────────────────────────────────────────────────────────────
 */

const Auth = (() => {
  const TOKEN_KEY = 'mtp_token';
  const USER_KEY  = 'mtp_user';

  function getToken()  {
    try { return localStorage.getItem(TOKEN_KEY); }
    catch (e) { return null; }
  }
  function getUser()   {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); }
    catch (e) { return null; }
  }
  function isLoggedIn() {
    try { return !!getToken() && !!getUser(); }
    catch (e) { return false; }
  }

  function saveSession(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.warn('LocalStorage clear failed:', e);
    }
  }

  /** Redirects to the homepage if the current user isn't logged in */
  function requireAuth(redirectTo = 'index.html') {
    if (!isLoggedIn()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  }

  /** Redirects to the homepage if the current user isn't an owner */
  function requireOwner(redirectTo = 'index.html') {
    const user = getUser();
    if (!isLoggedIn() || user?.role !== 'owner') {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  }

  /**
   * Call this on every page — updates the navbar Sign In button to
   * show the user's name (and a Sign Out option) when they're logged in.
   * Works on all 4 pages without any per-page changes.
   */
  function syncNavbar() {
    const signinBtn  = document.getElementById('signinBtn');
    const bottomAccount = document.getElementById('bottomAccount');
    const ownerName  = document.getElementById('ownerNameTop'); // owner portal topbar
    const ownerAvatar = document.getElementById('ownerAvatar');

    const user = getUser();

    // Universal T-Coin button click handler across all pages -> open wallet.html
    const tcoinBtn = document.getElementById('tcoinBtn');
    if (tcoinBtn) {
      tcoinBtn.style.cursor = 'pointer';
      tcoinBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = 'wallet.html';
      };
      if (isLoggedIn() && user) {
        const span = tcoinBtn.querySelector('span');
        if (span && user.tCoins !== undefined) {
          span.textContent = `${Number(user.tCoins).toLocaleString('en-IN')} T-Coins`;
        }
      }
    }

    if (signinBtn) {
      if (isLoggedIn() && user) {
        const displayName = user.name || 'User';
        signinBtn.innerHTML = `<i class="fas fa-user-check"></i> <span class="signin-label">${displayName.split(' ')[0]}</span>`;
        signinBtn.removeEventListener('click', openSigninModal);
        
        // Clone and replace to strip any sign-in trigger listeners
        const newBtn = signinBtn.cloneNode(true);
        signinBtn.parentNode.replaceChild(newBtn, signinBtn);
        newBtn.addEventListener('click', handleNavbarUserClick);
      }
    }

    if (bottomAccount && isLoggedIn() && user) {
      const span = bottomAccount.querySelector('span');
      if (span) span.textContent = 'Account';
      const newBottom = bottomAccount.cloneNode(true);
      bottomAccount.parentNode.replaceChild(newBottom, bottomAccount);
      newBottom.addEventListener('click', handleNavbarUserClick);
    }

    if (ownerName) ownerName.textContent = user?.name || 'Partner';
    if (ownerAvatar) ownerAvatar.textContent = user?.name?.[0]?.toUpperCase() || 'P';

    // Update any "Partner With Us" links dynamically if logged in as owner
    const partnerLinks = document.querySelectorAll('a[href="owner-portal.html"], a[data-role="partner"]');
    partnerLinks.forEach(link => {
      if (isLoggedIn() && user && user.role === 'owner') {
        link.innerHTML = `<i class="fas fa-warehouse"></i> Partner Dashboard`;
        link.href = 'owner-portal.html';
      } else {
        link.innerHTML = `<i class="fas fa-handshake"></i> Partner With Us`;
        link.href = 'owner-portal.html';
      }
    });

    // Populate hamburger profile dropdown with account options dynamically
    const profileMenu = document.getElementById('profileMenu');
    if (profileMenu && isLoggedIn() && user) {
      if (user.role === 'owner') {
        profileMenu.innerHTML = `
          <div class="dropdown-header">Partner Account</div>
          <a href="owner-portal.html"><i class="fas fa-gauge-high"></i> Dashboard</a>
          <a href="support.html"><i class="fas fa-headset"></i> Support</a>
          <a href="#" id="menuThemeToggle"><i class="fas fa-sun"></i> <span>Light Mode</span></a>
          <a href="#" id="menuLogoutBtn"><i class="fas fa-right-from-bracket"></i> Log Out</a>
        `;
      } else {
        profileMenu.innerHTML = `
          <div class="dropdown-header">My Account</div>
          <a href="wallet.html"><i class="fas fa-wallet" style="color:var(--green)"></i> T-Coins Wallet</a>
          <a href="my-bookings.html"><i class="fas fa-calendar-alt"></i> My Bookings</a>
          <a href="wishlist.html"><i class="fas fa-heart"></i> My Wishlist</a>
          <a href="about.html"><i class="fas fa-info-circle"></i> About Us</a>
          <a href="support.html"><i class="fas fa-headset"></i> Support</a>
          <a href="#" id="menuThemeToggle"><i class="fas fa-sun"></i> <span>Light Mode</span></a>
          <a href="#" id="menuLogoutBtn"><i class="fas fa-right-from-bracket"></i> Log Out</a>
        `;
      }
      if (window.ThemeManager) {
        window.ThemeManager.updateUI(window.ThemeManager.getTheme());
        document.getElementById('menuThemeToggle')?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.ThemeManager.toggle();
        });
      }
      document.getElementById('menuLogoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    }
  }

  function handleNavbarUserClick(e) {
    if (e) e.stopPropagation();
    const profileMenu = document.getElementById('profileMenu');
    if (profileMenu) {
      const open = profileMenu.classList.contains('open');
      document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
      if (!open) profileMenu.classList.add('open');
    } else {
      const user = getUser();
      if (user?.role === 'owner') {
        window.location.href = 'owner-portal.html';
      } else {
        window.location.href = 'my-bookings.html';
      }
    }
  }

  async function logout() {
    try { await API.auth.logout(); } catch (e) { /* ignore */ }
    clearToken();
    window.location.href = 'index.html';
  }

  // Placeholder so syncNavbar can removeEventListener on it (same reference needed)
  function openSigninModal() {
    document.getElementById('signinModal')?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  /**
   * Renders a "Sign in with Google" button into the given element and
   * wires it end-to-end: Google → our backend → saved session.
   * Each page passes its own onSuccess/onError so it can show its own
   * toast/UI, since toast() is defined locally per page.
   *
   *   Auth.initGoogleSignIn('googleBtnCustomer', {
   *     onSuccess: (user) => { closeSignin(); toast(`Welcome, ${user.name}!`); },
   *     onError: (err) => toast(err.message, true),
   *   });
   */
  function initGoogleSignIn(buttonElementId, { onSuccess, onError, isOwner = false } = {}) {
    const el = document.getElementById(buttonElementId);
    if (!el) return;

    if (typeof google === 'undefined' || !window.CONFIG_READY?.google) {
      el.innerHTML = '<p style="font-size:11px;color:var(--muted);text-align:center;padding:8px 0">Google Sign-In isn\'t configured yet</p>';
      return;
    }

    google.accounts.id.initialize({
      client_id: window.GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const apiCall = isOwner ? API.auth.googleLoginOwner : API.auth.googleLoginCustomer;
          const agreed = isOwner ? !!document.getElementById('suPrivacy')?.checked : undefined;
          const res = isOwner
            ? await apiCall(response.credential, agreed)
            : await apiCall(response.credential);
          saveSession(res.token, res.data);
          onSuccess?.(res.data);
        } catch (err) {
          onError?.(err);
        }
      },
    });
    google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', width: 280, text: 'continue_with' });
  }

  let activeToast = null;
  function localToast(msg, isError) {
    if (activeToast) activeToast(msg, isError);
    else console.log((isError ? '❌ ' : '🎉 ') + msg);
  }

  function initAuthModal(toastFn) {
    activeToast = toastFn;
    const signinModal = document.getElementById('signinModal');
    if (!signinModal) return;

    const modalClose = signinModal.querySelector('.modal-close');
    
    function closeSignin() {
      signinModal.classList.remove('active');
      document.body.style.overflow = '';
    }

    modalClose?.addEventListener('click', closeSignin);
    signinModal.addEventListener('click', e => { if (e.target === signinModal) closeSignin(); });

    // Expose openSignin so other files can call it
    Auth.openSignin = () => {
      if (Auth.isLoggedIn()) {
        localToast(`👋 Already signed in as ${Auth.getUser().name}`);
        return;
      }
      signinModal.classList.add('active');
      document.body.style.overflow = 'hidden';
      showLoginForm();
    };

    // Wire buttons
    const signinBtns = document.querySelectorAll('#signinBtn, #bottomAccount');
    signinBtns.forEach(btn => {
      btn.removeEventListener('click', Auth.openSignin);
      btn.addEventListener('click', Auth.openSignin);
    });

    /* ── OTP SQUARE BOX HELPERS ── */
    function createOtpBoxesHTML(wrapperId) {
      return `
        <div style="margin-top:10px">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;font-weight:700;display:block;text-align:center;margin-bottom:4px">Verification Code (OTP)</label>
          <div class="otp-boxes-wrapper" id="${wrapperId}">
            <input type="text" maxlength="1" class="otp-box" data-idx="0" inputmode="numeric" autocomplete="one-time-code"/>
            <input type="text" maxlength="1" class="otp-box" data-idx="1" inputmode="numeric"/>
            <input type="text" maxlength="1" class="otp-box" data-idx="2" inputmode="numeric"/>
            <input type="text" maxlength="1" class="otp-box" data-idx="3" inputmode="numeric"/>
            <input type="text" maxlength="1" class="otp-box" data-idx="4" inputmode="numeric"/>
            <input type="text" maxlength="1" class="otp-box" data-idx="5" inputmode="numeric"/>
          </div>
        </div>
      `;
    }

    function initOtpBoxes(wrapperId) {
      const container = document.getElementById(wrapperId);
      if (!container) return;
      const inputs = container.querySelectorAll('.otp-box');
      inputs.forEach((input, i) => {
        input.oninput = () => {
          const val = input.value;
          if (val.length > 1) {
            const digits = val.replace(/\D/g, '').split('');
            digits.forEach((d, idx) => { if (inputs[i + idx]) inputs[i + idx].value = d; });
            inputs[Math.min(i + digits.length, inputs.length - 1)]?.focus();
            return;
          }
          if (val && i < inputs.length - 1) inputs[i + 1].focus();
        };
        input.onkeydown = (e) => { if (e.key === 'Backspace' && !input.value && i > 0) inputs[i - 1].focus(); };
        input.onpaste = (e) => {
          e.preventDefault();
          const digits = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6).split('');
          digits.forEach((d, idx) => { if (inputs[idx]) inputs[idx].value = d; });
          if (digits.length > 0) inputs[Math.min(digits.length, inputs.length - 1)]?.focus();
        };
      });
    }

    function getOtpBoxesValue(wrapperId) {
      const container = document.getElementById(wrapperId);
      if (!container) return '';
      return Array.from(container.querySelectorAll('.otp-box')).map(inp => inp.value.trim()).join('');
    }

    function setOtpBoxesValue(wrapperId, code) {
      const container = document.getElementById(wrapperId);
      if (!container) return;
      const inputs = container.querySelectorAll('.otp-box');
      String(code).slice(0, 6).split('').forEach((d, i) => { if (inputs[i]) inputs[i].value = d; });
    }

    /* ── RESEND OTP TIMER HELPER ── */
    function createResendTimer(containerId, resendFn) {
      const el = document.getElementById(containerId);
      if (!el) return;
      let seconds = 60;
      el.innerHTML = `<span style="color:var(--muted);font-size:12px">Resend code in <strong id="${containerId}Count">60</strong>s</span>`;
      const counter = document.getElementById(`${containerId}Count`);
      const timer = setInterval(() => {
        seconds--;
        if (counter) counter.textContent = seconds;
        if (seconds <= 0) {
          clearInterval(timer);
          el.innerHTML = `<a href="#" id="${containerId}Link" style="color:var(--green);font-size:12px;font-weight:700;text-decoration:none"><i class="fas fa-redo"></i> Resend Verification Code</a>`;
          document.getElementById(`${containerId}Link`)?.addEventListener('click', (e) => {
            e.preventDefault();
            resendFn();
          });
        }
      }, 1000);
    }

    /* ══════════════════════════════
       SHOW LOGIN FORM
    ══════════════════════════════ */
    function showLoginForm(prefill = '') {
      const headerTitle = signinModal.querySelector('h2');
      const headerSub = signinModal.querySelector('.modal-header p');
      if (headerTitle) headerTitle.textContent = 'Welcome Back';
      if (headerSub) headerSub.textContent = 'Sign in to complete your booking';

      const body = signinModal.querySelector('.modal-body');
      if (!body) return;

      body.innerHTML = `
        <div id="loginFormState">
          <div class="input-group">
            <i class="fas fa-user-circle"></i>
            <input type="text" id="loginEmail" placeholder="Gmail address (e.g. user@gmail.com)" value="${prefill}" autocomplete="username"/>
          </div>
          <div class="input-group">
            <i class="fas fa-lock"></i>
            <input type="password" id="loginPw" placeholder="Password" autocomplete="current-password"/>
            <button class="toggle-pw" id="togglePw" type="button"><i class="fas fa-eye"></i></button>
          </div>
          <div id="loginOtpGroup" style="display:none; margin-top: 10px;">
            ${createOtpBoxesHTML('loginOtpBoxes')}
            <p style="font-size:11px;color:var(--green);margin:6px 0 0;text-align:center"><i class="fas fa-info-circle"></i> Verification code sent. Check your Gmail (Spam folder).</p>
            <div id="loginResendTimer" style="text-align:center;margin-top:8px"></div>
          </div>
          <a href="#" class="forgot-link">Forgot password?</a>
          <button class="btn-modal-signin" id="loginSubmit">Sign In <i class="fas fa-arrow-right"></i></button>
          <div class="modal-divider"><span>or continue with</span></div>
          <div id="googleSignInBtn" class="google-btn-wrap"></div>
          <p class="modal-footer-text">Don't have an account? <a href="#" id="goToRegister">Register Free</a></p>
        </div>
      `;

      initOtpBoxes('loginOtpBoxes');

      const togglePw = body.querySelector('#togglePw');
      const pwInput = body.querySelector('#loginPw');
      togglePw?.addEventListener('click', () => {
        const show = pwInput.type === 'password';
        pwInput.type = show ? 'text' : 'password';
        togglePw.innerHTML = show ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
      });

      body.querySelector('#goToRegister')?.addEventListener('click', e => { e.preventDefault(); showRegisterForm(body.querySelector('#loginEmail')?.value?.trim() || ''); });
      body.querySelector('.forgot-link')?.addEventListener('click', e => { e.preventDefault(); showForgotForm(); });

      let otpSent = false;
      let loginEmail;
      const submitBtn = body.querySelector('#loginSubmit');
      submitBtn?.addEventListener('click', async () => {
        const identifier = body.querySelector('#loginEmail').value.trim();
        const password = pwInput.value;
        if (!identifier || !password) { localToast('❌ Enter your Gmail and password', true); return; }

        loginEmail = identifier;

        if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(loginEmail)) {
          localToast('❌ Please enter a valid Gmail address (@gmail.com)', true); return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Processing… <i class="fas fa-spinner fa-spin"></i>';

        try {
          if (!otpSent) {
            const res = await API.auth.loginCustomer(loginEmail, password);
            if (res.needsOtp) {
              otpSent = true;
              body.querySelector('#loginOtpGroup').style.display = 'block';
              body.querySelector('#loginEmail').disabled = true;
              body.querySelector('#loginPw').disabled = true;
              submitBtn.innerHTML = 'Verify & Sign In <i class="fas fa-arrow-right"></i>';
              submitBtn.disabled = false;

              if (res.devCode) {
                setOtpBoxesValue('loginOtpBoxes', res.devCode);
                localToast('🔧 Dev mode: OTP auto-filled into boxes');
              } else {
                localToast('📧 Verification code sent! Check Gmail (spam).');
              }
              // Start resend timer
              createResendTimer('loginResendTimer', async () => {
                try {
                  const r2 = await API.auth.sendOtp(loginEmail, 'login', undefined, 'user');
                  if (r2.devCode) setOtpBoxesValue('loginOtpBoxes', r2.devCode);
                  localToast('📧 New verification code sent!');
                  createResendTimer('loginResendTimer', () => {});
                } catch (e2) { localToast(`❌ ${e2.message}`, true); }
              });
            } else {
              Auth.saveSession(res.token, res.data);
              closeSignin();
              Auth.syncNavbar();
              localToast(`👋 Welcome back, ${res.data.name.split(' ')[0]}!`);
              if (window.location.pathname.includes('my-bookings')) window.location.reload();
            }
          } else {
            const code = getOtpBoxesValue('loginOtpBoxes');
            if (!code || code.length !== 6) { localToast('❌ Please fill all 6 OTP boxes', true); submitBtn.disabled = false; return; }
            const res = await API.auth.loginCustomer(loginEmail, password, code);
            Auth.saveSession(res.token, res.data);
            closeSignin();
            Auth.syncNavbar();
            localToast(`👋 Welcome back, ${res.data.name.split(' ')[0]}!`);
            if (window.location.pathname.includes('my-bookings')) window.location.reload();
          }
        } catch (err) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = otpSent ? 'Verify & Sign In <i class="fas fa-arrow-right"></i>' : 'Sign In <i class="fas fa-arrow-right"></i>';

          // Show specific error: wrong password vs not found
          if (err.notFound || err.message?.toLowerCase().includes('no account found')) {
            localToast('❌ No account found with this Gmail. Please register first.', true);
          } else if (err.message?.toLowerCase().includes('incorrect password')) {
            localToast('❌ Incorrect password. Please try again or use Forgot Password.', true);
          } else {
            localToast(`❌ ${err.message}`, true);
          }
        }
      });

      Auth.initGoogleSignIn('googleSignInBtn', {
        onSuccess: (user) => { closeSignin(); Auth.syncNavbar(); localToast(`👋 Welcome, ${user.name.split(' ')[0]}!`); if (window.location.pathname.includes('my-bookings')) window.location.reload(); },
        onError: (err) => localToast(`❌ Google Sign-In failed: ${err.message}`, true),
      });
    }

    /* ══════════════════════════════
       SHOW FORGOT FORM
    ══════════════════════════════ */
    function showForgotForm() {
      const headerTitle = signinModal.querySelector('h2');
      const headerSub = signinModal.querySelector('.modal-header p');
      if (headerTitle) headerTitle.textContent = 'Forgot Password';
      if (headerSub) headerSub.textContent = 'Verify your account Gmail to reset password';

      const body = signinModal.querySelector('.modal-body');
      if (!body) return;

      body.innerHTML = `
        <div id="forgotFormState">
          <div class="input-group">
            <i class="fas fa-user-circle"></i>
            <input type="text" id="forgotEmail" placeholder="Enter your Gmail address" autocomplete="username"/>
          </div>
          <button class="btn-modal-signin" id="forgotSubmit" style="margin-top: 12px;">Send Code <i class="fas fa-arrow-right"></i></button>
          <p class="modal-footer-text"><a href="#" id="backToLogin">Back to Sign In</a></p>
        </div>
      `;

      body.querySelector('#backToLogin')?.addEventListener('click', e => { e.preventDefault(); showLoginForm(); });

      body.querySelector('#forgotSubmit')?.addEventListener('click', async () => {
        const identifier = body.querySelector('#forgotEmail').value.trim();
        if (!identifier) { localToast('❌ Please enter your Gmail address', true); return; }
        const submitBtn = body.querySelector('#forgotSubmit');
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Sending Code… <i class="fas fa-spinner fa-spin"></i>';
        try {
          const res = await API.auth.forgotPassword(identifier, 'user');
          localToast('📧 Reset OTP code sent! Check Gmail (Spam).');
          showResetForm(identifier, res.devCode);
        } catch (err) {
          localToast(`❌ ${err.message}`, true);
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Send Code <i class="fas fa-arrow-right"></i>';
        }
      });
    }

    /* ══════════════════════════════
       SHOW RESET FORM
    ══════════════════════════════ */
    function showResetForm(email, devCode) {
      const headerTitle = signinModal.querySelector('h2');
      const headerSub = signinModal.querySelector('.modal-header p');
      if (headerTitle) headerTitle.textContent = 'Reset Password';
      if (headerSub) headerSub.textContent = 'Enter verification OTP and new password';

      const body = signinModal.querySelector('.modal-body');
      if (!body) return;

      body.innerHTML = `
        <div id="resetFormState">
          ${createOtpBoxesHTML('resetOtpBoxes')}
          <div class="input-group" style="margin-top: 12px;">
            <i class="fas fa-lock"></i>
            <input type="password" id="resetNewPw" placeholder="New password (min 6 characters)" autocomplete="new-password"/>
          </div>
          <div id="resetDevBanner" style="display:none; margin-top:10px;"></div>
          <div id="resetResendTimer" style="text-align:center;margin-top:8px"></div>
          <button class="btn-modal-signin" id="resetSubmit" style="margin-top: 12px;">Reset Password <i class="fas fa-check"></i></button>
          <p class="modal-footer-text"><a href="#" id="backToLogin">Back to Sign In</a></p>
        </div>
      `;

      initOtpBoxes('resetOtpBoxes');

      if (devCode) {
        setOtpBoxesValue('resetOtpBoxes', devCode);
        const banner = body.querySelector('#resetDevBanner');
        banner.style.cssText = 'background:rgba(255,160,0,.15);border:1px solid rgba(255,160,0,.4);border-radius:10px;padding:10px 14px;margin-top:10px;font-size:12px;color:#ffb300;line-height:1.5;display:block';
        banner.innerHTML = `<i class="fas fa-flask" style="margin-right:6px"></i><strong>Dev Mode</strong> — OTP: <span style="font-size:18px;font-weight:900;letter-spacing:4px;color:#00c853">${devCode}</span>`;
        localToast('🔧 Dev mode: Reset OTP auto-filled');
      }

      // Resend timer for reset
      createResendTimer('resetResendTimer', async () => {
        try {
          const res = await API.auth.forgotPassword(email, 'user');
          if (res.devCode) setOtpBoxesValue('resetOtpBoxes', res.devCode);
          localToast('📧 New reset code sent!');
          createResendTimer('resetResendTimer', () => {});
        } catch (e2) { localToast(`❌ ${e2.message}`, true); }
      });

      body.querySelector('#backToLogin')?.addEventListener('click', e => { e.preventDefault(); showLoginForm(); });

      body.querySelector('#resetSubmit')?.addEventListener('click', async () => {
        const code = getOtpBoxesValue('resetOtpBoxes');
        const password = body.querySelector('#resetNewPw').value;
        if (!code || code.length !== 6) { localToast('❌ Please fill all 6 OTP boxes', true); return; }
        if (!password || password.length < 6) { localToast('❌ Password must be at least 6 characters', true); return; }

        const submitBtn = body.querySelector('#resetSubmit');
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Resetting… <i class="fas fa-spinner fa-spin"></i>';
        try {
          await API.auth.resetPassword(email, 'user', code, password);
          localToast('🎉 Password reset successfully! Sign in with your new password.');
          showLoginForm();
        } catch (err) {
          localToast(`❌ ${err.message}`, true);
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Reset Password <i class="fas fa-check"></i>';
        }
      });
    }

    /* ══════════════════════════════
       SHOW REGISTER FORM
    ══════════════════════════════ */
    function showRegisterForm(prefill = '') {
      const headerTitle = signinModal.querySelector('h2');
      const headerSub = signinModal.querySelector('.modal-header p');
      if (headerTitle) headerTitle.textContent = 'Create Account';
      if (headerSub) headerSub.textContent = 'Join MyTurfy — enter your details to get started!';

      const body = signinModal.querySelector('.modal-body');
      if (!body) return;

      const prefillEmail = prefill.includes('@') ? prefill : '';

      body.innerHTML = `
        <div id="registerFormState">
          <div class="input-group">
            <i class="fas fa-user"></i>
            <input type="text" id="regName" placeholder="Your full name"/>
          </div>
          <div class="input-group">
            <i class="fas fa-envelope"></i>
            <input type="email" id="regEmail" placeholder="Gmail address (e.g. user@gmail.com)" value="${prefillEmail}"/>
          </div>
          <div class="input-group">
            <i class="fas fa-phone"></i>
            <input type="tel" id="regPhone" placeholder="10-digit Mobile number (Optional)" maxlength="10"/>
          </div>
          <div class="input-group">
            <i class="fas fa-lock"></i>
            <input type="password" id="regPw" placeholder="Password (min 6 characters)"/>
          </div>
          <div id="regOtpGroup" style="display:none; margin-top: 10px;">
            ${createOtpBoxesHTML('regOtpBoxes')}
            <p style="font-size:11px;color:var(--green);margin:6px 0 0;text-align:center"><i class="fas fa-info-circle"></i> Verification code sent to your Gmail (check Spam folder).</p>
            <div id="regResendTimer" style="text-align:center;margin-top:8px"></div>
          </div>
          <button class="btn-modal-signin" id="regSubmit">Send Verification Code <i class="fas fa-arrow-right"></i></button>
          <div class="modal-divider"><span>or sign up with</span></div>
          <div id="googleSignInBtnReg" class="google-btn-wrap"></div>
          <p class="modal-footer-text">Already have an account? <a href="#" id="goToLogin">Sign In</a></p>
        </div>
      `;

      initOtpBoxes('regOtpBoxes');

      body.querySelector('#goToLogin')?.addEventListener('click', e => { e.preventDefault(); showLoginForm(); });

      let otpSent = false;
      let regName, regEmail, regPhone, regPassword;
      const submitBtn = body.querySelector('#regSubmit');
      submitBtn?.addEventListener('click', async () => {
        regName = body.querySelector('#regName').value.trim();
        regEmail = body.querySelector('#regEmail').value.trim();
        regPhone = body.querySelector('#regPhone').value.trim();
        regPassword = body.querySelector('#regPw').value;

        if (!regName || !regEmail || !regPassword) {
          localToast('❌ Full name, Gmail, and password are required', true); return;
        }
        if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(regEmail)) {
          localToast('❌ Please enter a valid Gmail address (@gmail.com)', true); return;
        }
        if (regPhone && !/^[6-9]\d{9}$/.test(regPhone.replace(/\D/g, ''))) {
          localToast('❌ If providing a mobile number, please enter a valid 10-digit number', true); return;
        }
        if (regPassword.length < 6) {
          localToast('❌ Password must be at least 6 characters', true); return;
        }

        submitBtn.disabled = true;

        try {
          if (!otpSent) {
            submitBtn.innerHTML = 'Sending Code… <i class="fas fa-spinner fa-spin"></i>';
            const otpRes = await API.auth.sendOtp(regEmail, 'signup', regName, 'user');
            otpSent = true;
            body.querySelector('#regOtpGroup').style.display = 'block';
            body.querySelector('#regName').disabled = true;
            body.querySelector('#regEmail').disabled = true;
            body.querySelector('#regPhone').disabled = true;
            body.querySelector('#regPw').disabled = true;
            submitBtn.innerHTML = 'Verify & Create Account <i class="fas fa-arrow-right"></i>';
            submitBtn.disabled = false;

            if (otpRes.devCode) {
              setOtpBoxesValue('regOtpBoxes', otpRes.devCode);
              localToast('🔧 Dev mode: OTP auto-filled into boxes');
            } else {
              localToast('📧 Verification code sent! Check Gmail (spam).');
            }

            // Start resend timer for registration
            createResendTimer('regResendTimer', async () => {
              try {
                const r2 = await API.auth.sendOtp(regEmail, 'signup', regName, 'user');
                if (r2.devCode) setOtpBoxesValue('regOtpBoxes', r2.devCode);
                localToast('📧 New verification code sent!');
                createResendTimer('regResendTimer', () => {});
              } catch (e2) { localToast(`❌ ${e2.message}`, true); }
            });
          } else {
            const code = getOtpBoxesValue('regOtpBoxes');
            if (!code || code.length !== 6) { localToast('❌ Please fill all 6 OTP boxes', true); submitBtn.disabled = false; return; }
            submitBtn.innerHTML = 'Creating Account… <i class="fas fa-spinner fa-spin"></i>';
            const res = await API.auth.registerCustomer(regName, regEmail, regPassword, regPhone || undefined, code);
            Auth.saveSession(res.token, res.data);
            closeSignin();
            Auth.syncNavbar();
            localToast(`🎉 Welcome to MyTurfy, ${res.data.name.split(' ')[0]}!`);
          }
        } catch (err) {
          localToast(`❌ ${err.message}`, true);
          submitBtn.disabled = false;
          submitBtn.innerHTML = otpSent ? 'Verify & Create Account <i class="fas fa-arrow-right"></i>' : 'Send Verification Code <i class="fas fa-arrow-right"></i>';
        }
      });

      Auth.initGoogleSignIn('googleSignInBtnReg', {
        onSuccess: (user) => { closeSignin(); Auth.syncNavbar(); localToast(`🎉 Welcome to MyTurfy, ${user.name.split(' ')[0]}!`); },
        onError: (err) => localToast(`❌ Google Sign-Up failed: ${err.message}`, true),
      });
    }
  }

  return {
    getToken,
    getUser,
    isLoggedIn,
    saveSession,
    clearToken,
    requireAuth,
    requireOwner,
    syncNavbar,
    logout,
    initGoogleSignIn,
    initAuthModal,
  };
})();
