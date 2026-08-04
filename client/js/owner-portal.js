/* =============================================
   MYTURFY PARTNER — owner-portal.js
   New in this version:
   • Drag-drop multi-image uploader with live preview — no URL needed
   • Open-hour / close-hour selectors feed into venue availability
   • 2-week closed-dates chip calendar
   • Dynamic slot generation data saved to DB
   ============================================= */

document.addEventListener('DOMContentLoaded', async () => {

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const getLocalDateString = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  /* ── toast ── */
  function toast(msg, isError = false) {
    const host = $('#toastHost');
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
    setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 400); }, 3500);
  }

  /* ── sport fallback images ── */
  const SPORT_IMG = {
    Football:'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=800&q=80',
    Cricket:'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&q=80',
    Basketball:'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',
    Pickleball:'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80',
    Bowling:'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800&q=80',
    Pool:'https://images.unsplash.com/photo-1599058917765-a780eda07a3e?w=800&q=80',
    Badminton:'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80',
    Tennis:'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80',
    default:'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=800&q=80',
  };
  const sportImg = s => SPORT_IMG[s] || SPORT_IMG.default;

  /* ═══════════════════════════════════════════
     AUTH SCREEN
  ═══════════════════════════════════════════ */
  const authScreen = $('#authScreen');
  const appEl      = $('#app');

  function showAuthScreen() {
    authScreen.hidden = false; appEl.hidden = true;
    closeSidebar();
    Auth.initGoogleSignIn('googleSignInBtnOwner', {
      isOwner:   true,
      onSuccess: (user) => { toast(`👋 Welcome, ${user.name?.split(' ')[0] || 'Partner'}!`); initDashboard(); },
      onError:   (err)  => toast(`❌ Google Sign-In failed: ${err.message}`, true),
    });
  }
  function showDashboard() { authScreen.hidden = true; appEl.hidden = false; }

  /* Tab switching and form routing */
  function activateForm(formId) {
    $$('.auth-form').forEach(f => f.classList.remove('active'));
    $('#' + formId)?.classList.add('active');
    
    $('#loginError').hidden = true;
    $('#signupError').hidden = true;
    $('#forgotError').hidden = true;
    $('#resetError').hidden = true;
    
    const showTabsAndGoogle = (formId === 'loginForm' || formId === 'signupForm');
    const tabs = $('.auth-tabs');
    const divider = $('#authDivider');
    const googleBtn = $('#googleSignInBtnOwner');
    
    if (tabs) tabs.style.display = showTabsAndGoogle ? 'flex' : 'none';
    if (divider) divider.style.display = showTabsAndGoogle ? 'block' : 'none';
    if (googleBtn) googleBtn.style.display = showTabsAndGoogle ? 'flex' : 'none';
    
    if (showTabsAndGoogle) {
      const tabName = formId === 'loginForm' ? 'login' : 'signup';
      $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    }
  }
  $$('.auth-tab').forEach(tab => tab.addEventListener('click', () => activateForm(tab.dataset.tab === 'login' ? 'loginForm' : 'signupForm')));
  $('#switchToSignup')?.addEventListener('click', e => { e.preventDefault(); activateForm('signupForm'); });
  $('#switchToLogin')?.addEventListener('click',  e => { e.preventDefault(); activateForm('loginForm');  });
  $('#forgotPwLink')?.addEventListener('click', e => { e.preventDefault(); activateForm('forgotForm'); });
  $('#forgotBackToLogin')?.addEventListener('click', e => { e.preventDefault(); activateForm('loginForm'); });
  $('#resetBackToForgot')?.addEventListener('click', e => { e.preventDefault(); activateForm('forgotForm'); });

  $$('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = $('#' + btn.dataset.target);
      const show = inp.type === 'text'; inp.type = show ? 'password' : 'text';
      btn.innerHTML = show ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    });
  });

  function showAuthError(id, msg) { const el = $('#' + id); if (el) { el.textContent = msg; el.hidden = false; } }

  /* Login */
  let loginOtpSent = false;
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#loginEmail').value.trim(), pw = $('#loginPw').value;
    if (!email || !pw) { showAuthError('loginError', 'Please fill in all fields.'); return; }
    const btn = $('#loginSubmitBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing…'; btn.disabled = true;
    $('#loginError').hidden = true;
    try {
      if (!loginOtpSent) {
        const res = await API.auth.loginOwner(email, pw);
        if (res.needsOtp) {
          loginOtpSent = true;
          $('#loginOtpGroup').style.display = 'block';
          $('#loginEmail').disabled = true;
          $('#loginPw').disabled = true;
          btn.innerHTML = '<i class="fas fa-check-circle"></i> Verify & Log In';
          btn.disabled = false;

          if (res.devCode) {
            $('#loginOtpInput').value = res.devCode;
            const existing = document.getElementById('ownerDevBannerLogin');
            if (!existing) {
              const banner = document.createElement('div');
              banner.id = 'ownerDevBannerLogin';
              banner.style.cssText = 'background:rgba(255,160,0,.15);border:1px solid rgba(255,160,0,.4);border-radius:10px;padding:10px 14px;margin-top:10px;font-size:12px;color:#ffb300;line-height:1.5';
              banner.innerHTML = `<i class="fas fa-flask" style="margin-right:6px"></i><strong>Dev Mode</strong> — No email configured. OTP: <span style="font-size:18px;font-weight:900;letter-spacing:4px;color:#00c853">${res.devCode}</span><br><small style="opacity:.6">Auto-filled — click verify to continue.</small>`;
              $('#loginOtpGroup').insertAdjacentElement('afterend', banner);
            }
            toast('🔧 Dev mode: OTP auto-filled');
          } else {
            toast('📧 Verification code sent to your email!');
          }
        } else {
          Auth.saveSession(res.token, res.data);
          toast(`👋 Welcome back, ${res.data.name?.split(' ')[0] || 'Partner'}!`);
          await initDashboard();
        }
      } else {
        const code = $('#loginOtpInput').value.trim();
        if (!code || code.length !== 6) { showAuthError('loginError', 'Enter the 6-digit code.'); btn.disabled = false; return; }
        const res = await API.auth.loginOwner(email, pw, code);
        Auth.saveSession(res.token, res.data);
        toast(`👋 Welcome back, ${res.data.name?.split(' ')[0] || 'Partner'}!`);
        await initDashboard();
      }
    } catch (err) {
      showAuthError('loginError', err.message || 'Login failed.');
      btn.disabled = false;
      btn.innerHTML = loginOtpSent ? '<i class="fas fa-check-circle"></i> Verify & Log In' : '<i class="fas fa-right-to-bracket"></i> Log In';
    }
  });

  /* Signup */
  let signupOtpSent = false;
  $('#signupForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#suName').value.trim(), email = $('#suEmail').value.trim();
    const phone = $('#suPhone').value.trim(), city = $('#suCity').value.trim(), pw = $('#suPw').value;
    const agreedPrivacy = $('#suPrivacy')?.checked;

    if (!agreedPrivacy) { showAuthError('signupError', 'You must agree to the Privacy Policy and Terms & Conditions to create a partner account.'); return; }
    if (!name || !email || !phone || !pw) { showAuthError('signupError', 'Please fill in all required fields.'); return; }
    if (pw.length < 6) { showAuthError('signupError', 'Password must be at least 6 characters.'); return; }
    const btn = $('#signupSubmitBtn'); btn.disabled = true;
    $('#signupError').hidden = true;
    try {
      if (!signupOtpSent) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending Code…';
        const otpRes = await API.auth.sendOtp(email, 'signup', name, 'owner');
        signupOtpSent = true;
        $('#signupOtpGroup').style.display = 'block';
        $('#suName').disabled = true; $('#suEmail').disabled = true;
        $('#suPhone').disabled = true; $('#suCity').disabled = true; $('#suPw').disabled = true;
        if ($('#suPrivacy')) $('#suPrivacy').disabled = true;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Verify & Create Account';
        btn.disabled = false;

        if (otpRes.devCode) {
          $('#suOtp').value = otpRes.devCode;
          const existing = document.getElementById('ownerDevBannerSignup');
          if (!existing) {
            const banner = document.createElement('div');
            banner.id = 'ownerDevBannerSignup';
            banner.style.cssText = 'background:rgba(255,160,0,.15);border:1px solid rgba(255,160,0,.4);border-radius:10px;padding:10px 14px;margin-top:10px;font-size:12px;color:#ffb300;line-height:1.5';
            banner.innerHTML = `<i class="fas fa-flask" style="margin-right:6px"></i><strong>Dev Mode</strong> — No email configured. OTP: <span style="font-size:18px;font-weight:900;letter-spacing:4px;color:#00c853">${otpRes.devCode}</span><br><small style="opacity:.6">Auto-filled — click verify to continue.</small>`;
            $('#signupOtpGroup').insertAdjacentElement('afterend', banner);
          }
          toast('🔧 Dev mode: OTP auto-filled');
        } else {
          toast('📧 Verification code sent to your email!');
        }
      } else {
        const code = $('#suOtp').value.trim();
        if (!code || code.length !== 6) { showAuthError('signupError', 'Enter the 6-digit verification code.'); btn.disabled = false; return; }
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account…';
        const res = await API.auth.registerOwner(name, email, pw, phone, city, code, true);
        Auth.saveSession(res.token, res.data);
        toast(`🎉 Account created! Welcome, ${res.data.name?.split(' ')[0] || 'Partner'}!`);
        await initDashboard();
      }
    } catch (err) {
      showAuthError('signupError', err.message || 'Sign-up failed.');
      btn.disabled = false;
      btn.innerHTML = signupOtpSent ? '<i class="fas fa-check-circle"></i> Verify & Create Account' : '<i class="fas fa-user-plus"></i> Create Account';
    }
  });

  /* Forgot Password */
  $('#forgotForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#forgotEmail').value.trim();
    if (!email) { showAuthError('forgotError', 'Please enter your business email.'); return; }
    const btn = $('#forgotSubmitBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending Code…'; btn.disabled = true;
    $('#forgotError').hidden = true;
    try {
      const res = await API.auth.forgotPassword(email, 'owner');
      toast('📧 Reset verification code sent to your email!');
      activateForm('resetForm');

      if (res.devCode) {
        $('#resetOtp').value = res.devCode;
        const banner = $('#resetDevBannerOwner');
        if (banner) {
          banner.style.cssText = 'background:rgba(255,160,0,.15);border:1px solid rgba(255,160,0,.4);border-radius:10px;padding:10px 14px;margin-top:10px;font-size:12px;color:#ffb300;line-height:1.5;display:block';
          banner.innerHTML = `<i class="fas fa-flask" style="margin-right:6px"></i><strong>Dev Mode</strong> — OTP: <span style="font-size:18px;font-weight:900;letter-spacing:4px;color:#00c853">${res.devCode}</span>`;
        }
        toast('🔧 Dev mode: Reset OTP auto-filled');
      }
    } catch (err) {
      showAuthError('forgotError', err.message || 'Failed to send reset code.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Send Verification Code <i class="fas fa-arrow-right"></i>';
    }
  });

  /* Reset Password */
  $('#resetForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#forgotEmail').value.trim();
    const code = $('#resetOtp').value.trim();
    const password = $('#resetNewPw').value;

    if (!code || code.length !== 6) { showAuthError('resetError', 'Please enter the 6-digit verification code.'); return; }
    if (!password || password.length < 6) { showAuthError('resetError', 'Password must be at least 6 characters.'); return; }

    const btn = $('#resetSubmitBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting…'; btn.disabled = true;
    $('#resetError').hidden = true;
    try {
      await API.auth.resetPassword(email, 'owner', code, password);
      toast('🎉 Password reset successfully! Please log in with your new password.');
      activateForm('loginForm');
    } catch (err) {
      showAuthError('resetError', err.message || 'Reset failed.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Reset Password <i class="fas fa-check"></i>';
    }
  });

  /* Logout */
  $('#logoutBtn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to log out?')) return;
    try { await API.auth.logout(); } catch (_) {}
    Auth.clearToken(); window.location.reload();
  });

  /* ═══════════════════════════════════════════
     NAVIGATION
  ═══════════════════════════════════════════ */
  const VIEW_TITLES = {
    overview: 'Overview',
    venues: 'My Venues',
    bookings: 'Bookings',
    earnings: 'Earnings',
    reviews: 'Reviews',
    'offline-bookings': 'Offline Booking',
    'qr-scanner': 'QR Scanner',
    settings: 'Settings'
  };
  function setView(name) {
    $$('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + name)?.classList.add('active');
    $$('.sb-link').forEach(l => l.classList.toggle('active', l.dataset.view === name));
    $('#viewTitle').textContent = VIEW_TITLES[name] || name;
    closeSidebar(); window.scrollTo(0, 0);
  }
  $$('.sb-link').forEach(l  => l.addEventListener('click', () => setView(l.dataset.view)));
  $$('[data-goto]').forEach(b => b.addEventListener('click', () => setView(b.dataset.goto)));
  function openSidebar()  { $('#sidebar').classList.add('open');    $('#sidebarBackdrop').classList.add('active'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.remove('active'); }
  $('#menuToggle').addEventListener('click', () => { if (!appEl.hidden) openSidebar(); });
  $('#sidebarBackdrop').addEventListener('click', closeSidebar);

  /* ═══════════════════════════════════════════
     STATE
  ═══════════════════════════════════════════ */
  let venues = [], bookings = [], reviews = [], session = null;

  async function initDashboard() {
    session = Auth.getUser();
    if (!session || session.role !== 'owner') { showAuthScreen(); return; }
    showDashboard();
    const name = session.name || 'Partner';
    $('#ownerNameTop').textContent     = name;
    $('#welcomeOwnerName').textContent = name.split(' ')[0];
    $('#ownerAvatar').textContent      = (name[0] || 'P').toUpperCase();
    fillSettingsForm();
    await refreshAll();
    setView('overview');
  }

  async function refreshAll() {
    try {
      const [vRes, bRes, rRes] = await Promise.all([
        API.venues.mine(), API.bookings.ownerList(), API.reviews.ownerList(),
      ]);
      venues   = vRes.data || [];
      bookings = bRes.data || [];
      reviews  = rRes.data || [];
      renderAll();
    } catch (err) { toast(`❌ Failed to load data: ${err.message}`, true); }
  }

  /* ═══════════════════════════════════════════
     OVERVIEW
  ═══════════════════════════════════════════ */
  function renderOverview() {
    const now = new Date();
    const thisMonth = bookings.filter(b => {
      const d = new Date(b.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && b.status !== 'cancelled';
    });
    const earnings  = thisMonth.reduce((s, b) => s + (b.amount || 0), 0);
    const avgRating = venues.length ? (venues.reduce((s, v) => s + (+v.rating || 4.5), 0) / venues.length).toFixed(1) : '0.0';
    $('#statVenues').textContent   = venues.length;
    $('#statBookings').textContent = thisMonth.length;
    $('#statRating').textContent   = avgRating;
    $('#statEarnings').textContent = '₹' + earnings.toLocaleString('en-IN');
    $('#gaugeVenues').style.setProperty('--pct',   Math.min(100, venues.length * 20) + '%');
    $('#gaugeBookings').style.setProperty('--pct',  Math.min(100, thisMonth.length * 8) + '%');
    $('#gaugeRating').style.setProperty('--pct',    (avgRating / 5 * 100) + '%');

    const days = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    const counts = days.map(d => bookings.filter(b => b.date === getLocalDateString(d)).length);
    const max = Math.max(1, ...counts);
    $('#weekChart').innerHTML = days.map((d, i) => `
      <div class="bar-col">
        <div class="bar-fill" style="height:${Math.max(4, counts[i] / max * 100)}%">
          <span class="bar-val">${counts[i]}</span>
        </div>
        <span class="bar-label">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
      </div>`).join('');

    const top = [...venues].sort((a, b) => (+b.rating || 0) - (+a.rating || 0))[0];
    $('#topVenueCard').innerHTML = top
      ? `<img src="${top.images?.[0] || sportImg(top.sport)}" alt="${top.name}" loading="lazy"/>
         <div class="tv-name">${top.name}</div>
         <div class="tv-meta"><i class="fas fa-star" style="color:#ffea00"></i> ${top.rating || '4.5'} · ${top.sport}</div>`
      : `<p style="color:var(--muted);font-size:13px">Add a venue to see your top performer here.</p>`;

    const recent = [...bookings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    $('#recentBookingsTable tbody').innerHTML = recent.length
      ? recent.map(b => `<tr>
          <td>${b.customer?.name || 'Customer'}</td>
          <td>${b.venue?.name || '—'}</td>
          <td>${b.date || '—'}</td><td>${b.time || '—'}</td>
          <td>₹${(b.amount || 0).toLocaleString('en-IN')}</td>
          <td><span class="status-pill status-${b.status}">${b.status}</span></td>
        </tr>`).join('')
      : `<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:20px">No bookings yet</td></tr>`;
  }

  /* ═══════════════════════════════════════════
     MY VENUES
  ═══════════════════════════════════════════ */
  function renderVenues() {
    const grid = $('#ownerVenueGrid'), empty = $('#venuesEmpty');
    if (!venues.length) { grid.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    grid.innerHTML = venues.map(v => {
      const img  = v.images?.[0] || sportImg(v.sport);
      const dims = v.specs ? `${v.specs.length || '—'} × ${v.specs.breadth || '—'} m` : '—';
      const openH  = v.openHour  ?? 6;
      const closeH = v.closeHour ?? 22;
      const fmtH = h => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
      return `
      <div class="owner-venue-card" data-id="${v._id}">
        <div class="ov-img-wrap">
          <img src="${img}" alt="${v.name}" loading="lazy"/>
          <span class="ov-sport-badge">${v.sport}</span>
        </div>
        <div class="ov-body">
          <div class="ov-name">${v.name}</div>
          <div class="ov-loc"><i class="fas fa-map-marker-alt"></i> ${v.location}</div>
          <div class="ov-loc" style="font-size:11px"><i class="fas fa-clock"></i> ${fmtH(openH)} – ${fmtH(closeH)}</div>
          <div class="ov-loc" style="font-size:11px;margin-top:-4px"><i class="fas fa-ruler-combined"></i> ${dims}</div>
          <div class="ov-meta-row">
            <span class="ov-price">₹${v.price}/hr</span>
            <span class="ov-rating"><i class="fas fa-star"></i> ${v.rating || '—'} (${v.reviewsCount || 0})</span>
          </div>
          <div class="ov-actions">
            <button class="row-action ov-edit" data-id="${v._id}"><i class="fas fa-pen"></i> Edit</button>
            <button class="row-action ov-delete" data-id="${v._id}" style="color:var(--red)"><i class="fas fa-trash"></i> Remove</button>
          </div>
        </div>
      </div>`;
    }).join('');
    $$('.ov-edit').forEach(btn   => btn.addEventListener('click', () => openVenueForm(btn.dataset.id)));
    $$('.ov-delete').forEach(btn => btn.addEventListener('click', () => deleteVenue(btn.dataset.id)));
  }

  async function deleteVenue(id) {
    const v = venues.find(x => x._id === id);
    if (!confirm(`Remove "${v?.name || 'this venue'}"? All bookings and reviews will also be deleted.`)) return;
    try { await API.venues.delete(id); toast('🗑️ Venue removed'); await refreshAll(); }
    catch (err) { toast(`❌ ${err.message}`, true); }
  }

  /* ═══════════════════════════════════════════
     IMAGE UPLOADER (multi-file, preview, Cloudinary-ready)
  ═══════════════════════════════════════════ */
  // Pending file objects (new files chosen but not yet uploaded)
  let pendingFiles = [];
  // Already-saved URLs from editing an existing venue
  let savedUrls = [];

  function buildPreviewStrip() {
    const container = $('#imgPreviews');
    if (!container) return;
    container.innerHTML = '';
    const allImages = [...savedUrls, ...pendingFiles.map(f => f.preview)];
    allImages.forEach((src, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'img-preview-item' + (i === 0 ? ' cover-img' : '');
      wrap.innerHTML = `
        <img src="${src}" alt="Photo ${i + 1}" loading="lazy"/>
        ${i === 0 ? '<div class="cover-badge">COVER</div>' : ''}
        <button type="button" class="remove-img" data-index="${i}" title="Remove"><i class="fas fa-times"></i></button>`;
      container.appendChild(wrap);
    });
    $$('.remove-img', container).forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.index;
        if (idx < savedUrls.length) {
          savedUrls.splice(idx, 1);
        } else {
          const fi = idx - savedUrls.length;
          URL.revokeObjectURL(pendingFiles[fi]?.preview);
          pendingFiles.splice(fi, 1);
        }
        buildPreviewStrip();
      });
    });
  }

  function attachImageHandlers() {
    const zone = $('#imgUploadZone');
    const fileInput = $('#vfImageFiles');
    if (!zone || !fileInput) return;

    // Drag & drop
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      handleFiles([...e.dataTransfer.files]);
    });

    fileInput.addEventListener('change', () => {
      handleFiles([...fileInput.files]);
      fileInput.value = ''; // allow re-selecting same file
    });
  }

  function handleFiles(files) {
    const allowed = 10 - savedUrls.length - pendingFiles.length;
    if (allowed <= 0) { toast('⚠️ Maximum 10 photos reached', true); return; }
    const added = files.filter(f => f.type.startsWith('image/')).slice(0, allowed);
    if (!added.length) { toast('⚠️ Only image files are allowed', true); return; }
    added.forEach(file => {
      pendingFiles.push({ file, preview: URL.createObjectURL(file) });
    });
    buildPreviewStrip();
  }

  // URL toggle and input listener for live URL previews
  $('#vfImages')?.addEventListener('input', () => {
    const urlLines = ($('#vfImages').value || '').split('\n').map(s => s.trim()).filter(Boolean);
    savedUrls = urlLines;
    buildPreviewStrip();
  });

  $('#urlToggleBtn')?.addEventListener('click', () => {
    const area = $('#urlArea');
    area.hidden = !area.hidden;
    $('#urlToggleBtn').innerHTML = area.hidden
      ? '<i class="fas fa-link"></i> Add photos by URL instead'
      : '<i class="fas fa-link"></i> Hide URL input';
  });

  attachImageHandlers();

  /* ═══════════════════════════════════════════
     HOURS SELECTOR
  ═══════════════════════════════════════════ */
  function hourLabel(h) {
    if (h === 0)  return '12:00 AM';
    if (h < 12)   return `${h}:00 AM`;
    if (h === 12) return '12:00 PM';
    return `${h - 12}:00 PM`;
  }
  function hourLabelShort(h) {
    if (h === 0)  return '12 AM';
    if (h < 12)   return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  }

  function buildHourSelects(openVal = 6, closeVal = 22) {
    const openSel  = $('#vfOpenHour');
    const closeSel = $('#vfCloseHour');
    if (!openSel || !closeSel) return;

    openSel.innerHTML  = '';
    closeSel.innerHTML = '';

    for (let h = 0; h < 24; h++) {
      openSel.innerHTML  += `<option value="${h}" ${h === openVal  ? 'selected' : ''}>${hourLabel(h)}</option>`;
    }
    for (let h = 1; h <= 24; h++) {
      const val = h === 24 ? 24 : h;
      const lbl = h === 24 ? '12:00 AM (midnight)' : hourLabel(h);
      closeSel.innerHTML += `<option value="${val}" ${val === closeVal ? 'selected' : ''}>${lbl}</option>`;
    }
    updateHoursDisplay();

    openSel.addEventListener('change',  updateHoursDisplay);
    closeSel.addEventListener('change', updateHoursDisplay);
  }

  function updateHoursDisplay() {
    const openH  = +($('#vfOpenHour')?.value  ?? 6);
    const closeH = +($('#vfCloseHour')?.value ?? 22);
    const disp = $('#hoursDisplay');
    if (disp) disp.textContent = `${hourLabelShort(openH)} – ${hourLabelShort(closeH)}`;
  }

  /* ═══════════════════════════════════════════
     CLOSED DATES GRID (next 14 days)
  ═══════════════════════════════════════════ */
  let closedDatesSet = new Set(); // Set of 'YYYY-MM-DD' strings

  function build14DayGrid(existingClosed = []) {
    closedDatesSet = new Set(existingClosed);
    const grid = $('#vfClosedDatesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const iso = getLocalDateString(d);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dateNum = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'date-chip' + (closedDatesSet.has(iso) ? ' closed' : '');
      chip.dataset.date = iso;
      chip.innerHTML = `<span>${dateNum}</span><span class="dc-day">${dayName}</span>`;
      chip.addEventListener('click', () => {
        if (closedDatesSet.has(iso)) { closedDatesSet.delete(iso); chip.classList.remove('closed'); }
        else { closedDatesSet.add(iso); chip.classList.add('closed'); }
      });
      grid.appendChild(chip);
    }
  }

  /* ═══════════════════════════════════════════
     VENUE FORM MODAL
  ═══════════════════════════════════════════ */
  const venueModal = $('#venueModal');

  function openVenueForm(id = null) {
    const v = id ? venues.find(x => x._id === id) : null;

    $('#venueModalTitle').textContent      = v ? 'Edit Venue' : 'Add Venue';
    $('#venueFormSubmitLabel').textContent = v ? 'Save Changes' : 'Add Venue';
    $('#vfId').value       = v ? v._id : '';
    $('#vfName').value     = v ? v.name : '';
    $('#vfSport').value    = v ? v.sport : 'Football';
    $('#vfLocation').value = v ? v.location : '';
    $('#vfPrice').value    = v ? v.price : '';
    $('#vfLength').value   = v?.specs?.length   ?? '';
    $('#vfBreadth').value  = v?.specs?.breadth  ?? '';
    $('#vfHeight').value   = v?.specs?.height   ?? '';
    $('#vfCondition').value = v?.specs?.condition ?? '';
    $('#vfTurfs').value    = v?.specs?.turfs    ?? 1;
    $('#vfTools').value    = v?.specs?.tools    ?? '';
    $('#vfLat').value      = v?.lat ?? '';
    $('#vfLng').value      = v?.lng ?? '';
    $('#vfDescription').value = v?.description || '';

    // Images
    pendingFiles = [];
    savedUrls    = v?.images ? [...v.images] : [];
    $('#vfImages').value = savedUrls.join('\n');
    buildPreviewStrip();
    $('#urlArea').hidden = true;
    $('#urlToggleBtn').innerHTML = '<i class="fas fa-link"></i> Add photos by URL instead';

    // Hours
    buildHourSelects(v?.openHour ?? 6, v?.closeHour ?? 22);

    // Closed dates
    build14DayGrid(v?.closedDates || []);

    // Facilities & slots
    $$('#facilitiesRow input[type="checkbox"]').forEach(cb => { cb.checked = !!(v && v.tags?.includes(cb.value)); });
    $$('#slotsRow input[type="checkbox"]').forEach(cb => { cb.checked = !!(v && v.slots?.includes(cb.value)); });

    venueModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#vfName')?.focus(), 100);
  }

  function closeVenueForm() {
    venueModal.classList.remove('active');
    document.body.style.overflow = '';
    $('#venueForm').reset();
    pendingFiles.forEach(f => URL.revokeObjectURL(f.preview));
    pendingFiles = []; savedUrls = [];
    $('#imgPreviews').innerHTML = '';
  }

  $('#addVenueBtn').addEventListener('click',      () => openVenueForm());
  $('#addVenueBtnEmpty').addEventListener('click', () => openVenueForm());
  $('#venueModalClose').addEventListener('click',  closeVenueForm);
  $('#venueFormCancel').addEventListener('click',  closeVenueForm);
  venueModal.addEventListener('click', e => { if (e.target === venueModal) closeVenueForm(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && venueModal.classList.contains('active')) closeVenueForm(); });

  /* ── FORM SUBMIT ── */
  $('#venueForm').addEventListener('submit', async e => {
    e.preventDefault();
    const id       = $('#vfId').value;
    const name     = $('#vfName').value.trim();
    const location = $('#vfLocation').value.trim();
    const price    = +$('#vfPrice').value;
    const length   = +$('#vfLength').value;
    const breadth  = +$('#vfBreadth').value;

    if (!name)     { toast('⚠️ Venue name is required', true); return; }
    if (!location) { toast('⚠️ Location is required', true);   return; }
    if (!price)    { toast('⚠️ Price per hour is required', true); return; }
    if (!length || !breadth) { toast('⚠️ Length and Breadth are required', true); return; }

    const tags  = $$('#facilitiesRow input:checked').map(c => c.value);
    const slots = $$('#slotsRow input:checked').map(c => c.value);
    const openHour  = +$('#vfOpenHour').value;
    const closeHour = +$('#vfCloseHour').value;

    if (closeHour <= openHour) { toast('⚠️ Close time must be after open time', true); return; }

    // Build image list: upload pending files first, then append saved + URL textarea
    let images = [...savedUrls];

    // URL textarea additions
    const urlLines = ($('#vfImages').value || '').split('\n').map(s => s.trim()).filter(Boolean);
    images = [...images, ...urlLines.filter(u => !images.includes(u))];

    const submitBtn = $('#venueFormSubmit');
    submitBtn.disabled = true;
    $('#venueFormSubmitLabel').textContent = id ? 'Saving…' : 'Adding…';

    // Upload any pending files to Cloudinary (if configured)
    if (pendingFiles.length) {
      toast(`⏳ Uploading ${pendingFiles.length} photo${pendingFiles.length > 1 ? 's' : ''}…`);
      for (const pf of pendingFiles) {
        try {
          const up = await API.venues.uploadImage(pf.file);
          images.unshift(up.url); // Cloudinary URLs go first
        } catch (err) {
          toast(`⚠️ Photo upload failed: ${err.message}`, true);
          console.error('Image upload error:', err);
        }
      }
    }

    // If still no images, fall back to sport default (server handles this too)
    const venueData = {
      name, sport: $('#vfSport').value, location, price,
      specs: {
        length, breadth,
        height:    +$('#vfHeight').value   || 0,
        condition: $('#vfCondition').value.trim() || 'Standard condition',
        tools:     $('#vfTools').value.trim()     || 'Not specified',
        turfs:     +$('#vfTurfs').value           || 1,
      },
      tags, slots, images,
      description: $('#vfDescription').value.trim() || '',
      lat:  $('#vfLat').value  ? +$('#vfLat').value  : null,
      lng:  $('#vfLng').value  ? +$('#vfLng').value  : null,
      openHour, closeHour,
      closedDates: [...closedDatesSet],
    };

    try {
      if (id) { await API.venues.update(id, venueData); toast('✅ Venue updated!'); }
      else    { await API.venues.create(venueData);     toast('🎉 Venue added and live on MyTurfy!'); }
      closeVenueForm();
      await refreshAll();
      setView('venues');
    } catch (err) {
      toast(`❌ ${err.message}`, true);
    } finally {
      submitBtn.disabled = false;
      $('#venueFormSubmitLabel').textContent = id ? 'Save Changes' : 'Add Venue';
    }
  });

  /* ═══════════════════════════════════════════
     BOOKINGS
  ═══════════════════════════════════════════ */
  function populateBookingFilters() {
    $('#bkVenueFilter').innerHTML = '<option value="all">All venues</option>'
      + venues.map(v => `<option value="${v._id}">${v.name}</option>`).join('');
  }
  function renderBookings() {
    const venueF  = $('#bkVenueFilter').value, statusF = $('#bkStatusFilter').value;
    let list = [...bookings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (venueF  !== 'all') list = list.filter(b => (b.venue?._id || b.venue) === venueF);
    if (statusF !== 'all') {
      if (statusF === 'refund_requested') {
        list = list.filter(b => b.refundStatus === 'requested');
      } else {
        list = list.filter(b => b.status === statusF);
      }
    }
    $('#bookingsTable tbody').innerHTML = list.length
      ? list.map(b => {
          let statusPill = `<span class="status-pill status-${b.status}">${b.status}</span>`;
          let actions = '';

          const pct = b.refundPct !== undefined ? b.refundPct : 100;
          const refAmt = b.refundAmount !== undefined ? b.refundAmount : Math.round(((b.amount || 0) * pct) / 100);

          if (b.refundStatus === 'requested') {
            statusPill = `<span class="status-pill" style="background:rgba(255,152,0,0.15);color:#ff9800;border:1px solid rgba(255,152,0,0.3);font-weight:700">Refund Requested (${pct}% - ₹${refAmt.toLocaleString('en-IN')})</span>`;
            actions = `<span style="font-size:11px;color:var(--muted);font-weight:600"><i class="fas fa-shield-halved" style="color:var(--green)"></i> Pending Admin Review</span>`;
          } else if (b.refundStatus === 'approved') {
            statusPill = `<span class="status-pill" style="background:rgba(0,200,83,0.15);color:#00c853;border:1px solid rgba(0,200,83,0.3)">${pct}% Refunded (₹${refAmt.toLocaleString('en-IN')})</span>`;
          } else if (b.refundStatus === 'rejected') {
            statusPill = `<span class="status-pill" style="background:rgba(239,83,80,0.15);color:#ef5350;border:1px solid rgba(239,83,80,0.3)">Refund Rejected</span>`;
          } else if (b.status === 'upcoming') {
            actions = `<button class="row-action bk-cancel" data-id="${b._id}">Cancel</button>`;
          }

          return `<tr>
            <td>${b.customer?.name || 'Customer'}</td><td>${b.venue?.name || '—'}</td>
            <td>${b.date || '—'}</td><td>${b.time || '—'}</td>
            <td>₹${(b.amount || 0).toLocaleString('en-IN')}</td>
            <td>${statusPill}</td>
            <td>${actions}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="7" style="color:var(--muted);text-align:center;padding:24px">No bookings match these filters</td></tr>`;

    $$('.bk-cancel').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Cancel this booking?')) return;
      try { await API.bookings.cancel(btn.dataset.id); toast('Booking cancelled'); await refreshAll(); }
      catch (err) { toast(`❌ ${err.message}`, true); }
    }));
  }
  $('#bkVenueFilter').addEventListener('change',  renderBookings);
  $('#bkStatusFilter').addEventListener('change', renderBookings);

  /* ═══════════════════════════════════════════
     EARNINGS
  ═══════════════════════════════════════════ */
  function renderEarnings() {
    const commPct   = 0.10;
    const completed = bookings.filter(b => b.status !== 'cancelled');
    const total     = completed.reduce((s, b) => s + (b.amount || 0), 0);
    const net       = Math.round(total * (1 - commPct));
    const pending   = Math.round(bookings.filter(b => b.status === 'upcoming').reduce((s, b) => s + (b.amount || 0), 0) * (1 - commPct));
    $('#earnTotal').textContent   = '₹' + net.toLocaleString('en-IN');
    $('#earnPending').textContent = '₹' + pending.toLocaleString('en-IN');

    const chart = $('#monthChart');
    if (!completed.length) {
      chart.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:30px 0">No completed bookings yet.</p>';
      $('#payoutTable tbody').innerHTML = `<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:20px">No payout history yet</td></tr>`;
      return;
    }
    const monthMap = {};
    completed.forEach(b => {
      const key = new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      monthMap[key] = (monthMap[key] || 0) + (b.amount || 0);
    });
    const entries = Object.entries(monthMap).slice(-6);
    const maxVal  = Math.max(1, ...entries.map(([, v]) => v));
    chart.innerHTML = entries.map(([label, val]) => `
      <div class="bar-col">
        <div class="bar-fill" style="height:${Math.max(4, val / maxVal * 100)}%">
          <span class="bar-val">₹${(val / 1000).toFixed(1)}k</span>
        </div>
        <span class="bar-label">${label}</span>
      </div>`).join('');
    $('#payoutTable tbody').innerHTML = entries.map(([label, val], i) => `<tr>
      <td>#PAY-${String(i + 1).padStart(3, '0')}</td>
      <td>${label}</td>
      <td>₹${Math.round(val * (1 - commPct)).toLocaleString('en-IN')}</td>
      <td><span class="status-pill status-completed">Settled</span></td>
    </tr>`).join('');
  }

  /* ═══════════════════════════════════════════
     REVIEWS
  ═══════════════════════════════════════════ */
  function renderReviews() {
    const list = $('#reviewsList');
    if (!reviews.length) { list.innerHTML = `<p style="color:var(--muted);font-size:14px;padding:20px 0">No reviews yet — they'll appear here once customers rate your venues.</p>`; return; }
    list.innerHTML = reviews.map(r => {
      const stars = '★'.repeat(Math.round(r.rating || 0)) + '☆'.repeat(5 - Math.round(r.rating || 0));
      return `
      <div class="review-card" data-id="${r._id}">
        <div class="review-top">
          <div><div class="review-customer">${r.customer?.name || 'Customer'}</div><div class="review-venue">${r.venue?.name || '—'}</div></div>
          <div class="review-stars">${stars} ${r.rating}</div>
        </div>
        <p class="review-text">${r.text || ''}</p>
        ${r.reply
          ? `<div class="review-reply"><strong>Your reply:</strong> ${r.reply}</div>`
          : `<div class="reply-form">
               <input type="text" class="reply-input" placeholder="Write a reply…"/>
               <button class="btn-secondary reply-send" data-id="${r._id}" style="white-space:nowrap;padding:8px 14px;font-size:12px">Reply</button>
             </div>`}
      </div>`;
    }).join('');
    $$('.reply-send').forEach(btn => btn.addEventListener('click', async () => {
      const text = btn.closest('.review-card').querySelector('.reply-input')?.value?.trim();
      if (!text) { toast('⚠️ Write a reply first', true); return; }
      btn.textContent = 'Sending…'; btn.disabled = true;
      try { await API.reviews.reply(btn.dataset.id, text); toast('💬 Reply posted!'); await refreshAll(); }
      catch (err) { toast(`❌ ${err.message}`, true); btn.textContent = 'Reply'; btn.disabled = false; }
    }));
  }

  /* ═══════════════════════════════════════════
     QR SCANNER
  ═══════════════════════════════════════════ */
  // Method switching
  $('#qrMethodBtn')?.addEventListener('click', () => {
    $('#qrMethodPanel').style.display = 'block';
    $('#emailMethodPanel').style.display = 'none';
    $('#qrMethodBtn').style.background = 'var(--green)';
    $('#qrMethodBtn').style.color = '#04140a';
    $('#qrMethodBtn').style.borderColor = 'var(--green)';
    $('#emailMethodBtn').style.background = '';
    $('#emailMethodBtn').style.color = '';
    $('#emailMethodBtn').style.borderColor = '';
    resetVerification();
  });

  $('#emailMethodBtn')?.addEventListener('click', () => {
    $('#emailMethodPanel').style.display = 'block';
    $('#qrMethodPanel').style.display = 'none';
    $('#emailMethodBtn').style.background = 'var(--green)';
    $('#emailMethodBtn').style.color = '#04140a';
    $('#emailMethodBtn').style.borderColor = 'var(--green)';
    $('#qrMethodBtn').style.background = '';
    $('#qrMethodBtn').style.color = '';
    $('#qrMethodBtn').style.borderColor = '';
    resetVerification();
  });

  function resetVerification() {
    $('#qrResult').style.display = 'none';
    $('#qrResultSuccess').style.display = 'none';
    $('#qrResultError').style.display = 'none';
    $('#emailStep1').style.display = 'block';
    $('#emailStep2').style.display = 'none';
    $('#customerEmailInput').value = '';
    $('#otpInput').value = '';
  }

  // QR Code validation
  $('#validateQrBtn')?.addEventListener('click', async () => {
    const qrCodeData = $('#qrCodeInput').value.trim();
    if (!qrCodeData) { toast('⚠️ Please enter QR code or booking ID', true); return; }

    const btn = $('#validateQrBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validating…';
    btn.disabled = true;

    const resultDiv = $('#qrResult');
    const successDiv = $('#qrResultSuccess');
    const errorDiv = $('#qrResultError');

    resultDiv.style.display = 'block';
    successDiv.style.display = 'none';
    errorDiv.style.display = 'none';

    try {
      const res = await API.bookings.validateQr(qrCodeData);
      successDiv.style.display = 'block';
      $('#qrCustomerName').textContent = res.data.customerName;
      $('#qrVenueName').textContent = res.data.venueName;
      $('#qrAmount').textContent = '₹' + res.data.amount.toLocaleString('en-IN');
      $('#qrValidatedAt').textContent = new Date(res.data.validatedAt).toLocaleString();
      toast('✅ QR code validated successfully!');
      $('#qrCodeInput').value = '';
    } catch (err) {
      errorDiv.style.display = 'block';
      $('#qrErrorMessage').textContent = err.message || 'Validation failed';
      toast('❌ QR code validation failed', true);
    } finally {
      btn.innerHTML = '<i class="fas fa-check"></i> Validate';
      btn.disabled = false;
    }
  });

  $('#qrCodeInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') $('#validateQrBtn')?.click();
  });

  // Email verification - Send OTP
  let currentEmail = '';
  $('#sendOtpBtn')?.addEventListener('click', async () => {
    const email = $('#customerEmailInput').value.trim();
    if (!email) { toast('⚠️ Please enter customer email', true); return; }

    const btn = $('#sendOtpBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
    btn.disabled = true;

    try {
      const res = await API.bookings.sendVerificationOtp(email);
      currentEmail = email;
      $('#emailStep1').style.display = 'none';
      $('#emailStep2').style.display = 'block';
      toast('✅ Verification code sent!');

      if (res.devCode) {
        $('#otpInput').value = res.devCode;
        toast('🔧 Dev mode: OTP auto-filled');
      }
    } catch (err) {
      toast('❌ ' + (err.message || 'Failed to send code'), true);
    } finally {
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Code';
      btn.disabled = false;
    }
  });

  // Email verification - Verify OTP
  $('#verifyOtpBtn')?.addEventListener('click', async () => {
    const otp = $('#otpInput').value.trim();
    if (!otp || otp.length !== 6) { toast('⚠️ Please enter 6-digit code', true); return; }

    const btn = $('#verifyOtpBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying…';
    btn.disabled = true;

    const resultDiv = $('#qrResult');
    const successDiv = $('#qrResultSuccess');
    const errorDiv = $('#qrResultError');

    resultDiv.style.display = 'block';
    successDiv.style.display = 'none';
    errorDiv.style.display = 'none';

    try {
      const res = await API.bookings.verifyOtp(currentEmail, otp);
      successDiv.style.display = 'block';
      $('#qrCustomerName').textContent = res.data.customerName;
      $('#qrVenueName').textContent = res.data.venueName;
      $('#qrAmount').textContent = '₹' + res.data.amount.toLocaleString('en-IN');
      $('#qrValidatedAt').textContent = new Date(res.data.validatedAt).toLocaleString();
      toast('✅ Booking verified successfully!');
      resetVerification();
    } catch (err) {
      errorDiv.style.display = 'block';
      $('#qrErrorMessage').textContent = err.message || 'Verification failed';
      toast('❌ Verification failed', true);
    } finally {
      btn.innerHTML = '<i class="fas fa-check"></i> Verify';
      btn.disabled = false;
    }
  });

  $('#otpInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') $('#verifyOtpBtn')?.click();
  });

  // Resend OTP
  $('#resendOtpBtn')?.addEventListener('click', async () => {
    const btn = $('#resendOtpBtn');
    btn.textContent = 'Sending…';
    btn.disabled = true;

    try {
      const res = await API.bookings.sendVerificationOtp(currentEmail);
      toast('✅ New code sent!');
      if (res.devCode) {
        $('#otpInput').value = res.devCode;
        toast('🔧 Dev mode: OTP auto-filled');
      }
    } catch (err) {
      toast('❌ Failed to resend code', true);
    } finally {
      btn.textContent = 'Resend Code';
      btn.disabled = false;
    }
  });

  /* ═══════════════════════════════════════════
     SETTINGS
  ═══════════════════════════════════════════ */
  function fillSettingsForm() {
    if (!session) return;
    $('#setName').value  = session.name  || '';
    $('#setEmail').value = session.email || '';
    $('#setPhone').value = session.phone || '';
    $('#setCity').value  = session.city  || '';

    if (session.payout) {
      $('#setBankName').value = session.payout.bankAccountHolder || '';
      $('#setAccNo').value    = session.payout.accountNumber || '';
      $('#setIfsc').value     = session.payout.ifsc || '';
      $('#setUpi').value      = session.payout.upi || '';
    }
    checkMissingPayoutAlert();
  }

  function checkMissingPayoutAlert() {
    if (!session) return;
    const p = session.payout || {};
    const hasPayout = !!(p.accountNumber || p.upi || p.ifsc || p.bankAccountHolder);
    const alertEl = $('#payoutMissingAlert');
    if (alertEl) {
      if (!hasPayout) {
        alertEl.style.display = 'block';
        alertEl.innerHTML = `
          <div style="background:rgba(255,152,0,0.15);border:1px solid rgba(255,152,0,0.4);border-radius:12px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#ffb300">
            <div style="display:flex;align-items:center;gap:12px">
              <i class="fas fa-exclamation-triangle" style="font-size:22px"></i>
              <div>
                <strong style="font-size:14px;color:#fff">Bank / UPI Payout Details Missing</strong>
                <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px">Your booking payouts & cancellation compensations remain securely held in escrow until payout details are added.</div>
              </div>
            </div>
            <button id="addPayoutDetailsBtn" style="background:#ff9800;color:#04140a;border:none;padding:8px 16px;border-radius:20px;font-weight:700;cursor:pointer;white-space:nowrap">Add Details</button>
          </div>`;
        alertEl.querySelector('#addPayoutDetailsBtn')?.addEventListener('click', () => {
          setView('settings');
        });
      } else {
        alertEl.style.display = 'none';
      }
    }
  }
  $('#saveProfileBtn').addEventListener('click', async () => {
    const name = $('#setName').value.trim();
    if (!name) { toast('⚠️ Name cannot be empty', true); return; }
    const btn = $('#saveProfileBtn'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; btn.disabled = true;
    try {
      const res = await API.auth.updateProfile({
        name,
        phone: $('#setPhone').value.trim(),
        city: $('#setCity').value.trim()
      });
      session = res.data;
      Auth.saveSession(Auth.getToken(), session);
      $('#ownerNameTop').textContent     = session.name;
      $('#welcomeOwnerName').textContent = session.name.split(' ')[0];
      $('#ownerAvatar').textContent      = (session.name[0] || 'P').toUpperCase();
      toast('✅ Profile saved!');
    } catch (err) {
      toast(`❌ ${err.message}`, true);
    } finally {
      btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Save Changes'; btn.disabled = false;
    }
  });
  $('#savePayoutBtn').addEventListener('click', async () => {
    const bankAccountHolder = $('#setBankName').value.trim();
    const accountNumber     = $('#setAccNo').value.trim();
    const ifsc              = $('#setIfsc').value.trim();
    const upi               = $('#setUpi').value.trim();
    if (!bankAccountHolder && !accountNumber && !ifsc && !upi) {
      toast('⚠️ Fill in at least one payout field.', true); return;
    }
    const btn = $('#savePayoutBtn'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; btn.disabled = true;
    try {
      const res = await API.auth.updatePayout({ bankAccountHolder, accountNumber, ifsc, upi });
      session = res.data;
      Auth.saveSession(Auth.getToken(), session);
      checkMissingPayoutAlert();
      toast('✅ Payout info saved!');
    } catch (err) {
      toast(`❌ ${err.message}`, true);
    } finally {
      btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Save Payout Info'; btn.disabled = false;
    }
  });

  /* ═══════════════════════════════════════════
     OFFLINE BOOKINGS & SLOT CONTROL
  ═══════════════════════════════════════════ */
  function populateOfflineBookingVenues() {
    const obVenue = $('#obVenue');
    const mcVenue = $('#mcVenue');
    if (!obVenue || !mcVenue) return;

    const currentObVal = obVenue.value;
    const currentMcVal = mcVenue.value;

    const options = venues.map(v => `<option value="${v._id}">${v.name}</option>`).join('');
    obVenue.innerHTML = options;
    mcVenue.innerHTML = options;

    if (currentObVal) obVenue.value = currentObVal;
    if (currentMcVal) mcVenue.value = currentMcVal;
  }

  // Set default dates to today
  const todayISO = getLocalDateString(new Date());
  if ($('#obDate') && !$('#obDate').value) $('#obDate').value = todayISO;
  if ($('#mcDate') && !$('#mcDate').value) $('#mcDate').value = todayISO;

  let obSelectedHour = null;

  function loadOfflineBookingSlots() {
    const venueId = $('#obVenue')?.value;
    const date = $('#obDate')?.value;
    const container = $('#obSlotsContainer');
    const msgEl = $('#obSlotsMessage');
    if (!venueId || !date || !container) return;

    const v = venues.find(x => x._id === venueId);
    if (!v) return;

    const openH = v.openHour ?? 6;
    const closeH = v.closeHour ?? 22;

    // Filter non-cancelled bookings for this venue and date
    const vBookings = bookings.filter(b => {
      const vId = b.venue?._id || b.venue;
      return vId === venueId && b.date === date && b.status !== 'cancelled';
    });

    const bookedHours = new Set();
    vBookings.forEach(b => {
      const startH = parseInt(b.time.split(':')[0], 10);
      for (let i = 0; i < (b.durationHours || 1); i++) {
        bookedHours.add(startH + i);
      }
    });

    container.innerHTML = '';
    obSelectedHour = null;
    $('#obSubmitBtn').disabled = true;

    const duration = +$('#obDuration').value || 1;
    let slotCount = 0;

    for (let h = openH; h < closeH; h++) {
      let isBlocked = false;
      for (let i = 0; i < duration; i++) {
        if (h + i >= closeH || bookedHours.has(h + i)) {
          isBlocked = true;
          break;
        }
      }

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'date-chip' + (isBlocked ? ' closed' : '');
      chip.disabled = isBlocked;
      chip.innerHTML = `<span>${hourLabel(h)}</span>`;

      if (!isBlocked) {
        slotCount++;
        chip.addEventListener('click', () => {
          $$('#obSlotsContainer button').forEach(c => {
            if (!c.classList.contains('closed')) c.style.borderColor = 'var(--border)';
          });
          chip.style.borderColor = 'var(--green)';
          obSelectedHour = h;
          $('#obSubmitBtn').disabled = false;
        });
      }
      container.appendChild(chip);
    }

    if (msgEl) {
      msgEl.textContent = slotCount > 0 
        ? 'Select an available start time slot above.' 
        : 'No available slots match the selected duration on this date.';
    }
  }

  function loadSlotControlTable() {
    const venueId = $('#mcVenue')?.value;
    const date = $('#mcDate')?.value;
    const tbody = $('#mcSlotsTable tbody');
    if (!venueId || !date || !tbody) return;

    const v = venues.find(x => x._id === venueId);
    if (!v) return;

    const openH = v.openHour ?? 6;
    const closeH = v.closeHour ?? 22;

    const vBookings = bookings.filter(b => {
      const vId = b.venue?._id || b.venue;
      return vId === venueId && b.date === date;
    });

    tbody.innerHTML = '';

    for (let h = openH; h < closeH; h++) {
      const activeBooking = vBookings.find(b => {
        const startH = parseInt(b.time.split(':')[0], 10);
        const endH = startH + (b.durationHours || 1);
        return h >= startH && h < endH;
      });

      const row = document.createElement('tr');
      const timeString = hourLabel(h);

      if (activeBooking) {
        const custName = activeBooking.customer?.name || 'Offline Customer';
        const custPhone = activeBooking.customer?.phone || '—';
        const status = activeBooking.status;

        row.innerHTML = `
          <td><strong>${timeString}</strong></td>
          <td>${custName}</td>
          <td>${custPhone}</td>
          <td><span class="status-pill status-${status}">${status}</span></td>
          <td>
            ${status !== 'cancelled'
              ? `<button class="row-action mc-cancel" data-id="${activeBooking._id}" style="color:var(--red)"><i class="fas fa-ban"></i> Cancel/Unblock</button>`
              : '—'}
          </td>
        `;
      } else {
        row.innerHTML = `
          <td><strong>${timeString}</strong></td>
          <td colspan="3" style="color:var(--green);font-size:12px"><i class="fas fa-check-circle"></i> Available / Open</td>
          <td>—</td>
        `;
      }
      tbody.appendChild(row);
    }

    $$('.mc-cancel', tbody).forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Cancel and unblock this slot immediately?')) return;
        try {
          await API.bookings.cancel(btn.dataset.id);
          toast('Slot unblocked/cancelled successfully!');
          await refreshAll();
        } catch (err) {
          toast(`❌ ${err.message}`, true);
        }
      });
    });
  }

  // Handle Offline Booking Form submit
  $('#offlineBookingForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (obSelectedHour === null) return;

    const venueId = $('#obVenue').value;
    const date = $('#obDate').value;
    const duration = +$('#obDuration').value || 1;
    const customerName = $('#obCustName').value.trim();
    const customerPhone = $('#obCustPhone').value.trim();
    const submitBtn = $('#obSubmitBtn');

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Booking…';

    try {
      const timeString = `${String(obSelectedHour).padStart(2, '0')}:00`;
      await API.bookings.createOffline(venueId, date, timeString, duration, customerName, customerPhone);
      toast('🎉 Offline booking created!');
      $('#obCustName').value = '';
      $('#obCustPhone').value = '';
      obSelectedHour = null;
      await refreshAll();
    } catch (err) {
      toast(`❌ ${err.message}`, true);
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-check"></i> Book Selected Slot';
    }
  });

  // Attach event listeners for updates
  $('#obVenue')?.addEventListener('change', loadOfflineBookingSlots);
  $('#obDate')?.addEventListener('change', loadOfflineBookingSlots);
  $('#obDuration')?.addEventListener('change', loadOfflineBookingSlots);

  $('#mcVenue')?.addEventListener('change', loadSlotControlTable);
  $('#mcDate')?.addEventListener('change', loadSlotControlTable);

  /* ═══════════════════════════════════════════
     RENDER ALL
  ═══════════════════════════════════════════ */
  function renderAll() { 
    populateBookingFilters(); 
    renderOverview(); 
    renderVenues(); 
    renderBookings(); 
    renderEarnings(); 
    renderReviews(); 
    populateOfflineBookingVenues();
    loadOfflineBookingSlots();
    loadSlotControlTable();
  }

  /* ═══════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════ */
  if (Auth.isLoggedIn() && Auth.getUser()?.role === 'owner') {
    await initDashboard();
  } else {
    showAuthScreen();
  }

  console.log('🏟️ MyTurfy Partner dashboard ready');
});
