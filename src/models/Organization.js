const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Organization name is required"],
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 100,
    },
    tag: {
      type: String,
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
      maxlength: 2000,
    },
    organizationAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizationAccount",
      required: true,
    },
    country: {
      type: String,
      trim: true,
    },
    isNepal: {
      type: Boolean,
      default: false,
    },
    foundedDate: {
      type: Date,
    },
    socialLinks: {
      twitter: { type: String, trim: true },
      facebook: { type: String, trim: true },
      instagram: { type: String, trim: true },
      website: { type: String, trim: true },
      discord: { type: String, trim: true },
    },
    staff: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        username: {
          type: String,
          required: true,
        },
        role: {
          type: String,
          required: true,
          enum: [
            "Owner",
            "Co-Owner",
            "CEO",
            "Manager",
            "Coach",
            "Analyst",
            "Content Creator",
            "Social Media Manager",
            "Admin",
            "Staff",
          ],
        },
        department: {
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
    teams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
      },
    ],
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
        teams: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team",
          },
        ],
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
    achievements: [
      {
        title: { type: String, required: true },
        description: { type: String },
        date: { type: Date },
        game: { type: String },
      },
    ],
    stats: {
      totalTeams: { type: Number, default: 0 },
      totalPlayers: { type: Number, default: 0 },
      championships: { type: Number, default: 0 },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Organization", organizationSchema);
