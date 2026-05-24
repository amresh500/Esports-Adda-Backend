const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const organizationAccountSchema = new mongoose.Schema({
  // Authentication fields
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [8, "Password must be at least 8 characters"],
  },

  // Organization details
  organizationName: {
    type: String,
    required: [true, "Organization name is required"],
    unique: true,
    trim: true,
    minlength: [3, "Organization name must be at least 3 characters"],
    maxlength: [100, "Organization name cannot exceed 100 characters"],
  },
  tag: {
    type: String,
    required: [true, "Organization tag is required"],
    unique: true,
    trim: true,
    uppercase: true,
    minlength: [2, "Tag must be at least 2 characters"],
    maxlength: [10, "Tag cannot exceed 10 characters"],
  },
  logo: {
    type: String,
    default: "",
  },
  description: {
    type: String,
    maxlength: 2000,
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

  // Contact information
  contactEmail: {
    type: String,
    trim: true,
  },
  contactPhone: {
    type: String,
    trim: true,
  },

  // Social links
  socialLinks: {
    twitter: { type: String, trim: true },
    facebook: { type: String, trim: true },
    instagram: { type: String, trim: true },
    website: { type: String, trim: true },
    discord: { type: String, trim: true },
    youtube: { type: String, trim: true },
  },

  // Staff members
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

  // Teams managed by this organization
  teams: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
    },
  ],

  // Games the organization participates in
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

  // Achievements
  achievements: [
    {
      title: { type: String, required: true },
      description: { type: String },
      date: { type: Date },
      game: { type: String },
      tournament: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament" },
      auto: { type: Boolean, default: false },
    },
  ],

  // Statistics
  stats: {
    totalTeams: { type: Number, default: 0 },
    totalPlayers: { type: Number, default: 0 },
    championships: { type: Number, default: 0 },
  },

  // Verification
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationToken: {
    type: String,
  },
  verificationTokenExpiration: {
    type: Date,
  },

  // Account status
  isActive: {
    type: Boolean,
    default: true,
  },

  // Account type identifier
  accountType: {
    type: String,
    default: "organization",
    immutable: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLogin: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Hash password before saving
organizationAccountSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
organizationAccountSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("OrganizationAccount", organizationAccountSchema);
