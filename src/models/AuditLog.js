const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "user_warned",
        "user_suspended",
        "user_banned",
        "user_unbanned",
        "user_unsuspended",
        "message_dismissed",
        "message_deleted",
        "message_sender_warned",
        "stream_approved",
        "stream_rejected",
        "tournament_cancelled",
        "tournament_force_completed",
      ],
    },
    targetType: {
      type: String,
      required: true,
      enum: ["User", "OrganizationAccount", "Message", "Stream", "Tournament"],
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    details: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ admin: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
