const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    game: {
      type: String,
      required: true,
      enum: [
        "Valorant",
        "CS2",
        "PUBG Mobile",
        "Dota 2",
        "League of Legends",
        "Free Fire",
      ],
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "senderModel",
    },
    senderModel: {
      type: String,
      required: true,
      enum: ["User", "OrganizationAccount"],
    },
    senderType: {
      type: String,
      required: true,
      enum: ["player", "organization"],
    },
    // Denormalized for fast display without extra DB lookups
    senderName: {
      type: String,
      required: true,
    },
    senderTag: {
      type: String,
      default: null,
    },
    senderAvatar: {
      type: String,
      default: null,
    },
    content: {
      type: String,
      required: true,
      maxlength: 2000,
      trim: true,
    },
    messageType: {
      type: String,
      enum: ["message", "announcement"],
      default: "message",
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    // ── Report system ─────────────────────────────────────────────────────
    reports: [
      {
        reporter: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          refPath: "reports.reporterModel",
        },
        reporterModel: {
          type: String,
          required: true,
          enum: ["User", "OrganizationAccount"],
        },
        reason: {
          type: String,
          required: true,
          enum: [
            "Harassment",
            "Hate Speech",
            "Spam",
            "Inappropriate Content",
            "Misinformation",
            "Other",
          ],
        },
        details: {
          type: String,
          maxlength: 500,
          default: "",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    reportCount: {
      type: Number,
      default: 0,
    },
    isFlagged: {
      type: Boolean,
      default: false,
    },
    autoFlagged: {
      type: Boolean,
      default: false,
    },
    autoFlagReason: {
      type: String,
      default: null,
    },
    // ── Admin moderation tracking ─────────────────────────────────────
    moderationAction: {
      action: {
        type: String,
        enum: ["dismissed", "deleted", "warned"],
      },
      actionBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      actionAt: Date,
      note: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast paginated queries per game
messageSchema.index({ game: 1, createdAt: -1 });
messageSchema.index({ game: 1, isPinned: 1 });
messageSchema.index({ sender: 1 });

module.exports = mongoose.model("Message", messageSchema);
