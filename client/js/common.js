/* =============================================
   MYTURFY — common.js
   Shared navbar/footer/sign-in behavior for the
   static content pages (About, Blog, Support,
   Tournaments) — same chrome as the homepage,
   minus the homepage-only sport-card logic.
   ============================================= */

/** Sanitize a string for safe HTML insertion — prevents XSS */
function escapeHTML(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

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
  if (window.ThemeManager) window.ThemeManager.init();

  /* ── T-COINS GLOBAL WALLET ── */
  let _tcoinsData = null;
  async function _loadGlobalTcoinsBalance() {
    if (!Auth.isLoggedIn() || !window.API?.tcoins) return;
    try {
      const res = await API.tcoins.balance();
      _tcoinsData = res.data;
      const btn = document.querySelector('#tcoinBtn');
      if (btn) btn.innerHTML = `<i class="fas fa-coins" style="color:#ffd700;font-size:14px"></i><span>${res.data.balance.toLocaleString('en-IN')} T-Coins</span>`;
    } catch (_) {}
  }
  _loadGlobalTcoinsBalance();

  /* ── DROPDOWNS & T COIN ── */
  const menuBtn = $('#menuBtn'), profileMenu = $('#profileMenu');
  const tcoinBtn = $('#tcoinBtn');

  function toggleMenu(menu) {
    if (!menu) return;
    const open = menu.classList.contains('open');
    $$('.dropdown-menu.open').forEach(m=>m.classList.remove('open'));
    if (!open) menu.classList.add('open');
  }
  menuBtn?.addEventListener('click', e=>{ e.stopPropagation(); toggleMenu(profileMenu) });
  document.addEventListener('click', ()=>$$('.dropdown-menu.open').forEach(m=>m.classList.remove('open')));

  tcoinBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.href = 'wallet.html';
  });

  /* ── SEARCH (Mobile & Desktop) — Works on all pages ── */
  const mobileSearchBar    = $('#mobileSearchBar');
  const mobileSearchToggle = $('#mobileSearchToggle');
  const mobileSearchClose  = $('#mobileSearchClose');
  const mobileSearchInput  = $('#searchInputMobile');

  mobileSearchToggle?.addEventListener('click', () => {
    if (mobileSearchBar) {
      mobileSearchBar.classList.add('open');
      mobileSearchInput?.focus();
    }
  });
  mobileSearchClose?.addEventListener('click', () => mobileSearchBar?.classList.remove('open'));

  function goToSearch(query) {
    const q = (query || '').trim();
    if (!q) return;
    if (window.location.pathname.includes('venues.html') && typeof window.loadVenues === 'function') {
      const p = new URLSearchParams(window.location.search);
      p.set('q', q);
      window.history.replaceState(null, '', `venues.html?${p.toString()}`);
      window.loadVenues({ q });
    } else {
      window.location.href = `venues.html?sport=all&q=${encodeURIComponent(q)}`;
    }
  }

  $$('#searchInputDesktop, #navSearch, #venueSearch').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); goToSearch(input.value); }
    });
  });

  $$('.desktop-search .search-icon, .search-bar .search-icon').forEach(icon => {
    icon.style.cursor = 'pointer';
    icon.addEventListener('click', () => {
      const input = icon.parentElement.querySelector('input');
      if (input) goToSearch(input.value);
    });
  });

  mobileSearchInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); goToSearch(mobileSearchInput.value); }
  });

  $$('#mobileSearchBar .search-icon').forEach(icon => {
    icon.style.cursor = 'pointer';
    icon.addEventListener('click', () => {
      if (mobileSearchInput) goToSearch(mobileSearchInput.value);
    });
  });

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

  /* ── T-COINS WALLET MODAL HELPERS ── */
  function _injectTcoinsModal() {
    const div = document.createElement('div');
    div.innerHTML = `
    <div class="modal-overlay" id="tcoinsModal">
      <div class="modal tcoins-modal">
        <button class="modal-close" id="tcoinsModalClose"><i class="fas fa-times"></i></button>
        <div class="modal-header" style="text-align:center">
          <div class="tcoins-wallet-icon"><i class="fas fa-coins"></i></div>
          <div class="modal-logo">T-Coins Wallet</div>
        </div>
        <div class="modal-body">
          <div class="tcw-balance-card">
            <div class="tcw-balance-big" id="tcwBalance">0</div>
            <div class="tcw-balance-sub">T-Coins <span id="tcwBalanceRupee">(= ₹0)</span></div>
            <div class="tcw-tier-row">
              <span class="tcw-tier-badge" id="tcwTier">🥉 ROOKIE</span>
              <span class="tcw-streak" id="tcwStreak">🔥 0-week streak</span>
            </div>
            <div class="tcw-tier-progress-wrap">
              <div class="tcw-tier-progress" id="tcwTierProgress" style="width:0%"></div>
            </div>
            <div class="tcw-tier-next" id="tcwTierNext">100,000 more coins to Regular!</div>
          </div>
          <div class="tcw-how-it-works">
            <h4><i class="fas fa-info-circle"></i> How T-Coins Work</h4>
            <div class="tcw-rule"><i class="fas fa-arrow-up" style="color:#00c853"></i> Earn 3% T-Coins on every booking</div>
            <div class="tcw-rule"><i class="fas fa-arrow-down" style="color:#ffd700"></i> 10 T-Coins = ₹1 discount</div>
            <div class="tcw-rule"><i class="fas fa-wallet" style="color:#42a5f5"></i> Use up to 50% of your coins per booking</div>
            <div class="tcw-rule"><i class="fas fa-percent" style="color:#ef5350"></i> Max 10% of booking amount as discount</div>
          </div>
          <div class="tcw-history-title"><i class="fas fa-history"></i> Recent Activity</div>
          <div class="tcw-history-list" id="tcwHistoryList">
            <p style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0">
              <i class="fas fa-spinner fa-spin"></i> Loading...
            </p>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(div.firstElementChild);
    document.getElementById('tcoinsModalClose')?.addEventListener('click', _closeTcoinsModal);
    document.getElementById('tcoinsModal')?.addEventListener('click', e => { if (e.target.id === 'tcoinsModal') _closeTcoinsModal(); });
  }

  function _closeTcoinsModal() {
    const m = document.getElementById('tcoinsModal');
    if (m) { m.classList.remove('active'); document.body.style.overflow = ''; }
  }

  function _renderGlobalWalletModal(data) {
    const $ = (s) => document.querySelector(s);
    if ($('#tcwBalance')) $('#tcwBalance').textContent = data.balance.toLocaleString('en-IN');
    if ($('#tcwBalanceRupee')) $('#tcwBalanceRupee').textContent = `(= ₹${data.balanceInRupees})`;
    const tierEmojis = { rookie: '🥉', regular: '🥈', champion: '🥇', legend: '💎' };
    if ($('#tcwTier')) $('#tcwTier').textContent = `${tierEmojis[data.tier] || '🥉'} ${data.tier.toUpperCase()}`;
    if ($('#tcwStreak')) $('#tcwStreak').textContent = `🔥 ${data.streak}-week streak`;
    if ($('#tcwTierProgress')) $('#tcwTierProgress').style.width = `${data.tierProgress}%`;
    if ($('#tcwTierNext')) {
      if (data.nextTier) {
        $('#tcwTierNext').textContent = `${data.coinsNeededForNextTier.toLocaleString('en-IN')} more coins to ${data.nextTier.toUpperCase()}!`;
      } else {
        $('#tcwTierNext').textContent = `🎉 You are at the top Legend tier!`;
      }
    }
    const list = $('#tcwHistoryList');
    if (list) {
      if (!data.recentTransactions || data.recentTransactions.length === 0) {
        list.innerHTML = '<p style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0">No activity yet. Book a venue to start earning T-Coins!</p>';
        return;
      }
      list.innerHTML = data.recentTransactions.map(tx => {
        const isPositive = tx.amount > 0;
        const iconMap = { earn: 'fa-arrow-up', redeem: 'fa-arrow-down', bonus: 'fa-gift', reverse_earn: 'fa-undo', reverse_redeem: 'fa-undo', expire: 'fa-clock' };
        const icon = iconMap[tx.type] || 'fa-coins';
        const color = isPositive ? '#00c853' : '#ef5350';
        const ago = _timeAgo(new Date(tx.createdAt));
        return `
          <div class="tcw-tx-item">
            <div class="tcw-tx-icon" style="color:${color}"><i class="fas ${icon}"></i></div>
            <div class="tcw-tx-detail">
              <div class="tcw-tx-desc">${tx.description}</div>
              <div class="tcw-tx-time">${ago}</div>
            </div>
            <div class="tcw-tx-amount" style="color:${color}">${isPositive ? '+' : ''}${tx.amount}</div>
          </div>`;
      }).join('');
    }
  }

  function _timeAgo(date) {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    if (s < 604800) return `${Math.floor(s/86400)}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
});