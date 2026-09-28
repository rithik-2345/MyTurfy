const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'block_user', 'unblock_user',
        'block_owner', 'unblock_owner',
        'verify_owner', 'unverify_owner',
        'sponsor_venue', 'unsponsor_venue',
        'change_commission', 'change_convenience_fee',
        'toggle_venue_active',
        'force_refund', 'change_booking_status',
        'delete_review', 'delete_user',
        'create_promo', 'edit_promo', 'delete_promo', 'toggle_promo',
        'create_announcement', 'delete_announcement',
        'admin_login',
      ],
    },
    targetType: {
      type: String,
      enum: ['user', 'owner', 'venue', 'booking', 'promo', 'review', 'announcement', 'system'],
      required: true,
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    details:  { type: String, default: '' },
  },
  { timestamps: true }
);

adminAuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
