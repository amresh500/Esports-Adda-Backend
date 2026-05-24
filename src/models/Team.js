const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Team name is required"],
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
    },
    tag: {
      type: String,
      required: [true, "Team tag is required"],
      unique: true,
      trim: true,
      maxlength: 10,
      uppercase: true,
    },
    logo: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      maxlength: 1000,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    teamLeader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizationAccount",
    },
    game: {
      type: String,
      required: [true, "Team game is required"],
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
    country: {
      type: String,
      trim: true,
    },
    isNepal: {
      type: Boolean,
      default: false,
    },
    socialLinks: {
      twitter: { type: String, trim: true },
      discord: { type: String, trim: true },
      website: { type: String, trim: true },
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
        roster: [
          {
            player: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              required: true,
            },
            playerName: {
              type: String,
              required: true,
            },
            role: {
              type: String,
              enum: ["Player", "Captain", "Coach", "Manager", "Substitute"],
              default: "Player",
            },
            inGameRole: {
              type: String,
              trim: true,
            },
            joinedDate: {
              type: Date,
              default: Date.now,
            },
            isActive: {
              type: Boolean,
              default: true,
            },
          },
        ],
      },
    ],
    stats: {
      tournamentsPlayed: { type: Number, default: 0 },
      wins: { type: Number, default: 0 },
      championships: { type: Number, default: 0 },
    },
    achievements: [
      {
        title: { type: String, required: true },
        description: { type: String },
        date: { type: Date },
        game: { type: String },
        tournament: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament" },
        placement: { type: Number },
        auto: { type: Boolean, default: false },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Team", teamSchema);
