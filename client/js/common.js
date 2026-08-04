/* =============================================
   MYTURFY — common.js
   Shared navbar/footer/sign-in behavior for the
   static content pages (About, Blog, Support,
   Tournaments) — same chrome as the homepage,
   minus the homepage-only sport-card logic.
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  const $  = (s, c=document) => c.querySelector(s);
  const $$ = (s, c=document) => [...c.querySelectorAll(s)];

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
  window.mtToast = toast; // exposed so page-specific inline scripts can reuse it

  Auth.syncNavbar();

  /* ── DROPDOWNS ── */
  const cityBtn = $('#cityBtn'), cityMenu = $('#cityMenu');
  const menuBtn = $('#menuBtn'), profileMenu = $('#profileMenu');
  function toggleMenu(menu) {
    const open = menu.classList.contains('open');
    $$('.dropdown-menu.open').forEach(m=>m.classList.remove('open'));
    if (!open) menu.classList.add('open');
  }
  cityBtn?.addEventListener('click', e=>{ e.stopPropagation(); toggleMenu(cityMenu) });
  menuBtn?.addEventListener('click', e=>{ e.stopPropagation(); toggleMenu(profileMenu) });
  document.addEventListener('click', ()=>$$('.dropdown-menu.open').forEach(m=>m.classList.remove('open')));

  $$('.city-menu a[data-city]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      cityBtn.innerHTML = `<i class="fas fa-map-marker-alt"></i> <span class="city-label">${link.dataset.city}</span> <i class="fas fa-chevron-down chevron"></i>`;
      cityMenu.classList.remove('open');
      toast(`📍 Location set to ${link.dataset.city}`);
    });
  });

  /* ── MOBILE SEARCH → redirects to venues.html like the homepage does ── */
  const mobileSearchBar    = $('#mobileSearchBar');
  const mobileSearchToggle = $('#mobileSearchToggle');
  const mobileSearchClose  = $('#mobileSearchClose');
  const mobileSearchInput  = $('#searchInputMobile');
  mobileSearchToggle?.addEventListener('click', () => { mobileSearchBar.classList.add('open'); mobileSearchInput?.focus(); });
  mobileSearchClose?.addEventListener('click', () => mobileSearchBar.classList.remove('open'));

  function goToSearch(query) {
    const q = query.trim();
    if (!q) return;
    window.location.href = `venues.html?sport=all&q=${encodeURIComponent(q)}`;
  }
  $('#searchInputDesktop')?.addEventListener('keydown', e => { if (e.key==='Enter') { e.preventDefault(); goToSearch(e.target.value); } });
  mobileSearchInput?.addEventListener('keydown', e => { if (e.key==='Enter') { e.preventDefault(); goToSearch(e.target.value); } });

  /* ── SIGN IN MODAL (Centralized) ── */
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

  /* ── NAVBAR SHRINK ON SCROLL ── */
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', ()=>{
    navbar.style.boxShadow = window.scrollY>20 ? '0 4px 28px rgba(0,0,0,.7)' : '0 2px 16px rgba(0,0,0,.4)';
  },{ passive:true });

  console.log('🏟️ MyTurfy — page ready');
});