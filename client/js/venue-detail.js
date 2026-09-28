/* =============================================
   MYTURFY — venue-detail.js  (rebuilt)
   Key changes vs original:
   • Time slots generated DYNAMICALLY from venue.openHour/closeHour
   • Booked slots fetched from /api/bookings/slots when date changes
   • Past slots (today, already gone) auto-marked unavailable
   • Date picker restricted to today → today+14 days
   • Owner-closed dates shown as warning, slots disabled
   • FIXED: Review button now resets properly (finally block)
   • FIXED: Razorpay createOrder wrapped with timeout to prevent infinite loading
   ============================================= */

document.addEventListener('DOMContentLoaded', async () => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  function toast(msg, isError = false) {
    $$('.turfy-toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'turfy-toast';
    t.textContent = msg;
    if (isError) t.style.background = '#c62828';
    document.body.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('visible')));
    setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 400); }, 3000);
  }

  /* ── READ VENUE ID FROM URL ── */
  const params = new URLSearchParams(location.search);
  const venueId = params.get('id');
  if (!venueId) { location.href = 'index.html'; return; }

  const nameEl = $('#vdName');
  if (nameEl) nameEl.textContent = 'Loading…';

  let venue;
  try {
    const res = await API.venues.get(venueId);
    venue = res.data;
    // Set meta description safely after data is fetched
    const metaDesc = document.getElementById('venueMetaDesc');
    if (metaDesc) {
      metaDesc.setAttribute('content',
        `Book ${venue.name} in ${venue.location} instantly. ${venue.sport} venue from ₹${venue.price}/hr with real-time slots, verified reviews and secure payment on MyTurfy.`
      );
    }
  } catch (err) {
    toast(`❌ ${err.message}`, true);
    setTimeout(() => location.href = 'index.html', 2000);
    return;
  }

  document.title = `MyTurfy – ${venue.name}`;

  /* ── BREADCRUMB ── */
  const breadSport = $('#breadSport'), breadVenue = $('#breadVenue');
  if (breadSport) { breadSport.textContent = venue.sport; breadSport.href = `venues.html?sport=${encodeURIComponent(venue.sport)}`; }
  if (breadVenue) breadVenue.textContent = venue.name;

  /* ══════════════════════════════════════
     CAROUSEL
  ══════════════════════════════════════ */
  const track      = $('#carouselTrack');
  const dotsEl     = $('#carouselDots');
  const thumbsEl   = $('#carouselThumbs');
  const prevBtn    = $('#carouselPrev');
  const nextBtn    = $('#carouselNext');
  const progressBar = $('#carouselProgress');
  const images = venue.images || [];
  let current = 0, autoTimer = null;

  images.forEach((src, i) => {
    const slide = document.createElement('div'); slide.className = 'carousel-slide';
    const img = document.createElement('img'); img.src = src; img.alt = `${venue.name} photo ${i + 1}`; img.loading = i === 0 ? 'eager' : 'lazy';
    slide.appendChild(img); track.appendChild(slide);
  });
  images.forEach((_, i) => {
    const dot = document.createElement('button'); dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Go to photo ${i + 1}`); dot.addEventListener('click', () => goTo(i)); dotsEl.appendChild(dot);
  });
  images.forEach((src, i) => {
    const wrap = document.createElement('div'); wrap.className = 'carousel-thumb' + (i === 0 ? ' active' : '');
    const img = document.createElement('img'); img.src = src; img.alt = `Thumb ${i + 1}`; img.loading = 'lazy';
    wrap.appendChild(img); wrap.addEventListener('click', () => goTo(i)); thumbsEl.appendChild(wrap);
  });

  function goTo(idx) {
    current = ((idx % images.length) + images.length) % images.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    $$('.carousel-dot', dotsEl).forEach((d, i) => d.classList.toggle('active', i === current));
    $$('.carousel-thumb', thumbsEl).forEach((t, i) => {
      t.classList.toggle('active', i === current);
      if (i === current) t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
    restartAuto();
  }
  prevBtn?.addEventListener('click', () => goTo(current - 1));
  nextBtn?.addEventListener('click', () => goTo(current + 1));
  document.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') goTo(current - 1); if (e.key === 'ArrowRight') goTo(current + 1); });

  let touchX = 0;
  track.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 40) goTo(current + (dx < 0 ? 1 : -1)); }, { passive: true });

  const AUTOPLAY_MS = 10000;
  function startProgress() {
    if (progressBar) {
      progressBar.style.transition = 'none'; progressBar.style.width = '0%';
      requestAnimationFrame(() => requestAnimationFrame(() => progressBar.classList.add('animating')));
    }
  }
  function restartAuto() {
    clearTimeout(autoTimer); if (progressBar) progressBar.classList.remove('animating');
    startProgress(); autoTimer = setTimeout(() => goTo(current + 1), AUTOPLAY_MS);
  }
  restartAuto();
  const container = $('#carouselContainer');
  container?.addEventListener('mouseenter', () => { clearTimeout(autoTimer); progressBar?.classList.remove('animating'); });
  container?.addEventListener('mouseleave', () => restartAuto());

  /* ══════════════════════════════════════
     POPULATE VENUE INFO
  ══════════════════════════════════════ */
  const FACILITY_LABELS = { floodlights: 'Floodlights', parking: 'Parking', changing: 'Changing Rooms', cafeteria: 'Cafeteria', ac: 'Air Conditioned', shower: 'Shower', wifi: 'Wi-Fi' };
  const FACILITY_ICONS  = { floodlights: 'fa-lightbulb', parking: 'fa-car', changing: 'fa-door-open', cafeteria: 'fa-utensils', ac: 'fa-snowflake', shower: 'fa-shower', wifi: 'fa-wifi' };

  $('#vdName').textContent      = venue.name;
  $('#vdLocation').textContent  = venue.location;
  $('#vdPrice').textContent     = `₹${venue.price}`;
  $('#vdRatingVal').textContent = venue.rating;
  $('#vdReviews').textContent   = `(${venue.reviewsCount || 0} reviews)`;
  if ($('#vdDistance')) $('#vdDistance').textContent = venue.distance || '';

  function starsHtml(r) {
    let h = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= Math.floor(r)) h += '<i class="fas fa-star"></i>';
      else if (i - r < 1)     h += '<i class="fas fa-star-half-alt"></i>';
      else                    h += '<i class="far fa-star empty"></i>';
    }
    return h;
  }
  $('#vdStars').innerHTML = starsHtml(venue.rating);

  const tagsEl = $('#vdTags');
  (venue.tags || []).forEach(t => {
    tagsEl.innerHTML += `<span class="vtag"><i class="fas ${FACILITY_ICONS[t] || 'fa-check'}"></i>${FACILITY_LABELS[t] || t}</span>`;
  });

  const s = venue.specs || {};
  const specRows = [
    { icon: '📏', label: 'Length',       value: `${s.length || 0} m` },
    { icon: '📐', label: 'Breadth',      value: `${s.breadth || 0} m` },
    { icon: '📊', label: 'Height',       value: `${s.height || 0} m` },
    { icon: '🧮', label: 'Total Area',   value: `${(venue.area || 0).toLocaleString('en-IN')} m²` },
    { icon: '📦', label: 'Volume',       value: `${(venue.volume || 0).toLocaleString('en-IN')} m³` },
    { icon: '🏟️', label: 'No. of Turfs', value: s.turfs || 1 },
    { icon: '🌱', label: 'Court Condition', value: s.condition || '—', full: true },
    { icon: '🛠️', label: 'Tools Provided',  value: s.tools || '—', full: true },
  ];
  const grid = $('#vdSpecsGrid');
  specRows.forEach(row => {
    const el = document.createElement('div');
    el.className = 'spec-item' + (row.full ? ' full' : '');
    el.innerHTML = `<span class="spec-icon">${row.icon}</span><span class="spec-label">${row.label}</span><span class="spec-val">${row.value}</span>`;
    grid.appendChild(el);
  });

  /* ══════════════════════════════════════
     COURT PICKER ENGINE — BookMyShow Seat-Map Style
  ══════════════════════════════════════ */
  const turfsCount = venue.specs?.turfs || 1;
  let selectedCourt = 1;

  /* Sport-specific SVG pitch diagrams */
  const COURT_SVG = {
    Football: `<svg viewBox="0 0 72 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="70" height="46" rx="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <line x1="36" y1="1" x2="36" y2="47" stroke="currentColor" stroke-width="1"/>
      <circle cx="36" cy="24" r="7" stroke="currentColor" stroke-width="1" fill="none"/>
      <circle cx="36" cy="24" r="1" fill="currentColor"/>
      <rect x="1" y="17" width="8" height="14" stroke="currentColor" stroke-width="1" fill="none"/>
      <rect x="63" y="17" width="8" height="14" stroke="currentColor" stroke-width="1" fill="none"/>
      <rect x="1" y="11" width="16" height="26" stroke="currentColor" stroke-width="1" fill="none"/>
      <rect x="55" y="11" width="16" height="26" stroke="currentColor" stroke-width="1" fill="none"/>
    </svg>`,
    Cricket: `<svg viewBox="0 0 72 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="36" cy="24" rx="34" ry="22" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <ellipse cx="36" cy="24" rx="10" ry="14" stroke="currentColor" stroke-width="1" fill="none"/>
      <line x1="36" y1="10" x2="36" y2="38" stroke="currentColor" stroke-width="1"/>
      <line x1="30" y1="17" x2="42" y2="17" stroke="currentColor" stroke-width="0.8"/>
      <line x1="30" y1="31" x2="42" y2="31" stroke="currentColor" stroke-width="0.8"/>
      <rect x="33" y="20" width="6" height="8" rx="1" stroke="currentColor" stroke-width="0.8" fill="none"/>
    </svg>`,
    Basketball: `<svg viewBox="0 0 72 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="70" height="46" rx="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <line x1="36" y1="1" x2="36" y2="47" stroke="currentColor" stroke-width="1"/>
      <circle cx="36" cy="24" r="6" stroke="currentColor" stroke-width="1" fill="none"/>
      <path d="M1 24 Q18 10 36 24 Q54 38 71 24" stroke="currentColor" stroke-width="0.8" fill="none"/>
      <path d="M1 24 Q18 38 36 24 Q54 10 71 24" stroke="currentColor" stroke-width="0.8" fill="none"/>
      <path d="M1 8 Q14 8 14 24 Q14 40 1 40" stroke="currentColor" stroke-width="1" fill="none"/>
      <path d="M71 8 Q58 8 58 24 Q58 40 71 40" stroke="currentColor" stroke-width="1" fill="none"/>
      <rect x="14" y="18" width="8" height="12" rx="1" stroke="currentColor" stroke-width="1" fill="none"/>
      <rect x="50" y="18" width="8" height="12" rx="1" stroke="currentColor" stroke-width="1" fill="none"/>
    </svg>`,
    Badminton: `<svg viewBox="0 0 48 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="46" height="70" rx="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <line x1="1" y1="36" x2="47" y2="36" stroke="currentColor" stroke-width="1.5"/>
      <line x1="24" y1="1" x2="24" y2="71" stroke="currentColor" stroke-width="0.8"/>
      <line x1="1" y1="12" x2="47" y2="12" stroke="currentColor" stroke-width="0.8"/>
      <line x1="1" y1="60" x2="47" y2="60" stroke="currentColor" stroke-width="0.8"/>
    </svg>`,
    Tennis: `<svg viewBox="0 0 72 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="70" height="46" rx="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <line x1="36" y1="1" x2="36" y2="47" stroke="currentColor" stroke-width="1.5"/>
      <line x1="36" y1="7" x2="36" y2="41" stroke="currentColor" stroke-width="0.6"/>
      <line x1="1" y1="7" x2="71" y2="7" stroke="currentColor" stroke-width="0.8"/>
      <line x1="1" y1="41" x2="71" y2="41" stroke="currentColor" stroke-width="0.8"/>
      <line x1="12" y1="7" x2="12" y2="41" stroke="currentColor" stroke-width="0.8"/>
      <line x1="60" y1="7" x2="60" y2="41" stroke="currentColor" stroke-width="0.8"/>
    </svg>`,
    Pickleball: `<svg viewBox="0 0 72 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="70" height="46" rx="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <line x1="36" y1="1" x2="36" y2="47" stroke="currentColor" stroke-width="1.5"/>
      <line x1="1" y1="17" x2="71" y2="17" stroke="currentColor" stroke-width="0.8"/>
      <line x1="1" y1="31" x2="71" y2="31" stroke="currentColor" stroke-width="0.8"/>
      <line x1="36" y1="17" x2="36" y2="31" stroke="currentColor" stroke-width="1.5"/>
      <rect x="12" y="17" width="12" height="14" stroke="currentColor" stroke-width="0.6" fill="none"/>
      <rect x="48" y="17" width="12" height="14" stroke="currentColor" stroke-width="0.6" fill="none"/>
    </svg>`,
    Bowling: `<svg viewBox="0 0 40 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="38" height="70" rx="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <rect x="7" y="1" width="26" height="70" stroke="currentColor" stroke-width="0.8" fill="none"/>
      <line x1="1" y1="58" x2="39" y2="58" stroke="currentColor" stroke-width="0.8"/>
      <circle cx="20" cy="65" r="4" stroke="currentColor" stroke-width="1" fill="none"/>
      <line x1="16" y1="15" x2="24" y2="15" stroke="currentColor" stroke-width="0.6"/>
      <line x1="14" y1="19" x2="26" y2="19" stroke="currentColor" stroke-width="0.6"/>
    </svg>`,
    Pool: `<svg viewBox="0 0 72 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="70" height="38" rx="4" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1" fill="none"/>
      <circle cx="64" cy="8" r="3" stroke="currentColor" stroke-width="1" fill="none"/>
      <circle cx="8" cy="32" r="3" stroke="currentColor" stroke-width="1" fill="none"/>
      <circle cx="64" cy="32" r="3" stroke="currentColor" stroke-width="1" fill="none"/>
      <circle cx="36" cy="8" r="3" stroke="currentColor" stroke-width="1" fill="none"/>
      <circle cx="36" cy="32" r="3" stroke="currentColor" stroke-width="1" fill="none"/>
      <circle cx="36" cy="20" r="4" stroke="currentColor" stroke-width="1" fill="none"/>
      <circle cx="28" cy="20" r="1.5" fill="currentColor"/>
      <circle cx="44" cy="20" r="1.5" fill="currentColor"/>
    </svg>`,
    default: `<svg viewBox="0 0 72 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="70" height="46" rx="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <line x1="36" y1="1" x2="36" y2="47" stroke="currentColor" stroke-width="1"/>
      <circle cx="36" cy="24" r="8" stroke="currentColor" stroke-width="1" fill="none"/>
    </svg>`
  };

  function renderCourtGrid(containerId, onCourtSelect) {
    const container = $('#' + containerId);
    if (!container) return;
    if (turfsCount <= 1) {
      container.style.display = 'none';
      const label = container.previousElementSibling;
      if (label && label.classList.contains('form-label')) label.style.display = 'none';
      return;
    }
    const svgTemplate = COURT_SVG[venue.sport] || COURT_SVG.default;
    container.style.display = 'flex';
    container.innerHTML = Array.from({ length: turfsCount }, (_, i) => {
      const c = i + 1;
      const sel = c === selectedCourt;
      return `<div class="court-card${sel ? ' selected' : ''}" data-court="${c}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="Court ${c}">
        <div class="court-svg-wrap" style="color:${sel ? 'var(--green)' : 'rgba(255,255,255,0.3)'}">${svgTemplate}</div>
        <div class="court-card-label">Court ${c}</div>
        <div class="court-card-badge">${sel ? '<i class="fas fa-check-circle"></i> Selected' : 'Available'}</div>
      </div>`;
    }).join('');

    $$('.court-card', container).forEach(card => {
      const activate = () => {
        selectedCourt = +card.dataset.court;
        renderCourtGrid('qbCourtGrid', onCourtSelect);
        renderCourtGrid('mCourtGrid', onCourtSelect);
        onCourtSelect();
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
    });
  }

  // Reload slots when court selection changes
  function onCourtSelect() {
    if ($('#qbDate')?.value) {
      loadSlots($('#qbDate').value, 'qbTimeSlots', t => { selTime = t; updateQBSummary(); }, 'qbDateNote');
    }
    if ($('#mDate')?.value) {
      loadSlots($('#mDate').value, 'mBookSlots', t => { selTimeMob = t; updateMSummary(); }, 'mDateNote');
    }
  }

  renderCourtGrid('qbCourtGrid', onCourtSelect);
  renderCourtGrid('mCourtGrid', onCourtSelect);

  /* ══════════════════════════════════════
     DYNAMIC TIME SLOT ENGINE
  ══════════════════════════════════════ */
  const openH  = venue.openHour  ?? 6;
  const closeH = venue.closeHour ?? 22;
  const closedDates = venue.closedDates || [];

  const getLocalDateString = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  const todayStr = getLocalDateString(new Date());
  const maxDate  = (() => { const d = new Date(); d.setDate(d.getDate() + 14); return getLocalDateString(d); })();

  function hourLabel(h) {
    if (h === 0)  return '12 AM';
    if (h < 12)   return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  }

  function renderSlots(containerId, bookedHours, date, onSelect) {
    const container = $('#' + containerId);
    if (!container) return;

    const isToday  = date === todayStr;
    const nowHour  = new Date().getHours();
    const isClosed = closedDates.includes(date);

    if (isClosed) {
      container.innerHTML = `<p style="color:var(--red);font-size:13px;padding:8px 0"><i class="fas fa-ban"></i> This venue is closed on this date. Please pick another date.</p>`;
      return;
    }

    let html = '';
    for (let h = openH; h < closeH; h++) {
      const isPast   = isToday && h <= nowHour;
      const isBooked = bookedHours.includes(h);
      const blocked  = isPast || isBooked;
      const title    = isPast ? 'Past slot' : isBooked ? 'Already booked' : 'Available';
      html += `<button
        class="time-slot${blocked ? ' unavailable' : ''}"
        data-time="${String(h).padStart(2, '0')}:00"
        data-hour="${h}"
        title="${title}"
        ${blocked ? 'disabled' : ''}
      >${hourLabel(h)}</button>`;
    }

    if (!html) {
      container.innerHTML = `<p style="color:var(--muted);font-size:13px;padding:8px 0">No slots configured for this venue.</p>`;
      return;
    }
    container.innerHTML = html;

    $$('.time-slot', container).forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        $$('.time-slot', container).forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const selectedH = parseInt(btn.dataset.hour, 10);
        const maxDurationAllowed = Math.max(1, closeH - selectedH);

        // Update duration buttons in both desktop and mobile views
        ['#qbDuration', '#bookingModal'].forEach(scopeId => {
          const durBtns = $$(scopeId ? `${scopeId} .dur-btn` : '.dur-btn');
          let activeBtnDisabled = false;
          durBtns.forEach(durBtn => {
            const hrs = +durBtn.dataset.hours;
            const disabled = hrs > maxDurationAllowed;
            durBtn.disabled = disabled;
            durBtn.style.opacity = disabled ? '0.35' : '1';
            durBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
            if (disabled && durBtn.classList.contains('active')) {
              durBtn.classList.remove('active');
              activeBtnDisabled = true;
            }
          });
          if (activeBtnDisabled) {
            const firstValid = durBtns.find(b => !b.disabled);
            if (firstValid) {
              firstValid.classList.add('active');
              if (scopeId === '#bookingModal') selDurMob = +firstValid.dataset.hours;
              else selDur = +firstValid.dataset.hours;
            }
          }
        });

        onSelect(btn.dataset.time);
      });
    });
  }

  async function loadSlots(date, containerId, onSelect, noteElId) {
    const container = $('#' + containerId);
    if (!container) return;

    const noteEl = noteElId ? $('#' + noteElId) : null;
    if (closedDates.includes(date)) {
      if (noteEl) noteEl.textContent = '— Closed';
      renderSlots(containerId, [], date, onSelect);
      return;
    }
    if (noteEl) noteEl.textContent = '';

    container.innerHTML = `<p style="color:var(--muted);font-size:12px;padding:8px 0"><i class="fas fa-spinner fa-spin"></i> Loading slots…</p>`;
    try {
      const res    = await API.bookings.getBookedSlots(venueId, date, selectedCourt);
      const booked = res.data || [];
      renderSlots(containerId, booked, date, onSelect);
    } catch (_) {
      renderSlots(containerId, [], date, onSelect);
    }
  }

  /* ══════════════════════════════════════
     BOOKING STATE & SPLIT BILL
  ══════════════════════════════════════ */
  let selDate = todayStr, selTime = '', selDur = 1;
  let selDateMob = todayStr, selTimeMob = '', selDurMob = 1;

  /* ══════════════════════════════════════
     SPLIT BILL LOGIC — Premium (Desktop + Mobile)
  ══════════════════════════════════════ */
  let splitPlayers = 2;

  function updateSplitUI() {
    const total = venue.price * (selDur || selDurMob || 1);
    const perPerson = Math.round(total / splitPlayers);
    const colors = ['#e53935','#1e88e5','#43a047','#fb8c00','#8e24aa','#00acc1'];
    const avatarHTML = Array.from({ length: Math.min(splitPlayers, 6) }, (_, i) =>
      `<div class="split-avatar" style="background:${colors[i % colors.length]}">${i === 0 ? '<i class="fas fa-user" style="font-size:10px"></i>' : (i === Math.min(splitPlayers, 6) - 1 && splitPlayers > 6 ? `+${splitPlayers - 5}` : '<i class="fas fa-user" style="font-size:10px"></i>')}</div>`
    ).join('');

    // Update both desktop and mobile elements
    ['', 'm'].forEach(prefix => {
      const countEl = $(`#${prefix}${prefix ? 'P' : 'p'}layerCount`);
      const perEl = $(`#${prefix}${prefix ? 'P' : 'p'}erPersonCost`);
      const noteEl = $(`#${prefix ? 'mS' : 's'}plitNote`);
      const avatarsEl = $(`#${prefix ? 'mS' : 's'}plitAvatars`);
      if (countEl) countEl.textContent = splitPlayers;
      if (perEl) perEl.textContent = `₹${perPerson.toLocaleString('en-IN')}`;
      if (noteEl) noteEl.textContent = `of ₹${total.toLocaleString('en-IN')} total`;
      if (avatarsEl) avatarsEl.innerHTML = avatarHTML;
    });
  }

  // Toggle handlers — desktop and mobile
  function setupSplitToggle(toggleId, areaId, arrowId) {
    $(toggleId)?.addEventListener('click', () => {
      const area = $(areaId), arrow = $(arrowId);
      const open = area?.style.display !== 'none';
      if (area) area.style.display = open ? 'none' : 'block';
      if (arrow) arrow.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
      if (!open) updateSplitUI();
    });
  }
  setupSplitToggle('#splitBillToggle', '#splitExpandedArea', '#splitArrow');
  setupSplitToggle('#mSplitBillToggle', '#mSplitExpandedArea', '#mSplitArrow');

  // Stepper handlers — desktop and mobile
  ['#stepDown', '#mStepDown'].forEach(id => {
    $(id)?.addEventListener('click', () => { if (splitPlayers > 2) { splitPlayers--; updateSplitUI(); } });
  });
  ['#stepUp', '#mStepUp'].forEach(id => {
    $(id)?.addEventListener('click', () => { if (splitPlayers < 20) { splitPlayers++; updateSplitUI(); } });
  });

  // Shared split booking logic
  async function handleSplitShare(openWhatsApp) {
    if (!Auth.isLoggedIn()) {
      toast('❌ Please sign in to create a split booking', true);
      if (typeof Auth.openSignin === 'function') Auth.openSignin();
      return;
    }
    const d = selDate || selDateMob || todayStr;
    const t = selTime || selTimeMob;
    if (!t) {
      toast('❌ Please select a date and time slot first', true);
      return;
    }
    const dur = selDur || selDurMob || 1;

    try {
      toast('⏳ Creating team split booking…');
      const res = await API.payments.createSplitOrder(venue._id, d, t, dur, selectedCourt, splitPlayers);
      const splitCode = res.splitCode;
      const baseUrl = window.location.href.split('venue-detail.html')[0];
      const splitUrl = `${baseUrl}split-pay.html?code=${splitCode}`;

      if (openWhatsApp) {
        const perPerson = Math.round((venue.price * dur) / splitPlayers);
        const msg = encodeURIComponent(`🏟️ Team, let's play at ${venue.name}!\n📅 ${d} @ ${t} (Court ${selectedCourt})\n💰 Your share: ₹${perPerson} (split ${splitPlayers} ways)\n👉 Pay your share here: ${splitUrl}`);
        window.open(`https://wa.me/?text=${msg}`, '_blank');
      } else {
        try {
          await navigator.clipboard.writeText(splitUrl);
          toast('✅ Team split link copied to clipboard!');
        } catch (_) {
          toast(`Link: ${splitUrl}`);
        }
      }

      setTimeout(() => {
        window.location.href = `split-pay.html?code=${splitCode}`;
      }, 1200);
    } catch (err) {
      toast(`❌ ${err.message}`, true);
    }
  }

  // WhatsApp share — desktop and mobile
  ['#shareSplitBtn', '#mShareSplitBtn'].forEach(id => {
    $(id)?.addEventListener('click', () => handleSplitShare(true));
  });

  // Copy link — desktop and mobile
  ['#copySplitBtn', '#mCopySplitBtn'].forEach(id => {
    $(id)?.addEventListener('click', () => handleSplitShare(false));
  });

  const qbDate = $('#qbDate');
  if (qbDate) {
    qbDate.min   = todayStr;
    qbDate.max   = maxDate;
    qbDate.value = todayStr;
    loadSlots(todayStr, 'qbTimeSlots', t => { selTime = t; updateQBSummary(); }, 'qbDateNote');

    qbDate.addEventListener('change', () => {
      selDate = qbDate.value;
      selTime = '';
      loadSlots(selDate, 'qbTimeSlots', t => { selTime = t; updateQBSummary(); }, 'qbDateNote');
    });
  }

  function updateQBSummary() {
    const rateEl  = $('#qbRate');
    const durEl   = $('#qbDur');
    const totalEl = $('#qbTotal');
    if (rateEl)  rateEl.textContent  = `₹${venue.price}/hr`;
    if (durEl)   durEl.textContent   = `${selDur} hour${selDur > 1 ? 's' : ''}`;
    if (totalEl) totalEl.textContent = `₹${(venue.price * selDur).toLocaleString('en-IN')}`;
    updateTcoinsCalculation();
  }
  updateQBSummary();

  $$('#qbDuration .dur-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#qbDuration .dur-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selDur = +btn.dataset.hours;
      updateQBSummary();
    });
  });

  $('#qbConfirm')?.addEventListener('click', () => initiatePayment(selDate, selTime, selDur));

  /* ── Mobile booking modal ── */
  const bookingModal = $('#bookingModal'), bookingClose = $('#bookingClose');

  function openBooking() {
    const d = $('#mBookDate');
    if (d) {
      d.min   = todayStr;
      d.max   = maxDate;
      d.value = todayStr;
    }
    selDateMob = todayStr;
    selTimeMob = '';
    renderCourtGrid('mCourtGrid', onCourtSelect);
    loadSlots(todayStr, 'mBookSlots', t => { selTimeMob = t; updateMSummary(); }, 'mDateNote');
    updateMSummary();
    bookingModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeBooking() {
    removeTcoins();
    bookingModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  $('#bookDetailBtn')?.addEventListener('click', () => {
    if (window.innerWidth < 900) openBooking();
    else $('.quick-book-card')?.scrollIntoView({ behavior: 'smooth' });
  });
  bookingClose?.addEventListener('click', closeBooking);
  bookingModal?.addEventListener('click', e => { if (e.target === bookingModal) closeBooking(); });

  if ($('#modalVenueName')) $('#modalVenueName').textContent = venue.name;
  if ($('#modalVenueLoc')) $('#modalVenueLoc').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${escapeHTML(venue.location)}`;

  function updateMSummary() {
    if ($('#mSummaryRate'))  $('#mSummaryRate').textContent  = `₹${venue.price}/hr`;
    if ($('#mSummaryDur'))   $('#mSummaryDur').textContent   = `${selDurMob} hour${selDurMob > 1 ? 's' : ''}`;
    if ($('#mSummaryTotal')) $('#mSummaryTotal').textContent = `₹${(venue.price * selDurMob).toLocaleString('en-IN')}`;
    updateTcoinsCalculation();
  }

  $('#mBookDate')?.addEventListener('change', () => {
    selDateMob = $('#mBookDate').value;
    selTimeMob = '';
    loadSlots(selDateMob, 'mBookSlots', t => { selTimeMob = t; updateMSummary(); }, 'mDateNote');
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest('#bookingModal .dur-btn');
    if (btn) {
      $$('#bookingModal .dur-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selDurMob = +btn.dataset.hours;
      updateMSummary();
    }
  });

  $('#mConfirmBook')?.addEventListener('click', () => {
    const d = $('#mBookDate')?.value || selDateMob;
    if (!d)          { toast('❌ Select a date', true);      return; }
    if (!selTimeMob) { toast('❌ Select a time slot', true); return; }
    initiatePayment(d, selTimeMob, selDurMob);
  });

  /* ── 3-MINUTE COUNTDOWN TIMER & SLOT HOLD ENGINE ── */
  let holdInterval = null;
  let currentHoldBookingId = null;
  const HOLD_TOTAL_SECS = 3 * 60; // 3 minutes hold for solo bookings
  let holdExpired = false;    // Set to true when hold timer runs out
  let activeRzpInstance = null; // Reference to open Razorpay modal so timer can close it

  function stopHoldCountdown() {
    clearInterval(holdInterval);
    const bannerEls = [$('#checkoutHoldBanner'), $('#mCheckoutHoldBanner')].filter(Boolean);
    bannerEls.forEach(b => b.classList.remove('hold-active', 'hold-urgent'));
  }

  function reloadSlots() {
    if (selDate)    loadSlots(selDate,    'qbTimeSlots', t => { selTime    = t; updateQBSummary(); }, 'qbDateNote');
    if (selDateMob) loadSlots(selDateMob, 'mBookSlots',  t => { selTimeMob = t; updateMSummary();  }, 'mDateNote');
  }

  async function cancelCurrentHold() {
    if (currentHoldBookingId) {
      const bId = currentHoldBookingId;
      currentHoldBookingId = null;
      try {
        // Use releaseHold to instantly delete the hold booking and free the slot
        await API.bookings.releaseHold(bId);
      } catch (_) {
        // Fallback to regular cancel if releaseHold fails
        try { await API.bookings.cancel(bId); } catch (_) {}
      }
    }
    stopHoldCountdown();
    reloadSlots();
  }

  function startHoldCountdown(expiresAt) {
    const timerEls  = [$('#checkoutTimer'), $('#mCheckoutTimer')].filter(Boolean);
    const bannerEls = [$('#checkoutHoldBanner'), $('#mCheckoutHoldBanner')].filter(Boolean);
    const fillEls   = [$('#holdProgressFill'), $('#mHoldProgressFill')].filter(Boolean);

    bannerEls.forEach(b => b.classList.add('hold-active'));
    clearInterval(holdInterval);

    holdInterval = setInterval(async () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000));
      const mins = String(Math.floor(diff / 60)).padStart(2, '0');
      const secs = String(diff % 60).padStart(2, '0');
      const pct  = (diff / HOLD_TOTAL_SECS) * 100;

      timerEls.forEach(t => {
        t.textContent = `${mins}:${secs}`;
        t.style.color = diff > 120 ? '#00c853' : diff > 60 ? '#ffb300' : '#ef5350';
      });
      fillEls.forEach(f => {
        f.style.width = `${pct}%`;
        f.style.background = diff > 120
          ? 'linear-gradient(90deg,#00c853,#80f0a0)'
          : diff > 60
          ? 'linear-gradient(90deg,#ffb300,#ffd54f)'
          : 'linear-gradient(90deg,#ef5350,#ff7043)';
      });
      bannerEls.forEach(b => b.classList.toggle('hold-urgent', diff <= 60));

      if (diff <= 0) {
        holdExpired = true;
        // Force-close Razorpay payment modal if it's still open
        if (activeRzpInstance) {
          try { activeRzpInstance.close(); } catch (_) {}
          activeRzpInstance = null;
        }
        toast('⚠️ 3-minute slot hold expired. Slot is now released.', true);
        stopHoldCountdown();
        cancelCurrentHold();
      }
    }, 1000);
  }

  /* ── LATE PAYMENT REFUND NOTIFICATION MODAL ── */
  function showLatePaymentRefundNotice(message) {
    $('#latePaymentRefundModal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'latePaymentRefundModal';
    overlay.className = 'qr-modal-overlay active';
    overlay.style.cssText = 'z-index: 10000; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 20px;';

    overlay.innerHTML = `
      <div style="background: #111a14; border: 1px solid rgba(239,83,80,0.4); border-radius: 18px; max-width: 480px; width: 100%; padding: 28px 24px; text-align: center; color: #e8f5e9; box-shadow: 0 20px 40px rgba(0,0,0,0.6); position: relative; animation: slideUp 0.3s ease;">
        <div style="width: 64px; height: 64px; background: rgba(239,83,80,0.15); border: 1px solid rgba(239,83,80,0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; color: #ef5350; font-size: 28px;">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3 style="font-size: 20px; font-weight: 800; color: #fff; margin: 0 0 8px 0;">Booking Not Confirmed</h3>
        <div style="display: inline-block; background: rgba(0,200,83,0.15); border: 1px solid rgba(0,200,83,0.3); color: #00c853; font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 20px; margin-bottom: 16px;">
          <i class="fas fa-check-circle"></i> 100% Real Money Refund Initiated
        </div>
        <p style="font-size: 14px; line-height: 1.5; color: #b0bec5; margin: 0 0 18px 0;">
          ${escapeHTML(message || 'Your reservation hold expired and this slot was booked by another customer. 100% of your payment has been automatically refunded back to your bank account / payment method.')}
        </p>
        <div style="background: #0a0f0d; border-radius: 12px; padding: 14px; margin-bottom: 20px; text-align: left; font-size: 12px; color: #7aad82; border: 1px solid rgba(0,200,83,0.1);">
          <div style="display: flex; gap: 8px; margin-bottom: 6px;">
            <i class="fas fa-university" style="color: #00c853; margin-top: 2px;"></i>
            <span><strong>Refund Destination:</strong> Original payment source (Bank / UPI / Card)</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <i class="fas fa-clock" style="color: #00c853; margin-top: 2px;"></i>
            <span><strong>Expected Timeline:</strong> 3 to 7 business days per standard banking timelines</span>
          </div>
        </div>
        <button id="closeLateRefundBtn" style="background: #00c853; color: #04140a; border: none; font-weight: 700; font-size: 15px; padding: 12px 28px; border-radius: 30px; cursor: pointer; width: 100%; transition: all 0.2s ease;">
          OK, Got It &middot; Choose Another Slot
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeNotice = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 250);
    };

    overlay.querySelector('#closeLateRefundBtn')?.addEventListener('click', closeNotice);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeNotice();
    });
  }

  /* ── PAYMENT FLOW ── */
  async function initiatePayment(date, time, durationHours) {
    if (!date) { toast('❌ Select a date', true);      return; }
    if (!time) { toast('❌ Select a time slot', true); return; }

    const isDesktop = window.innerWidth >= 900;
    const policyCheckbox = isDesktop ? $('#qbRefundPolicyCheck') : $('#mRefundPolicyCheck');
    if (policyCheckbox && !policyCheckbox.checked) {
      toast('⚠️ Please review and accept the Refund & Cancellation Policy checkbox to proceed.', true);
      policyCheckbox.focus();
      return;
    }

    if (!Auth.isLoggedIn()) {
      toast('❌ Please sign in to book a venue', true);
      if (typeof Auth.openSignin === 'function') {
        Auth.openSignin();
      } else {
        document.getElementById('signinModal')?.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
      return;
    }

    const confirmBtns = [$$('#qbConfirm'), $$('#mConfirmBook')].flat().filter(Boolean);
    confirmBtns.forEach(b => { if (b) { b.textContent = 'Holding Slot…'; b.disabled = true; } });

    let isPaymentCompleted = false;
    holdExpired = false;

    try {
      // Step 1: Hold slot for 3 minutes
      const holdRes = await API.bookings.holdSlot(venue._id, date, time, durationHours, selectedCourt);
      currentHoldBookingId = holdRes.data.bookingId;
      startHoldCountdown(holdRes.data.holdExpiresAt);
      toast('⏱️ Slot held for 3 minutes! Complete payment to confirm.');

      confirmBtns.forEach(b => { if (b) { b.textContent = 'Processing Payment…'; } });

      // Step 2: Create Razorpay Order with a 15-second timeout
      const coinsToRedeem = tcoinsApplied ? tcoinsToUse : 0;
      const createOrderPromise = API.payments.createOrder(
        venue._id, date, time, durationHours, selectedCourt, holdRes.data.bookingId, coinsToRedeem
      );
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Payment server did not respond within 15 seconds. Please try again.')), 15000)
      );
      
      const orderRes = await Promise.race([createOrderPromise, timeoutPromise]);

      const rzp = new Razorpay({
        key:        orderRes.keyId,
        amount:     orderRes.amount,
        currency:   orderRes.currency,
        order_id:   orderRes.orderId,
        name:       'MyTurfy',
        description: `Booking: Court ${selectedCourt} at ${venue.name}`,
        handler: async (response) => {
          isPaymentCompleted = true;
          activeRzpInstance = null;
          // Block payment verification if hold timer already expired
          if (holdExpired) {
            toast('⚠️ Your 3-minute slot hold expired before payment completed. Any charge will be automatically refunded.', true);
            await cancelCurrentHold();
            removeTcoins();
            reloadSlots();
            return;
          }
          try {
            const verifyRes = await API.payments.verify({
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              venueId: venue._id, date, time, durationHours, courtNumber: selectedCourt, bookingId: currentHoldBookingId,
              tCoinsUsed: coinsToRedeem,
              tCoinsDiscount: orderRes.tCoinsDiscount || 0,
            });
            currentHoldBookingId = null;
            closeBooking();
            stopHoldCountdown();
            removeTcoins();
            toast(`🎉 Payment confirmed! Court ${selectedCourt} at ${venue.name} booked for ${date} at ${time}`);
            reloadSlots();
            selTime = ''; selTimeMob = '';
            if (verifyRes.coinsEarned) {
              showTcoinsEarnedCelebration(verifyRes.coinsEarned);
            }
            loadTcoinsBalance();
          } catch (err) {
            currentHoldBookingId = null;
            closeBooking();
            stopHoldCountdown();
            removeTcoins();
            reloadSlots();
            const msg = err.message || '';
            const isRefundNotice = msg.includes('refund') || msg.includes('expired') || msg.includes('booked by another') || msg.includes('slot was booked');
            if (isRefundNotice) {
              showLatePaymentRefundNotice(msg);
            } else {
              toast(`❌ Payment verification failed: ${msg}`, true);
            }
          }
        },
        modal: {
          ondismiss: async function () {
            activeRzpInstance = null;
            if (!isPaymentCompleted) {
              toast('⚠️ Payment cancelled. Your slot reservation has been released.', true);
              await cancelCurrentHold();
              removeTcoins();
            }
          },
        },
        theme: { color: '#00c853' },
      });

      rzp.on('payment.failed', async function (response) {
        activeRzpInstance = null;
        isPaymentCompleted = false;
        const reason = response.error?.description || response.error?.reason || 'Payment failed or declined by bank';
        toast(`❌ Payment Failed: ${reason}`, true);
        await cancelCurrentHold();
        removeTcoins();
      });

      activeRzpInstance = rzp;
      rzp.open();
    } catch (err) {
      toast(`❌ ${err.message}`, true);
      await cancelCurrentHold();
      removeTcoins();
    } finally {
      confirmBtns.forEach(b => { 
        if (b) { 
          b.innerHTML = '<i class="fas fa-check-circle"></i> Confirm Booking'; 
          b.disabled = false; 
        } 
      });
    }
  }

  /* ══════════════════════════════════════
     T-COINS LOYALTY ENGINE
  ══════════════════════════════════════ */
  let tcoinsBalance = 0;
  let tcoinsApplied = false;
  let tcoinsToUse = 0;
  let tcoinsDiscount = 0;
  let tcoinsData = null;

  async function loadTcoinsBalance() {
    if (!Auth.isLoggedIn()) return;
    try {
      const res = await API.tcoins.balance();
      tcoinsData = res.data;
      tcoinsBalance = res.data.balance;
      updateTcoinsHeaderBtn();
      
      ['tcoinsSection', 'mTcoinsSection'].forEach(id => {
        const el = $('#' + id);
        if (el) el.style.display = 'block';
      });
      updateTcoinsCalculation();
    } catch (_) {}
  }

  function updateTcoinsHeaderBtn() {
    const btn = $('#tcoinBtn');
    if (!btn) return;
    if (tcoinsData) {
      btn.innerHTML = `<i class="fas fa-coins" style="color:#ffd700;font-size:14px"></i><span>${tcoinsBalance} T-Coins</span>`;
    }
  }

  async function updateTcoinsCalculation() {
    if (!Auth.isLoggedIn()) return;
    const dur = selDur || selDurMob || 1;
    const bookingAmount = venue.price * dur;

    try {
      const res = await API.tcoins.calculate(bookingAmount);
      const d = res.data;

      ['qb', 'm'].forEach(prefix => {
        const balEl = $('#' + prefix + 'TcoinsBalance');
        const rupEl = $('#' + prefix + 'TcoinsRupee');
        const maxUseEl = $('#' + prefix + 'TcoinsMaxUse');
        const maxSaveEl = $('#' + prefix + 'TcoinsMaxSave');
        const earnEl = $('#' + prefix + 'TcoinsEarn');
        const tierEl = $('#' + prefix + 'TcoinsTier');

        if (balEl) balEl.textContent = d.userBalance.toLocaleString('en-IN');
        if (rupEl) rupEl.textContent = `(= ₹${Math.floor(d.userBalance / 10)})`;
        if (maxUseEl) maxUseEl.textContent = d.maxCoinsUsable.toLocaleString('en-IN');
        if (maxSaveEl) maxSaveEl.textContent = `₹${d.maxDiscount}`;
        if (earnEl) earnEl.textContent = d.coinsToEarn.toLocaleString('en-IN');
        if (tierEl && tcoinsData) tierEl.textContent = tcoinsData.tier.toUpperCase();
      });

      tcoinsToUse = d.maxCoinsUsable;
      tcoinsDiscount = d.maxDiscount;

      if (tcoinsApplied) {
        if (tcoinsToUse <= 0) {
          removeTcoins();
        } else {
          applyTcoins();
        }
      }
    } catch (_) {}
  }

  function applyTcoins() {
    if (tcoinsToUse <= 0) {
      toast('⚠️ You need more T-Coins to redeem on this booking', true);
      return;
    }
    tcoinsApplied = true;

    const dur = selDur || selDurMob || 1;
    const total = venue.price * dur;
    const finalAmount = Math.max(0, total - tcoinsDiscount);

    ['qb', 'm'].forEach(prefix => {
      const applyRow = $('#' + prefix + 'TcoinsApplyRow');
      const appliedBanner = $('#' + prefix + 'TcoinsApplied');
      const savingEl = $('#' + prefix + 'TcoinsSaving');
      const discountRow = $('#' + prefix + 'TcoinsDiscountRow');
      const discountVal = $('#' + prefix + 'TcoinsDiscountVal');
      const finalRow = $('#' + prefix + 'FinalRow');
      const finalTotal = $('#' + prefix + 'FinalTotal');

      if (applyRow) applyRow.style.display = 'none';
      if (appliedBanner) appliedBanner.style.display = 'flex';
      if (savingEl) savingEl.textContent = `₹${tcoinsDiscount}`;
      if (discountRow) discountRow.style.display = 'flex';
      if (discountVal) discountVal.textContent = `-₹${tcoinsDiscount}`;
      if (finalRow) finalRow.style.display = 'flex';
      if (finalTotal) finalTotal.textContent = `₹${finalAmount.toLocaleString('en-IN')}`;
    });

    toast(`⚡ T-Coins applied! Saving ₹${tcoinsDiscount}`);
  }

  function removeTcoins() {
    tcoinsApplied = false;

    ['qb', 'm'].forEach(prefix => {
      const applyRow = $('#' + prefix + 'TcoinsApplyRow');
      const appliedBanner = $('#' + prefix + 'TcoinsApplied');
      const discountRow = $('#' + prefix + 'TcoinsDiscountRow');
      const finalRow = $('#' + prefix + 'FinalRow');

      if (applyRow) applyRow.style.display = 'flex';
      if (appliedBanner) appliedBanner.style.display = 'none';
      if (discountRow) discountRow.style.display = 'none';
      if (finalRow) finalRow.style.display = 'none';
    });
  }

  // Attach event handlers for apply & remove
  ['qbApplyTcoins', 'mApplyTcoins'].forEach(id => {
    $('#' + id)?.addEventListener('click', applyTcoins);
  });
  ['qbRemoveTcoins', 'mRemoveTcoins'].forEach(id => {
    $('#' + id)?.addEventListener('click', removeTcoins);
  });

  // T-Coins Wallet Modal Handlers
  const tcoinsModal = $('#tcoinsModal'), tcoinsModalClose = $('#tcoinsModalClose');

  $('#tcoinBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.href = 'wallet.html';
  });

  function closeTcoinsModal() {
    tcoinsModal.classList.remove('active');
    document.body.style.overflow = '';
  }
  tcoinsModalClose?.addEventListener('click', closeTcoinsModal);
  tcoinsModal?.addEventListener('click', e => { if (e.target === tcoinsModal) closeTcoinsModal(); });

  function renderWalletModal(data) {
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
        const ago = timeAgo(new Date(tx.createdAt));

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

  function showTcoinsEarnedCelebration(coins) {
    if (!coins || coins <= 0) return;
    const cashbackLabel = tcoinsData?.cashbackPct ? `${tcoinsData.cashbackPct}%` : 'Tier';
    const cel = document.createElement('div');
    cel.className = 'tcoins-celebration';
    cel.innerHTML = `
      <div class="tcoins-celebration-inner">
        <div class="tcoins-celebration-coins"><i class="fas fa-coins"></i></div>
        <div class="tcoins-celebration-text">+${coins} T-Coins Earned!</div>
        <div class="tcoins-celebration-sub">${cashbackLabel} Cashback credited to your wallet</div>
      </div>
    `;
    document.body.appendChild(cel);
    setTimeout(() => {
      cel.style.opacity = '0';
      cel.style.transition = 'opacity 0.5s ease';
      setTimeout(() => cel.remove(), 500);
    }, 2500);
  }

  loadTcoinsBalance();

  /* ══════════════════════════════════════
     RATE US MODAL (FIXED: Added finally block for button reset)
  ══════════════════════════════════════ */
  const rateModal = $('#rateModal'), rateClose = $('#rateClose'), starPicker = $('#starPicker'), starLabel = $('#starLabel');
  let selectedRating = 0;
  let editingReviewId = null;
  const starTexts = ['', 'Terrible 😞', 'Poor 😕', 'Okay 😐', 'Good 😊', 'Excellent 🤩'];
  if ($('#rateVenueName')) $('#rateVenueName').textContent = venue.name;

  function openRateModal(editId = null, editRating = 0, editText = '') {
    if (!Auth.isLoggedIn()) {
      toast('❌ Please sign in to leave a review', true);
      Auth.openSignin();
      return;
    }
    editingReviewId = editId;
    if (editId) {
      selectedRating = editRating;
      updateStars(editRating);
      if (reviewTextEl) reviewTextEl.value = editText;
      const title = $('#rateModal h2');
      if (title) title.textContent = 'Edit Your Review';
    } else {
      selectedRating = 0;
      updateStars(0);
      if (reviewTextEl) reviewTextEl.value = '';
      const title = $('#rateModal h2');
      if (title) title.textContent = 'Rate & Review Venue';
    }
    rateModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeRateModal() {
    rateModal.classList.remove('active');
    document.body.style.overflow = '';
    selectedRating = 0;
    editingReviewId = null;
    updateStars(0);
    if (reviewTextEl) reviewTextEl.value = '';
  }
  $('#rateBtn')?.addEventListener('click', () => openRateModal());
  $('#rateBtnBottom')?.addEventListener('click', () => openRateModal());
  rateClose?.addEventListener('click', closeRateModal);
  rateModal?.addEventListener('click', e => { if (e.target === rateModal) closeRateModal(); });

  function updateStars(val, isHover = false) {
    $$('i[data-val]', starPicker).forEach(s => {
      s.className = +s.dataset.val <= val ? 'fas fa-star' : 'far fa-star';
      s.classList.toggle('hovered', isHover && +s.dataset.val <= val);
      s.classList.toggle('selected', !isHover && +s.dataset.val <= selectedRating);
    });
    if (val > 0) starLabel.textContent = starTexts[val] || '';
    else if (!isHover) starLabel.textContent = selectedRating > 0 ? starTexts[selectedRating] : 'Tap to rate';
  }
  $$('i[data-val]', starPicker).forEach(star => {
    star.addEventListener('mouseover',  () => updateStars(+star.dataset.val, true));
    star.addEventListener('mouseleave', () => updateStars(selectedRating, false));
    star.addEventListener('click',      () => { selectedRating = +star.dataset.val; updateStars(selectedRating, false); });
  });

  const reviewTextEl = $('#reviewText');

  $('#submitRate')?.addEventListener('click', async () => {
    if (!Auth.isLoggedIn()) {
      toast('❌ Please sign in to leave a review', true);
      closeRateModal();
      Auth.openSignin();
      return;
    }
    if (!selectedRating) { toast('❌ Please select a rating', true); return; }
    const submitBtn = $('#submitRate');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…';
    try {
      const text = (reviewTextEl?.value?.trim()) || `Rated ${selectedRating}/5`;
      if (editingReviewId) {
        await API.reviews.update(editingReviewId, selectedRating, text);
        toast(`⭐ Review updated successfully!`);
      } else {
        // NOTE: To allow a single user to review many times, you must 
        // remove the unique index on { customerId, venueId } in your MongoDB 'reviews' collection.
        // Run in MongoDB shell: db.reviews.dropIndex("customerId_1_venueId_1")
        await API.reviews.create(venue._id, selectedRating, text, null);
        toast(`⭐ Thank you! You rated ${venue.name} ${selectedRating}/5`);
      }
      closeRateModal();
      loadReviews(activeStarFilter);
    } catch (err) {
      toast(`❌ ${err.message}`, true);
    } finally {
      // 🔥 FIX: Ensure button always resets, regardless of success or failure
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Rating';
    }
  });

  /* ══════════════════════════════════════
     REVIEWS SECTION — with star filter & Edit/Delete
  ══════════════════════════════════════ */
  let allReviews = [];
  let activeStarFilter = 0; // 0 = show all

  async function loadReviews(filterStar = 0) {
    activeStarFilter = filterStar;
    const reviewsContainer = $('#reviewsList');
    const reviewsSummary   = $('#reviewsSummary');
    const filterBtns = $$('.star-filter-btn');
    filterBtns.forEach(b => b.classList.toggle('active', +b.dataset.star === filterStar));

    if (!reviewsContainer) return;
    reviewsContainer.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0"><i class="fas fa-spinner fa-spin"></i> Loading reviews…</p>';
    try {
      const res = await API.reviews.forVenue(venueId);
      allReviews = res.data || [];

      // Build star breakdown
      const counts = [0,0,0,0,0,0]; // index 1-5
      allReviews.forEach(r => { if (r.rating >= 1 && r.rating <= 5) counts[r.rating]++; });
      if (reviewsSummary) {
        reviewsSummary.innerHTML = '';
        for (let s = 5; s >= 1; s--) {
          const pct = allReviews.length ? Math.round((counts[s] / allReviews.length) * 100) : 0;
          reviewsSummary.innerHTML += `
            <button class="star-filter-btn${activeStarFilter === s ? ' active' : ''}" data-star="${s}" title="Show ${s}-star reviews">
              <span class="sfb-stars">${'★'.repeat(s)}${'☆'.repeat(5-s)}</span>
              <span class="sfb-bar"><span class="sfb-fill" style="width:${pct}%"></span></span>
              <span class="sfb-count">${counts[s]}</span>
            </button>`;
        }
        // All button
        reviewsSummary.innerHTML += `<button class="star-filter-btn${activeStarFilter === 0 ? ' active' : ''}" data-star="0">All (${allReviews.length})</button>`;
        $$('.star-filter-btn', reviewsSummary).forEach(btn => {
          btn.addEventListener('click', () => loadReviews(+btn.dataset.star));
        });
      }

      const currentUser = Auth.getUser();
      const currentUserId = currentUser?._id || currentUser?.id;

      const filtered = activeStarFilter === 0 ? allReviews : allReviews.filter(r => r.rating === activeStarFilter);
      if (!filtered.length) {
        reviewsContainer.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0">No reviews yet for this filter. Be the first to rate!</p>';
        return;
      }
      reviewsContainer.innerHTML = filtered.map(r => {
        const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
        const ago   = timeAgo(new Date(r.createdAt));
        const customerId = r.customer?._id || r.customer;
        const isMyReview = currentUserId && String(customerId) === String(currentUserId);
        const safeText = (r.text || '').replace(/"/g, '&quot;');

        return `
          <div class="review-card" data-id="${r._id}">
            <div class="review-header">
              <span class="review-avatar">${(r.customer?.name?.[0] || '?').toUpperCase()}</span>
              <div class="review-meta">
                <strong>${r.customer?.name || 'Anonymous'}</strong>
                <span class="review-stars">${stars}</span>
              </div>
              <span class="review-ago">${ago}</span>
            </div>
            <p class="review-text">${r.text || ''}</p>
            ${r.reply ? `<div class="review-reply"><i class="fas fa-reply"></i> <strong>Owner replied:</strong> ${r.reply}</div>` : ''}
            ${isMyReview ? `
              <div class="review-actions-user" style="margin-top: 10px; display: flex; gap: 14px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
                <button class="btn-edit-review" data-id="${r._id}" data-rating="${r.rating}" data-text="${safeText}" style="background: none; border: none; color: var(--green); cursor: pointer; font-size: 12px; font-weight: 600; padding: 0;"><i class="fas fa-edit"></i> Edit Review</button>
                <button class="btn-delete-review" data-id="${r._id}" style="background: none; border: none; color: var(--red); cursor: pointer; font-size: 12px; font-weight: 600; padding: 0;"><i class="fas fa-trash-alt"></i> Delete</button>
              </div>
            ` : ''}
          </div>`;
      }).join('');

      // Wire Edit and Delete buttons
      $$('.btn-edit-review', reviewsContainer).forEach(btn => {
        btn.addEventListener('click', () => {
          openRateModal(btn.dataset.id, parseInt(btn.dataset.rating, 10), btn.dataset.text);
        });
      });

      $$('.btn-delete-review', reviewsContainer).forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('Are you sure you want to delete your review?')) {
            try {
              await API.reviews.delete(btn.dataset.id);
              toast('✅ Review deleted');
              loadReviews(activeStarFilter);
            } catch (err) {
              toast(`❌ ${err.message}`, true);
            }
          }
        });
      });
    } catch (err) {
      reviewsContainer.innerHTML = `<p style="color:var(--red);font-size:13px">${err.message}</p>`;
    }
  }

  function timeAgo(date) {
    const secs = Math.floor((Date.now() - date) / 1000);
    if (secs < 60)   return 'just now';
    if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
    return `${Math.floor(secs/86400)}d ago`;
  }

  loadReviews(0);

  /* ══════════════════════════════════════
     GET DIRECTIONS
  ══════════════════════════════════════ */
  const directionsBtn = $('#getDirectionsBtn');
  if (directionsBtn) {
    const destination = (venue.lat != null && venue.lng != null)
      ? `${venue.lat},${venue.lng}`
      : encodeURIComponent(`${venue.name}, ${venue.location}`);
    directionsBtn.href   = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
    directionsBtn.target = '_blank';
    directionsBtn.rel    = 'noopener noreferrer';
  }

  /* ══════════════════════════════════════
     WISHLIST
  ══════════════════════════════════════ */
  const wishBtn = $('#wishBtn');
  if (Auth.isLoggedIn()) {
    API.auth.getWishlist()
      .then(res => {
        const wishlist = res.data || [];
        const isWishlisted = wishlist.some(v => (v._id || v) === venueId);
        if (isWishlisted && wishBtn) {
          wishBtn.classList.add('active');
          wishBtn.innerHTML = '<i class="fas fa-heart"></i> Wishlisted';
        }
      })
      .catch(() => {});
  }

  wishBtn?.addEventListener('click', async () => {
    if (!Auth.isLoggedIn()) { toast('❌ Please sign in to save to wishlist', true); openSignin(); return; }
    try {
      const res = await API.auth.toggleWishlist(venueId);
      if (res.wishlisted) {
        wishBtn.classList.add('active');
        wishBtn.innerHTML = '<i class="fas fa-heart"></i> Wishlisted';
        toast('❤️ Added to wishlist');
      } else {
        wishBtn.classList.remove('active');
        wishBtn.innerHTML = '<i class="far fa-heart"></i> Wishlist';
        toast('🤍 Removed from wishlist');
      }
    } catch (err) { toast(`❌ ${err.message}`, true); }
  });

  console.log(`🏟️ Venue detail loaded: ${venue.name} | Open: ${openH}:00–${closeH}:00`);
});