/* =============================================
   MYTURFY — split-pay.js
   Commercial Multi-Payer Split Payment Engine
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

  Auth.syncNavbar();

  const urlParams = new URLSearchParams(window.location.search);
  const splitCode = urlParams.get('code') || urlParams.get('splitCode');

  const loadingEl = $('#loadingState');
  const container = $('#splitContainer');

  if (!splitCode) {
    if (loadingEl) loadingEl.innerHTML = `<i class="fas fa-exclamation-triangle" style="font-size:36px;color:var(--red);margin-bottom:12px"></i><p style="color:var(--red)">No split code provided in URL.</p><a href="index.html" class="btn-primary" style="margin-top:14px;display:inline-block;padding:8px 20px;background:var(--green);color:#04140a;border-radius:20px;text-decoration:none;font-weight:700">Back to Home</a>`;
    return;
  }

  let splitData = null;
  let timerInterval = null;

  async function loadSplitDetails() {
    try {
      const res = await API.payments.getSplitDetails(splitCode);
      splitData = res.data;
      renderSplitUI();
      if (loadingEl) loadingEl.style.display = 'none';
      if (container) container.style.display = 'block';
    } catch (err) {
      if (loadingEl) {
        loadingEl.innerHTML = `
          <i class="fas fa-exclamation-circle" style="font-size:36px;color:var(--red);margin-bottom:12px"></i>
          <p style="color:var(--red);font-size:15px;font-weight:700">${err.message}</p>
          <a href="index.html" style="margin-top:14px;display:inline-block;padding:8px 20px;background:var(--green);color:#04140a;border-radius:20px;text-decoration:none;font-weight:700">Explore Venues</a>
        `;
      }
    }
  }

  function renderSplitUI() {
    if (!splitData) return;
    const d = splitData;

    // Header info
    if (d.venue.image && $('#splitBanner')) {
      $('#splitBanner').style.backgroundImage = `url('${d.venue.image}')`;
    }
    if ($('#splitSportBadge')) $('#splitSportBadge').textContent = d.venue.sport || 'Sport';
    if ($('#splitVenueName')) $('#splitVenueName').textContent = d.venue.name || 'Venue';
    if ($('#splitLoc')) $('#splitLoc').textContent = d.venue.location || '';
    if ($('#splitDate')) $('#splitDate').textContent = d.date || '';
    if ($('#splitTime')) $('#splitTime').textContent = d.time || '';
    if ($('#splitCourt')) $('#splitCourt').textContent = d.courtNumber || '1';

    // Progress
    const pct = Math.min(100, Math.round((d.paidAmount / d.totalAmount) * 100));
    if ($('#splitProgressAmount')) $('#splitProgressAmount').textContent = `₹${d.paidAmount.toLocaleString('en-IN')} / ₹${d.totalAmount.toLocaleString('en-IN')}`;
    if ($('#splitProgressFill')) $('#splitProgressFill').style.width = `${pct}%`;
    if ($('#splitPaidCount')) $('#splitPaidCount').textContent = `${d.splitPayments.length} of ${d.targetPlayers} teammates paid (${pct}%)`;
    if ($('#splitPerPersonLabel')) $('#splitPerPersonLabel').textContent = `₹${d.perPersonAmount.toLocaleString('en-IN')} per person`;

    // Contributors List
    const listEl = $('#contributorsList');
    if (listEl) {
      if (!d.splitPayments || !d.splitPayments.length) {
        listEl.innerHTML = `<p style="font-size:13px;color:var(--muted);padding:6px 0">No payments collected yet.</p>`;
      } else {
        listEl.innerHTML = d.splitPayments.map((p, idx) => {
          const initial = (p.payerName?.[0] || 'T').toUpperCase();
          const roleLabel = idx === 0 ? 'Booker' : 'Teammate';
          return `
            <div class="contributor-item">
              <div class="ci-left">
                <div class="ci-avatar">${initial}</div>
                <div>
                  <div class="ci-name">${p.payerName} <span class="ci-role">${roleLabel}</span></div>
                  <div style="font-size:11px;color:var(--muted)">Paid ${new Date(p.paidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
              <div class="ci-amount">₹${p.amount.toLocaleString('en-IN')}</div>
            </div>
          `;
        }).join('');
      }
    }

    // Action Card & States
    const payForm = $('#payFormArea');
    const completedArea = $('#completedArea');
    const expiredArea = $('#expiredArea');
    const timerCard = $('#splitTimerCard');
    const payShareAmount = $('#payShareAmount');
    const payBtnVal = $('#payBtnVal');

    const shareAmount = Math.min(d.perPersonAmount, d.remainingAmount);
    if (payShareAmount) payShareAmount.textContent = `₹${shareAmount}`;
    if (payBtnVal) payBtnVal.textContent = `₹${shareAmount}`;

    // Pre-fill user name if logged in
    const currentUser = Auth.getUser();
    const nameInput = $('#payerNameInput');
    if (currentUser?.name && nameInput && !nameInput.value) {
      nameInput.value = currentUser.name;
    }

    if (d.isFullyPaid) {
      if (payForm) payForm.style.display = 'none';
      if (expiredArea) expiredArea.style.display = 'none';
      if (completedArea) completedArea.style.display = 'block';
      if (timerCard) timerCard.style.display = 'none';

      // QR Pass button setup
      $('#viewQrBtn')?.addEventListener('click', () => {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(d.qrCodeData || d.bookingId)}`;
        if ($('#qrVenueTitle')) $('#qrVenueTitle').textContent = d.venue.name;
        if ($('#qrSlotMeta')) $('#qrSlotMeta').textContent = `Court ${d.courtNumber} · ${d.date} @ ${d.time}`;
        if ($('#qrImg')) $('#qrImg').src = qrUrl;
        const qrModal = $('#qrModal');
        if (qrModal) qrModal.style.display = 'flex';
      });

      $('#qrCloseBtn')?.addEventListener('click', () => {
        const qrModal = $('#qrModal');
        if (qrModal) qrModal.style.display = 'none';
      });

    } else if (d.isExpired) {
      if (payForm) payForm.style.display = 'none';
      if (completedArea) completedArea.style.display = 'none';
      if (expiredArea) expiredArea.style.display = 'block';
      if (timerCard) timerCard.style.display = 'none';
    } else {
      if (payForm) payForm.style.display = 'block';
      if (completedArea) completedArea.style.display = 'none';
      if (expiredArea) expiredArea.style.display = 'none';
      if (timerCard) timerCard.style.display = 'flex';

      // Start Countdown Timer
      if (d.splitExpiresAt) {
        clearInterval(timerInterval);
        const expiresMs = new Date(d.splitExpiresAt).getTime();
        const updateTimer = () => {
          const diff = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
          const mins = String(Math.floor(diff / 60)).padStart(2, '0');
          const secs = String(diff % 60).padStart(2, '0');
          if ($('#splitTimerDigits')) $('#splitTimerDigits').textContent = `${mins}:${secs}`;
          if (diff <= 60 && timerCard) timerCard.classList.add('urgent');
          if (diff <= 0) {
            clearInterval(timerInterval);
            loadSplitDetails();
          }
        };
        updateTimer();
        timerInterval = setInterval(updateTimer, 1000);
      }
    }

    // WhatsApp Share Link
    const waBtn = $('#waShareBtn');
    if (waBtn) {
      const shareUrl = window.location.href;
      const text = encodeURIComponent(`🏟️ Teammates! Pay your share for ${d.venue.name} (${d.date} @ ${d.time}):\n💰 Share: ₹${shareAmount} per person\n👉 Pay here: ${shareUrl}`);
      waBtn.href = `https://wa.me/?text=${text}`;
    }

    // Copy Link Button
    const copyBtn = $('#copyLinkBtn');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          toast('✅ Split link copied to clipboard!');
        } catch (_) {
          toast('Copy URL: ' + window.location.href);
        }
      };
    }
  }

  // Pay My Share Button Handler (Real Razorpay Modal)
  $('#payShareBtn')?.addEventListener('click', async () => {
    const nameInput = $('#payerNameInput');
    const phoneInput = $('#payerPhoneInput');
    const payerName = nameInput?.value?.trim();
    const payerPhone = phoneInput?.value?.trim();

    if (!payerName) {
      toast('❌ Please enter your name to pay', true);
      nameInput?.focus();
      return;
    }

    const btn = $('#payShareBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initializing Razorpay…';
    }

    try {
      // Step 1: Create Razorpay Order for Teammate Share
      const orderRes = await API.payments.createSplitShareOrder(splitCode);

      let isSplitPaymentCompleted = false;

      const rzp = new Razorpay({
        key: orderRes.keyId,
        amount: orderRes.amount,
        currency: orderRes.currency,
        order_id: orderRes.orderId,
        name: 'MyTurfy',
        description: `Split Share Payment for ${splitData?.venue?.name || 'Venue'}`,
        prefill: {
          name: payerName,
          contact: payerPhone || '',
        },
        handler: async (response) => {
          isSplitPaymentCompleted = true;
          try {
            toast('⏳ Verifying payment…');
            const verifyRes = await API.payments.paySplitShare({
              splitCode,
              payerName,
              payerPhone,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast(`🎉 ${verifyRes.message}`);
            await loadSplitDetails();
          } catch (err) {
            toast(`❌ Payment verification failed: ${err.message}`, true);
          }
        },
        modal: {
          ondismiss: function () {
            if (!isSplitPaymentCompleted) {
              toast('⚠️ Payment cancelled.', true);
            }
          },
        },
        theme: { color: '#00c853' },
      });

      rzp.on('payment.failed', function (response) {
        isSplitPaymentCompleted = false;
        const msg = response.error?.description || response.error?.reason || 'Payment failed or declined by bank.';
        toast(`❌ Payment Failed: ${msg}`, true);
      });

      rzp.open();
    } catch (err) {
      toast(`❌ ${err.message}`, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        const shareAmount = Math.min(splitData?.perPersonAmount || 0, splitData?.remainingAmount || 0);
        btn.innerHTML = `<i class="fas fa-credit-card"></i> Pay My Share <span id="payBtnVal">₹${shareAmount}</span>`;
      }
    }
  });

  // Initial load
  await loadSplitDetails();
});
