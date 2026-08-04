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

  /* ── Sync navbar ── */
  Auth.syncNavbar();

  /* ─── CONSTANTS ─── */
  const FACILITY_LABELS = { floodlights:'Floodlights', parking:'Parking', changing:'Changing Rooms', cafeteria:'Cafeteria', ac:'Air Conditioned' };
  const FACILITY_ICONS  = { floodlights:'fa-lightbulb', parking:'fa-car', changing:'fa-door-open', cafeteria:'fa-utensils', ac:'fa-snowflake' };
  const SPORT_ICONS = { Football:'fas fa-futbol', Cricket:'🏏', Basketball:'fas fa-basketball', Pickleball:'fa-solid fa-table-tennis-paddle-ball', Bowling:'fas fa-bowling-ball', Pool:'fas fa-circle' };
  const SPORT_BG = {
    Football:'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=1400&q=80',
    Cricket:'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&q=80',
    Basketball:'image/basketball.png', Pickleball:'image/pickleball.png',
    Bowling:'image/bowling.png', Pool:'image/pool.png',
    all:'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=1400&q=80',
  };

  /* ─── URL PARAMS ─── */
  const params = new URLSearchParams(location.search);
  const currentSport = params.get('sport') || 'Football';
  const qParam       = params.get('q') || '';

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

    return `
      <div class="venue-card" data-id="${v._id}" data-price="${v.price}" data-rating="${v.rating}">
        <div class="venue-img-wrap">
          <img src="${v.images?.[0] || 'image/placeholder.jpg'}" alt="${v.name}" class="venue-img" loading="lazy"/>
          <div class="venue-img-overlay">
            <div class="venue-badges">
              ${v.badge ? `<span class="badge ${v.badgeType||'badge-green'}"><i class="fas fa-bolt"></i> ${v.badge}</span>` : ''}
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

    // Keep the map's pins in sync if Map View is currently open
    if (typeof renderMap === 'function') renderMap();
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
              <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--text);margin-top:2px">${venue.name} <span style="font-size:14px;color:var(--muted)">(${b.date} at ${b.time})</span></div>
              <div style="font-size:12px;color:var(--muted)"><i class="fas fa-map-marker-alt"></i> ${venue.location} · Court ${b.courtNumber || 1}</div>
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
            <h3 style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--text);margin:0 0 4px">${venue.name}</h3>
            <p style="font-size:12px;color:var(--green);margin:0 0 16px">Court ${b.courtNumber || 1} · ${b.date} @ ${b.time}</p>
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

  function applySearch(q) {
    const lq = q.toLowerCase().trim();
    displayed = !lq ? [...allLoaded] : allLoaded.filter(v =>
      v.name.toLowerCase().includes(lq) ||
      v.location.toLowerCase().includes(lq) ||
      (v.tags||[]).some(t=>t.includes(lq))
    );
    renderCards(displayed);
    const subEl = $('#pageSub');
    if (subEl) subEl.textContent = `${displayed.length} venue${displayed.length!==1?'s':''} available near you`;
  }

  venueSearch?.addEventListener('input',  () => applySearch(venueSearch.value));
  mobileSearch?.addEventListener('input', () => { if (venueSearch) venueSearch.value = mobileSearch.value; applySearch(mobileSearch.value); });

  // Pre-fill search from URL ?q= param
  if (qParam) {
    if (venueSearch) venueSearch.value = qParam;
    if (mobileSearch) mobileSearch.value = qParam;
  }

  /* ─── MOBILE SEARCH TOGGLE ─── */
  const mobileSearchBar   = $('#mobileSearchBar');
  const mobileSearchToggle = $('#mobileSearchToggle');
  const mobileSearchClose  = $('#mobileSearchClose');
  mobileSearchToggle?.addEventListener('click', () => { mobileSearchBar.classList.add('open'); mobileSearch?.focus(); });
  mobileSearchClose?.addEventListener('click', () => mobileSearchBar.classList.remove('open'));

  /* ─── SIGN IN MODAL (Centralized) ─── */
  Auth.initAuthModal(toast);

  /* ─── NAVBAR DROPDOWNS ─── */
  const cityBtn = $('#cityBtn'), cityMenu = $('#cityMenu');
  const menuBtn = $('#menuBtn'), profileMenu = $('#profileMenu');
  function toggleDrop(menu) {
    const open = menu.classList.contains('open');
    $$('.dropdown-menu.open').forEach(m=>m.classList.remove('open'));
    if (!open) menu.classList.add('open');
  }
  cityBtn?.addEventListener('click', e=>{e.stopPropagation();toggleDrop(cityMenu)});
  menuBtn?.addEventListener('click', e=>{e.stopPropagation();toggleDrop(profileMenu)});
  document.addEventListener('click', ()=>$$('.dropdown-menu.open').forEach(m=>m.classList.remove('open')));

  $$('.city-menu a[data-city]').forEach(link=>{
    link.addEventListener('click', e=>{
      e.preventDefault();
      cityBtn.innerHTML=`<i class="fas fa-map-marker-alt"></i> <span class="city-label">${link.dataset.city}</span> <i class="fas fa-chevron-down chevron"></i>`;
      cityMenu.classList.remove('open');
    });
  });

  /* ─── NEAREST-FIRST — real distance, not a stub ───
     Uses the browser's geolocation + the Haversine formula (great-circle
     distance) against each venue's lat/lng. Venues without coordinates
     set sort to the back rather than crashing the sort.
  ─── */
  let userCoords = null; // cached after first successful geolocation lookup

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2-lat1) * Math.PI/180;
    const dLng = (lng2-lng1) * Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function getUserLocation() {
    return new Promise((resolve, reject) => {
      if (userCoords) return resolve(userCoords);
      if (!navigator.geolocation) return reject(new Error('Geolocation is not supported by your browser'));
      navigator.geolocation.getCurrentPosition(
        (pos) => { userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude }; resolve(userCoords); },
        () => reject(new Error('Location access denied — enable it in your browser settings to sort by nearest')),
        { timeout: 10000 }
      );
    });
  }

  /* ─── SORT (horizontal scroll chip strip) ─── */
  $$('input[name="sortOption"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      $$('.sort-chip').forEach(c=>c.classList.remove('active'));
      radio.closest('.sort-chip').classList.add('active');
      const sort = radio.value;
      const label = radio.closest('.sort-chip').querySelector('span').textContent.trim();
      // Client-side sort on already-loaded data (fast, no extra API call)
      let sorted = [...displayed];
      if (sort==='price-low')  sorted.sort((a,b)=>a.price-b.price);
      if (sort==='price-high') sorted.sort((a,b)=>b.price-a.price);
      if (sort==='rating')     sorted.sort((a,b)=>b.rating-a.rating);
      if (sort==='area-large') sorted.sort((a,b)=>(b.area||0)-(a.area||0));
      if (sort==='area-small') sorted.sort((a,b)=>(a.area||0)-(b.area||0));
      if (sort==='distance') {
        toast('📍 Finding venues near you…');
        try {
          const coords = await getUserLocation();
          sorted.sort((a, b) => {
            const distA = (a.lat!=null && a.lng!=null) ? haversineKm(coords.lat, coords.lng, a.lat, a.lng) : Infinity;
            const distB = (b.lat!=null && b.lng!=null) ? haversineKm(coords.lat, coords.lng, b.lat, b.lng) : Infinity;
            return distA - distB;
          });
        } catch (err) {
          toast(`❌ ${err.message}`, true);
          return; // keep the previous order rather than applying a broken sort
        }
      }
      displayed = sorted;
      renderCards(displayed);
      toast(`🔃 Sorted by ${label}`);
    });
  });
  $('input[name="sortOption"]:checked')?.closest('.sort-chip')?.classList.add('active');

  /* ─── FILTER DRAWER ─── */
  const sidebar = $('#sidebar'), sidebarBackdrop = $('#sidebarBackdrop'), drawerClose = $('#drawerClose');
  function openDrawer() { sidebar.classList.add('drawer-open'); sidebarBackdrop.classList.add('active'); document.body.style.overflow='hidden'; }
  function closeDrawer() { sidebar.classList.remove('drawer-open'); sidebarBackdrop.classList.remove('active'); document.body.style.overflow=''; }
  $('#venueFilterToggle')?.addEventListener('click', openDrawer);
  $('#bottomFilter')?.addEventListener('click', openDrawer);
  drawerClose?.addEventListener('click', closeDrawer);
  sidebarBackdrop?.addEventListener('click', closeDrawer);

  let touchY=0;
  sidebar?.addEventListener('touchstart',e=>{touchY=e.touches[0].clientY},{passive:true});
  sidebar?.addEventListener('touchend',e=>{if(e.changedTouches[0].clientY-touchY>80&&sidebar.scrollTop===0)closeDrawer()},{passive:true});

  /* ─── PRICE RANGE ─── */
  const rangeSlider = $('#priceRange'), priceDisplay = $('#priceDisplay');
  rangeSlider?.addEventListener('input', ()=>{
    const v=+rangeSlider.value;
    priceDisplay.textContent=`₹${v.toLocaleString('en-IN')}`;
    const pct=((v-500)/4500)*100;
    rangeSlider.style.background=`linear-gradient(to right,var(--green) ${pct}%,var(--dark3) ${pct}%)`;
  });

  /* ─── LIVE FILTERS (client-side on loaded data) ─── */
  function applySidebarFilters() {
    const maxPrice  = +(rangeSlider?.value || 5000);
    const minRating = +($$('[name="rating"]:checked')[0]?.value || 0);
    const facilities = $$('[data-filter="facility"]:checked').map(c=>c.value);
    displayed = allLoaded.filter(v => {
      if (v.price > maxPrice) return false;
      if (v.rating < minRating) return false;
      if (facilities.length && !facilities.every(f=>(v.tags||[]).includes(f))) return false;
      return true;
    });
    renderCards(displayed);
    toast(`✅ ${displayed.length} venue${displayed.length!==1?'s':''} found`);
  }

  rangeSlider?.addEventListener('change', applySidebarFilters);
  $$('[name="rating"]').forEach(r=>r.addEventListener('change', applySidebarFilters));
  $$('[data-filter="facility"]').forEach(c=>c.addEventListener('change', applySidebarFilters));

  $('#resetFiltersBtn')?.addEventListener('click', ()=>{
    $$('[data-filter="facility"]').forEach(c=>c.checked=false);
    $$('[name="rating"]')[0].checked=true;
    $$('[name="sortOption"]')[0].checked=true;
    $$('.sort-chip').forEach(c=>c.classList.remove('active'));
    $$('.sort-chip')[0]?.classList.add('active');
    if(rangeSlider){rangeSlider.value=5000;priceDisplay.textContent='₹5,000';
      rangeSlider.style.background='linear-gradient(to right,var(--green) 100%,var(--dark3) 100%)';}
    displayed=[...allLoaded]; renderCards(displayed); closeDrawer(); toast('🔄 Filters reset');
  });

  /* ─── NAVBAR SCROLL ─── */
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll',()=>{
    navbar.style.boxShadow=window.scrollY>20?'0 4px 28px rgba(0,0,0,.7)':'0 2px 16px rgba(0,0,0,.4)';
  },{passive:true});

  /* ─── MAP VIEW — optional, needs GOOGLE_MAPS_API_KEY in client/js/config.js.
     Without a key, clicking "Map View" shows a friendly explanation
     instead of a broken/blank map. ─── */
  let mapInstance = null;
  let mapMarkers = [];

  function loadGoogleMapsScript() {
    return new Promise((resolve, reject) => {
      if (window.google?.maps) return resolve();
      if (!window.CONFIG_READY?.maps) return reject(new Error('Map view needs a Google Maps API key — add one to client/js/config.js'));
      window.__mtInitMap = () => resolve();
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${window.GOOGLE_MAPS_API_KEY}&callback=__mtInitMap`;
      script.async = true;
      script.onerror = () => reject(new Error('Failed to load Google Maps — check your API key'));
      document.head.appendChild(script);
    });
  }

  async function renderMap() {
    const mapContainer = $('#mapContainer');
    if (!mapContainer || mapContainer.style.display !== 'block') return; // map not currently showing

    try {
      await loadGoogleMapsScript();
    } catch (err) {
      mapContainer.innerHTML = `<div class="map-unavailable"><i class="fas fa-map-location-dot"></i><p>${err.message}</p></div>`;
      return;
    }

    const withCoords = displayed.filter(v => v.lat != null && v.lng != null);
    const center = withCoords.length ? { lat: withCoords[0].lat, lng: withCoords[0].lng } : { lat: 21.1702, lng: 72.8311 };

    if (!mapInstance) mapInstance = new google.maps.Map(mapContainer, { center, zoom: 12 });
    else mapInstance.setCenter(center);

    mapMarkers.forEach(m => m.setMap(null));
    mapMarkers = [];

    if (!withCoords.length) {
      toast('📍 None of these venues have map coordinates set yet', true);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    withCoords.forEach(v => {
      const marker = new google.maps.Marker({ position: { lat: v.lat, lng: v.lng }, map: mapInstance, title: v.name });
      const info = new google.maps.InfoWindow({
        content: `<div style="color:#111;min-width:160px">
          <strong>${v.name}</strong><br/>₹${v.price}/hr · ⭐ ${v.rating}<br/>
          <a href="venue-detail.html?id=${v._id}" style="color:#00c853">View Details →</a></div>`,
      });
      marker.addListener('click', () => info.open(mapInstance, marker));
      mapMarkers.push(marker);
      bounds.extend(marker.getPosition());
    });
    if (withCoords.length > 1) mapInstance.fitBounds(bounds);
  }

  $('#mapViewToggle')?.addEventListener('click', async () => {
    const mapContainer = $('#mapContainer');
    const cardsContainer = $('#venueCards');
    const toggleBtn = $('#mapViewToggle');
    const showingMap = mapContainer.style.display === 'block';

    if (showingMap) {
      mapContainer.style.display = 'none';
      cardsContainer.style.display = '';
      toggleBtn.innerHTML = '<i class="fas fa-map"></i> Map View';
      toggleBtn.classList.remove('active');
    } else {
      mapContainer.style.display = 'block';
      cardsContainer.style.display = 'none';
      toggleBtn.innerHTML = '<i class="fas fa-list"></i> List View';
      toggleBtn.classList.add('active');
      await renderMap();
    }
  });

  /* ─── INIT ─── */
  await loadVenues();

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
