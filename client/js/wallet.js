/**
 * client/js/wallet.js
 * RITurf / MyTurfy T-Coins Wallet & Loyalty Engine
 */

document.addEventListener('DOMContentLoaded', async () => {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  function toast(msg, isError = false) {
    $$('.turfy-toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'turfy-toast' + (isError ? ' error' : ' success-toast');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('visible')));
    setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 400); }, 3000);
  }

  // Ensure user is signed in
  if (!Auth.isLoggedIn()) {
    toast('⚠️ Please sign in to view your T-Coins Wallet', true);
    setTimeout(() => {
      if (typeof Auth.openSignin === 'function') Auth.openSignin();
    }, 500);
  }

  Auth.syncNavbar();

  let walletData = null;
  let allTransactions = [];

  /* ─────────────────────────────────────
     1. LOAD WALLET DATA
  ───────────────────────────────────── */
  async function loadWalletData() {
    if (!Auth.isLoggedIn()) return;
    try {
      const res = await API.tcoins.balance();
      walletData = res.data;
      allTransactions = walletData.recentTransactions || [];
      renderWalletHero();
      renderTierProgress();
      renderPassbook('all');
    } catch (err) {
      toast(`❌ ${err.message}`, true);
    }
  }

  function renderWalletHero() {
    if (!walletData) return;
    const coins = walletData.balance || 0;
    const rupees = walletData.balanceInRupees || Math.floor(coins / 10);
    $('#walletCoinsDisplay').textContent = coins.toLocaleString('en-IN');
    $('#walletRupeesDisplay').textContent = `≈ ₹${rupees.toLocaleString('en-IN')} value`;

    const streakCount = $('#streakCount');
    if (streakCount) streakCount.textContent = `${walletData.streak || 0} Week Streak 🔥`;

    // Sync navbar T-coin button if present
    const navTcoin = $('#tcoinBtn span');
    if (navTcoin) navTcoin.textContent = `${coins.toLocaleString('en-IN')} T-Coins`;
  }

  function renderTierProgress() {
    if (!walletData) return;
    const tier = walletData.tier || 'rookie';
    const progress = walletData.tierProgress || 0;
    const needed = walletData.coinsNeededForNextTier || 0;
    const nextTier = walletData.nextTier;
    const cashbackPct = walletData.cashbackPct || (tier === 'legend' ? 5 : tier === 'regular' ? 4 : 3);

    const tierBadge = $('#tierBadge');
    if (tierBadge) {
      tierBadge.innerHTML = `<i class="fas fa-crown"></i> ${tier.toUpperCase()} MEMBER`;
    }

    const tierCashbackDisplay = $('#tierCashbackDisplay');
    if (tierCashbackDisplay) {
      tierCashbackDisplay.textContent = `${cashbackPct}% Instant Cashback`;
    }

    const tierBar = $('#tierProgressBar');
    if (tierBar) {
      tierBar.style.width = `${progress}%`;
    }

    const tierNextText = $('#tierNextText');
    if (tierNextText) {
      if (nextTier) {
        tierNextText.textContent = `${needed.toLocaleString('en-IN')} more T-Coins to reach ${nextTier.toUpperCase()}`;
      } else {
        tierNextText.textContent = `🌟 Max tier achieved (LEGEND)! Highest cashback (${cashbackPct}%) active.`;
      }
    }
  }

  /* ─────────────────────────────────────
     2. PASSBOOK / TRANSACTION LEDGER
  ───────────────────────────────────── */
  function renderPassbook(filterType = 'all') {
    const tbody = $('#passbookTableBody');
    if (!tbody) return;

    let filtered = allTransactions;
    if (filterType === 'earned') filtered = allTransactions.filter(t => t.type === 'earn' || t.amount > 0 && t.type !== 'bonus');
    else if (filterType === 'redeemed') filtered = allTransactions.filter(t => t.type === 'redeem' || t.amount < 0);
    else if (filterType === 'bonus') filtered = allTransactions.filter(t => t.type === 'bonus');

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">No transactions found</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(t => {
      const isPositive = (t.amount || 0) > 0;
      const typeBadge = t.type === 'redeem'
        ? `<span class="tx-type-badge tx-redeemed"><i class="fas fa-arrow-up"></i> Redeemed</span>`
        : t.type === 'bonus'
        ? `<span class="tx-type-badge tx-bonus"><i class="fas fa-gift"></i> Bonus</span>`
        : `<span class="tx-type-badge tx-earned"><i class="fas fa-arrow-down"></i> Cashback</span>`;

      const dateStr = t.createdAt
        ? new Date(t.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

      return `
        <tr>
          <td><strong>${t.description || 'T-Coins Activity'}</strong></td>
          <td>${typeBadge}</td>
          <td style="color:${isPositive ? 'var(--green)' : 'var(--red)'};font-weight:800;font-family:'Bebas Neue',sans-serif;font-size:18px">
            ${isPositive ? '+' : ''}${t.amount} Coins
          </td>
          <td style="font-weight:600">₹${Math.abs(t.rupeesEquivalent || Math.floor((t.amount || 0) / 10))}</td>
          <td style="color:var(--muted);font-size:12px">${dateStr}</td>
        </tr>
      `;
    }).join('');
  }

  $$('.passbook-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.passbook-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderPassbook(tab.dataset.filter);
    });
  });

  // Initial fetch
  await loadWalletData();
});
