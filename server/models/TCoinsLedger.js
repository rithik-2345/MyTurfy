const mongoose = require('mongoose');

const tCoinsLedgerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    type: {
      type: String,
      enum: ['earn', 'redeem', 'reverse_earn', 'reverse_redeem', 'bonus', 'refund', 'expire'],
      required: true,
    },
    amount: { type: Number, required: true },        // Always in display coins (10 = ₹1), positive = credit, negative = debit
    rupeesEquivalent: { type: Number, default: 0 },  // ₹ value of this transaction
    balanceAfter: { type: Number, default: 0 },       // User's wallet balance after this transaction
    description: { type: String, default: '' },       // Human-readable description
  },
  { timestamps: true }
);

module.exports = mongoose.model('TCoinsLedger', tCoinsLedgerSchema);
