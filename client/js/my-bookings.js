/* =============================================
   MYTURFY — my-bookings.js
   ============================================= */

document.addEventListener('DOMContentLoaded', async () => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const SPORT_IMG = {
    Football: 'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=400&q=80',
    Cricket: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=400&q=80',
    Basketball: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&q=80',
    Pickleball: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=400&q=80',
    Bowling: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=400&q=80',
    Pool: 'https://images.unsplash.com/photo-1599058917765-a780eda07a3e?w=400&q=80',
    Badminton: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=400&q=80',
    Tennis: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&q=80',
    default: 'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=400&q=80'
  };

  const getSportImg = (s) => SPORT_IMG[s] || SPORT_IMG.default;

  /* ── TOAST ── */
  function toast(msg, isError = false) {
    const host = $('#toastHost');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 400);
    }, 3500);
  }

  /* ── LIVE MATCH CARD — Swiggy Tracking Style ── */
  async function loadLiveMatchCard() {
    const container = $('#liveMatchContainer');
    if (!container || !Auth.isLoggedIn()) return;
    try {
      const res = await API.bookings.getLiveTicket();
      const b = res.data;
      if (!b || !b.venue) { container.style.display = 'none'; return; }

      const venue = b.venue;
      const dest = (venue.lat != null && venue.lng != null)
        ? `${venue.lat},${venue.lng}`
        : encodeURIComponent(`${venue.name}, ${venue.location}`);
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(b.qrCodeData || b._id)}`;
      const SPORT_EMOJI = { Football:'⚽',Cricket:'🏏',Basketball:'🏀',Pickleball:'🏓',Bowling:'🎳',Pool:'🎱',Badminton:'🏸',Tennis:'🎾' };
      const sportEmoji = SPORT_EMOJI[venue.sport] || '🏟️';

      function formatCountdown(ms) {
        if (ms <= 0) return { text: 'Match started!', color: '#ef5350', urgent: true };
        const s = Math.floor(ms / 1000);
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
        const m = Math.floor((s % 3600) / 60), sec = s % 60;
        let text = d > 0 ? `${d}d ${h}h ${m}m`
          : h > 0 ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
          : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
        const urgent = ms < 3600000;
        return { text, color: urgent ? '#ef5350' : ms < 86400000 ? '#ffb300' : '#00c853', urgent };
      }

      const slotMs = (() => {
        try {
          const [y, m, d] = b.date.split('-').map(Number);
          const h = parseInt((b.time || '0').split(':')[0], 10);
          return new Date(y, m - 1, d, h, 0, 0).getTime();
        } catch(_) { return null; }
      })();

      container.innerHTML = `
        <div class="live-card" id="liveCardEl">
          <div class="live-card-header">
            <div class="live-pulse"></div>
            <span class="live-tag">UPCOMING MATCH</span>
            <span class="live-sport">${sportEmoji} ${venue.sport}</span>
          </div>
          <div class="live-card-body">
            <div class="live-venue-info">
              <div class="live-venue-name">${venue.name}</div>
              <div class="live-venue-loc"><i class="fas fa-map-marker-alt"></i> ${venue.location} &middot; Court ${b.courtNumber || 1}</div>
              <div class="live-venue-dt"><i class="far fa-calendar-alt"></i> ${b.date} &nbsp;&middot;&nbsp; <i class="far fa-clock"></i> ${b.time}</div>
            </div>
            <div class="live-countdown-block">
              <div class="live-countdown-label">Game starts in</div>
              <div class="live-countdown-val" id="liveCDVal">--:--</div>
              <div class="live-countdown-sub" id="liveCDSub">Calculating&hellip;</div>
            </div>
          </div>
          <div class="live-card-actions">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${dest}" target="_blank" rel="noopener" class="live-action-btn live-nav-btn">
              <i class="fas fa-diamond-turn-right"></i> Navigate
            </a>
            <button class="live-action-btn live-qr-btn" id="showLiveQrBtn">
              <i class="fas fa-qrcode"></i> QR Pass
            </button>
            <a href="venue-detail.html?id=${venue._id}" class="live-action-btn live-view-btn">
              <i class="fas fa-eye"></i> View Venue
            </a>
          </div>
        </div>`;
      container.style.display = 'block';

      if (slotMs) {
        const tick = () => {
          const diff = slotMs - Date.now();
          const { text, color, urgent } = formatCountdown(diff);
          const cdEl = $('#liveCDVal'), subEl = $('#liveCDSub'), card = $('#liveCardEl');
          if (cdEl) { cdEl.textContent = text; cdEl.style.color = color; }
          if (subEl) subEl.textContent = urgent ? '🔴 Head to the venue now!' : 'Stay ready for your game!';
          if (card) card.classList.toggle('live-card-urgent', urgent);
        };
        tick();
        setInterval(tick, 1000);
      }

      // QR Modal
      $('#showLiveQrBtn')?.addEventListener('click', () => {
        const ov = document.createElement('div');
        ov.className = 'qr-modal-overlay';
        ov.innerHTML = `
          <div class="qr-modal-box">
            <div class="qr-venue-name">${venue.name}</div>
            <div class="qr-meta">Court ${b.courtNumber || 1} &middot; ${b.date} &middot; ${b.time}</div>
            <img src="${qrUrl}" alt="QR Entry Pass" class="qr-img" />
            <p class="qr-hint">Show this QR code at the venue entrance</p>
            <div class="qr-booking-id">Booking #${b._id.slice(-8).toUpperCase()}</div>
            <button class="qr-close-btn" id="qrCloseBtn">Close Pass</button>
          </div>`;
        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('active'));
        const close = () => { ov.classList.remove('active'); setTimeout(() => ov.remove(), 300); };
        ov.querySelector('#qrCloseBtn')?.addEventListener('click', close);
        ov.addEventListener('click', e => { if (e.target === ov) close(); });
      });
    } catch(_) {}
  }

  /* ── INITIALIZE AUTH & NAVBAR ── */
  Auth.syncNavbar();
  Auth.initAuthModal(toast);

  // Setup Auth callbacks
  window.AuthCallbacks = {
    onSuccess: () => {
      toast('👋 Logged in successfully!');
      Auth.syncNavbar();
      initBookings();
    },
    onError: (err) => {
      toast(`❌ Auth Error: ${err.message}`, true);
    }
  };

  // Navbar dropdown & search triggers
  const cityBtn = $('#cityBtn'), cityMenu = $('#cityMenu'), menuBtn = $('#menuBtn'), profileMenu = $('#profileMenu');
  function toggleDrop(menu) { if (!menu) return; const open = menu.classList.contains('open'); $$('.dropdown-menu.open').forEach(m => m.classList.remove('open')); if (!open) menu.classList.add('open'); }
  cityBtn?.addEventListener('click', e => { e.stopPropagation(); toggleDrop(cityMenu); });
  menuBtn?.addEventListener('click', e => { e.stopPropagation(); toggleDrop(profileMenu); });
  document.addEventListener('click', () => $$('.dropdown-menu.open').forEach(m => m.classList.remove('open')));

  /* ── INITIALIZE ── */
  async function initBookings() {
    const container = $('#bookingsMainContent');
    if (!container) return;

    if (!Auth.isLoggedIn()) {
      renderSignInPrompt(container);
      return;
    }

    const user = Auth.getUser();
    if (user && user.role === 'owner') {
      renderPartnerPrompt(container, user);
      return;
    }

    renderSkeletons(container);

    try {
      const res = await API.bookings.mine();
      const bookings = res.data || [];
      renderBookingsList(container, bookings);
    } catch (err) {
      if (err.message && (err.message.includes('401') || err.message.includes('token') || err.message.includes('authorized') || err.message.includes('Not authorized'))) {
        Auth.clearToken();
        Auth.syncNavbar();
        renderSignInPrompt(container);
      } else if (err.message && err.message.includes('customer accounts')) {
        renderPartnerPrompt(container, user || { name: 'Partner' });
      } else {
        container.innerHTML = `
          <div style="text-align:center; padding: 40px; color: var(--red);">
            <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px;"></i>
            <p>Failed to load bookings: ${err.message}</p>
            <button class="btn-signin-prompt" style="margin-top: 14px;" onclick="window.location.reload()">Retry</button>
          </div>
        `;
      }
    }
  }

  /* ── INIT ── */
  initBookings();
  loadLiveMatchCard();

  /* ── RENDER PARTNER PROMPT ── */
  function renderPartnerPrompt(container, user) {
    container.innerHTML = `
      <div class="signin-prompt">
        <div class="signin-prompt-icon" style="background: rgba(0, 200, 83, 0.15); color: var(--green);"><i class="fas fa-warehouse"></i></div>
        <h2>Signed in as Partner (${user.name})</h2>
        <p>This reservation history page is for customer slot bookings. As a venue partner, you can manage your venue bookings, walk-ins, earnings, and customer refund requests in your Partner Dashboard.</p>
        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 18px;">
          <a href="owner-portal.html" class="btn-signin-prompt" style="text-decoration: none;">Go to Partner Dashboard <i class="fas fa-arrow-right"></i></a>
          <button class="btn-signin-prompt" id="switchAccountBtn" style="background: var(--dark3); border: 1px solid var(--border); color: var(--text);">Switch to Customer Account</button>
        </div>
      </div>
    `;

    $('#switchAccountBtn')?.addEventListener('click', () => {
      Auth.clearToken();
      Auth.syncNavbar();
      initBookings();
      if (typeof Auth.openSignin === 'function') {
        Auth.openSignin();
      }
    });
  }

  /* ── RENDER SKELETONS ── */
  function renderSkeletons(container) {
    container.innerHTML = `
      <div class="bookings-toolbar">
        <div class="bk-result-count"><div class="bk-skeleton-line" style="width: 100px;"></div></div>
      </div>
      <div class="bookings-grid">
        ${Array(4).fill(0).map(() => `
          <div class="bk-skeleton">
            <div class="bk-skeleton-img"></div>
            <div class="bk-skeleton-body">
              <div class="bk-skeleton-line" style="width: 70%;"></div>
              <div class="bk-skeleton-line" style="width: 45%;"></div>
              <div class="bk-skeleton-line" style="width: 90%;"></div>
              <div class="bk-skeleton-line" style="width: 30%;"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /* ── RENDER SIGN-IN PROMPT ── */
  function renderSignInPrompt(container) {
    container.innerHTML = `
      <div class="signin-prompt">
        <div class="signin-prompt-icon"><i class="fas fa-calendar-alt"></i></div>
        <h2>Sign In to View Bookings</h2>
        <p>You need to be logged in as a customer to view, cancel, or request refunds for your sports spots.</p>
        <button class="btn-signin-prompt" id="promptSignInBtn">Sign In / Register <i class="fas fa-arrow-right"></i></button>
      </div>
    `;

    $('#promptSignInBtn')?.addEventListener('click', () => {
      if (typeof Auth.openSignin === 'function') {
        Auth.openSignin();
      } else {
        $('#signinModal')?.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    });
  }

  /* ── RENDER BOOKINGS LIST ── */
  function renderBookingsList(container, bookings) {
    if (!bookings.length) {
      container.innerHTML = `
        <div class="bookings-empty">
          <div class="bookings-empty-icon"><i class="far fa-calendar-times"></i></div>
          <h2>No bookings found</h2>
          <p>You haven't booked any slots yet. Find your favourite court and make your first booking today!</p>
          <a href="index.html" class="btn-explore-bookings">Explore Venues <i class="fas fa-futbol"></i></a>
        </div>
      `;
      return;
    }

    // Helper: format hour labels
    const formatHour = (hStr) => {
      const h = parseInt(hStr.split(':')[0], 10);
      if (h === 0) return '12:00 AM';
      if (h < 12) return `${h}:00 AM`;
      if (h === 12) return '12:00 PM';
      return `${h - 12}:00 PM`;
    };

    const cardsHtml = bookings.map((b) => {
      const venue = b.venue || {};
      const img = (venue.images && venue.images[0]) || getSportImg(venue.sport);
      
      const splitPayments = b.splitPayments || [];
      const paidAmount = b.isSplit
        ? splitPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
        : (b.paymentStatus === 'paid' ? b.amount : 0);

      // Determine Display Status and Color
      let statusText = b.status;
      let statusClass = 'status-upcoming-mb';
      
      const pct = b.refundPct !== undefined ? b.refundPct : 100;
      const refAmt = b.refundAmount !== undefined ? b.refundAmount : Math.round(((b.amount || 0) * pct) / 100);

      if (b.isSplit && b.splitStatus === 'active') {
        statusText = `⏳ Split Pending (₹${paidAmount} / ₹${b.amount || 0})`;
        statusClass = 'status-refund-req-mb';
      } else if (b.isSplit && b.splitStatus === 'expired') {
        statusText = 'Split Expired / Cancelled';
        statusClass = 'status-cancelled-mb';
      } else if (b.refundStatus === 'approved') {
        statusText = `${pct}% Refunded (₹${refAmt.toLocaleString('en-IN')})`;
        statusClass = 'status-refunded-mb';
      } else if (b.refundStatus === 'requested') {
        statusText = `Process Ongoing (Pending Admin Review - ${pct}% ₹${refAmt.toLocaleString('en-IN')})`;
        statusClass = 'status-refund-req-mb';
      } else if (b.refundStatus === 'rejected') {
        statusText = 'Refund Declined by Admin (Slot Retained)';
        statusClass = 'status-upcoming-mb';
      } else if (b.status === 'hold' && !b.isSplit) {
        statusText = '⏱️ Payment Pending (5-min Hold)';
        statusClass = 'status-refund-req-mb';
      } else if (b.status === 'cancelled') {
        statusText = 'Cancelled / Expired';
        statusClass = 'status-cancelled-mb';
      } else if (b.status === 'completed') {
        statusText = 'Completed';
        statusClass = 'status-completed-mb';
      } else if (b.isSplit && b.splitStatus === 'completed') {
        statusText = 'Upcoming (Split 100% Paid)';
        statusClass = 'status-upcoming-mb';
      }

      const priceLabel = (b.isSplit && b.paymentStatus !== 'paid') ? 'Split Collected' : 'Amount Paid';
      const priceDisplay = (b.isSplit && b.paymentStatus !== 'paid')
        ? `₹${paidAmount.toLocaleString('en-IN')} <span style="font-size:12px;color:var(--muted);font-weight:400">/ ₹${(b.amount || 0).toLocaleString('en-IN')}</span>`
        : `₹${(b.amount || 0).toLocaleString('en-IN')}`;

      // Action buttons conditionality
      const isUpcoming = b.status === 'upcoming' && b.paymentStatus === 'paid' && b.refundStatus !== 'requested' && b.refundStatus !== 'approved';
      const isPendingSplit = b.isSplit && b.splitStatus === 'active' && b.status !== 'cancelled';

      return `
        <div class="mb-card" data-id="${b._id}">
          <div class="mb-img-wrap">
            <img src="${img}" alt="${venue.name || 'Venue'}" class="mb-img" loading="lazy"/>
            <span class="mb-sport-badge">${venue.sport || 'Sports'}</span>
          </div>
          <div class="mb-body">
            <div class="mb-main-info">
              <h3 class="mb-name">${venue.name || 'Venue Name'}</h3>
              <div class="mb-location"><i class="fas fa-map-marker-alt"></i> ${venue.location || 'Location'}</div>
              <div class="mb-details-row">
                <div class="mb-detail"><i class="far fa-calendar-alt"></i> ${b.date}</div>
                <div class="mb-detail"><i class="far fa-clock"></i> ${formatHour(b.time)}</div>
                <div class="mb-detail"><i class="fas fa-hourglass-half"></i> ${b.durationHours || 1} hr(s)</div>
                <div class="mb-detail"><i class="fas fa-receipt"></i> ID: ...${b._id.slice(-6).toUpperCase()}</div>
              </div>
            </div>
            <div class="mb-footer">
              <div class="mb-price">
                <span class="mb-price-label">${priceLabel}</span>
                ${priceDisplay}
              </div>
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                <span class="status-pill-mb ${statusClass}">${statusText}</span>
                ${isUpcoming ? `
                  <div class="mb-actions">
                    <button class="btn-mb-action btn-mb-cancel" data-id="${b._id}">Cancel &amp; Request Refund</button>
                  </div>
                ` : ''}
                ${isPendingSplit ? `
                  <div class="mb-actions" style="display:flex;gap:8px;">
                    <a href="split-pay.html?code=${b.splitCode}" class="btn-mb-action" style="background:#00c853;color:#04140a;font-weight:700;text-decoration:none;">
                      <i class="fas fa-users"></i> Pay Share / Invite Friends
                    </a>
                    <button class="btn-mb-action btn-mb-cancel-split" data-code="${b.splitCode}" data-id="${b._id}" style="background:#ef5350;color:#fff;">
                      Cancel Split
                    </button>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="bookings-toolbar">
        <div class="bk-result-count">Showing <strong>${bookings.length}</strong> booking(s)</div>
      </div>
      <div class="bookings-grid">
        ${cardsHtml}
      </div>
    `;

    // Trigger visual entry animations
    setTimeout(() => {
      $$('.mb-card').forEach((card, i) => {
        setTimeout(() => card.classList.add('visible'), i * 80);
      });
    }, 50);

    // Attach Event Listeners for actions
    $$('.btn-mb-cancel, .btn-mb-refund').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        openCancelModal(id);
      });
    });

    $$('.btn-mb-cancel-split').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const splitCode = btn.dataset.code;
        const bId = btn.dataset.id;
        if (!confirm('Are you sure you want to cancel this split payment and release the slot?')) return;
        btn.disabled = true;
        btn.textContent = 'Cancelling…';
        try {
          if (splitCode) {
            await API.payments.cancelSplit(splitCode);
          } else {
            await API.bookings.cancel(bId);
          }
          toast('✅ Split booking cancelled and slot released.');
          initBookings();
        } catch (err) {
          toast(`❌ ${err.message}`, true);
          btn.disabled = false;
          btn.textContent = 'Cancel Split';
        }
      });
    });
  }

  /* ── CANCEL & REFUND MODAL ── */
  const cancelModal = $('#cancelModal');
  const cancelModalClose = $('#cancelModalClose');
  const confirmCancelBtn = $('#confirmCancelBtn');

  async function openCancelModal(bookingId) {
    $('#cancelBookingId').value = bookingId;
    $('#cancelReason').value = '';
    const tierEstimate = $('#tierEstimate');
    if (tierEstimate) tierEstimate.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating estimated refund policy tier…';

    cancelModal.classList.add('active');
    cancelModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#cancelReason')?.focus(), 100);

    try {
      const res = await API.bookings.refundPreview(bookingId);
      if (res.data && tierEstimate) {
        const { refundPct, refundAmount, bookingAmount } = res.data;
        if (refundPct > 0) {
          tierEstimate.innerHTML = `<span style="color:#00c853;">${refundPct}% Refund Eligible (₹${refundAmount.toLocaleString('en-IN')} of ₹${bookingAmount.toLocaleString('en-IN')})</span>`;
        } else {
          tierEstimate.innerHTML = `<span style="color:var(--red);">0% Refund (Slot starts in &lt;1h or has passed)</span>`;
        }
      }
    } catch (_) {
      if (tierEstimate) tierEstimate.textContent = 'Estimated refund calculated upon cancellation request.';
    }
  }

  function closeCancelModal() {
    cancelModal.classList.remove('active');
    cancelModal.style.display = 'none';
    document.body.style.overflow = '';
  }

  cancelModalClose?.addEventListener('click', closeCancelModal);
  cancelModal?.addEventListener('click', (e) => {
    if (e.target === cancelModal) closeCancelModal();
  });

  confirmCancelBtn?.addEventListener('click', async () => {
    const id = $('#cancelBookingId').value;
    const reason = $('#cancelReason').value.trim() || 'Customer requested slot cancellation';

    confirmCancelBtn.disabled = true;
    confirmCancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing…';

    try {
      const res = await API.bookings.requestRefund(id, reason);
      toast(`🎉 ${res.message || 'Booking cancelled & refund request submitted!'}`);
      closeCancelModal();
      initBookings(); // refresh list
    } catch (err) {
      toast(`❌ Cancellation failed: ${err.message}`, true);
    } finally {
      confirmCancelBtn.disabled = false;
      confirmCancelBtn.innerHTML = '<i class="fas fa-ban"></i> Cancel &amp; Request Refund';
    }
  });

});
