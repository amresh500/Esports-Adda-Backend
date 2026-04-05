const mongoose = require("mongoose");

// Notification types and what triggers them:
//
//  tournament_registration_approved  → team owner when org approves their registration
//  tournament_registration_rejected  → team owner when org rejects their registration
//  tournament_bracket_generated      → all approved participants when bracket is ready
//  tournament_match_scheduled        → both participants of a match when time is set
//  tournament_completed              → all participants when tournament finishes
//  stream_approved                   → organizer when admin approves their stream
//  stream_rejected                   → organizer when admin rejects their stream
//  user_warned                       → player when admin issues a warning
//  user_suspended                    → player when admin suspends them
//  user_banned                       → player when admin bans them

const notificationSchema = new mongoose.Schema(
  {
    // Who receives this notification
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "recipientModel",
    },
    recipientModel: {
      type: String,
      required: true,
      enum: ["User", "OrganizationAccount"],
    },

    // What kind of notification
    type: {
      type: String,
      required: true,
      enum: [
        "tournament_registration_approved",
        "tournament_registration_rejected",
        "tournament_bracket_generated",
        "tournament_match_scheduled",
        "tournament_completed",
        "stream_approved",
        "stream_rejected",
        "user_warned",
        "user_suspended",
        "user_banned",
      ],
    },

    // Human-readable title and message
    title: { type: String, required: true },
    message: { type: String, required: true },

    // Optional link the frontend can navigate to on click
    link: { type: String, default: null },

    // Has the user seen this notification?
    isRead: { type: Boolean, default: false },

    // Optional reference to the related document
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    refModel: {
      type: String,
      enum: ["Tournament", "Stream", "User", null],
      default: null,
    },
  },
  { timestamps: true }
);

// Index for fast per-user queries, newest first
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
