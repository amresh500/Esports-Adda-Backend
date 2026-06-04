const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, "Username is required"],
    unique: true,
    trim: true,
    minlength: [3, "Username must be at least 3 characters"],
    maxlength: [30, "Username cannot exceed 30 characters"],
  },
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLogin: {
    type: Date,
  },
  isVerified:{
    type: Boolean,
    default: false,
  },
  verificationToken: {
    type: String,
    index: { sparse: true },
  },
  verificationTokenExpiration: {
    type: Date,
  },
  // ── Password reset (OTP) ────────────────────────────────────────────
  resetPasswordOTP: {
    type: String,
    index: { sparse: true },
  },
  resetPasswordExpiration: {
    type: Date,
  },
  // ── Email change (pending until verified at new address) ────────────
  pendingEmail: {
    type: String,
    lowercase: true,
    trim: true,
  },
  pendingEmailToken: {
    type: String,
    index: { sparse: true },
  },
  pendingEmailExpiration: {
    type: Date,
  },
  // ── Soft delete ─────────────────────────────────────────────────────
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  // ── Admin & Moderation ──────────────────────────────────────────────
  isAdmin: {
    type: Boolean,
    default: false,
  },
  isSuspended: {
    type: Boolean,
    default: false,
  },
  suspendedUntil: {
    type: Date,
    default: null,
  },
  isBanned: {
    type: Boolean,
    default: false,
  },
  banReason: {
    type: String,
    default: null,
  },
  warnings: [
    {
      reason: { type: String, required: true },
      issuedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      createdAt: { type: Date, default: Date.now },
    },
  ],
});

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
