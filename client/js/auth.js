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
          <a href="#" id="menuLogoutBtn"><i class="fas fa-right-from-bracket"></i> Log Out</a>
        `;
      } else {
        profileMenu.innerHTML = `
          <div class="dropdown-header">My Account</div>
          <a href="my-bookings.html"><i class="fas fa-calendar-alt"></i> My Bookings</a>
          <a href="wishlist.html"><i class="fas fa-heart"></i> My Wishlist</a>
          <a href="about.html"><i class="fas fa-info-circle"></i> About Us</a>
          <a href="support.html"><i class="fas fa-headset"></i> Support</a>
          <a href="#" id="menuLogoutBtn"><i class="fas fa-right-from-bracket"></i> Log Out</a>
        `;
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
      btn.removeEventListener('click', Auth.openSignin); // clear any placeholder
      btn.addEventListener('click', Auth.openSignin);
    });

    function showLoginForm() {
      const headerTitle = signinModal.querySelector('h2');
      const headerSub = signinModal.querySelector('.modal-header p');
      if (headerTitle) headerTitle.textContent = 'Welcome Back';
      if (headerSub) headerSub.textContent = 'Sign in to complete your booking';

      const body = signinModal.querySelector('.modal-body');
      if (!body) return;

      body.innerHTML = `
        <div id="loginFormState">
          <div class="input-group">
            <i class="fas fa-envelope"></i>
            <input type="email" id="loginEmail" placeholder="Email address" autocomplete="email"/>
          </div>
          <div class="input-group">
            <i class="fas fa-lock"></i>
            <input type="password" id="loginPw" placeholder="Password" autocomplete="current-password"/>
            <button class="toggle-pw" id="togglePw" type="button"><i class="fas fa-eye"></i></button>
          </div>
          <div id="loginOtpGroup" style="display:none; margin-top: 10px;">
            <div class="input-group">
              <i class="fas fa-key"></i>
              <input type="text" id="loginOtp" placeholder="Enter 6-digit verification code" maxlength="6"/>
            </div>
            <p style="font-size:11px;color:var(--green);margin:4px 0 0 4px"><i class="fas fa-info-circle"></i> Verification code sent to your email.</p>
          </div>
          <a href="#" class="forgot-link">Forgot password?</a>
          <button class="btn-modal-signin" id="loginSubmit">Sign In <i class="fas fa-arrow-right"></i></button>
          <div class="modal-divider"><span>or continue with</span></div>
          <div id="googleSignInBtn" class="google-btn-wrap"></div>
          <p class="modal-footer-text">Don't have an account? <a href="#" id="goToRegister">Register Free</a></p>
        </div>
      `;

      // Password toggle
      const togglePw = body.querySelector('#togglePw');
      const pwInput = body.querySelector('#loginPw');
      togglePw?.addEventListener('click', () => {
        const show = pwInput.type === 'password';
        pwInput.type = show ? 'text' : 'password';
        togglePw.innerHTML = show ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
      });

      // Switch to register
      body.querySelector('#goToRegister')?.addEventListener('click', e => {
        e.preventDefault();
        showRegisterForm();
      });

      // Forgot password
      body.querySelector('.forgot-link')?.addEventListener('click', e => {
        e.preventDefault();
        showForgotForm();
      });

      // Submit
      let otpSent = false;
      const submitBtn = body.querySelector('#loginSubmit');
      submitBtn?.addEventListener('click', async () => {
        const email = body.querySelector('#loginEmail').value.trim();
        const password = pwInput.value;
        if (!email || !password) {
          localToast('❌ Enter email and password', true);
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Processing… <i class="fas fa-spinner fa-spin"></i>';

        try {
          if (!otpSent) {
            const res = await API.auth.loginCustomer(email, password);
            if (res.needsOtp) {
              otpSent = true;
              body.querySelector('#loginOtpGroup').style.display = 'block';
              body.querySelector('#loginEmail').disabled = true;
              body.querySelector('#loginPw').disabled = true;
              submitBtn.innerHTML = 'Verify & Sign In <i class="fas fa-arrow-right"></i>';
              submitBtn.disabled = false;

              if (res.devCode) {
                body.querySelector('#loginOtp').value = res.devCode;
                const devBanner = document.createElement('div');
                devBanner.id = 'devModeBannerLogin';
                devBanner.style.cssText = 'background:rgba(255,160,0,.15);border:1px solid rgba(255,160,0,.4);border-radius:10px;padding:10px 14px;margin-top:10px;font-size:12px;color:#ffb300;line-height:1.5';
                devBanner.innerHTML = `<i class="fas fa-flask" style="margin-right:6px"></i><strong>Dev Mode</strong> — Email not configured. Your OTP is: <span style="font-size:18px;font-weight:900;letter-spacing:4px;color:#00c853">${res.devCode}</span><br><small style="color:rgba(255,255,255,.45)">It has been auto-filled. Click verify to continue.</small>`;
                body.querySelector('#loginOtpGroup').insertAdjacentElement('afterend', devBanner);
                localToast('🔧 Dev mode: OTP auto-filled (email not configured)');
              } else {
                localToast('📧 Verification code sent to your email!');
              }
            } else {
              Auth.saveSession(res.token, res.data);
              closeSignin();
              Auth.syncNavbar();
              localToast(`👋 Welcome back, ${res.data.name.split(' ')[0]}!`);
              // If we are on my-bookings page, refresh it
              if (window.location.pathname.includes('my-bookings')) {
                window.location.reload();
              }
            }
          } else {
            const code = body.querySelector('#loginOtp').value.trim();
            if (!code || code.length !== 6) {
              localToast('❌ Enter the 6-digit code', true);
              submitBtn.disabled = false;
              return;
            }
            const res = await API.auth.loginCustomer(email, password, code);
            Auth.saveSession(res.token, res.data);
            closeSignin();
            Auth.syncNavbar();
            localToast(`👋 Welcome back, ${res.data.name.split(' ')[0]}!`);
            if (window.location.pathname.includes('my-bookings')) {
              window.location.reload();
            }
          }
        } catch (err) {
          localToast(`❌ ${err.message}`, true);
          submitBtn.disabled = false;
          submitBtn.innerHTML = otpSent ? 'Verify & Sign In <i class="fas fa-arrow-right"></i>' : 'Sign In <i class="fas fa-arrow-right"></i>';
        }
      });

      // Google Sign-In
      Auth.initGoogleSignIn('googleSignInBtn', {
        onSuccess: (user) => {
          closeSignin();
          Auth.syncNavbar();
          localToast(`👋 Welcome, ${user.name.split(' ')[0]}!`);
          if (window.location.pathname.includes('my-bookings')) {
            window.location.reload();
          }
        },
        onError:   (err)  => localToast(`❌ Google Sign-In failed: ${err.message}`, true),
      });
    }

    function showForgotForm() {
      const headerTitle = signinModal.querySelector('h2');
      const headerSub = signinModal.querySelector('.modal-header p');
      if (headerTitle) headerTitle.textContent = 'Forgot Password';
      if (headerSub) headerSub.textContent = 'Verify your account email to reset password';

      const body = signinModal.querySelector('.modal-body');
      if (!body) return;

      body.innerHTML = `
        <div id="forgotFormState">
          <div class="input-group">
            <i class="fas fa-envelope"></i>
            <input type="email" id="forgotEmail" placeholder="Enter your email address" autocomplete="email"/>
          </div>
          <button class="btn-modal-signin" id="forgotSubmit" style="margin-top: 12px;">Send Code <i class="fas fa-arrow-right"></i></button>
          <p class="modal-footer-text"><a href="#" id="backToLogin">Back to Sign In</a></p>
        </div>
      `;

      body.querySelector('#backToLogin')?.addEventListener('click', e => {
        e.preventDefault();
        showLoginForm();
      });

      const submitBtn = body.querySelector('#forgotSubmit');
      submitBtn?.addEventListener('click', async () => {
        const email = body.querySelector('#forgotEmail').value.trim();
        if (!email) {
          localToast('❌ Please enter your email address', true);
          return;
        }
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Sending Code… <i class="fas fa-spinner fa-spin"></i>';

        try {
          const res = await API.auth.forgotPassword(email, 'user');
          localToast('📧 Reset OTP code sent to your email!');
          showResetForm(email, res.devCode);
        } catch (err) {
          localToast(`❌ ${err.message}`, true);
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Send Code <i class="fas fa-arrow-right"></i>';
        }
      });
    }

    function showResetForm(email, devCode) {
      const headerTitle = signinModal.querySelector('h2');
      const headerSub = signinModal.querySelector('.modal-header p');
      if (headerTitle) headerTitle.textContent = 'Reset Password';
      if (headerSub) headerSub.textContent = 'Enter verification OTP and new password';

      const body = signinModal.querySelector('.modal-body');
      if (!body) return;

      body.innerHTML = `
        <div id="resetFormState">
          <div class="input-group">
            <i class="fas fa-key"></i>
            <input type="text" id="resetOtp" placeholder="6-digit verification code" maxlength="6"/>
          </div>
          <div class="input-group" style="margin-top: 10px;">
            <i class="fas fa-lock"></i>
            <input type="password" id="resetNewPw" placeholder="New password (min 6 characters)" autocomplete="new-password"/>
          </div>
          <div id="resetDevBanner" style="display:none; margin-top:10px;"></div>
          <button class="btn-modal-signin" id="resetSubmit" style="margin-top: 12px;">Reset Password <i class="fas fa-check"></i></button>
          <p class="modal-footer-text"><a href="#" id="backToForgot">Resend Code</a></p>
        </div>
      `;

      if (devCode) {
        body.querySelector('#resetOtp').value = devCode;
        const banner = body.querySelector('#resetDevBanner');
        banner.style.cssText = 'background:rgba(255,160,0,.15);border:1px solid rgba(255,160,0,.4);border-radius:10px;padding:10px 14px;margin-top:10px;font-size:12px;color:#ffb300;line-height:1.5;display:block';
        banner.innerHTML = `<i class="fas fa-flask" style="margin-right:6px"></i><strong>Dev Mode</strong> — OTP: <span style="font-size:18px;font-weight:900;letter-spacing:4px;color:#00c853">${devCode}</span>`;
        localToast('🔧 Dev mode: Reset OTP auto-filled');
      }

      body.querySelector('#backToForgot')?.addEventListener('click', e => {
        e.preventDefault();
        showForgotForm();
      });

      const submitBtn = body.querySelector('#resetSubmit');
      submitBtn?.addEventListener('click', async () => {
        const code = body.querySelector('#resetOtp').value.trim();
        const password = body.querySelector('#resetNewPw').value;

        if (!code || code.length !== 6) {
          localToast('❌ Enter the 6-digit code', true);
          return;
        }
        if (!password || password.length < 6) {
          localToast('❌ Password must be at least 6 characters', true);
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Resetting… <i class="fas fa-spinner fa-spin"></i>';

        try {
          await API.auth.resetPassword(email, 'user', code, password);
          localToast('🎉 Password reset successfully! Please sign in with your new password.');
          showLoginForm();
        } catch (err) {
          localToast(`❌ ${err.message}`, true);
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Reset Password <i class="fas fa-check"></i>';
        }
      });
    }

    function showRegisterForm() {
      const headerTitle = signinModal.querySelector('h2');
      const headerSub = signinModal.querySelector('.modal-header p');
      if (headerTitle) headerTitle.textContent = 'Create Account';
      if (headerSub) headerSub.textContent = 'Join MyTurfy — it\'s free!';

      const body = signinModal.querySelector('.modal-body');
      if (!body) return;

      body.innerHTML = `
        <div id="registerFormState">
          <div class="input-group">
            <i class="fas fa-user"></i>
            <input type="text" id="regName" placeholder="Your full name"/>
          </div>
          <div class="input-group">
            <i class="fas fa-envelope"></i>
            <input type="email" id="regEmail" placeholder="Email address"/>
          </div>
          <div class="input-group">
            <i class="fas fa-phone"></i>
            <input type="tel" id="regPhone" placeholder="Phone number (optional)"/>
          </div>
          <div class="input-group">
            <i class="fas fa-lock"></i>
            <input type="password" id="regPw" placeholder="Password (min 6 characters)"/>
          </div>
          <div id="regOtpGroup" style="display:none; margin-top: 10px;">
            <div class="input-group">
              <i class="fas fa-key"></i>
              <input type="text" id="regOtp" placeholder="Enter 6-digit verification code" maxlength="6"/>
            </div>
            <p style="font-size:11px;color:var(--green);margin:4px 0 0 4px"><i class="fas fa-info-circle"></i> Verification code sent to your email.</p>
          </div>
          <button class="btn-modal-signin" id="regSubmit">Send Verification Code <i class="fas fa-arrow-right"></i></button>
          <div class="modal-divider"><span>or sign up with</span></div>
          <div id="googleSignInBtnReg" class="google-btn-wrap"></div>
          <p class="modal-footer-text">Already have an account? <a href="#" id="goToLogin">Sign In</a></p>
        </div>
      `;

      // Switch to login
      body.querySelector('#goToLogin')?.addEventListener('click', e => {
        e.preventDefault();
        showLoginForm();
      });

      // Submit
      let otpSent = false;
      const submitBtn = body.querySelector('#regSubmit');
      submitBtn?.addEventListener('click', async () => {
        const name = body.querySelector('#regName').value.trim();
        const email = body.querySelector('#regEmail').value.trim();
        const phone = body.querySelector('#regPhone').value.trim();
        const password = body.querySelector('#regPw').value;

        if (!name || !email || !password) {
          localToast('❌ Name, email and password are required', true);
          return;
        }
        if (password.length < 6) {
          localToast('❌ Password must be at least 6 characters', true);
          return;
        }

        submitBtn.disabled = true;

        try {
          if (!otpSent) {
            submitBtn.innerHTML = 'Sending Code… <i class="fas fa-spinner fa-spin"></i>';
            const otpRes = await API.auth.sendOtp(email, 'signup', name, 'user');
            otpSent = true;
            body.querySelector('#regOtpGroup').style.display = 'block';
            body.querySelector('#regName').disabled = true;
            body.querySelector('#regEmail').disabled = true;
            body.querySelector('#regPhone').disabled = true;
            body.querySelector('#regPw').disabled = true;
            submitBtn.innerHTML = 'Verify & Create Account <i class="fas fa-arrow-right"></i>';
            submitBtn.disabled = false;

            if (otpRes.devCode) {
              // Dev mode — no real email configured, show the code directly in UI
              body.querySelector('#regOtp').value = otpRes.devCode;
              const devBanner = document.createElement('div');
              devBanner.id = 'devModeBanner';
              devBanner.style.cssText = 'background:rgba(255,160,0,.15);border:1px solid rgba(255,160,0,.4);border-radius:10px;padding:10px 14px;margin-top:10px;font-size:12px;color:#ffb300;line-height:1.5';
              devBanner.innerHTML = `<i class="fas fa-flask" style="margin-right:6px"></i><strong>Dev Mode</strong> — Email not configured. Your OTP is: <span style="font-size:18px;font-weight:900;letter-spacing:4px;color:#00c853">${otpRes.devCode}</span><br><small style="color:rgba(255,255,255,.45)">It has been auto-filled. Click verify to continue.</small>`;
              body.querySelector('#regOtpGroup').insertAdjacentElement('afterend', devBanner);
              localToast('🔧 Dev mode: OTP auto-filled (email not configured)');
            } else {
              localToast('📧 Verification code sent to your email!');
            }
          } else {
            const code = body.querySelector('#regOtp').value.trim();
            if (!code || code.length !== 6) {
              localToast('❌ Enter the 6-digit code', true);
              submitBtn.disabled = false;
              return;
            }
            submitBtn.innerHTML = 'Creating Account… <i class="fas fa-spinner fa-spin"></i>';
            const res = await API.auth.registerCustomer(name, email, password, phone || undefined, code);
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

      // Google Sign-Up
      Auth.initGoogleSignIn('googleSignInBtnReg', {
        onSuccess: (user) => { closeSignin(); Auth.syncNavbar(); localToast(`🎉 Welcome to MyTurfy, ${user.name.split(' ')[0]}!`); },
        onError:   (err)  => localToast(`❌ Google Sign-Up failed: ${err.message}`, true),
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
