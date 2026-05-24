const mongoose = require("mongoose");

const playerProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    realName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    bio: {
      type: String,
      maxlength: 500,
    },
    country: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    isNepal: {
      type: Boolean,
      default: false,
    },
    avatar: {
      type: String,
      default: "",
    },
    dateOfBirth: {
      type: Date,
    },
    socialLinks: {
      twitter: { type: String, trim: true },
      twitch: { type: String, trim: true },
      youtube: { type: String, trim: true },
      discord: { type: String, trim: true },
      instagram: { type: String, trim: true },
    },
    games: [
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
            "Mobile Legends",
            "Apex Legends",
            "Call of Duty",
            "Rainbow Six Siege",
            "Other",
          ],
        },
        rank: {
          type: String,
          required: true,
          trim: true,
        },
        role: {
          type: String,
          trim: true,
        },
        inGameName: {
          type: String,
          trim: true,
        },
        isPrimary: {
          type: Boolean,
          default: false,
        },
      },
    ],
    teams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
      },
    ],
    currentTeam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
    },
    organizations: [
      {
        organization: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Organization",
        },
        role: {
          type: String,
          trim: true,
        },
        department: {
          type: String,
          trim: true,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    achievements: [
      {
        title: { type: String, required: true },
        description: { type: String },
        date: { type: Date },
        game: { type: String },
        tournament: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament" },
        team: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
        placement: { type: Number },
        auto: { type: Boolean, default: false },
      },
    ],
    stats: {
      tournamentsPlayed: { type: Number, default: 0 },
      wins: { type: Number, default: 0 },
      mvps: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("PlayerProfile", playerProfileSchema);
