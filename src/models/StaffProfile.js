const mongoose = require("mongoose");

const staffProfileSchema = new mongoose.Schema(
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
      maxlength: 1000,
    },
    profilePicture: {
      type: String,
      default: "",
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
    dateOfBirth: {
      type: Date,
    },

    // Professional information
    currentOrganization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizationAccount",
    },
    currentRole: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },

    // Work history
    workHistory: [
      {
        organization: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "OrganizationAccount",
        },
        organizationName: {
          type: String,
          required: true,
        },
        role: {
          type: String,
          required: true,
        },
        department: {
          type: String,
        },
        startDate: {
          type: Date,
          required: true,
        },
        endDate: {
          type: Date,
        },
        description: {
          type: String,
          maxlength: 500,
        },
        isCurrent: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // Skills and expertise
    skills: [
      {
        type: String,
        trim: true,
      },
    ],
    specializations: [
      {
        type: String,
        enum: [
          "Team Management",
          "Player Development",
          "Strategy & Analysis",
          "Content Creation",
          "Social Media",
          "Event Management",
          "Marketing",
          "Business Development",
          "Coaching",
          "Other",
        ],
      },
    ],

    // Experience
    yearsOfExperience: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Games expertise
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
        expertise: {
          type: String,
          enum: ["Beginner", "Intermediate", "Advanced", "Expert"],
          default: "Intermediate",
        },
      },
    ],

    // Achievements and certifications
    achievements: [
      {
        title: { type: String, required: true },
        description: { type: String },
        organization: { type: String },
        date: { type: Date },
      },
    ],

    certifications: [
      {
        name: { type: String, required: true },
        issuer: { type: String },
        date: { type: Date },
        expiryDate: { type: Date },
        credentialId: { type: String },
      },
    ],

    // Social links
    socialLinks: {
      linkedin: { type: String, trim: true },
      twitter: { type: String, trim: true },
      instagram: { type: String, trim: true },
      discord: { type: String, trim: true },
      website: { type: String, trim: true },
    },

    // Contact information
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },

    // Availability
    availableForHire: {
      type: Boolean,
      default: false,
    },
    preferredRoles: [
      {
        type: String,
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
    ],

    // Organizations this staff member is part of
    organizations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "OrganizationAccount",
      },
    ],

    // Privacy settings
    isProfilePublic: {
      type: Boolean,
      default: true,
    },
    showContactInfo: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster lookups
staffProfileSchema.index({ user: 1 });
staffProfileSchema.index({ currentOrganization: 1 });
staffProfileSchema.index({ "games.game": 1 });

module.exports = mongoose.model("StaffProfile", staffProfileSchema);
