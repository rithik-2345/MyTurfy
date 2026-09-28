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
  let splitTimerExpired = false;
  let activeSplitRzp = null;

  /* ── T-COINS LOYALTY STATE ON SPLIT PAY ── */
  let splitTcoinsBalance = 0;
  let splitTcoinsApplied = false;
  let splitTcoinsToUse = 0;
  let splitTcoinsDiscount = 0;
  let splitTcoinsData = null;

  async function loadSplitTcoins() {
    if (!Auth.isLoggedIn() || !window.API?.tcoins) {
      const sec = $('#splitTcoinsSection');
      if (sec) sec.style.display = 'none';
      return;
    }
    try {
      const res = await API.tcoins.balance();
      splitTcoinsData = res.data;
      splitTcoinsBalance = res.data.balance || 0;
      const sec = $('#splitTcoinsSection');
      if (sec) sec.style.display = 'block';

      if ($('#splitTcoinsBal')) $('#splitTcoinsBal').textContent = splitTcoinsBalance.toLocaleString('en-IN');
      if ($('#splitTcoinsRupee')) $('#splitTcoinsRupee').textContent = `(= ₹${Math.floor(splitTcoinsBalance / 10)})`;
      if ($('#splitTcoinsTier')) $('#splitTcoinsTier').textContent = (res.data.tier || 'ROOKIE').toUpperCase();

      const customInput = $('#customAmountInput');
      const curVal = customInput ? (parseInt(customInput.value) || splitData?.perPersonAmount || 0) : 0;
      updateSplitTcoinsCalculation(curVal);
    } catch (_) {}
  }

  async function updateSplitTcoinsCalculation(shareAmount) {
    if (!shareAmount || shareAmount <= 0 || !Auth.isLoggedIn() || !window.API?.tcoins) return;
    try {
      // Group mode: max 50% user coins & max 10% of total match cost across all players
      const res = await API.tcoins.calculate(shareAmount, true, splitCode, splitData?.totalAmount);
      const d = res.data;
      splitTcoinsToUse = d.maxCoinsUsable || 0;
      splitTcoinsDiscount = d.maxDiscount || 0;

      if ($('#splitTcoinsBal')) $('#splitTcoinsBal').textContent = (d.userBalance || 0).toLocaleString('en-IN');
      if ($('#splitTcoinsRupee')) $('#splitTcoinsRupee').textContent = `(= ₹${Math.floor((d.userBalance || 0) / 10)})`;
      if ($('#splitTcoinsMaxUse')) $('#splitTcoinsMaxUse').textContent = (d.maxCoinsUsable || 0).toLocaleString('en-IN');
      if ($('#splitTcoinsMaxSave')) $('#splitTcoinsMaxSave').textContent = `₹${d.maxDiscount || 0}`;
      if ($('#splitTcoinsBtnDiscount')) $('#splitTcoinsBtnDiscount').textContent = `₹${d.maxDiscount || 0}`;

      const previewEl = $('#splitTcoinsPreview');
      if (previewEl) {
        if (d.groupCapReached) {
          previewEl.innerHTML = `<i class="fas fa-info-circle" style="color:#ffb300"></i> Group T-Coins limit reached (max 10% of match cost used across team).`;
        } else if (d.maxCoinsUsable > 0) {
          previewEl.innerHTML = `<i class="fas fa-sparkles"></i> Use up to <strong id="splitTcoinsMaxUse">${d.maxCoinsUsable.toLocaleString('en-IN')}</strong> coins to save <strong id="splitTcoinsMaxSave">₹${d.maxDiscount}</strong> (50% your coins &middot; max 10% match cap)`;
        } else {
          previewEl.innerHTML = `<i class="fas fa-info-circle"></i> No T-Coins discount available on this share.`;
        }
      }

      if (splitTcoinsApplied) {
        if (splitTcoinsToUse <= 0) {
          removeSplitTcoins();
        } else {
          applySplitTcoins(false);
        }
      }
    } catch (_) {}
  }

  function applySplitTcoins(notify = true) {
    if (splitTcoinsToUse <= 0) {
      if (notify) toast('⚠️ Not enough T-Coins to apply a discount on this share amount.', true);
      return;
    }
    splitTcoinsApplied = true;
    const customInput = $('#customAmountInput');
    const baseShare = customInput ? (parseInt(customInput.value) || splitData?.perPersonAmount || 0) : (splitData?.perPersonAmount || 0);
    const discountedPayable = Math.max(1, baseShare - splitTcoinsDiscount);

    const applyRow = $('#splitTcoinsApplyRow');
    const appliedBanner = $('#splitTcoinsApplied');
    const appliedText = $('#splitTcoinsAppliedText');
    const payBtnVal = $('#payBtnVal');
    const payShareAmount = $('#payShareAmount');

    if (applyRow) applyRow.style.display = 'none';
    if (appliedBanner) appliedBanner.style.display = 'flex';
    if (appliedText) appliedText.textContent = `${splitTcoinsToUse} Coins (₹${splitTcoinsDiscount} off)`;
    if (payBtnVal) payBtnVal.textContent = `₹${discountedPayable}`;
    if (payShareAmount) payShareAmount.textContent = `₹${discountedPayable} (₹${splitTcoinsDiscount} T-Coins off)`;

    if (notify) toast(`✨ ${splitTcoinsToUse} T-Coins applied! You saved ₹${splitTcoinsDiscount}.`);
  }

  function removeSplitTcoins() {
    splitTcoinsApplied = false;
    const customInput = $('#customAmountInput');
    const baseShare = customInput ? (parseInt(customInput.value) || splitData?.perPersonAmount || 0) : (splitData?.perPersonAmount || 0);

    const applyRow = $('#splitTcoinsApplyRow');
    const appliedBanner = $('#splitTcoinsApplied');
    const payBtnVal = $('#payBtnVal');
    const payShareAmount = $('#payShareAmount');

    if (applyRow) applyRow.style.display = 'block';
    if (appliedBanner) appliedBanner.style.display = 'none';
    if (payBtnVal) payBtnVal.textContent = `₹${baseShare}`;
    if (payShareAmount) payShareAmount.textContent = `₹${baseShare}`;
  }

  $('#splitTcoinsApplyBtn')?.addEventListener('click', () => applySplitTcoins(true));
  $('#splitTcoinsRemoveBtn')?.addEventListener('click', removeSplitTcoins);

  async function loadSplitDetails() {
    try {
      const res = await API.payments.getSplitDetails(splitCode);
      splitData = res.data;
      renderSplitUI();
      if (loadingEl) loadingEl.style.display = 'none';
      if (container) container.style.display = 'block';
      loadSplitTcoins();
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
          const coinBadge = p.tCoinsDiscount > 0 ? `<span style="font-size:10px;color:#ffd700;margin-left:4px;font-weight:700;">🪙 ₹${p.tCoinsDiscount} coins</span>` : '';
          return `
            <div class="contributor-item">
              <div class="ci-left">
                <div class="ci-avatar">${initial}</div>
                <div>
                  <div class="ci-name">${p.payerName} <span class="ci-role">${roleLabel}</span>${coinBadge}</div>
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

    const defaultShareAmount = Math.min(d.perPersonAmount, d.remainingAmount);
    if (payShareAmount) payShareAmount.textContent = `₹${defaultShareAmount}`;
    if (payBtnVal) payBtnVal.textContent = `₹${defaultShareAmount}`;

    // Custom amount input setup
    const customInput = $('#customAmountInput');
    const presetDesignated = $('#presetDesignated');
    const presetRemaining = $('#presetRemaining');

    // Dynamic Cashback preview (10 coins per rupee)
    const updateCoinsPreview = (val) => {
      const cashbackPct = splitTcoinsData?.cashbackPct || 3;
      const coins = Math.round(val * (cashbackPct / 100) * 10);
      const coinsEl = $('#splitCoinsEarnVal');
      if (coinsEl) coinsEl.textContent = coins.toLocaleString('en-IN');
      const pctEl = $('#splitCashbackPctDisplay');
      if (pctEl) pctEl.textContent = `${cashbackPct}%`;
      updateSplitTcoinsCalculation(val);
    };

    if (customInput) {
      if (!customInput.value || customInput.value === '0') {
        customInput.value = defaultShareAmount;
      }
      customInput.max = d.remainingAmount;
      customInput.min = 1;
      updateCoinsPreview(parseInt(customInput.value) || defaultShareAmount);

      customInput.oninput = () => {
        const val = Math.min(d.remainingAmount, Math.max(1, parseInt(customInput.value) || 0));
        const payable = splitTcoinsApplied ? Math.max(1, val - splitTcoinsDiscount) : val;
        if (payBtnVal) payBtnVal.textContent = `₹${payable}`;
        if (payShareAmount) payShareAmount.textContent = `₹${payable}`;
        updateCoinsPreview(val);
      };
    }

    if (presetDesignated) {
      presetDesignated.textContent = `Designated Share: ₹${defaultShareAmount}`;
      presetDesignated.onclick = () => {
        if (customInput) customInput.value = defaultShareAmount;
        const payable = splitTcoinsApplied ? Math.max(1, defaultShareAmount - splitTcoinsDiscount) : defaultShareAmount;
        if (payBtnVal) payBtnVal.textContent = `₹${payable}`;
        if (payShareAmount) payShareAmount.textContent = `₹${payable}`;
        updateCoinsPreview(defaultShareAmount);
      };
    }

    if (presetRemaining) {
      presetRemaining.textContent = `Full Remaining: ₹${d.remainingAmount}`;
      presetRemaining.onclick = () => {
        if (customInput) customInput.value = d.remainingAmount;
        const payable = splitTcoinsApplied ? Math.max(1, d.remainingAmount - splitTcoinsDiscount) : d.remainingAmount;
        if (payBtnVal) payBtnVal.textContent = `₹${payable}`;
        if (payShareAmount) payShareAmount.textContent = `₹${payable}`;
        updateCoinsPreview(d.remainingAmount);
      };
    }

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
      splitTimerExpired = false;
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
            splitTimerExpired = true;
            clearInterval(timerInterval);
            // Force-close Razorpay modal if teammate is mid-payment
            if (activeSplitRzp) {
              try { activeSplitRzp.close(); } catch (_) {}
              activeSplitRzp = null;
            }
            // Disable pay button immediately
            const payBtn = $('#payShareBtn');
            if (payBtn) {
              payBtn.disabled = true;
              payBtn.innerHTML = '<i class="fas fa-clock"></i> Split Expired';
            }
            toast('⚠️ Split booking timer expired. Payments already made will be refunded.', true);
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
      const text = encodeURIComponent(`🏟️ Teammates! Pay your share for ${d.venue.name} (${d.date} @ ${d.time}):\n💰 Share: ₹${defaultShareAmount} per person\n👉 Pay here: ${shareUrl}`);
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

  function showTcoinsEarnedCelebration(coins) {
    if (!coins || coins <= 0) return;
    const cel = document.createElement('div');
    cel.className = 'tcoins-celebration';
    cel.innerHTML = `
      <div class="tcoins-celebration-inner">
        <div class="tcoins-celebration-coins"><i class="fas fa-coins"></i></div>
        <div class="tcoins-celebration-text">+${coins} T-Coins Earned!</div>
        <div class="tcoins-celebration-sub">Tier Cashback credited to your wallet</div>
      </div>
    `;
    document.body.appendChild(cel);
    setTimeout(() => {
      cel.style.opacity = '0';
      cel.style.transition = 'opacity 0.5s ease';
      setTimeout(() => cel.remove(), 500);
    }, 2500);
  }

  // Pay My Share Button Handler (Real Razorpay Modal)
  $('#payShareBtn')?.addEventListener('click', async () => {
    const nameInput = $('#payerNameInput');
    const phoneInput = $('#payerPhoneInput');
    const payerName = nameInput?.value?.trim();
    const payerPhone = phoneInput?.value?.trim();
    const customAmtInput = $('#customAmountInput');
    const customAmount = customAmtInput?.value ? parseInt(customAmtInput.value) : undefined;

    if (!payerName) {
      toast('❌ Please enter your name to pay', true);
      nameInput?.focus();
      return;
    }

    if (customAmount && (customAmount < 1 || customAmount > (splitData?.remainingAmount || Infinity))) {
      toast(`❌ Amount must be between ₹1 and ₹${splitData?.remainingAmount}`, true);
      return;
    }

    const btn = $('#payShareBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initializing Razorpay…';
    }

    const coinsToRedeem = splitTcoinsApplied ? splitTcoinsToUse : 0;

    try {
      // Guard: Don't allow payment if split timer has already expired
      if (splitTimerExpired) {
        toast('⚠️ Split booking timer has expired. Payment cannot proceed.', true);
        return;
      }

      // Step 1: Create Razorpay Order for Teammate Share with T-Coins
      const orderRes = await API.payments.createSplitShareOrder(splitCode, customAmount, coinsToRedeem);

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
          activeSplitRzp = null;
          if (splitTimerExpired) {
            toast('⚠️ Split timer expired before payment completed. Any charge will be automatically refunded.', true);
            removeSplitTcoins();
            await loadSplitDetails();
            return;
          }
          try {
            toast('⏳ Verifying payment…');
            const verifyRes = await API.payments.paySplitShare({
              splitCode,
              payerName,
              payerPhone,
              customAmount,
              tCoinsUsed: coinsToRedeem,
              tCoinsDiscount: orderRes.tCoinsDiscount || 0,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast(`🎉 ${verifyRes.message}`);
            removeSplitTcoins();
            if (verifyRes.coinsEarned) {
              showTcoinsEarnedCelebration(verifyRes.coinsEarned);
            }
            await loadSplitDetails();
          } catch (err) {
            removeSplitTcoins();
            await loadSplitDetails();
            const msg = err.message || '';
            const isRefundNotice = msg.includes('refund') || msg.includes('expired') || msg.includes('booked by another');
            if (isRefundNotice) {
              alert(`⚠️ Booking Status Alert\n\n${msg}\n\nRefund destination: Original Payment Method / Bank Account (3-7 business days).`);
            } else {
              toast(`❌ Payment verification failed: ${msg}`, true);
            }
          }
        },
        modal: {
          ondismiss: function () {
            activeSplitRzp = null;
            if (!isSplitPaymentCompleted) {
              toast('⚠️ Payment cancelled.', true);
            }
          },
        },
        theme: { color: '#00c853' },
      });

      rzp.on('payment.failed', function (response) {
        activeSplitRzp = null;
        isSplitPaymentCompleted = false;
        const msg = response.error?.description || response.error?.reason || 'Payment failed or declined by bank.';
        toast(`❌ Payment Failed: ${msg}`, true);
      });

      activeSplitRzp = rzp;
      rzp.open();
    } catch (err) {
      toast(`❌ ${err.message}`, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        const baseShare = Math.min(splitData?.perPersonAmount || 0, splitData?.remainingAmount || 0);
        const payable = splitTcoinsApplied ? Math.max(1, baseShare - splitTcoinsDiscount) : baseShare;
        btn.innerHTML = `<i class="fas fa-credit-card"></i> Pay My Share <span id="payBtnVal">₹${payable}</span>`;
      }
    }
  });

  // Initial load
  await loadSplitDetails();
});
