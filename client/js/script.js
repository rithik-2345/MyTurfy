/* =============================================
   MYTURFY — script.js  (Homepage)
   All UI logic identical to the original.
   Only change: the Sign In modal now calls the
   real backend (API.auth.loginCustomer) instead
   of doing nothing.
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {

  function $(sel, ctx=document) { return ctx.querySelector(sel) }
  function $$(sel, ctx=document) { return [...ctx.querySelectorAll(sel)] }

  function toast(msg, isError=false) {
    $$('.turfy-toast').forEach(t=>t.remove());
    const t = document.createElement('div');
    t.className = 'turfy-toast';
    t.textContent = msg;
    if (isError) t.style.background='#c62828';
    document.body.appendChild(t);
    requestAnimationFrame(()=>requestAnimationFrame(()=>t.classList.add('visible')));
    setTimeout(()=>{ t.classList.remove('visible'); setTimeout(()=>t.remove(),400) },2800);
  }

  /* ── Sync navbar to logged-in state ── */
  Auth.syncNavbar();

  /* ─────────────────────────────────────
     1. DROPDOWNS
  ───────────────────────────────────── */
  const cityBtn    = $('#cityBtn');
  const cityMenu   = $('#cityMenu');
  const menuBtn    = $('#menuBtn');
  const profileMenu= $('#profileMenu');

  function toggleMenu(menu) {
    const open = menu.classList.contains('open');
    $$('.dropdown-menu.open').forEach(m=>m.classList.remove('open'));
    if (!open) menu.classList.add('open');
  }
  cityBtn?.addEventListener('click', e=>{ e.stopPropagation(); toggleMenu(cityMenu) });
  menuBtn?.addEventListener('click', e=>{ e.stopPropagation(); toggleMenu(profileMenu) });
  document.addEventListener('click', ()=>$$('.dropdown-menu.open').forEach(m=>m.classList.remove('open')));

  /* ─────────────────────────────────────
     2. CITY SELECTION
  ───────────────────────────────────── */
  $$('.city-menu a[data-city]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const city = link.dataset.city;
      cityBtn.innerHTML = `<i class="fas fa-map-marker-alt"></i> <span class="city-label">${city}</span> <i class="fas fa-chevron-down chevron"></i>`;
      cityMenu.classList.remove('open');
      toast(`📍 Location set to ${city}`);
    });
  });

  $('#useLocationBtn')?.addEventListener('click', e => {
    e.preventDefault();
    if (!navigator.geolocation) { toast('❌ Geolocation not supported.', true); return; }
    $('#useLocationBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting…';
    navigator.geolocation.getCurrentPosition(
      () => {
        cityBtn.innerHTML = `<i class="fas fa-map-marker-alt"></i> <span class="city-label">Near Me</span> <i class="fas fa-chevron-down chevron"></i>`;
        $('#useLocationBtn').innerHTML = '<i class="fas fa-location-crosshairs"></i> Use My Location';
        cityMenu.classList.remove('open');
        toast('📍 Location detected!');
      },
      () => {
        $('#useLocationBtn').innerHTML = '<i class="fas fa-location-crosshairs"></i> Use My Location';
        toast('❌ Location access denied.', true);
      }
    );
  });

  /* ─────────────────────────────────────
     3. MOBILE SEARCH
  ───────────────────────────────────── */
  const mobileSearchBar    = $('#mobileSearchBar');
  const mobileSearchToggle = $('#mobileSearchToggle');
  const mobileSearchClose  = $('#mobileSearchClose');
  const mobileSearchInput  = $('#searchInputMobile');

  function openMobileSearch() { mobileSearchBar.classList.add('open'); mobileSearchInput?.focus() }
  function closeMobileSearch() { mobileSearchBar.classList.remove('open') }

  mobileSearchToggle?.addEventListener('click', openMobileSearch);
  mobileSearchClose?.addEventListener('click', closeMobileSearch);
  $('#bottomSearch')?.addEventListener('click', ()=>{ setBottomTab('search'); openMobileSearch() });

  function syncSearch(src, tgt) {
    src?.addEventListener('input', ()=>{
      if (tgt) tgt.value = src.value;
      filterCardsBySearch(src.value);
    });
  }
  syncSearch($('#searchInputDesktop'), mobileSearchInput);
  syncSearch(mobileSearchInput, $('#searchInputDesktop'));

  // Swiggy-Style Autocomplete Search Engine
  function setupAutocomplete(inputId, dropdownId) {
    const input = $('#' + inputId);
    const dropdown = $('#' + dropdownId);
    if (!input || !dropdown) return;

    let debounceTimer;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (!q || q.length < 2) {
        dropdown.style.display = 'none';
        return;
      }

      debounceTimer = setTimeout(async () => {
        try {
          const res = await API.venues.list({ q });
          const list = res.data || [];
          if (!list.length) {
            dropdown.innerHTML = `<div style="padding:10px 14px;color:var(--muted);font-size:12px">No matching venues found</div>`;
          } else {
            dropdown.innerHTML = list.slice(0, 5).map(v => `
              <a href="venue-detail.html?id=${v._id}" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;color:var(--text);text-decoration:none;border-bottom:1px solid var(--border)">
                <div>
                  <div style="font-weight:700;font-size:13px">${v.name}</div>
                  <div style="font-size:11px;color:var(--muted)"><i class="fas fa-map-marker-alt" style="color:var(--green)"></i> ${v.location} · <span style="color:var(--green)">${v.sport}</span></div>
                </div>
                <span style="font-family:'Bebas Neue',sans-serif;font-size:16px;color:var(--green)">₹${v.price}/hr</span>
              </a>
            `).join('');
          }
          dropdown.style.display = 'block';
        } catch (_) {}
      }, 250);
    });

    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  setupAutocomplete('searchInputDesktop', 'searchAutocompleteDesktop');
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

  // Enter key → search ALL venues across every sport on the venues page
  function goToSearch(query) {
    const q = query.trim();
    if (!q) return;
    window.location.href = `venues.html?sport=all&q=${encodeURIComponent(q)}`;
  }
  $('#searchInputDesktop')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); goToSearch(e.target.value); }
  });
  mobileSearchInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); goToSearch(e.target.value); }
  });

  /* ─────────────────────────────────────
     4. SIGN IN MODAL — Login & Register (Centralized)
  ───────────────────────────────────── */
  Auth.initAuthModal(toast);

  /* ─────────────────────────────────────
     5. NAVIGATE TO VENUES PAGE
  ───────────────────────────────────── */
  function goToVenues(sport) {
    window.location.href = `venues.html?sport=${encodeURIComponent(sport)}`;
  }

  $$('.btn-book').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      goToVenues(btn.closest('.sport-card')?.dataset.sport || 'Football');
    });
  });

  $$('.sport-card').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => goToVenues(card.dataset.sport || 'Football'));
  });

  /* ─────────────────────────────────────
     6. FILTER DRAWER (mobile)
  ───────────────────────────────────── */
  const sidebar         = $('#sidebar');
  const sidebarBackdrop = $('#sidebarBackdrop');
  const drawerClose     = $('#drawerClose');
  const filterToggle    = $('#filterToggleMobile');
  const bottomFilter    = $('#bottomFilter');

  function openDrawer() {
    sidebar?.classList.add('drawer-open');
    sidebarBackdrop?.classList.add('active');
    document.body.style.overflow='hidden';
  }
  function closeDrawer() {
    sidebar?.classList.remove('drawer-open');
    sidebarBackdrop?.classList.remove('active');
    document.body.style.overflow='';
  }
  filterToggle?.addEventListener('click', openDrawer);
  bottomFilter?.addEventListener('click', ()=>{ setBottomTab('filter'); openDrawer() });
  drawerClose?.addEventListener('click', closeDrawer);
  sidebarBackdrop?.addEventListener('click', closeDrawer);

  let touchStartY=0;
  sidebar?.addEventListener('touchstart', e=>{ touchStartY=e.touches[0].clientY },{ passive:true });
  sidebar?.addEventListener('touchend', e=>{
    if(e.changedTouches[0].clientY-touchStartY>80 && sidebar.scrollTop===0) closeDrawer();
  },{ passive:true });

  /* ─────────────────────────────────────
     7. PRICE RANGE
  ───────────────────────────────────── */
  const rangeSlider  = $('#priceRange');
  const priceDisplay = $('#priceDisplay');
  rangeSlider?.addEventListener('input', ()=>{
    const v = +rangeSlider.value;
    priceDisplay.textContent = `₹${v.toLocaleString('en-IN')}`;
    const pct = ((v-500)/4500)*100;
    rangeSlider.style.background =
      `linear-gradient(to right,var(--green) ${pct}%,var(--dark3) ${pct}%)`;
  });

  /* ─────────────────────────────────────
     8. SPORT FILTER PILLS + CHECKBOXES
  ───────────────────────────────────── */
  const cards = $$('.sport-card');

  function filterCardsBySearch(query) {
    const q = query.toLowerCase().trim();
    cards.forEach(card=>{
      const sport = card.dataset.sport.toLowerCase();
      const desc  = card.querySelector('p')?.textContent.toLowerCase()||'';
      card.style.display = (!q || sport.includes(q) || desc.includes(q)) ? '' : 'none';
    });
  }

  function filterCardsBySport(f) {
    cards.forEach(card=>{
      card.style.display = (f==='all' || card.dataset.sport===f) ? '' : 'none';
    });
  }

  $$('.pill').forEach(pill=>{
    pill.addEventListener('click', ()=>{
      $$('.pill').forEach(p=>p.classList.remove('active'));
      pill.classList.add('active');
      filterCardsBySport(pill.dataset.filter);
      $$('.filter-check input[data-sport]').forEach(cb=>{
        cb.checked = pill.dataset.filter==='all' || cb.dataset.sport===pill.dataset.filter;
      });
    });
  });

  function applySportCheckboxFilter() {
    const checked = $$('.filter-check input[data-sport]:checked').map(cb=>cb.dataset.sport);
    if (!checked.length) {
      filterCardsBySport('all');
      $$('.pill').forEach(p=>p.classList.remove('active'));
      $('.pill[data-filter="all"]')?.classList.add('active');
    } else {
      cards.forEach(card=>{
        card.style.display = checked.includes(card.dataset.sport) ? '' : 'none';
      });
      $$('.pill').forEach(p=>p.classList.remove('active'));
      if (checked.length===1) $(`.pill[data-filter="${checked[0]}"]`)?.classList.add('active');
      else $('.pill[data-filter="all"]')?.classList.add('active');
    }
    toast('✅ Filters applied!');
  }
  $$('.filter-check input[data-sport]').forEach(cb=>{
    cb.addEventListener('change', applySportCheckboxFilter);
  });

  /* ─────────────────────────────────────
     9. BOTTOM NAV
  ───────────────────────────────────── */
  function setBottomTab(tab) {
    $$('.bottom-nav-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  }
  $$('.bottom-nav-item').forEach(btn=>{
    btn.addEventListener('click', ()=>setBottomTab(btn.dataset.tab));
  });

  $('#exploreBtn')?.addEventListener('click', ()=>{
    $('.sports-grid')?.scrollIntoView({ behavior:'smooth', block:'start' });
    setBottomTab('home');
  });

  /* ─────────────────────────────────────
     10. CARD ANIMATIONS
  ───────────────────────────────────── */
  const observer = new IntersectionObserver((entries)=>{
    entries.forEach((entry,i)=>{
      if (entry.isIntersecting) {
        const card = entry.target;
        setTimeout(()=>{ card.style.opacity='1'; card.style.transform=''; }, i*70);
        observer.unobserve(card);
      }
    });
  },{ threshold:0.08 });

  cards.forEach((card,i)=>{
    card.style.opacity='0';
    card.style.transform='translateY(28px)';
    card.style.transition=`opacity .45s ease ${i*.06}s, transform .45s ease ${i*.06}s, border-color .3s, box-shadow .3s`;
    observer.observe(card);
  });

  /* ─────────────────────────────────────
     11. RIPPLE ON CARD TAP
  ───────────────────────────────────── */
  const styleEl = document.createElement('style');
  styleEl.textContent=`@keyframes ripple{to{transform:scale(1);opacity:0}}`;
  document.head.appendChild(styleEl);

  cards.forEach(card=>{
    card.addEventListener('click', e=>{
      if (e.target.closest('.btn-book')) return;
      const r = document.createElement('span');
      const rect = card.getBoundingClientRect();
      const sz = Math.max(rect.width,rect.height)*1.8;
      r.style.cssText=`position:absolute;width:${sz}px;height:${sz}px;border-radius:50%;
        background:rgba(0,200,83,.12);
        top:${e.clientY-rect.top-sz/2}px;left:${e.clientX-rect.left-sz/2}px;
        transform:scale(0);animation:ripple .55s ease forwards;pointer-events:none;z-index:5;`;
      card.appendChild(r);
      setTimeout(()=>r.remove(),600);
    });
  });

  /* ─────────────────────────────────────
     12. NAVBAR SHRINK ON SCROLL
  ───────────────────────────────────── */
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', ()=>{
    navbar.style.boxShadow = window.scrollY>20
      ? '0 4px 28px rgba(0,0,0,.7)' : '0 2px 16px rgba(0,0,0,.4)';
  },{ passive:true });

  /* ─────────────────────────────────────
     13. COMING SOON — any link with data-soon="Feature Name"
  ───────────────────────────────────── */
  function initComingSoon() {
    const overlay = document.getElementById('comingSoonOverlay');
    const titleEl = document.getElementById('comingSoonTitle');
    const msgEl   = document.getElementById('comingSoonMsg');
    if (!overlay) return;
    document.querySelectorAll('[data-soon]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const name = el.dataset.soon || 'This feature';
        if (titleEl) titleEl.textContent = `${name} — Coming Soon!`;
        if (msgEl)   msgEl.textContent   = `We're working hard on ${name}. Stay tuned for updates!`;
        overlay.style.display = 'flex';
      });
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
  }
  initComingSoon();

  console.log('🏟️ MyTurfy Homepage — Play hard!');
});
