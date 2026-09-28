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

  /* ── TIME FORMATTER ── */
  function formatHour(timeStr) {
    if (!timeStr) return '';
    const match = String(timeStr).match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
    if (!match) return timeStr;
    let h = parseInt(match[1], 10);
    const min = match[2] || '00';
    const ampm = match[3];
    if (ampm) return timeStr;
    const suffix = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${min.padStart(2, '0')} ${suffix}`;
  }

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
              <div class="live-venue-name">${escapeHTML(venue.name)}</div>
              <div class="live-venue-loc"><i class="fas fa-map-marker-alt"></i> ${escapeHTML(venue.location)} &middot; Court ${escapeHTML(b.courtNumber || 1)}</div>
              <div class="live-venue-dt"><i class="far fa-calendar-alt"></i> ${escapeHTML(b.date)} &nbsp;&middot;&nbsp; <i class="far fa-clock"></i> ${escapeHTML(b.time)}</div>
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
            <div class="qr-venue-name">${escapeHTML(venue.name)}</div>
            <div class="qr-meta">Court ${escapeHTML(b.courtNumber || 1)} &middot; ${escapeHTML(b.date)} &middot; ${escapeHTML(b.time)}</div>
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
        <h2>Signed in as Partner (${escapeHTML(user.name)})</h2>
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

    const currentUser = Auth.getUser();
    const currentUserId = currentUser ? (currentUser._id || currentUser.id)?.toString() : null;

    // Helper: parse slot start timestamp for chronological sorting
    const getSlotMs = (item) => {
      try {
        const [y, m, d] = (item.date || '').split('-').map(Number);
        let h = 0, min = 0;
        if (item.time) {
          const match = item.time.match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
          if (match) {
            h = parseInt(match[1], 10);
            min = parseInt(match[2] || '0', 10);
            const isPM = match[3] && match[3].toUpperCase() === 'PM';
            const isAM = match[3] && match[3].toUpperCase() === 'AM';
            if (isPM && h < 12) h += 12;
            if (isAM && h === 12) h = 0;
          }
        }
        return new Date(y, m - 1, d, h, min, 0).getTime() || 0;
      } catch (_) {
        return 0;
      }
    };

    // Sort in increasing time order (earliest upcoming match slot first)
    const sortedBookings = [...bookings].sort((a, b) => getSlotMs(a) - getSlotMs(b));

    const cardsHtml = sortedBookings.map((b) => {
      const venue = b.venue || {};
      const img = (venue.images && venue.images[0]) || getSportImg(venue.sport);
      
      const splitPayments = b.splitPayments || [];
      const paidAmount = b.isSplit
        ? splitPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
        : (b.paymentStatus === 'paid' ? b.amount : 0);

      const bookingCustomerId = (b.customer?._id || b.customer)?.toString();
      const isTheCustomer = !bookingCustomerId || (currentUserId && bookingCustomerId === currentUserId);

      // Determine Display Status and Color
      let statusText = b.status;
      let statusClass = 'status-upcoming-mb';
      
      const pct = b.refundPct !== undefined ? b.refundPct : 100;
      const refAmt = b.refundAmount !== undefined ? b.refundAmount : Math.round(((b.amount || 0) * pct) / 100);
      const isLatePaymentRefund = b.refundReason && (b.refundReason.toLowerCase().includes('late payment') || b.refundReason.toLowerCase().includes('hold expired'));

      if (b.isSplit && b.splitStatus === 'active') {
        statusText = `⏳ Split Pending (₹${paidAmount} / ₹${b.amount || 0})`;
        statusClass = 'status-refund-req-mb';
      } else if (b.isSplit && b.splitStatus === 'expired') {
        statusText = 'Split Expired / Cancelled';
        statusClass = 'status-cancelled-mb';
      } else if (b.paymentStatus === 'refunded' || b.refundStatus === 'approved') {
        if (isLatePaymentRefund) {
          statusText = `100% Refunded (Late Payment - Slot Taken)`;
        } else if (b.refundInTCoins === false) {
          statusText = `100% Real Money Refunded (₹${refAmt.toLocaleString('en-IN')})`;
        } else {
          statusText = `${pct}% Refunded (₹${refAmt.toLocaleString('en-IN')})`;
        }
        statusClass = 'status-refunded-mb';
      } else if (b.refundStatus === 'requested') {
        statusText = `Process Ongoing (Pending Admin Review - ${pct}% ₹${refAmt.toLocaleString('en-IN')})`;
        statusClass = 'status-refund-req-mb';
      } else if (b.refundStatus === 'rejected') {
        statusText = 'Refund Declined by Admin (Slot Retained)';
        statusClass = 'status-upcoming-mb';
      } else if (b.status === 'hold' && !b.isSplit) {
        statusText = '⏱️ Payment Pending (3-min Hold)';
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
              <h3 class="mb-name">${escapeHTML(venue.name || 'Venue Name')}</h3>
              <div class="mb-location"><i class="fas fa-map-marker-alt"></i> ${escapeHTML(venue.location || 'Location')}</div>
              <div class="mb-details-row">
                <div class="mb-detail"><i class="far fa-calendar-alt"></i> ${b.date}</div>
                <div class="mb-detail"><i class="far fa-clock"></i> ${formatHour(b.time)}</div>
                <div class="mb-detail"><i class="fas fa-hourglass-half"></i> ${b.durationHours || 1} hr(s)</div>
                <div class="mb-detail"><i class="fas fa-receipt"></i> ID: ...${b._id.slice(-6).toUpperCase()}</div>
              </div>
              ${isLatePaymentRefund ? `
                <div style="margin-top: 10px; padding: 10px 12px; background: rgba(0,200,83,0.08); border: 1px solid rgba(0,200,83,0.25); border-radius: 8px; font-size: 12px; color: #c8e6c9; line-height: 1.4;">
                  <div style="font-weight: 700; color: #00c853; margin-bottom: 3px;">
                    <i class="fas fa-info-circle"></i> Late Payment Auto-Refund
                  </div>
                  Hold expired before payment completed and slot was booked by another user. Full refund of <strong>₹${(b.refundAmount || b.amount).toLocaleString('en-IN')}</strong> initiated back to your bank account / original payment method (3–7 business days).
                </div>
              ` : ''}
            </div>
            <div class="mb-footer">
              <div class="mb-price">
                <span class="mb-price-label">${priceLabel}</span>
                ${priceDisplay}
              </div>
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                <span class="status-pill-mb ${statusClass}">${statusText}</span>
                ${isUpcoming ? `
                  <div class="mb-actions" style="display:flex;gap:8px;align-items:center;">
                    <button class="btn-mb-action btn-mb-qr" data-id="${b._id}" data-venue="${venue.name || ''}" data-court="${b.courtNumber || 1}" data-date="${b.date}" data-time="${formatHour(b.time)}" data-qr="${b.qrCodeData || b._id}" style="background:rgba(0,200,83,0.15);color:#00c853;border:1px solid rgba(0,200,83,0.3);font-weight:700;"><i class="fas fa-qrcode"></i> QR Pass</button>
                    ${(!b.isSplit || isTheCustomer) ? `
                      <button class="btn-mb-action btn-mb-cancel" data-id="${b._id}">Cancel &amp; Request Refund</button>
                    ` : `
                      <span style="font-size:11px;color:var(--muted);font-weight:600;"><i class="fas fa-users"></i> Team Match (Booker Managed)</span>
                    `}
                  </div>
                ` : ''}
                ${isPendingSplit ? `
                  <div class="mb-actions" style="display:flex;gap:8px;">
                    <a href="split-pay.html?code=${b.splitCode}" class="btn-mb-action" style="background:#00c853;color:#04140a;font-weight:700;text-decoration:none;">
                      <i class="fas fa-users"></i> Pay Share / Invite Friends
                    </a>
                    ${isTheCustomer ? `
                      <button class="btn-mb-action btn-mb-cancel-split" data-code="${b.splitCode}" data-id="${b._id}" style="background:#ef5350;color:#fff;">
                        Cancel Split
                      </button>
                    ` : ''}
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
    $$('.btn-mb-qr').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { id, venue, court, date, time, qr } = btn.dataset;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr || id)}`;
        const ov = document.createElement('div');
        ov.className = 'qr-modal-overlay';
        ov.innerHTML = `
          <div class="qr-modal-box">
            <div class="qr-venue-name">${escapeHTML(venue || 'Venue')}</div>
            <div class="qr-meta">Court ${escapeHTML(court || 1)} &middot; ${escapeHTML(date)} &middot; ${escapeHTML(time)}</div>
            <img src="${qrUrl}" alt="QR Entry Pass" class="qr-img" />
            <p class="qr-hint">Show this QR code at the venue entrance</p>
            <div class="qr-booking-id">Booking #${id.slice(-8).toUpperCase()}</div>
            <button class="qr-close-btn" id="qrCloseBtn">Close Pass</button>
          </div>`;
        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('active'));
        const close = () => { ov.classList.remove('active'); setTimeout(() => ov.remove(), 300); };
        ov.querySelector('#qrCloseBtn')?.addEventListener('click', close);
        ov.addEventListener('click', ev => { if (ev.target === ov) close(); });
      });
    });

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

    if (confirmCancelBtn) {
      confirmCancelBtn.disabled = true;
      confirmCancelBtn.style.opacity = '0.6';
    }

    cancelModal.classList.add('active');
    cancelModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#cancelReason')?.focus(), 100);

    try {
      const res = await API.bookings.refundPreview(bookingId);
      if (res.data && tierEstimate) {
        const { refundPct, refundAmount, refundCoins, bookingAmount, canCancel, message, isSplit } = res.data;
        const totalCoins = refundCoins || Math.round(refundAmount * 10);
        if (canCancel && refundPct > 0) {
          tierEstimate.innerHTML = `
            <span style="color:#00c853;">${refundPct}% Refund in T-Coins: <strong>${totalCoins.toLocaleString('en-IN')} T-Coins</strong> (= ₹${refundAmount.toLocaleString('en-IN')})</span>
            <div style="font-size:12px;color:#ffd700;margin-top:4px;"><i class="fas fa-coins"></i> 100% credited instantly to your MyTurfy wallet ${isSplit ? '(shared with team)' : ''}</div>
          `;
          if (confirmCancelBtn) {
            confirmCancelBtn.disabled = false;
            confirmCancelBtn.style.opacity = '1';
            confirmCancelBtn.style.cursor = 'pointer';
          }
        } else {
          tierEstimate.innerHTML = `<span style="color:var(--red);">${message || 'Cancellations cannot be processed for this booking (Match starts in <24h or window passed).'}</span>`;
          if (confirmCancelBtn) {
            confirmCancelBtn.disabled = true;
            confirmCancelBtn.style.opacity = '0.4';
            confirmCancelBtn.style.cursor = 'not-allowed';
          }
        }
      }
    } catch (err) {
      if (tierEstimate) tierEstimate.innerHTML = `<span style="color:var(--red);">${err.message || 'Estimated refund calculated upon cancellation request.'}</span>`;
      if (confirmCancelBtn) {
        confirmCancelBtn.disabled = false;
        confirmCancelBtn.style.opacity = '1';
        confirmCancelBtn.style.cursor = 'pointer';
      }
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
    confirmCancelBtn.disabled = true;
    confirmCancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Refund…';

    try {
      const res = await API.bookings.cancel(id);
      toast(`🎉 ${res.message || 'Booking cancelled and refund processed!'}`);
      closeCancelModal();
      initBookings(); // refresh list
      if (window.API?.tcoins?.balance) {
        API.tcoins.balance().then(bRes => {
          const btn = document.querySelector('#tcoinBtn');
          if (btn && bRes?.data) {
            btn.innerHTML = `<i class="fas fa-coins" style="color:#ffd700;font-size:14px"></i><span>${bRes.data.balance.toLocaleString('en-IN')} T-Coins</span>`;
          }
        }).catch(() => {});
      }
    } catch (err) {
      toast(`❌ Cancellation failed: ${err.message}`, true);
    } finally {
      confirmCancelBtn.disabled = false;
      confirmCancelBtn.innerHTML = '<i class="fas fa-ban"></i> Cancel &amp; Request Refund';
    }
  });

});
