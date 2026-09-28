/**
 * client/js/rithik.js
 * RITurf Admin Dashboard — frontend logic
 * 3-step login → full dashboard with all sections
 */

const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:5000/api' : '/api';

/* ─── Helpers ─── */
let adminToken = null;

async function adminReq(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json().catch(() => ({ success: false, message: res.statusText }));
  if (!data.success) throw new Error(data.message || 'Request failed');
  return data;
}

function toast(msg, isError = false) {
  document.querySelectorAll('.admin-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'admin-toast' + (isError ? ' error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('visible')));
  setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 400); }, 3000);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtMoney(n) { return '₹' + (n || 0).toLocaleString('en-IN'); }
function escHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

/* ═══════════════════════════════════════════
   LOGIN (3-Step)
═══════════════════════════════════════════ */
let loginEmail = '';

function initLogin() {
  const steps = document.querySelectorAll('.login-card .step');
  const errEl = document.getElementById('loginError');

  // Step 1: Email + Password
  document.getElementById('loginStep1Btn').addEventListener('click', () => {
    loginEmail = document.getElementById('adminEmail').value.trim();
    const pw = document.getElementById('adminPassword').value;
    if (!loginEmail || !pw) { errEl.textContent = 'Enter email and password'; return; }
    errEl.textContent = '';
    steps.forEach(s => s.classList.remove('active'));
    steps[1].classList.add('active');
  });

  // Step 2: Name + Parents → send OTP
  document.getElementById('loginStep2Btn').addEventListener('click', async () => {
    const name = document.getElementById('adminName').value.trim();
    const father = document.getElementById('adminFather').value.trim();
    const mother = document.getElementById('adminMother').value.trim();
    const pw = document.getElementById('adminPassword').value;

    if (!name || !father || !mother) { errEl.textContent = 'All identity fields required'; return; }
    errEl.textContent = '';
    const btn = document.getElementById('loginStep2Btn');
    btn.disabled = true; btn.innerHTML = 'Verifying… <i class="fas fa-spinner fa-spin"></i>';

    try {
      const res = await adminReq('POST', '/auth/admin/login', {
        email: loginEmail, password: pw, name, fatherName: father, motherName: mother,
      });
      toast(res.message);
      if (res.devCode) {
        // Auto-fill OTP in dev mode
        const boxes = document.querySelectorAll('#otpBoxes input');
        String(res.devCode).split('').forEach((d, i) => { if (boxes[i]) boxes[i].value = d; });
        toast('🔧 Dev mode: OTP auto-filled');
      }
      steps.forEach(s => s.classList.remove('active'));
      steps[2].classList.add('active');
    } catch (e) {
      errEl.textContent = e.message;
    }
    btn.disabled = false; btn.innerHTML = 'Verify Identity & Send OTP <i class="fas fa-arrow-right"></i>';
  });

  // OTP box navigation
  const otpInputs = document.querySelectorAll('#otpBoxes input');
  otpInputs.forEach((inp, i) => {
    inp.oninput = () => { if (inp.value && i < otpInputs.length - 1) otpInputs[i + 1].focus(); };
    inp.onkeydown = (e) => { if (e.key === 'Backspace' && !inp.value && i > 0) otpInputs[i - 1].focus(); };
    inp.onpaste = (e) => {
      e.preventDefault();
      const digits = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6).split('');
      digits.forEach((d, idx) => { if (otpInputs[idx]) otpInputs[idx].value = d; });
    };
  });

  // Step 3: Verify OTP
  document.getElementById('loginStep3Btn').addEventListener('click', async () => {
    const code = Array.from(otpInputs).map(i => i.value.trim()).join('');
    if (code.length !== 6) { errEl.textContent = 'Enter all 6 OTP digits'; return; }
    errEl.textContent = '';
    const btn = document.getElementById('loginStep3Btn');
    btn.disabled = true; btn.innerHTML = 'Verifying… <i class="fas fa-spinner fa-spin"></i>';

    try {
      const res = await adminReq('POST', '/auth/admin/verify-otp', { email: loginEmail, code });
      adminToken = res.token;
      sessionStorage.setItem('admin_token', adminToken);
      document.querySelector('.admin-login').style.display = 'none';
      document.querySelector('.admin-dash').classList.add('active');
      loadDashboard();
      toast('🎉 Welcome, RITurf Admin!');
    } catch (e) {
      errEl.textContent = e.message;
    }
    btn.disabled = false; btn.innerHTML = 'Verify OTP & Login <i class="fas fa-check"></i>';
  });
}

/* ═══════════════════════════════════════════
   DASHBOARD NAVIGATION
═══════════════════════════════════════════ */
function initNavigation() {
  const navLinks = document.querySelectorAll('.sidebar nav a');
  const sections = document.querySelectorAll('.dash-section');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.section;
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      sections.forEach(s => s.classList.toggle('active', s.id === target));
      // Load section data
      loadSection(target);
      // Close mobile sidebar
      document.querySelector('.sidebar')?.classList.remove('open');
    });
  });

  // Mobile toggle
  document.querySelector('.menu-toggle')?.addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
  });

  // Logout
  document.querySelector('.logout-btn')?.addEventListener('click', () => {
    adminToken = null;
    sessionStorage.removeItem('admin_token');
    document.querySelector('.admin-dash').classList.remove('active');
    document.querySelector('.admin-login').style.display = 'flex';
    toast('Logged out');
  });
}

const sectionLoaded = {};
function loadSection(id) {
  if (sectionLoaded[id]) return;
  sectionLoaded[id] = true;
  switch(id) {
    case 'sec-overview': loadOverview(); break;
    case 'sec-users': loadUsers(); break;
    case 'sec-owners': loadOwners(); break;
    case 'sec-venues': loadVenues(); break;
    case 'sec-bookings': loadBookings(); break;
    case 'sec-reviews': loadReviews(); break;
    case 'sec-promos': loadPromos(); break;
    case 'sec-announcements': loadAnnouncements(); break;
    case 'sec-blocked': loadBlockedSlots(); break;
    case 'sec-analytics': loadAnalytics(); break;
    case 'sec-audit': loadAuditLog(); break;
  }
}

function loadDashboard() {
  loadOverview();
  sectionLoaded['sec-overview'] = true;
}

/* ═══════════════════════════════════════════
   OVERVIEW
═══════════════════════════════════════════ */
let statsData = null;

async function loadOverview() {
  try {
    const res = await adminReq('GET', '/admin/stats');
    statsData = res.data;
    renderOverviewKPIs();
    renderOverviewCharts();
  } catch (e) {
    toast('Failed to load stats: ' + e.message, true);
  }
}

function renderOverviewKPIs() {
  const d = statsData;
  document.getElementById('kpiUsers').textContent = d.totalUsers;
  document.getElementById('kpiOwners').textContent = d.totalOwners;
  document.getElementById('kpiVenues').textContent = d.totalVenues;
  document.getElementById('kpiBookings').textContent = d.totalBookings;
  document.getElementById('kpiRevenue').textContent = fmtMoney(d.totalRevenue);
  document.getElementById('kpiSponsored').textContent = d.sponsoredVenues;
  document.getElementById('kpiBlockedUsers').textContent = d.blockedUsers;
  document.getElementById('kpiBlockedOwners').textContent = d.blockedOwners;
}

function renderOverviewCharts() {
  const d = statsData;
  // Bookings trend (30d)
  const ctx1 = document.getElementById('chartBookings30d')?.getContext('2d');
  if (ctx1) {
    new Chart(ctx1, {
      type: 'line',
      data: {
        labels: d.bookingsPerDay.map(i => i._id.slice(5)),
        datasets: [{ label: 'Bookings', data: d.bookingsPerDay.map(i => i.count), borderColor: '#00c853', backgroundColor: 'rgba(0,200,83,.1)', fill: true, tension: .4 }],
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#e8f5e9' } } }, scales: { x: { ticks: { color: '#7aad82' } }, y: { ticks: { color: '#7aad82' }, beginAtZero: true } } },
    });
  }
  // Revenue trend
  const ctx2 = document.getElementById('chartRevenue30d')?.getContext('2d');
  if (ctx2) {
    new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: d.bookingsPerDay.map(i => i._id.slice(5)),
        datasets: [{ label: 'Revenue ₹', data: d.bookingsPerDay.map(i => i.revenue), backgroundColor: 'rgba(0,200,83,.5)', borderColor: '#00c853', borderWidth: 1 }],
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#e8f5e9' } } }, scales: { x: { ticks: { color: '#7aad82' } }, y: { ticks: { color: '#7aad82' }, beginAtZero: true } } },
    });
  }
  // By sport
  const ctx3 = document.getElementById('chartBySport')?.getContext('2d');
  if (ctx3) {
    const colors = ['#00c853','#42a5f5','#ffea00','#ef5350','#ab47bc','#ff7043','#26c6da','#9ccc65'];
    new Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: d.bookingsBySport.map(i => i._id),
        datasets: [{ data: d.bookingsBySport.map(i => i.count), backgroundColor: colors.slice(0, d.bookingsBySport.length) }],
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#e8f5e9' }, position: 'bottom' } } },
    });
  }
}

/* ═══════════════════════════════════════════
   USERS
═══════════════════════════════════════════ */
async function loadUsers(search = '', page = 1) {
  try {
    const qs = new URLSearchParams({ search, page, limit: 30 }).toString();
    const res = await adminReq('GET', `/admin/users?${qs}`);
    renderUsersTable(res.data, res.total, page);
  } catch (e) { toast('Failed to load users: ' + e.message, true); }
}

function renderUsersTable(users, total, page) {
  const tbody = document.querySelector('#usersTable tbody');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${escHtml(u.name)}</td>
      <td>${escHtml(u.email || '—')}</td>
      <td>${escHtml(u.phone || '—')}</td>
      <td><span class="badge badge-green">${u.tCoinsTier || 'rookie'}</span></td>
      <td>${u.tCoins || 0}</td>
      <td>${fmtDate(u.createdAt)}</td>
      <td>${u.isBlocked ? '<span class="badge badge-red">Blocked</span>' : '<span class="badge badge-green">Active</span>'}</td>
      <td>
        <button class="action-btn" onclick="viewUser('${u._id}')"><i class="fas fa-eye"></i></button>
        <button class="action-btn ${u.isBlocked ? '' : 'danger'}" onclick="toggleBlockUser('${u._id}')">${u.isBlocked ? '<i class="fas fa-unlock"></i>' : '<i class="fas fa-ban"></i>'}</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:20px">No users found</td></tr>';

  const info = document.querySelector('#usersSection .table-pagination .page-info');
  if (info) info.textContent = `Showing ${users.length} of ${total}`;
}

async function toggleBlockUser(id) {
  try {
    const res = await adminReq('PATCH', `/admin/users/${id}/block`);
    toast(res.message);
    sectionLoaded['sec-users'] = false;
    loadUsers(document.getElementById('userSearch')?.value || '');
  } catch (e) { toast(e.message, true); }
}

async function viewUser(id) {
  try {
    const res = await adminReq('GET', `/admin/users/${id}`);
    const u = res.data;
    showModal(`
      <h3><i class="fas fa-user"></i> ${escHtml(u.name)}</h3>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Email</div><div class="value">${escHtml(u.email || '—')}</div></div>
        <div class="detail-item"><div class="label">Phone</div><div class="value">${escHtml(u.phone || '—')}</div></div>
        <div class="detail-item"><div class="label">Tier</div><div class="value">${u.tCoinsTier || 'rookie'}</div></div>
        <div class="detail-item"><div class="label">T-Coins</div><div class="value">${u.tCoins || 0}</div></div>
        <div class="detail-item"><div class="label">Joined</div><div class="value">${fmtDate(u.createdAt)}</div></div>
        <div class="detail-item"><div class="label">Status</div><div class="value">${u.isBlocked ? '🚫 Blocked' : '✅ Active'}</div></div>
      </div>
      <h3 style="font-size:18px;margin-top:16px">Bookings (${u.bookings?.length || 0})</h3>
      <table><thead><tr><th>Date</th><th>Venue</th><th>Amount</th><th>Status</th></tr></thead><tbody>
      ${(u.bookings || []).slice(0, 20).map(b => `<tr><td>${b.date}</td><td>${escHtml(b.venue?.name || '—')}</td><td>${fmtMoney(b.amount)}</td><td><span class="badge badge-${b.status === 'completed' ? 'green' : b.status === 'cancelled' ? 'red' : 'yellow'}">${b.status}</span></td></tr>`).join('') || '<tr><td colspan="4" style="color:var(--muted)">No bookings</td></tr>'}
      </tbody></table>
    `);
  } catch (e) { toast(e.message, true); }
}

/* ═══════════════════════════════════════════
   OWNERS
═══════════════════════════════════════════ */
async function loadOwners(search = '', page = 1) {
  try {
    const qs = new URLSearchParams({ search, page, limit: 30 }).toString();
    const res = await adminReq('GET', `/admin/owners?${qs}`);
    renderOwnersTable(res.data, res.total, page);
  } catch (e) { toast('Failed to load owners: ' + e.message, true); }
}

function renderOwnersTable(owners, total, page) {
  const tbody = document.querySelector('#ownersTable tbody');
  tbody.innerHTML = owners.map(o => `
    <tr>
      <td>${escHtml(o.name)}</td>
      <td>${escHtml(o.email || '—')}</td>
      <td>${escHtml(o.phone || '—')}</td>
      <td>${escHtml(o.city || '—')}</td>
      <td>${o.isVerified ? '<span class="badge badge-green">Verified</span>' : '<span class="badge badge-muted">No</span>'}</td>
      <td>${o.venueCount || 0}</td>
      <td>${fmtDate(o.createdAt)}</td>
      <td>${o.isBlocked ? '<span class="badge badge-red">Blocked</span>' : '<span class="badge badge-green">Active</span>'}</td>
      <td>
        <button class="action-btn" onclick="viewOwner('${o._id}')"><i class="fas fa-eye"></i></button>
        <button class="action-btn ${o.isBlocked ? '' : 'danger'}" onclick="toggleBlockOwner('${o._id}')">${o.isBlocked ? '<i class="fas fa-unlock"></i>' : '<i class="fas fa-ban"></i>'}</button>
        <button class="action-btn" onclick="toggleVerifyOwner('${o._id}')" title="${o.isVerified ? 'Unverify' : 'Verify'}">${o.isVerified ? '<i class="fas fa-times-circle"></i>' : '<i class="fas fa-check-circle"></i>'}</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:20px">No owners found</td></tr>';
}

async function toggleBlockOwner(id) {
  try {
    const res = await adminReq('PATCH', `/admin/owners/${id}/block`);
    toast(res.message); sectionLoaded['sec-owners'] = false;
    loadOwners(document.getElementById('ownerSearch')?.value || '');
  } catch (e) { toast(e.message, true); }
}

async function toggleVerifyOwner(id) {
  try {
    const res = await adminReq('PATCH', `/admin/owners/${id}/verify`);
    toast(res.message); sectionLoaded['sec-owners'] = false;
    loadOwners(document.getElementById('ownerSearch')?.value || '');
  } catch (e) { toast(e.message, true); }
}

async function viewOwner(id) {
  try {
    const res = await adminReq('GET', `/admin/owners/${id}`);
    const o = res.data;
    showModal(`
      <h3><i class="fas fa-building"></i> ${escHtml(o.name)}</h3>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Email</div><div class="value">${escHtml(o.email || '—')}</div></div>
        <div class="detail-item"><div class="label">Phone</div><div class="value">${escHtml(o.phone || '—')}</div></div>
        <div class="detail-item"><div class="label">City</div><div class="value">${escHtml(o.city || '—')}</div></div>
        <div class="detail-item"><div class="label">Verified</div><div class="value">${o.isVerified ? '✅ Yes' : '❌ No'}</div></div>
        <div class="detail-item"><div class="label">Status</div><div class="value">${o.isBlocked ? '🚫 Blocked' : '✅ Active'}</div></div>
        <div class="detail-item"><div class="label">Joined</div><div class="value">${fmtDate(o.createdAt)}</div></div>
      </div>
      <h3 style="font-size:18px;margin-top:16px">Venues (${o.venues?.length || 0})</h3>
      <table><thead><tr><th>Name</th><th>Sport</th><th>Price</th><th>Commission</th><th>Active</th></tr></thead><tbody>
      ${(o.venues || []).map(v => `<tr><td>${escHtml(v.name)}</td><td>${v.sport}</td><td>${fmtMoney(v.price)}/hr</td><td>${v.commissionPct || 10}%</td><td>${v.isActive ? '✅' : '❌'}</td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">No venues</td></tr>'}
      </tbody></table>
    `);
  } catch (e) { toast(e.message, true); }
}

/* ═══════════════════════════════════════════
   VENUES
═══════════════════════════════════════════ */
async function loadVenues(search = '', sport = 'all', page = 1) {
  try {
    const params = { search, page, limit: 30 };
    if (sport && sport !== 'all') params.sport = sport;
    const qs = new URLSearchParams(params).toString();
    const res = await adminReq('GET', `/admin/venues?${qs}`);
    renderVenuesTable(res.data, res.total, page);
  } catch (e) { toast('Failed to load venues: ' + e.message, true); }
}

function renderVenuesTable(venues, total, page) {
  const tbody = document.querySelector('#venuesTable tbody');
  tbody.innerHTML = venues.map(v => `
    <tr>
      <td><strong>${escHtml(v.name)}</strong><br><span style="font-size:11px;color:var(--muted)">${escHtml(v.owner?.name || '—')}</span></td>
      <td>${v.sport}</td>
      <td>${escHtml(v.location)}</td>
      <td>${fmtMoney(v.price)}/hr</td>
      <td>${v.rating}⭐ (${v.reviewsCount})</td>
      <td>${v.specs?.turfs || 1}</td>
      <td style="text-align:center">
        <input type="number" value="${v.commissionPct || 10}" min="0" max="100" style="width:60px;padding:4px 6px;font-size:12px;text-align:center"
          onchange="changeCommission('${v._id}', this.value)" title="Commission %"/>%
      </td>
      <td style="text-align:center">
        <input type="checkbox" class="sponsor-check" ${v.isSponsored ? 'checked' : ''} onchange="toggleSponsor('${v._id}')" title="Sponsored — appears on top"/>
      </td>
      <td>${v.isActive ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
      <td>
        <button class="action-btn" onclick="viewVenue('${v._id}')"><i class="fas fa-eye"></i></button>
        <button class="action-btn" onclick="toggleVenueActive('${v._id}')" title="Toggle active">${v.isActive ? '<i class="fas fa-toggle-on"></i>' : '<i class="fas fa-toggle-off"></i>'}</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:20px">No venues found</td></tr>';
}

async function toggleSponsor(id) {
  try {
    const res = await adminReq('PATCH', `/admin/venues/${id}/sponsor`);
    toast(res.message);
  } catch (e) { toast(e.message, true); }
}

async function changeCommission(id, val) {
  try {
    const res = await adminReq('PATCH', `/admin/venues/${id}/commission`, { commissionPct: Number(val) });
    toast(res.message);
  } catch (e) { toast(e.message, true); }
}

async function toggleVenueActive(id) {
  try {
    const res = await adminReq('PATCH', `/admin/venues/${id}/toggle-active`);
    toast(res.message); sectionLoaded['sec-venues'] = false;
    loadVenues(document.getElementById('venueSearch')?.value || '', document.getElementById('venueSportFilter')?.value || 'all');
  } catch (e) { toast(e.message, true); }
}

async function viewVenue(id) {
  try {
    const res = await adminReq('GET', `/admin/venues/${id}`);
    const v = res.data;
    showModal(`
      <h3><i class="fas fa-futbol"></i> ${escHtml(v.name)}</h3>
      ${v.images?.length ? `<div style="display:flex;gap:8px;overflow-x:auto;margin-bottom:16px">${v.images.map(img => `<img src="${img}" style="height:80px;border-radius:8px;object-fit:cover"/>`).join('')}</div>` : ''}
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Sport</div><div class="value">${v.sport}</div></div>
        <div class="detail-item"><div class="label">Location</div><div class="value">${escHtml(v.location)}</div></div>
        <div class="detail-item"><div class="label">Price</div><div class="value">${fmtMoney(v.price)}/hr</div></div>
        <div class="detail-item"><div class="label">Rating</div><div class="value">${v.rating}⭐ (${v.reviewsCount} reviews)</div></div>
        <div class="detail-item"><div class="label">Turfs/Courts</div><div class="value">${v.specs?.turfs || 1}</div></div>
        <div class="detail-item"><div class="label">Dimensions</div><div class="value">${v.specs?.length}×${v.specs?.breadth}${v.specs?.height ? '×' + v.specs.height : ''} m</div></div>
        <div class="detail-item"><div class="label">Condition</div><div class="value">${escHtml(v.specs?.condition || '—')}</div></div>
        <div class="detail-item"><div class="label">Equipment</div><div class="value">${escHtml(v.specs?.tools || '—')}</div></div>
        <div class="detail-item"><div class="label">Hours</div><div class="value">${v.openHour || 6}:00 – ${v.closeHour || 22}:00</div></div>
        <div class="detail-item"><div class="label">Tags</div><div class="value">${(v.tags || []).join(', ') || '—'}</div></div>
        <div class="detail-item"><div class="label">Commission</div><div class="value" style="color:var(--green);font-size:18px">${v.commissionPct || 10}%</div></div>
        <div class="detail-item"><div class="label">Convenience Fee</div><div class="value">${fmtMoney(v.convenienceFee || 0)}</div></div>
        <div class="detail-item"><div class="label">Sponsored</div><div class="value">${v.isSponsored ? '⭐ Yes' : 'No'}</div></div>
        <div class="detail-item"><div class="label">Active</div><div class="value">${v.isActive ? '✅ Yes' : '❌ No'}</div></div>
      </div>
      <div class="detail-grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:12px">
        <div class="detail-item"><div class="label">Total Bookings</div><div class="value">${v.stats?.totalBookings || 0}</div></div>
        <div class="detail-item"><div class="label">Total Revenue</div><div class="value">${fmtMoney(v.stats?.totalRevenue)}</div></div>
        <div class="detail-item"><div class="label">Platform Cut</div><div class="value">${fmtMoney(v.stats?.platformCut)}</div></div>
      </div>
      <div style="margin-top:12px">
        <div class="label" style="font-size:11px;color:var(--muted);margin-bottom:4px">OWNER</div>
        <div>${escHtml(v.owner?.name || '—')} · ${escHtml(v.owner?.email || '')} · ${v.owner?.isVerified ? '✅ Verified' : '❌ Unverified'}</div>
      </div>
      ${v.blockedSlots?.length ? `<div style="margin-top:12px"><div class="label" style="font-size:11px;color:var(--muted);margin-bottom:4px">OWNER-BLOCKED SLOTS</div>${v.blockedSlots.map(s => `<div style="font-size:12px;color:var(--red)">${s.date}: hours ${s.hours.join(', ')}</div>`).join('')}</div>` : ''}
      ${v.adminNotes ? `<div style="margin-top:12px"><div class="label" style="font-size:11px;color:var(--muted);margin-bottom:4px">ADMIN NOTES</div><div style="font-size:13px">${escHtml(v.adminNotes)}</div></div>` : ''}
    `);
  } catch (e) { toast(e.message, true); }
}

/* ═══════════════════════════════════════════
   BOOKINGS
═══════════════════════════════════════════ */
async function loadBookings(status = 'all', page = 1) {
  try {
    const params = { page, limit: 30 };
    if (status && status !== 'all') params.status = status;
    const dateFrom = document.getElementById('bkDateFrom')?.value;
    const dateTo = document.getElementById('bkDateTo')?.value;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    const qs = new URLSearchParams(params).toString();
    const res = await adminReq('GET', `/admin/bookings?${qs}`);
    renderBookingsTable(res.data, res.total, page);
  } catch (e) { toast('Failed to load bookings: ' + e.message, true); }
}

function renderBookingsTable(bookings, total, page) {
  const tbody = document.querySelector('#bookingsTable tbody');
  tbody.innerHTML = bookings.map(b => `
    <tr>
      <td>${escHtml(b.customer?.name || '—')}</td>
      <td>${escHtml(b.venue?.name || '—')}</td>
      <td>${b.date}</td>
      <td>${b.time}</td>
      <td>${fmtMoney(b.amount)}</td>
      <td>${b.commissionPct || 10}%</td>
      <td><span class="badge badge-${b.status === 'completed' ? 'green' : b.status === 'cancelled' ? 'red' : b.status === 'upcoming' ? 'blue' : 'yellow'}">${b.status}</span></td>
      <td><span class="badge badge-${b.paymentStatus === 'paid' ? 'green' : b.paymentStatus === 'refunded' ? 'red' : 'yellow'}">${b.paymentStatus}</span></td>
      <td>
        ${b.status !== 'cancelled' && b.paymentStatus === 'paid' ? `<button class="action-btn danger" onclick="forceRefund('${b._id}')"><i class="fas fa-undo"></i></button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:20px">No bookings found</td></tr>';
}

async function forceRefund(id) {
  if (!confirm('Force refund this booking? This cannot be undone.')) return;
  try {
    const res = await adminReq('POST', `/admin/bookings/${id}/force-refund`);
    toast(res.message); sectionLoaded['sec-bookings'] = false;
    loadBookings(document.getElementById('bkStatusFilter')?.value || 'all');
  } catch (e) { toast(e.message, true); }
}

/* ═══════════════════════════════════════════
   REVIEWS
═══════════════════════════════════════════ */
async function loadReviews(page = 1) {
  try {
    const res = await adminReq('GET', `/admin/reviews?page=${page}&limit=30`);
    const tbody = document.querySelector('#reviewsTable tbody');
    tbody.innerHTML = res.data.map(r => `
      <tr>
        <td>${escHtml(r.customer?.name || '—')}</td>
        <td>${escHtml(r.venue?.name || '—')}</td>
        <td>${'⭐'.repeat(r.rating)}</td>
        <td style="max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.text)}</td>
        <td>${fmtDate(r.createdAt)}</td>
        <td><button class="action-btn danger" onclick="deleteReview('${r._id}')"><i class="fas fa-trash"></i></button></td>
      </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">No reviews</td></tr>';
  } catch (e) { toast(e.message, true); }
}

async function deleteReview(id) {
  if (!confirm('Delete this review?')) return;
  try {
    const res = await adminReq('DELETE', `/admin/reviews/${id}`);
    toast(res.message); sectionLoaded['sec-reviews'] = false; loadReviews();
  } catch (e) { toast(e.message, true); }
}

/* ═══════════════════════════════════════════
   PROMO CODES
═══════════════════════════════════════════ */
async function loadPromos() {
  try {
    const res = await adminReq('GET', '/admin/promos');
    const tbody = document.querySelector('#promosTable tbody');
    tbody.innerHTML = res.data.map(p => `
      <tr>
        <td><strong style="color:var(--green)">${escHtml(p.code)}</strong></td>
        <td>${p.discountType === 'flat' ? fmtMoney(p.discountValue) + ' off' : p.discountValue + '% off'}</td>
        <td>${fmtMoney(p.minOrder)}</td>
        <td>${p.maxDiscount ? fmtMoney(p.maxDiscount) : '—'}</td>
        <td>${p.usedCount}${p.maxUses ? '/' + p.maxUses : ''}</td>
        <td>${p.expiresAt ? fmtDate(p.expiresAt) : 'Never'}</td>
        <td>${p.isActive ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Off</span>'}</td>
        <td>
          <button class="action-btn" onclick="togglePromo('${p._id}')">${p.isActive ? '<i class="fas fa-toggle-on"></i>' : '<i class="fas fa-toggle-off"></i>'}</button>
          <button class="action-btn danger" onclick="deletePromo('${p._id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:20px">No promo codes</td></tr>';
  } catch (e) { toast(e.message, true); }
}

async function createPromo() {
  const code = document.getElementById('promoCode').value.trim().toUpperCase();
  const discountType = document.getElementById('promoType').value;
  const discountValue = Number(document.getElementById('promoValue').value);
  const minOrder = Number(document.getElementById('promoMinOrder').value || 0);
  const maxDiscount = Number(document.getElementById('promoMaxDiscount').value || 0);
  const maxUses = Number(document.getElementById('promoMaxUses').value || 0);
  const expiresAt = document.getElementById('promoExpiry').value || null;

  if (!code || !discountValue) { toast('Code and discount value required', true); return; }
  try {
    await adminReq('POST', '/admin/promos', { code, discountType, discountValue, minOrder, maxDiscount, maxUses, expiresAt });
    toast('✅ Promo created: ' + code);
    sectionLoaded['sec-promos'] = false; loadPromos();
    // Clear form
    document.getElementById('promoCode').value = '';
    document.getElementById('promoValue').value = '';
  } catch (e) { toast(e.message, true); }
}

async function togglePromo(id) {
  try { await adminReq('PATCH', `/admin/promos/${id}/toggle`); sectionLoaded['sec-promos'] = false; loadPromos(); }
  catch (e) { toast(e.message, true); }
}

async function deletePromo(id) {
  if (!confirm('Delete this promo code?')) return;
  try { await adminReq('DELETE', `/admin/promos/${id}`); toast('Promo deleted'); sectionLoaded['sec-promos'] = false; loadPromos(); }
  catch (e) { toast(e.message, true); }
}

/* ═══════════════════════════════════════════
   ANNOUNCEMENTS
═══════════════════════════════════════════ */
async function loadAnnouncements() {
  try {
    const res = await adminReq('GET', '/admin/announcements');
    const tbody = document.querySelector('#announcementsTable tbody');
    tbody.innerHTML = res.data.map(a => `
      <tr>
        <td><strong>${escHtml(a.title)}</strong></td>
        <td style="max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(a.message)}</td>
        <td><span class="badge badge-${a.type === 'promo' ? 'green' : a.type === 'warning' ? 'yellow' : a.type === 'maintenance' ? 'red' : 'blue'}">${a.type}</span></td>
        <td>${a.isActive ? '<span class="badge badge-green">Live</span>' : '<span class="badge badge-muted">Off</span>'}</td>
        <td>${a.expiresAt ? fmtDate(a.expiresAt) : 'Never'}</td>
        <td><button class="action-btn danger" onclick="deleteAnnouncement('${a._id}')"><i class="fas fa-trash"></i></button></td>
      </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">No announcements</td></tr>';
  } catch (e) { toast(e.message, true); }
}

async function createAnnouncement() {
  const title = document.getElementById('annTitle').value.trim();
  const message = document.getElementById('annMessage').value.trim();
  const type = document.getElementById('annType').value;
  const expiresAt = document.getElementById('annExpiry').value || null;
  if (!title || !message) { toast('Title and message required', true); return; }
  try {
    await adminReq('POST', '/admin/announcements', { title, message, type, expiresAt, isActive: true });
    toast('✅ Announcement created'); sectionLoaded['sec-announcements'] = false; loadAnnouncements();
    document.getElementById('annTitle').value = ''; document.getElementById('annMessage').value = '';
  } catch (e) { toast(e.message, true); }
}

async function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  try { await adminReq('DELETE', `/admin/announcements/${id}`); toast('Deleted'); sectionLoaded['sec-announcements'] = false; loadAnnouncements(); }
  catch (e) { toast(e.message, true); }
}

/* ═══════════════════════════════════════════
   BLOCKED SLOTS
═══════════════════════════════════════════ */
async function loadBlockedSlots() {
  try {
    const res = await adminReq('GET', '/admin/blocked-slots');
    const container = document.getElementById('blockedSlotsContent');
    if (!res.data.length) { container.innerHTML = '<p style="color:var(--muted);padding:20px">No owner-blocked slots found across any venue.</p>'; return; }
    container.innerHTML = res.data.map(v => `
      <div style="background:var(--dark3);border-radius:10px;padding:14px;margin-bottom:10px">
        <div style="font-weight:700;margin-bottom:6px">${escHtml(v.name)} <span style="color:var(--muted);font-size:12px">(${v.sport}) · by ${escHtml(v.owner?.name || '—')}</span></div>
        ${v.blockedSlots.map(s => `<div style="font-size:12px;color:var(--red);margin-left:12px">📅 ${s.date} → Hours: ${s.hours.join(', ')}</div>`).join('')}
      </div>
    `).join('');
  } catch (e) { toast(e.message, true); }
}

/* ═══════════════════════════════════════════
   ANALYTICS (full page charts)
═══════════════════════════════════════════ */
async function loadAnalytics() {
  if (!statsData) {
    try { const res = await adminReq('GET', '/admin/stats'); statsData = res.data; }
    catch (e) { toast(e.message, true); return; }
  }
  const d = statsData;
  // Top venues bar chart
  const ctx = document.getElementById('chartTopVenues')?.getContext('2d');
  if (ctx && d.topVenues?.length) {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: d.topVenues.map(v => v.name?.slice(0, 15)),
        datasets: [
          { label: 'Bookings', data: d.topVenues.map(v => v.count), backgroundColor: 'rgba(0,200,83,.6)' },
          { label: 'Revenue ₹', data: d.topVenues.map(v => v.revenue), backgroundColor: 'rgba(66,165,245,.6)' },
        ],
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#e8f5e9' } } }, scales: { x: { ticks: { color: '#7aad82', maxRotation: 45 } }, y: { ticks: { color: '#7aad82' }, beginAtZero: true } } },
    });
  }
  // User growth
  const ctx2 = document.getElementById('chartUserGrowth')?.getContext('2d');
  if (ctx2 && d.userGrowth?.length) {
    new Chart(ctx2, {
      type: 'line',
      data: {
        labels: d.userGrowth.map(i => i._id.slice(5)),
        datasets: [{ label: 'New Users', data: d.userGrowth.map(i => i.count), borderColor: '#42a5f5', backgroundColor: 'rgba(66,165,245,.1)', fill: true, tension: .4 }],
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#e8f5e9' } } }, scales: { x: { ticks: { color: '#7aad82' } }, y: { ticks: { color: '#7aad82' }, beginAtZero: true } } },
    });
  }
}

/* ═══════════════════════════════════════════
   AUDIT LOG
═══════════════════════════════════════════ */
async function loadAuditLog(page = 1) {
  try {
    const res = await adminReq('GET', `/admin/audit-log?page=${page}&limit=50`);
    const container = document.getElementById('auditLogContent');
    container.innerHTML = res.data.map(log => `
      <div class="audit-item">
        <div class="audit-dot"></div>
        <div>
          <div class="audit-action">${escHtml(log.action.replace(/_/g, ' ').toUpperCase())}</div>
          <div class="audit-detail">${escHtml(log.details)}</div>
          <div class="audit-time">${new Date(log.createdAt).toLocaleString('en-IN')}</div>
        </div>
      </div>
    `).join('') || '<p style="color:var(--muted);padding:20px">No admin actions recorded yet.</p>';
  } catch (e) { toast(e.message, true); }
}

/* ═══════════════════════════════════════════
   CSV EXPORT
═══════════════════════════════════════════ */
async function exportCSV(type) {
  try {
    const res = await fetch(`${API_BASE}/admin/export/${type}`, {
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${type}_export.csv`; a.click();
    URL.revokeObjectURL(url);
    toast(`📥 ${type} CSV downloaded`);
  } catch (e) { toast(e.message, true); }
}

/* ═══════════════════════════════════════════
   MODAL
═══════════════════════════════════════════ */
function showModal(html) {
  const overlay = document.getElementById('adminModalOverlay');
  const modal = document.getElementById('adminModalContent');
  modal.innerHTML = `<button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>` + html;
  overlay.classList.add('active');
}
function closeModal() {
  document.getElementById('adminModalOverlay').classList.remove('active');
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  initNavigation();

  // Check for existing session
  const saved = sessionStorage.getItem('admin_token');
  if (saved) {
    adminToken = saved;
    document.querySelector('.admin-login').style.display = 'none';
    document.querySelector('.admin-dash').classList.add('active');
    loadDashboard();
  }

  // Search handlers
  document.getElementById('userSearch')?.addEventListener('input', (e) => { sectionLoaded['sec-users'] = false; loadUsers(e.target.value); });
  document.getElementById('ownerSearch')?.addEventListener('input', (e) => { sectionLoaded['sec-owners'] = false; loadOwners(e.target.value); });
  document.getElementById('venueSearch')?.addEventListener('input', (e) => { sectionLoaded['sec-venues'] = false; loadVenues(e.target.value, document.getElementById('venueSportFilter')?.value); });
  document.getElementById('venueSportFilter')?.addEventListener('change', (e) => { sectionLoaded['sec-venues'] = false; loadVenues(document.getElementById('venueSearch')?.value || '', e.target.value); });
  document.getElementById('bkStatusFilter')?.addEventListener('change', (e) => { sectionLoaded['sec-bookings'] = false; loadBookings(e.target.value); });
  document.getElementById('bkDateFrom')?.addEventListener('change', () => { sectionLoaded['sec-bookings'] = false; loadBookings(document.getElementById('bkStatusFilter')?.value || 'all'); });
  document.getElementById('bkDateTo')?.addEventListener('change', () => { sectionLoaded['sec-bookings'] = false; loadBookings(document.getElementById('bkStatusFilter')?.value || 'all'); });

  // Modal close
  document.getElementById('adminModalOverlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
});
