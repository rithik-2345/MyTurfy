/* =============================================
   MYTURFY — venues.js  (Venue listing page)
   All UI/animations/filters identical to original.
   Data now comes from GET /api/venues instead of
   data.js — no other change to how the page feels.
   ============================================= */

document.addEventListener('DOMContentLoaded', async () => {

  const $ = (s, c=document) => c.querySelector(s);
  const $$ = (s, c=document) => [...c.querySelectorAll(s)];

  function toast(msg, isError=false) {
    $$('.turfy-toast').forEach(t=>t.remove());
    const t = document.createElement('div');
    t.className = 'turfy-toast' + (isError ? '' : ' success-toast');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(()=>requestAnimationFrame(()=>t.classList.add('visible')));
    setTimeout(()=>{ t.classList.remove('visible'); setTimeout(()=>t.remove(),400); },3000);
  }



  /* ─── CONSTANTS ─── */
  const FACILITY_LABELS = { floodlights:'Floodlights', parking:'Parking', changing:'Changing Rooms', cafeteria:'Cafeteria', ac:'Air Conditioned' };
  const FACILITY_ICONS  = { floodlights:'fa-lightbulb', parking:'fa-car', changing:'fa-door-open', cafeteria:'fa-utensils', ac:'fa-snowflake' };
  const SPORT_ICONS = { Football:'fas fa-futbol', Cricket:'🏏', Basketball:'fas fa-basketball', Pickleball:'fa-solid fa-table-tennis-paddle-ball', Bowling:'fas fa-bowling-ball', Pool:'fas fa-circle' };
  const SPORT_BG = {
    Football:'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=1400&q=80',
    Cricket:'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&q=80',
    Basketball:'image/basketball.webp', Pickleball:'image/pickleball.webp',
    Bowling:'image/bowling.webp', Pool:'image/pool.webp',
    all:'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=1400&q=80'
  };

  /* ─── URL PARAMS ─── */
  const params = new URLSearchParams(location.search);
  const currentSport = params.get('sport') || 'Football';
  const qParam       = params.get('q') || '';
  const timeParam    = params.get('time') || '';
  const priceParam   = params.get('price') || '';
  const ratingParam  = params.get('rating') || '';
  const facilityParam= params.get('facilities') || params.get('facility') || '';
  const sortParam    = params.get('sort') || '';
  const availParam   = params.get('avail') || '';
  const nearestParam = params.get('nearest') || '';

  // Current state — updated on every filter/sort/search action
  let allLoaded = [];      // full list from the last API call
  let displayed = [];      // currently rendered (may be post-filter)
  let userWishlist = [];   // user's wishlist items from the backend

  /* ─── HERO ─── */
  function setupHero(count) {
    const displayTitle = currentSport === 'all' ? 'All' : currentSport;
    const displayIcon  = currentSport === 'all' ? 'fas fa-layer-group' : (SPORT_ICONS[currentSport] || 'fas fa-futbol');
    const bg           = SPORT_BG[currentSport] || SPORT_BG.Football;

    const hero = $('#pageHero');
    if (hero) hero.style.backgroundImage =
      `linear-gradient(135deg,rgba(0,200,83,.10) 0%,transparent 60%),
       linear-gradient(to right,var(--dark) 20%,transparent),
       url('${bg}')`;

    const titleEl = $('#pageTitle');
    if (titleEl) titleEl.innerHTML = `${displayTitle} <span>Venues</span>`;
    const subEl   = $('#pageSub');
    if (subEl) subEl.textContent = `${count} venue${count!==1?'s':''} available near you`;
    const badge   = $('#sportBadge');
    if (badge) {
      badge.innerHTML = displayIcon.startsWith('fa')
        ? `<i class="${displayIcon}"></i>`
        : `<span style="font-size:26px">${displayIcon}</span>`;
    }
    document.title = `MyTurfy – ${displayTitle} Venues`;
  }

  /* ─── STARS ─── */
  function renderStars(rating) {
    let h = '<div class="stars">';
    for (let i=1;i<=5;i++){
      if (i<=Math.floor(rating)) h+='<i class="fas fa-star"></i>';
      else if (i-rating<1)       h+='<i class="fas fa-star-half-alt"></i>';
      else                       h+='<i class="far fa-star empty"></i>';
    }
    return h + '</div>';
  }

  /* ─── CARD BUILDER
     v._id  = MongoDB _id (replaces old v.id from data.js)
     v.area = virtual from Venue schema (no need to compute client-side)
  ─── */
  function buildCard(v) {
    const tags = (v.tags||[]).map(t=>`
      <span class="vtag"><i class="fas ${FACILITY_ICONS[t]||'fa-check'}"></i>${FACILITY_LABELS[t]||t}</span>`).join('');
    const area = v.area ?? 0;
    const height = v.specs?.height ?? 0;
    const sportBadge = currentSport === 'all'
      ? `<span class="badge badge-blue"><i class="fas fa-tag"></i> ${v.sport}</span>` : '';
    const distBadge = v.distKm != null && isFinite(v.distKm)
      ? `<span class="badge badge-green" style="background:rgba(0,200,83,0.22);color:var(--green);font-weight:800"><i class="fas fa-location-arrow"></i> ~${v.distKm < 1 ? Math.round(v.distKm * 1000) + ' m' : v.distKm.toFixed(1) + ' km'} approx</span>`
      : '';

    return `
      <div class="venue-card" data-id="${v._id}" data-price="${v.price}" data-rating="${v.rating}">
        <div class="venue-img-wrap">
          <img src="${v.images?.[0] || 'image/placeholder.jpg'}" alt="${v.name}" class="venue-img" loading="lazy"/>
          <div class="venue-img-overlay">
            <div class="venue-badges">
              ${v.badge ? `<span class="badge ${v.badgeType||'badge-green'}"><i class="fas fa-bolt"></i> ${v.badge}</span>` : ''}
              ${distBadge}
              ${sportBadge}
            </div>
          </div>
          <button class="venue-wish ${userWishlist.includes(v._id) ? 'active' : ''}" data-id="${v._id}" aria-label="Wishlist"><i class="${userWishlist.includes(v._id) ? 'fas fa-heart' : 'far fa-heart'}"></i></button>
        </div>
        <div class="venue-card-body">
          <div class="venue-name">${v.name}</div>
          <div class="venue-location"><i class="fas fa-map-marker-alt"></i> ${v.location}</div>
          <div class="venue-rating-row">
            ${renderStars(v.rating)}
            <span class="rating-val">${v.rating}</span>
            <span class="review-count">(${v.reviewsCount||0} reviews)</span>
          </div>
          <div class="venue-dims">
            <span><i class="fas fa-ruler-combined"></i> ${area} m² area</span>
            <span><i class="fas fa-arrows-up-down"></i> ${height} m height</span>
          </div>
          <div class="venue-tags">${tags}</div>
          <div class="venue-footer">
            <div class="venue-price">
              <span class="price-from">From</span>
              <span class="price-val">₹${v.price}<span class="price-unit">/hr</span></span>
            </div>
            <button class="btn-book-venue" data-id="${v._id}">
              View Details <i class="fas fa-arrow-right"></i>
            </button>
          </div>
        </div>
      </div>`;
  }

  /* ─── RENDER ─── */
  function renderCards(list) {
    const container = $('#venueCards');
    const empty     = $('#emptyState');
    const countEl   = $('#resultCount');
    if (!list.length) {
      container.innerHTML = '';
      empty.style.display = 'block';
      if (countEl) countEl.innerHTML = 'Showing <strong>0</strong> venues';
      return;
    }
    empty.style.display = 'none';
    if (countEl) countEl.innerHTML = `Showing <strong>${list.length}</strong> venues`;
    container.innerHTML = list.map(buildCard).join('');

    $$('.venue-card', container).forEach((card, i) => {
      setTimeout(() => card.classList.add('visible'), i * 80);
    });

    $$('.venue-wish').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!Auth.isLoggedIn()) {
          toast('⚠️ Please sign in to wishlist venues', true);
          openSignin();
          return;
        }
        const venueId = btn.dataset.id;
        try {
          const res = await API.auth.toggleWishlist(venueId);
          if (res.wishlisted) {
            btn.classList.add('active');
            btn.querySelector('i').className = 'fas fa-heart';
            toast('❤️ Added to wishlist');
            if (!userWishlist.includes(venueId)) userWishlist.push(venueId);
          } else {
            btn.classList.remove('active');
            btn.querySelector('i').className = 'far fa-heart';
            toast('🤍 Removed from wishlist');
            userWishlist = userWishlist.filter(id => id !== venueId);
          }
        } catch (err) {
          toast(`❌ ${err.message}`, true);
        }
      });
    });

    $$('.btn-book-venue, .venue-card').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.venue-wish')) return;
        const id = el.dataset.id || el.closest('.venue-card')?.dataset.id;
        if (id) window.location.href = `venue-detail.html?id=${encodeURIComponent(id)}`;
      });
    });
  }

  /* ─── LOADING STATE ─── */
  function showLoading() {
    const container = $('#venueCards');
    container.innerHTML = Array(6).fill(`
      <div class="venue-card skeleton">
        <div class="venue-img-wrap" style="background:var(--dark3);height:180px;border-radius:12px 12px 0 0"></div>
        <div class="venue-card-body" style="display:flex;flex-direction:column;gap:10px;padding:14px">
          <div style="height:16px;background:var(--dark3);border-radius:6px;width:70%"></div>
          <div style="height:12px;background:var(--dark3);border-radius:6px;width:50%"></div>
          <div style="height:12px;background:var(--dark3);border-radius:6px;width:90%"></div>
        </div>
      </div>`).join('');
  }

  /* ─── FETCH FROM API ─── */
  async function loadVenues(extraOpts = {}) {
    showLoading();
    try {
      if (Auth.isLoggedIn()) {
        try {
          const wishRes = await API.auth.getWishlist();
          userWishlist = (wishRes.data || []).map(v => v._id || v);
        } catch (e) {
          console.error("Failed to load wishlist:", e);
        }
      }
      const opts = {
        sport: currentSport,
        ...(qParam ? { q: qParam } : {}),
        ...extraOpts,
      };
      // Remove sport if it's 'all' so the API returns everything
      if (opts.sport === 'all') delete opts.sport;

      const res = await API.venues.list(opts);
      allLoaded = res.data || [];
      displayed = [...allLoaded];
      setupHero(allLoaded.length);
      renderCards(displayed);
    } catch (err) {
      toast(`❌ ${err.message}`, true);
      $('#venueCards').innerHTML = '';
      $('#emptyState').style.display = 'block';
    }
  }
  window.loadVenues = loadVenues;

  /* ─── SEARCH ─── */
  const venueSearch    = $('#venueSearch');
  const mobileSearch   = $('#searchInputMobile');

  // Swiggy-Style Premium Autocomplete Search Engine
  const SPORTS_ALL  = ['Football','Cricket','Basketball','Pickleball','Bowling','Pool','Badminton','Tennis'];
  const SPORT_EMOJI = { Football:'⚽',Cricket:'🏏',Basketball:'🏀',Pickleball:'🏓',Bowling:'🎳',Pool:'🎱',Badminton:'🏸',Tennis:'🎾' };

  function hlMatch(text, q) {
    if (!q) return text;
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
    return text.replace(re, '<mark style="background:rgba(0,200,83,0.25);color:inherit;border-radius:2px;padding:0 1px">$1</mark>');
  }

  function setupAutocomplete(inputId, dropdownId) {
    const input    = $('#' + inputId);
    const dropdown = $('#' + dropdownId);
    if (!input || !dropdown) return;

    // Ensure parent is positioned
    const parent = input.closest('.search-bar, .search-wrap') || input.parentElement;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

    let activeIndex = -1;
    let debounceTimer;

    function renderRows(htmlItems) {
      dropdown.innerHTML = htmlItems.join('');
      dropdown.style.display = htmlItems.length ? 'block' : 'none';
      activeIndex = -1;
    }

    function setActive(idx) {
      const rows = [...dropdown.querySelectorAll('.ac-row')];
      rows.forEach((r, i) => r.classList.toggle('ac-active', i === idx));
      activeIndex = idx;
    }

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (!q) { dropdown.style.display = 'none'; return; }

      // Instant sport suggestions
      const matchSports = SPORTS_ALL.filter(s => s.toLowerCase().includes(q.toLowerCase()));
      const sportRows = matchSports.slice(0, 3).map(s =>
        `<a href="venues.html?sport=${encodeURIComponent(s)}" class="ac-row ac-sport-row">
           <span class="ac-sport-emoji">${SPORT_EMOJI[s] || '🏟️'}</span>
           <div class="ac-row-text">
             <div class="ac-row-title">${hlMatch(s, q)} <span class="ac-row-type">Sport</span></div>
             <div class="ac-row-sub">Browse all ${s} venues &rarr;</div>
           </div>
           <i class="fas fa-arrow-right ac-arrow"></i>
         </a>`);

      // Spinner while fetching
      const spinner = `<div class="ac-row ac-loading" style="justify-content:center;gap:8px"><i class="fas fa-circle-notch fa-spin" style="color:var(--green)"></i><span style="color:var(--muted);font-size:12px">Searching venues…</span></div>`;
      renderRows([...sportRows, sportRows.length ? '<div class="ac-divider"></div>' : '', spinner].filter(Boolean));

      debounceTimer = setTimeout(async () => {
        try {
          const res  = await API.venues.list({ q });
          const list = res.data || [];
          const venueRows = list.slice(0, 5).map(v =>
            `<a href="venue-detail.html?id=${v._id}" class="ac-row ac-venue-row">
               <div class="ac-thumb" style="background-image:url('${v.images?.[0] || ''}')">
                 ${!v.images?.[0] ? `<span style="font-size:18px">${SPORT_EMOJI[v.sport]||'🏟️'}</span>` : ''}
               </div>
               <div class="ac-row-text">
                 <div class="ac-row-title">${hlMatch(v.name, q)}</div>
                 <div class="ac-row-sub"><i class="fas fa-map-marker-alt" style="color:var(--green)"></i> ${v.location} &middot; ${v.sport}</div>
               </div>
               <div class="ac-price">₹${v.price}<span style="font-size:10px;color:var(--muted)">/hr</span></div>
             </a>`);

          const sections = [];
          if (sportRows.length) { sections.push(...sportRows, '<div class="ac-divider"></div>'); }
          if (venueRows.length) {
            sections.push('<div class="ac-section-label">Venues</div>', ...venueRows);
          }
          if (!sportRows.length && !venueRows.length) {
            sections.push(`<div class="ac-row ac-empty"><i class="fas fa-search-minus" style="color:var(--muted);margin-right:8px"></i>No results for "${q}"</div>`);
          }
          if (list.length > 5) {
            sections.push(`<a href="venues.html?sport=all&q=${encodeURIComponent(q)}" class="ac-row ac-view-all">View all ${list.length} results for "${q}" &rarr;</a>`);
          }
          renderRows(sections.filter(Boolean));
        } catch(_) { dropdown.style.display = 'none'; }
      }, 280);
    });

    // Keyboard navigation
    input.addEventListener('keydown', e => {
      const rows = [...dropdown.querySelectorAll('a.ac-row')];
      if (!rows.length || dropdown.style.display === 'none') return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIndex + 1, rows.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(Math.max(activeIndex - 1, 0)); }
      if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); rows[activeIndex]?.click(); }
      if (e.key === 'Escape') { dropdown.style.display = 'none'; }
    });

    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = 'none';
    });
  }

  setupAutocomplete('venueSearch', 'searchAutocompleteDesktop');
  setupAutocomplete('searchInputMobile', 'searchAutocompleteMobile');

  // Live Match Ticket Banner (Swiggy Live Tracking Style)
  async function loadLiveMatchCard() {
    const container = $('#liveMatchContainer');
    if (!container || !Auth.isLoggedIn()) return;

    try {
      const res = await API.bookings.getLiveTicket();
      const b = res.data;
      if (!b || !b.venue) { container.style.display = 'none'; return; }

      const venue = b.venue;
      const destination = (venue.lat != null && venue.lng != null) ? `${venue.lat},${venue.lng}` : encodeURIComponent(`${venue.name}, ${venue.location}`);
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(b.qrCodeData || b._id)}`;

      container.innerHTML = `
        <div style="background:linear-gradient(135deg, var(--card-bg) 0%, #111a14 100%);border:1px solid var(--green);border-radius:16px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;box-shadow:0 8px 24px rgba(0,200,83,0.15)">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:48px;height:48px;border-radius:12px;background:rgba(0,200,83,0.15);display:flex;align-items:center;justify-content:center;color:var(--green);font-size:20px">
              <i class="fas fa-bolt"></i>
            </div>
            <div>
              <div style="font-size:11px;font-weight:700;color:var(--green);letter-spacing:1px;text-transform:uppercase">Upcoming Live Match Ticket</div>
              <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--text);margin-top:2px">${escapeHTML(venue.name)} <span style="font-size:14px;color:var(--muted)">(${escapeHTML(b.date)} at ${escapeHTML(b.time)})</span></div>
              <div style="font-size:12px;color:var(--muted)"><i class="fas fa-map-marker-alt"></i> ${escapeHTML(venue.location)} · Court ${escapeHTML(b.courtNumber || 1)}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${destination}" target="_blank" rel="noopener" style="padding:8px 14px;background:var(--dark3);color:var(--text);border:1px solid var(--border);border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px">
              <i class="fas fa-diamond-turn-right" style="color:var(--green)"></i> Directions
            </a>
            <button id="showQrBtn" style="padding:8px 14px;background:var(--green);color:#04140a;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:6px">
              <i class="fas fa-qrcode"></i> View QR Pass
            </button>
          </div>
        </div>
      `;
      container.style.display = 'block';

      $('#showQrBtn')?.addEventListener('click', () => {
        const qrModal = document.createElement('div');
        qrModal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)';
        qrModal.innerHTML = `
          <div style="background:var(--card-bg);border:1px solid var(--green);border-radius:20px;padding:24px;text-align:center;max-width:320px">
            <h3 style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--text);margin:0 0 4px">${escapeHTML(venue.name)}</h3>
            <p style="font-size:12px;color:var(--green);margin:0 0 16px">Court ${escapeHTML(b.courtNumber || 1)} · ${escapeHTML(b.date)} @ ${escapeHTML(b.time)}</p>
            <img src="${qrUrl}" alt="QR Ticket" style="width:180px;height:180px;border-radius:12px;border:2px solid var(--green);padding:6px;background:#fff"/>
            <p style="font-size:11px;color:var(--muted);margin:14px 0 16px">Show this QR Pass to the venue manager upon arrival</p>
            <button id="closeQrBtn" style="padding:8px 24px;background:var(--green);color:#04140a;border:none;border-radius:50px;font-weight:700;cursor:pointer">Close Pass</button>
          </div>
        `;
        document.body.appendChild(qrModal);
        $('#closeQrBtn', qrModal).addEventListener('click', () => qrModal.remove());
        qrModal.addEventListener('click', e => { if (e.target === qrModal) qrModal.remove(); });
      });
    } catch (_) {}
  }
  loadLiveMatchCard();

  /* ─── NEAREST TO ME — geolocation + Haversine ─── */
  let userCoords = null;

  const CITY_COORDS = {
    surat:     { lat: 21.1702, lng: 72.8311 },
    mumbai:    { lat: 19.0760, lng: 72.8777 },
    ahmedabad: { lat: 23.0225, lng: 72.5714 },
    delhi:     { lat: 28.6139, lng: 77.2090 },
    bangalore: { lat: 12.9716, lng: 77.5946 },
    bengaluru: { lat: 12.9716, lng: 77.5946 },
    pune:      { lat: 18.5204, lng: 73.8567 },
    hyderabad: { lat: 17.3850, lng: 78.4867 },
    kolkata:   { lat: 22.5726, lng: 88.3639 },
    chennai:   { lat: 13.0827, lng: 80.2707 },
    vadodara:  { lat: 22.3072, lng: 73.1812 },
    rajkot:    { lat: 22.3039, lng: 70.8022 },
  };

  function getVenueCoords(v) {
    if (v.lat != null && v.lng != null && !isNaN(v.lat) && !isNaN(v.lng)) {
      return { lat: Number(v.lat), lng: Number(v.lng) };
    }
    const loc = (v.location || '').toLowerCase();
    for (const [cityName, coords] of Object.entries(CITY_COORDS)) {
      if (loc.includes(cityName)) return coords;
    }
    return null;
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const straight = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return straight * 1.35; // road-distance approximation
  }

  function getUserLocation() {
    return new Promise((resolve, reject) => {
      if (userCoords) return resolve(userCoords);
      if (!navigator.geolocation) return reject(new Error('Geolocation is not supported by your browser'));
      navigator.geolocation.getCurrentPosition(
        (pos) => { userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude }; resolve(userCoords); },
        () => reject(new Error('Please allow location access to find turfs nearest to you')),
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  }

  function calculateAllDistances(coords) {
    allLoaded.forEach(v => {
      const vc = getVenueCoords(v);
      v.distKm = vc ? haversineKm(coords.lat, coords.lng, vc.lat, vc.lng) : null;
    });
  }

  /* ─── TIME SLOT AVAILABILITY CHECKER ─── */
  function venueHasTimeSlot(v, slotType, availDay = 'any') {
    // Check explicit venue slots array if defined & not empty
    if (Array.isArray(v.slots) && v.slots.length > 0) {
      if (!v.slots.includes(slotType)) return false;
    }

    const open = v.openHour ?? 6;
    const close = v.closeHour ?? 22; // 22 = 10 PM, 24 = 12 AM

    // Check operating hours overlap with selected slot window
    let isOpenInSlot = false;
    if (slotType === 'morning') {
      // Morning: 6 AM to 12 PM (6:00 to 12:00)
      isOpenInSlot = (open < 12 && close > 6);
    } else if (slotType === 'afternoon') {
      // Afternoon: 12 PM to 5 PM (12:00 to 17:00)
      isOpenInSlot = (open < 17 && close > 12);
    } else if (slotType === 'evening') {
      // Evening: 5 PM to 10 PM (17:00 to 22:00)
      isOpenInSlot = (open < 22 && close > 17);
    } else if (slotType === 'night') {
      // Night: 10 PM to 6 AM (22:00 to 06:00)
      isOpenInSlot = (open < 6 || close > 22 || close === 24 || close === 0);
    }

    if (!isOpenInSlot) return false;

    // Check date-specific blocks or closed dates if filtering for a specific day
    const now = new Date();
    let targetDateStr = null;
    if (availDay === 'today') {
      targetDateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const currentHour = now.getHours();
      // If filtering today and the slot time window has already completely passed
      if (slotType === 'morning' && currentHour >= 12) return false;
      if (slotType === 'afternoon' && currentHour >= 17) return false;
      if (slotType === 'evening' && currentHour >= 22) return false;
    } else if (availDay === 'tomorrow') {
      const tom = new Date(now);
      tom.setDate(tom.getDate() + 1);
      targetDateStr = `${tom.getFullYear()}-${String(tom.getMonth()+1).padStart(2,'0')}-${String(tom.getDate()).padStart(2,'0')}`;
    }

    if (targetDateStr) {
      if ((v.closedDates || []).includes(targetDateStr)) return false;

      // Check owner blocked slots for this date
      const blocked = (v.blockedSlots || []).find(b => b.date === targetDateStr);
      if (blocked && Array.isArray(blocked.hours)) {
        let slotHours = [];
        if (slotType === 'morning') slotHours = [6,7,8,9,10,11];
        else if (slotType === 'afternoon') slotHours = [12,13,14,15,16];
        else if (slotType === 'evening') slotHours = [17,18,19,20,21];
        else if (slotType === 'night') slotHours = [22,23,0,1,2,3,4,5];

        const activeVenueHours = slotHours.filter(h => h >= open && h < close);
        if (activeVenueHours.length > 0 && activeVenueHours.every(h => blocked.hours.includes(h))) {
          return false;
        }
      }
    }

    return true;
  }

  /* ─── AVAILABILITY DAY FILTER ─── */
  function venueMatchesAvailability(v, availValue) {
    if (!availValue || availValue === 'any') return true;
    const now = new Date();
    const formatDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    if (availValue === 'today') {
      const todayStr = formatDate(now);
      if ((v.closedDates || []).includes(todayStr)) return false;
      if (now.getHours() >= (v.closeHour ?? 22)) return false;
      return true;
    }
    if (availValue === 'tomorrow') {
      const tom = new Date(now);
      tom.setDate(tom.getDate() + 1);
      const tomStr = formatDate(tom);
      return !(v.closedDates || []).includes(tomStr);
    }
    if (availValue === 'weekend') {
      const day = now.getDay();
      const satOffset = (6 - day + 7) % 7;
      const sunOffset = (7 - day + 7) % 7;
      const sat = new Date(now); sat.setDate(sat.getDate() + satOffset);
      const sun = new Date(now); sun.setDate(sun.getDate() + sunOffset);
      const satStr = formatDate(sat);
      const sunStr = formatDate(sun);
      const closed = v.closedDates || [];
      return !(closed.includes(satStr) && closed.includes(sunStr));
    }
    return true;
  }

  /* ─── MULTI-TIER 3KM RADIUS SORTING & GLOBAL SORTING ─── */
  function sortVenuesList(list, sortType, nearestActive) {
    const comparator = (a, b) => {
      if (sortType === 'price-low')  return a.price - b.price;
      if (sortType === 'price-high') return b.price - a.price;
      if (sortType === 'rating')     return (b.rating || 0) - (a.rating || 0);
      if (sortType === 'area-large') return (b.area || 0) - (a.area || 0);
      if (sortType === 'area-small') return (a.area || 0) - (b.area || 0);
      // relevance: sponsored first, then rating
      return ((b.isSponsored ? 1 : 0) - (a.isSponsored ? 1 : 0)) || ((b.rating || 0) - (a.rating || 0));
    };

    if (!nearestActive) {
      return [...list].sort(comparator);
    }

    // Group venues into 3 km radius rings:
    // Band 0: 0 - 3 km (Math.floor(distKm / 3) === 0)
    // Band 1: 3 - 6 km (Math.floor(distKm / 3) === 1)
    // Band 2: 6 - 9 km (Math.floor(distKm / 3) === 2)
    // etc.
    return [...list].sort((a, b) => {
      const distA = (a.distKm != null && isFinite(a.distKm)) ? a.distKm : 999999;
      const distB = (b.distKm != null && isFinite(b.distKm)) ? b.distKm : 999999;

      const tierA = Math.floor(distA / 3);
      const tierB = Math.floor(distB / 3);

      if (tierA !== tierB) {
        return tierA - tierB; // Closer 3 km radius band comes first
      }

      // Within the SAME 3 km radius ring, sort by chosen sort criteria (e.g. price-low, rating)
      return comparator(a, b);
    });
  }

  /* ─── UNIFIED FILTER & SORT ENGINE ─── */
  const rangeSlider  = $('#priceRange');
  const priceDisplay = $('#priceDisplay');
  const nearestCheckbox = $('#nearestCheckbox');
  const quickNearestBtn = $('#quickNearestBtn');

  function applyAllFiltersAndSort(showToast = false) {
    const maxPrice     = +(rangeSlider?.value || 5000);
    const minRating    = +($$('[name="rating"]:checked')[0]?.value || 0);
    const facilities   = $$('[data-filter="facility"]:checked').map(c => c.value);
    const selectedSlots= $$('[data-filter="time"]:checked').map(c => c.value);
    const availVal     = $$('[name="avail"]:checked')[0]?.value || 'any';
    const sortType     = $$('[name="sortOption"]:checked')[0]?.value || 'relevance';
    const nearestActive= nearestCheckbox ? nearestCheckbox.checked : false;
    const q            = (venueSearch?.value || mobileSearch?.value || '').toLowerCase().trim();

    displayed = allLoaded.filter(v => {
      // 1. Search filter (name, location, sport, tags)
      if (q) {
        const matchName  = (v.name || '').toLowerCase().includes(q);
        const matchLoc   = (v.location || '').toLowerCase().includes(q);
        const matchTags  = (v.tags || []).some(t => (t || '').toLowerCase().includes(q));
        const matchSport = (v.sport || '').toLowerCase().includes(q);
        if (!matchName && !matchLoc && !matchTags && !matchSport) return false;
      }
      // 2. Price filter
      if (v.price > maxPrice) return false;
      // 3. Rating filter
      if ((v.rating || 0) < minRating) return false;
      // 4. Facility filter
      if (facilities.length && !facilities.every(f => (v.tags || []).includes(f))) return false;
      // 5. Time slot filter (Morning, Afternoon, Evening, Night)
      if (selectedSlots.length > 0) {
        const hasSlot = selectedSlots.some(slot => venueHasTimeSlot(v, slot, availVal));
        if (!hasSlot) return false;
      }
      // 6. Availability filter (Any, Today, Tomorrow, Weekend)
      if (!venueMatchesAvailability(v, availVal)) return false;

      return true;
    });

    // Apply sort (with 3 km radius banding if nearest is active)
    displayed = sortVenuesList(displayed, sortType, nearestActive);

    renderCards(displayed);
    const subEl = $('#pageSub');
    if (subEl) subEl.textContent = `${displayed.length} venue${displayed.length !== 1 ? 's' : ''} available near you`;

    if (showToast) {
      toast(`✅ ${displayed.length} venue${displayed.length !== 1 ? 's' : ''} found`);
    }
  }

  /* ─── NEAREST TO ME TOGGLE ─── */
  async function toggleNearestMode(forceState = null) {
    if (!nearestCheckbox) return;
    const targetState = forceState !== null ? forceState : nearestCheckbox.checked;
    nearestCheckbox.checked = targetState;

    if (targetState) {
      toast('📍 Finding turfs nearest to you…');
      quickNearestBtn?.classList.add('active');
      try {
        const coords = await getUserLocation();
        calculateAllDistances(coords);
        applyAllFiltersAndSort();
        toast('📍 Grouped by 3 km radius rings!');
      } catch (err) {
        nearestCheckbox.checked = false;
        quickNearestBtn?.classList.remove('active');
        toast(`❌ ${err.message}`, true);
        applyAllFiltersAndSort();
      }
    } else {
      quickNearestBtn?.classList.remove('active');
      allLoaded.forEach(v => { delete v.distKm; });
      applyAllFiltersAndSort();
      toast('📍 Nearest priority disabled');
    }
  }

  nearestCheckbox?.addEventListener('change', () => toggleNearestMode(nearestCheckbox.checked));
  quickNearestBtn?.addEventListener('click', () => toggleNearestMode(!nearestCheckbox.checked));

  /* ─── SEARCH INPUTS ─── */
  venueSearch?.addEventListener('input', () => {
    if (mobileSearch) mobileSearch.value = venueSearch.value;
    applyAllFiltersAndSort();
  });
  mobileSearch?.addEventListener('input', () => {
    if (venueSearch) venueSearch.value = mobileSearch.value;
    applyAllFiltersAndSort();
  });

  if (qParam) {
    if (venueSearch) venueSearch.value = qParam;
    if (mobileSearch) mobileSearch.value = qParam;
  }

  /* ─── SORT OPTIONS ─── */
  $$('input[name="sortOption"]').forEach(radio => {
    radio.addEventListener('change', () => {
      $$('.sort-chip').forEach(c => c.classList.remove('active'));
      radio.closest('.sort-chip')?.classList.add('active');
      const label = radio.closest('.sort-chip')?.querySelector('span')?.textContent.trim() || 'Sort';
      applyAllFiltersAndSort();
      toast(`🔃 Sorted by ${label}`);
    });
  });

  /* ─── PRICE RANGE SLIDER ─── */
  rangeSlider?.addEventListener('input', () => {
    const v = +rangeSlider.value;
    if (priceDisplay) priceDisplay.textContent = `₹${v.toLocaleString('en-IN')}`;
    const pct = ((v - 500) / 4500) * 100;
    rangeSlider.style.background = `linear-gradient(to right,var(--green) ${pct}%,var(--dark3) ${pct}%)`;
  });
  rangeSlider?.addEventListener('change', () => applyAllFiltersAndSort(true));

  /* ─── RATING, FACILITIES, TIME SLOTS, AVAILABILITY LISTENERS ─── */
  $$('[name="rating"]').forEach(r => r.addEventListener('change', () => applyAllFiltersAndSort(true)));
  $$('[data-filter="facility"]').forEach(c => c.addEventListener('change', () => applyAllFiltersAndSort(true)));
  $$('[data-filter="time"]').forEach(c => c.addEventListener('change', () => applyAllFiltersAndSort(true)));
  $$('[name="avail"]').forEach(r => r.addEventListener('change', () => applyAllFiltersAndSort(true)));

  /* ─── RESET FILTERS BUTTON ─── */
  $('#resetFiltersBtn')?.addEventListener('click', () => {
    // Reset Price
    if (rangeSlider) {
      rangeSlider.value = 5000;
      if (priceDisplay) priceDisplay.textContent = '₹5,000';
      rangeSlider.style.background = 'linear-gradient(to right,var(--green) 100%,var(--dark3) 100%)';
    }
    // Reset Rating
    const defaultRating = $('input[name="rating"][value="any"]');
    if (defaultRating) defaultRating.checked = true;
    // Reset Facilities & Time Slots
    $$('[data-filter="facility"]').forEach(c => { c.checked = false; });
    $$('[data-filter="time"]').forEach(c => { c.checked = false; });
    // Reset Availability
    const defaultAvail = $('input[name="avail"][value="any"]');
    if (defaultAvail) defaultAvail.checked = true;
    // Reset Sort
    const defaultSort = $('input[name="sortOption"][value="relevance"]');
    if (defaultSort) {
      defaultSort.checked = true;
      $$('.sort-chip').forEach(c => c.classList.remove('active'));
      defaultSort.closest('.sort-chip')?.classList.add('active');
    }
    // Reset Nearest
    if (nearestCheckbox) nearestCheckbox.checked = false;
    quickNearestBtn?.classList.remove('active');
    allLoaded.forEach(v => { delete v.distKm; });

    // Reset Search
    if (venueSearch) venueSearch.value = '';
    if (mobileSearch) mobileSearch.value = '';

    applyAllFiltersAndSort();
    closeDrawer();
    toast('🔄 Filters reset');
  });

  /* ─── FILTER DRAWER (Mobile) ─── */
  const sidebar = $('#sidebar'), sidebarBackdrop = $('#sidebarBackdrop'), drawerClose = $('#drawerClose');
  function openDrawer() { sidebar.classList.add('drawer-open'); sidebarBackdrop.classList.add('active'); document.body.style.overflow='hidden'; }
  function closeDrawer() { sidebar.classList.remove('drawer-open'); sidebarBackdrop.classList.remove('active'); document.body.style.overflow=''; }
  $('#venueFilterToggle')?.addEventListener('click', openDrawer);
  $('#bottomFilter')?.addEventListener('click', openDrawer);
  drawerClose?.addEventListener('click', closeDrawer);
  sidebarBackdrop?.addEventListener('click', closeDrawer);

  let touchY = 0;
  sidebar?.addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
  sidebar?.addEventListener('touchend', e => {
    if (e.changedTouches[0].clientY - touchY > 80 && sidebar.scrollTop === 0) closeDrawer();
  }, { passive: true });

  /* ─── INITIALIZE FILTERS FROM URL PARAMS ─── */
  function initFiltersFromUrl() {
    if (priceParam && rangeSlider) {
      const p = Math.max(500, Math.min(5000, +priceParam));
      rangeSlider.value = p;
      if (priceDisplay) priceDisplay.textContent = `₹${p.toLocaleString('en-IN')}`;
      const pct = ((p - 500) / 4500) * 100;
      rangeSlider.style.background = `linear-gradient(to right,var(--green) ${pct}%,var(--dark3) ${pct}%)`;
    }
    if (timeParam) {
      const times = timeParam.split(',').map(s => s.trim().toLowerCase());
      $$('[data-filter="time"]').forEach(cb => {
        if (times.includes(cb.value.toLowerCase())) cb.checked = true;
      });
    }
    if (ratingParam) {
      const rRadio = $(`input[name="rating"][value="${ratingParam}"]`);
      if (rRadio) rRadio.checked = true;
    }
    if (facilityParam) {
      const facs = facilityParam.split(',').map(s => s.trim().toLowerCase());
      $$('[data-filter="facility"]').forEach(cb => {
        if (facs.includes(cb.value.toLowerCase())) cb.checked = true;
      });
    }
    if (availParam) {
      const aRadio = $(`input[name="avail"][value="${availParam}"]`);
      if (aRadio) aRadio.checked = true;
    }
    if (sortParam) {
      const sRadio = $(`input[name="sortOption"][value="${sortParam}"]`);
      if (sRadio) {
        sRadio.checked = true;
        $$('.sort-chip').forEach(c => c.classList.remove('active'));
        sRadio.closest('.sort-chip')?.classList.add('active');
      }
    }
  }

  /* ─── NAVBAR SCROLL ─── */
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    navbar.style.boxShadow = window.scrollY > 20 ? '0 4px 28px rgba(0,0,0,.7)' : '0 2px 16px rgba(0,0,0,.4)';
  }, { passive: true });

  /* ─── INIT ─── */
  await loadVenues();
  initFiltersFromUrl();
  if (nearestParam === 'true' || nearestParam === '1') {
    await toggleNearestMode(true);
  } else {
    applyAllFiltersAndSort();
  }

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

  console.log(`🏟️ MyTurfy Venues — ${currentSport}`);
});
