/* =============================================
   MYTURFY — wishlist.js
   Logic for the wishlist page.
   ============================================= */

document.addEventListener('DOMContentLoaded', async () => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  function toast(msg, isError = false) {
    const existing = $('.turfy-toast');
    if (existing) existing.remove();

    const t = document.createElement('div');
    t.className = 'turfy-toast' + (isError ? '' : ' success-toast');
    t.textContent = msg;
    document.body.appendChild(t);

    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('visible')));
    setTimeout(() => {
      t.classList.remove('visible');
      setTimeout(() => t.remove(), 400);
    }, 2800);
  }

  // Sync Navbar
  Auth.syncNavbar();

  const mainContainer = $('#wlMainContent');
  const countBadge = $('#wlCountBadge');
  const countText = $('#wlCountText');

  const SPORT_ICONS = {
    Football: 'fas fa-futbol',
    Cricket: '🏏',
    Basketball: 'fas fa-basketball',
    Pickleball: 'fa-solid fa-table-tennis-paddle-ball',
    Bowling: 'fas fa-bowling-ball',
    Pool: 'fas fa-circle'
  };

  const FACILITY_LABELS = {
    floodlights: 'Floodlights',
    parking: 'Parking',
    changing: 'Changing Rooms',
    cafeteria: 'Cafeteria',
    ac: 'Air Conditioned'
  };

  const FACILITY_ICONS = {
    floodlights: 'fa-lightbulb',
    parking: 'fa-car',
    changing: 'fa-door-open',
    cafeteria: 'fa-utensils',
    ac: 'fa-snowflake'
  };

  // Render Star Ratings
  function renderStars(rating) {
    let h = '<div class="wl-stars">';
    for (let i = 1; i <= 5; i++) {
      if (i <= Math.floor(rating)) {
        h += '<i class="fas fa-star"></i>';
      } else if (i - rating < 1) {
        h += '<i class="fas fa-star-half-alt"></i>';
      } else {
        h += '<i class="far fa-star empty"></i>';
      }
    }
    return h + '</div>';
  }

  // Load wishlist items
  async function loadWishlist() {
    if (!Auth.isLoggedIn()) {
      renderSignInPrompt();
      return;
    }

    renderSkeleton();

    try {
      const res = await API.auth.getWishlist();
      const items = res.data || [];
      renderItems(items);
    } catch (err) {
      toast(`❌ Error loading wishlist: ${err.message}`, true);
      mainContainer.innerHTML = `
        <div class="wishlist-empty">
          <div class="wishlist-empty-icon"><i class="fas fa-exclamation-triangle"></i></div>
          <h2>Failed to Load</h2>
          <p>${err.message}</p>
          <button class="btn-explore-venues" id="wlRetryBtn">Retry</button>
        </div>
      `;
      $('#wlRetryBtn')?.addEventListener('click', loadWishlist);
    }
  }

  // Render skeleton loading state
  function renderSkeleton() {
    mainContainer.innerHTML = `
      <div class="wishlist-layout">
        <div class="wishlist-grid">
          ${Array(3).fill(`
            <div class="wl-skeleton">
              <div class="wl-skeleton-img"></div>
              <div class="wl-skeleton-body">
                <div class="wl-skeleton-line" style="width: 70%;"></div>
                <div class="wl-skeleton-line" style="width: 40%;"></div>
                <div class="wl-skeleton-line" style="width: 90%;"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Render sign in prompt if not logged in
  function renderSignInPrompt() {
    countBadge.style.display = 'none';
    mainContainer.innerHTML = `
      <div class="signin-prompt">
        <div class="signin-prompt-icon"><i class="fas fa-heart"></i></div>
        <h2>Sign In to View Wishlist</h2>
        <p>Save your favourite football turfs, cricket boxes, and pickleball courts to track them here.</p>
        <button class="btn-signin-prompt" id="promptSignInBtn">
          <i class="fas fa-right-to-bracket"></i> Sign In Now
        </button>
      </div>
    `;

    $('#promptSignInBtn')?.addEventListener('click', Auth.openSignin);
  }

  // Render actual wishlist items
  function renderItems(items) {
    if (items.length === 0) {
      countBadge.style.display = 'none';
      mainContainer.innerHTML = `
        <div class="wishlist-empty">
          <div class="wishlist-empty-icon"><i class="far fa-heart"></i></div>
          <h2>Your Wishlist is Empty</h2>
          <p>Tap the heart icon on any venue card to save it here for quick access later.</p>
          <a href="venues.html?sport=all" class="btn-explore-venues">Explore Venues</a>
        </div>
      `;
      return;
    }

    // Update Hero Badge
    countText.textContent = `${items.length} saved venue${items.length !== 1 ? 's' : ''}`;
    countBadge.style.display = 'inline-flex';

    // Generate Layout
    mainContainer.innerHTML = `
      <div class="wishlist-layout">
        <div class="wishlist-toolbar">
          <div class="wl-result-count">Showing <strong>${items.length}</strong> saved venue${items.length !== 1 ? 's' : ''}</div>
          <button class="btn-clear-all" id="clearAllWishBtn"><i class="fas fa-trash-can"></i> Clear All</button>
        </div>
        <div class="wishlist-grid" id="wlGrid">
          ${items.map(v => buildWLCard(v)).join('')}
        </div>
      </div>
    `;

    // Trigger Entrance Animations
    $$('.wl-card').forEach((card, i) => {
      setTimeout(() => card.classList.add('visible'), i * 80);
    });

    // Wire up events
    $$('.wl-remove-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const venueId = btn.dataset.id;
        btn.disabled = true;
        try {
          const res = await API.auth.toggleWishlist(venueId);
          toast('🤍 Removed from wishlist');
          // Reload the wishlist list
          loadWishlist();
        } catch (err) {
          toast(`❌ ${err.message}`, true);
          btn.disabled = false;
        }
      });
    });

    // Navigate to details
    $$('.wl-card, .btn-view-venue').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.wl-remove-btn')) return;
        const id = el.dataset.id || el.closest('.wl-card')?.dataset.id;
        if (id) {
          window.location.href = `venue-detail.html?id=${encodeURIComponent(id)}`;
        }
      });
    });

    // Clear All Wishlist Items
    $('#clearAllWishBtn')?.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to remove all saved venues from your wishlist?')) return;
      try {
        for (const item of items) {
          await API.auth.toggleWishlist(item._id || item);
        }
        toast('🗑️ Wishlist cleared!');
        loadWishlist();
      } catch (err) {
        toast(`❌ Failed to clear wishlist: ${err.message}`, true);
      }
    });
  }

  // Build card HTML
  function buildWLCard(v) {
    const area = v.area ?? (v.specs ? v.specs.length * v.specs.breadth : 0);
    const height = v.specs?.height ?? 0;
    const tags = (v.tags || []).slice(0, 3).map(t => `
      <span class="wl-tag">
        <i class="fas ${FACILITY_ICONS[t] || 'fa-check'}"></i>${FACILITY_LABELS[t] || t}
      </span>
    `).join('');

    return `
      <div class="wl-card" data-id="${v._id}">
        <div class="wl-img-wrap">
          <img src="${v.images?.[0] || 'image/placeholder.jpg'}" alt="${v.name}" class="wl-img" loading="lazy"/>
          <div class="wl-img-overlay">
            <span class="wl-sport-badge">
              <i class="${SPORT_ICONS[v.sport] || 'fas fa-futbol'}"></i> ${v.sport}
            </span>
          </div>
          <button class="wl-remove-btn" data-id="${v._id}" aria-label="Remove from wishlist">
            <i class="fas fa-heart"></i>
          </button>
        </div>
        <div class="wl-body">
          <div class="wl-name">${v.name}</div>
          <div class="wl-location"><i class="fas fa-map-marker-alt"></i> ${v.location}</div>
          <div class="wl-rating-row">
            ${renderStars(v.rating)}
            <span class="wl-rating-val">${v.rating}</span>
            <span>(${v.reviewsCount || 0})</span>
          </div>
          <div class="wl-dims" style="font-size:12px;color:var(--muted);display:flex;gap:12px;margin-bottom:10px;">
            <span><i class="fas fa-ruler-combined"></i> ${area} m²</span>
            <span><i class="fas fa-arrows-up-down"></i> ${height} m</span>
          </div>
          <div class="wl-tags">${tags}</div>
          <div class="wl-footer">
            <div class="wl-price">
              <span class="wl-price-from">From</span>
              <span class="wl-price-val">₹${v.price}<span class="wl-price-unit">/hr</span></span>
            </div>
            <a href="venue-detail.html?id=${v._id}" class="btn-view-venue" data-id="${v._id}">
              Book Now <i class="fas fa-arrow-right"></i>
            </a>
          </div>
        </div>
      </div>
    `;
  }

  /* ── SIGN IN MODAL FOR WISHLIST PAGE (Centralized) ── */
  Auth.initAuthModal(toast);

  /* ── COMING SOON handler for data-soon links ── */
  const csOverlay = document.getElementById('comingSoonOverlay');
  const csTitleEl = document.getElementById('comingSoonTitle');
  const csMsgEl   = document.getElementById('comingSoonMsg');
  if (csOverlay) {
    document.querySelectorAll('[data-soon]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const name = el.dataset.soon || 'This feature';
        if (csTitleEl) csTitleEl.textContent = `${name} — Coming Soon!`;
        if (csMsgEl)   csMsgEl.textContent   = `We're working hard on ${name}. Stay tuned!`;
        csOverlay.style.display = 'flex';
      });
    });
    csOverlay.addEventListener('click', e => { if (e.target === csOverlay) csOverlay.style.display = 'none'; });
  }

  // Load the page
  loadWishlist();
});
