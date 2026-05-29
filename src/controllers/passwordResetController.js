const crypto = require("crypto");
const User = require("../models/User");
const OrganizationAccount = require("../models/OrganizationAccount");
const { sendPasswordResetEmail } = require("../utils/mailer");
const { validatePassword } = require("../utils/passwordPolicy");

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Find an account (player or org) by email. Returns { account, model } or null.
async function findAccountByEmail(email) {
  const user = await User.findOne({ email });
  if (user) return { account: user, model: "User" };
  const org = await OrganizationAccount.findOne({ email });
  if (org) return { account: org, model: "OrganizationAccount" };
  return null;
}

function generateOTP() {
  // 6-digit numeric code, zero-padded
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// POST /api/auth/forgot-password { email }
// Always responds success (don't reveal whether an account exists).
exports.forgotPassword = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const found = await findAccountByEmail(email);

    // Generic response regardless of existence (prevents account enumeration).
    const genericMsg =
      "If an account with that email exists, a reset code has been sent.";

    if (!found) {
      return res.status(200).json({ success: true, message: genericMsg });
    }

    const otp = generateOTP();
    found.account.resetPasswordOTP = otp;
    found.account.resetPasswordExpiration = new Date(Date.now() + OTP_TTL_MS);
    await found.account.save();

    try {
      await sendPasswordResetEmail({ to: email, otp });
    } catch (mailErr) {
      console.error("Password reset email failed to send:", mailErr.message);
      // Surface a soft error so the user knows to retry, without leaking existence.
      return res.status(200).json({
        success: true,
        message:
          "If an account with that email exists, a reset code has been sent. (If you don't receive it, try again shortly.)",
      });
    }

    res.status(200).json({ success: true, message: genericMsg });
  } catch (error) {
    console.error("forgotPassword error:", error);
    res.status(500).json({ success: false, message: "Failed to process request" });
  }
};

// POST /api/auth/verify-reset-otp { email, otp }
// Optional pre-check so the UI can advance to the password step.
exports.verifyResetOTP = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const otp = req.body.otp?.trim();
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and code are required" });
    }

    const found = await findAccountByEmail(email);
    if (
      !found ||
      !found.account.resetPasswordOTP ||
      found.account.resetPasswordOTP !== otp ||
      !found.account.resetPasswordExpiration ||
      found.account.resetPasswordExpiration < new Date()
    ) {
      return res.status(400).json({ success: false, message: "Invalid or expired code" });
    }

    res.status(200).json({ success: true, message: "Code verified" });
  } catch (error) {
    console.error("verifyResetOTP error:", error);
    res.status(500).json({ success: false, message: "Failed to verify code" });
  }
};

// POST /api/auth/reset-password { email, otp, newPassword }
exports.resetPassword = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const otp = req.body.otp?.trim();
    const { newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, code, and new password are required",
      });
    }

    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ success: false, message: pwCheck.message });
    }

    const found = await findAccountByEmail(email);
    if (
      !found ||
      !found.account.resetPasswordOTP ||
      found.account.resetPasswordOTP !== otp ||
      !found.account.resetPasswordExpiration ||
      found.account.resetPasswordExpiration < new Date()
    ) {
      return res.status(400).json({ success: false, message: "Invalid or expired code" });
    }

    // Setting .password triggers the pre-save bcrypt hook on both models.
    found.account.password = newPassword;
    found.account.resetPasswordOTP = undefined;
    found.account.resetPasswordExpiration = undefined;
    await found.account.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully. You can now log in.",
    });
  } catch (error) {
    console.error("resetPassword error:", error);
    res.status(500).json({ success: false, message: "Failed to reset password" });
  }
};
