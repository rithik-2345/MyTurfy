const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const TCoinsLedger = require('../models/TCoinsLedger');

function getTierInfo(lifetimeCoins) {
  const lifetime = Math.max(0, lifetimeCoins || 0);
  if (lifetime >= 1000000) {
    return { tier: 'legend', cashbackPct: 5, nextTier: null, coinsNeeded: 0, progress: 100 };
  } else if (lifetime >= 100000) {
    const progress = Math.min(100, Math.round(((lifetime - 100000) / 900000) * 100));
    return { tier: 'regular', cashbackPct: 4, nextTier: 'legend', coinsNeeded: 1000000 - lifetime, progress };
  } else {
    const progress = Math.min(100, Math.round((lifetime / 100000) * 100));
    return { tier: 'rookie', cashbackPct: 3, nextTier: 'regular', coinsNeeded: 100000 - lifetime, progress };
  }
}

function getCashbackPct(user) {
  const lifetime = user?.tCoinsLifetime || 0;
  return getTierInfo(lifetime).cashbackPct;
}

// GET /api/tcoins/balance
router.get('/balance', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.id).select('tCoins tCoinsLifetime tCoinsTier tCoinsStreak');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const lifetime = user.tCoinsLifetime || 0;
    const tierInfo = getTierInfo(lifetime);

    // Update tier if changed
    if (user.tCoinsTier !== tierInfo.tier) {
      user.tCoinsTier = tierInfo.tier;
      await user.save();
    }

    const recentTransactions = await TCoinsLedger.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate({ path: 'booking', populate: { path: 'venue', select: 'name' } });

    res.json({
      success: true,
      data: {
        balance: user.tCoins || 0,
        balanceInRupees: Math.floor((user.tCoins || 0) / 10),
        tier: tierInfo.tier,
        cashbackPct: tierInfo.cashbackPct,
        nextTier: tierInfo.nextTier,
        coinsNeededForNextTier: tierInfo.coinsNeeded,
        tierProgress: tierInfo.progress,
        streak: user.tCoinsStreak || 0,
        lifetime,
        recentTransactions: recentTransactions.map(tx => ({
          _id: tx._id,
          type: tx.type,
          amount: tx.amount,
          rupeesEquivalent: tx.rupeesEquivalent,
          balanceAfter: tx.balanceAfter,
          description: tx.description || (tx.booking?.venue?.name ? `Booking at ${tx.booking.venue.name}` : 'T-Coins transaction'),
          createdAt: tx.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

const Booking = require('../models/Booking');

// POST /api/tcoins/calculate
router.post('/calculate', protect, async (req, res, next) => {
  try {
    const { bookingAmount, isGroup = false, splitCode = null, totalBookingAmount = null } = req.body;
    if (!bookingAmount || isNaN(bookingAmount) || bookingAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid bookingAmount is required' });
    }

    const user = await User.findById(req.auth.id).select('tCoins tCoinsLifetime');
    const userCoins = user ? (user.tCoins || 0) : 0;
    const cashbackPct = getCashbackPct(user);

    let maxCoinsUsable = 0;
    let maxDiscount = 0;

    if (isGroup) {
      // Group Booking Rules:
      // 1. Each individual can spend at most 50% of their total coins
      // 2. Total payment of ALL players in group booking using T-Coins <= 10% of total match cost
      let totalMatchCost = Number(totalBookingAmount) || Number(bookingAmount);
      let remainingGroupCoinsPool = Infinity;

      if (splitCode) {
        const booking = await Booking.findOne({ splitCode: splitCode.toUpperCase() });
        if (booking) {
          totalMatchCost = booking.amount || totalMatchCost;
          const totalCoinsUsedSoFar = (booking.splitPayments || []).reduce((sum, p) => sum + (p.tCoinsUsed || 0), 0);
          const maxAllowedGroupCoins = Math.floor(totalMatchCost * 0.10 * 10); // 10% of total cost in T-Coins (10 coins = ₹1)
          remainingGroupCoinsPool = Math.max(0, maxAllowedGroupCoins - totalCoinsUsedSoFar);
        }
      } else if (totalBookingAmount) {
        remainingGroupCoinsPool = Math.floor(Number(totalBookingAmount) * 0.10 * 10);
      } else {
        remainingGroupCoinsPool = Math.floor(bookingAmount * 0.10 * 10);
      }

      const maxByBalance = Math.floor(userCoins * 0.50); // 50% of individual's total coins
      const maxByShare = Math.floor(bookingAmount * 10); // cannot exceed individual share amount

      const rawCoinsUsable = Math.max(0, Math.min(maxByBalance, remainingGroupCoinsPool, maxByShare));
      maxCoinsUsable = Math.floor(rawCoinsUsable / 10) * 10; // Round down to multiple of 10 (10 coins = ₹1)
      maxDiscount = Math.floor(maxCoinsUsable / 10);
      const groupCapReached = isFinite(remainingGroupCoinsPool) && remainingGroupCoinsPool <= 0;

      res.json({
        success: true,
        data: {
          maxCoinsUsable,
          maxDiscount,
          maxCoinsBalancePercent: 50,
          maxGroupCostPercent: 10,
          remainingGroupCoinsPool: isFinite(remainingGroupCoinsPool) ? remainingGroupCoinsPool : null,
          remainingGroupDiscountPool: isFinite(remainingGroupCoinsPool) ? Math.floor(remainingGroupCoinsPool / 10) : null,
          groupCapReached,
          amountAfterDiscount: Math.max(0, bookingAmount - maxDiscount),
          userBalance: userCoins,
          cashbackPct,
          coinsToEarn: Math.round(bookingAmount * (cashbackPct / 100) * 10),
          isGroup: true,
        },
      });
    } else {
      // Solo Rule: Max 70% of user coins & Max 20% of total amount
      const maxByBalance = Math.floor(userCoins * 0.70);
      const maxByOrder = Math.floor(bookingAmount * 0.20 * 10); // 10 coins = ₹1

      const rawCoinsUsable = Math.max(0, Math.min(maxByBalance, maxByOrder));
      maxCoinsUsable = Math.floor(rawCoinsUsable / 10) * 10; // Round down to multiple of 10
      maxDiscount = Math.floor(maxCoinsUsable / 10);

      res.json({
        success: true,
        data: {
          maxCoinsUsable,
          maxDiscount,
          maxDiscountPercent: 20,
          maxCoinsBalancePercent: 70,
          discountPercent: bookingAmount > 0 ? Math.round((maxDiscount / bookingAmount) * 100) : 0,
          amountAfterDiscount: Math.max(0, bookingAmount - maxDiscount),
          userBalance: userCoins,
          cashbackPct,
          coinsToEarn: Math.round(bookingAmount * (cashbackPct / 100) * 10),
          isGroup: false,
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.getTierInfo = getTierInfo;
module.exports.getCashbackPct = getCashbackPct;
