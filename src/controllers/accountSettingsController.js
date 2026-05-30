const crypto = require("crypto");
const User = require("../models/User");
const OrganizationAccount = require("../models/OrganizationAccount");
const { sendEmailChangeVerification } = require("../utils/mailer");
const { validatePassword } = require("../utils/passwordPolicy");

const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Resolve the right model from the JWT's accountType
function getModel(accountType) {
  return accountType === "organization" ? OrganizationAccount : User;
}

function clearAuthCookie(res) {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
}

// POST /api/auth/change-password { currentPassword, newPassword }
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required",
      });
    }

    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ success: false, message: pwCheck.message });
    }

    const Model = getModel(req.accountType);
    const account = await Model.findById(req.userId);
    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    const ok = await account.comparePassword(currentPassword);
    if (!ok) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from the current one",
      });
    }

    account.password = newPassword; // pre-save hook re-hashes
    await account.save();

    res.status(200).json({
      success: true,
      message: "Password updated. Please log in again.",
    });
  } catch (error) {
    console.error("changePassword error:", error);
    res.status(500).json({ success: false, message: "Failed to change password" });
  }
};

// POST /api/auth/change-email { newEmail, currentPassword }
// Sends a verification email to the NEW address. Old email stays active
// until the user clicks the link in that email.
exports.requestEmailChange = async (req, res) => {
  try {
    const newEmail = req.body.newEmail?.trim().toLowerCase();
    const { currentPassword } = req.body;

    if (!newEmail || !currentPassword) {
      return res.status(400).json({
        success: false,
        message: "New email and current password are required",
      });
    }
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email" });
    }

    const Model = getModel(req.accountType);
    const account = await Model.findById(req.userId);
    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    const ok = await account.comparePassword(currentPassword);
    if (!ok) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    if (account.email === newEmail) {
      return res.status(400).json({
        success: false,
        message: "That's already your current email",
      });
    }

    // Make sure no other account is using the new email (check both collections).
    const [userTaken, orgTaken] = await Promise.all([
      User.findOne({ email: newEmail }).select("_id"),
      OrganizationAccount.findOne({ email: newEmail }).select("_id"),
    ]);
    if (userTaken || orgTaken) {
      return res.status(400).json({ success: false, message: "That email is already in use" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    account.pendingEmail = newEmail;
    account.pendingEmailToken = token;
    account.pendingEmailExpiration = new Date(Date.now() + EMAIL_CHANGE_TTL_MS);
    await account.save();

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5050";
    const url = `${frontendUrl}/verify-email-change?token=${token}`;

    try {
      await sendEmailChangeVerification({ to: newEmail, url });
    } catch (mailErr) {
      console.error("Email change verification failed to send:", mailErr.message);
      return res.status(500).json({
        success: false,
        message: "Couldn't send confirmation email. Please try again shortly.",
      });
    }

    res.status(200).json({
      success: true,
      message: `Confirmation email sent to ${newEmail}. Click the link to complete the change.`,
    });
  } catch (error) {
    console.error("requestEmailChange error:", error);
    res.status(500).json({ success: false, message: "Failed to request email change" });
  }
};

// GET /api/auth/verify-email-change/:token
// Public — anyone with the token can confirm. Idempotent: a used token won't match.
exports.verifyEmailChange = async (req, res) => {
  try {
    const { token } = req.params;

    // The token could belong to either a User or an OrganizationAccount.
    const [user, org] = await Promise.all([
      User.findOne({
        pendingEmailToken: token,
        pendingEmailExpiration: { $gt: new Date() },
      }),
      OrganizationAccount.findOne({
        pendingEmailToken: token,
        pendingEmailExpiration: { $gt: new Date() },
      }),
    ]);

    const account = user || org;
    if (!account || !account.pendingEmail) {
      return res.status(400).json({ success: false, message: "Invalid or expired token" });
    }

    // Final check that the email hasn't been claimed since the request.
    const [userTaken, orgTaken] = await Promise.all([
      User.findOne({ email: account.pendingEmail }).select("_id"),
      OrganizationAccount.findOne({ email: account.pendingEmail }).select("_id"),
    ]);
    if (
      (userTaken && userTaken._id.toString() !== account._id.toString()) ||
      (orgTaken && orgTaken._id.toString() !== account._id.toString())
    ) {
      account.pendingEmail = undefined;
      account.pendingEmailToken = undefined;
      account.pendingEmailExpiration = undefined;
      await account.save();
      return res.status(400).json({ success: false, message: "That email is no longer available" });
    }

    account.email = account.pendingEmail;
    account.pendingEmail = undefined;
    account.pendingEmailToken = undefined;
    account.pendingEmailExpiration = undefined;
    await account.save();

    res.status(200).json({
      success: true,
      message: "Email updated successfully. Please log in with your new email.",
    });
  } catch (error) {
    console.error("verifyEmailChange error:", error);
    res.status(500).json({ success: false, message: "Failed to verify email change" });
  }
};

// POST /api/auth/delete-account { currentPassword }
// Soft delete: sets isDeleted + deletedAt and logs the user out.
// Account can be restored within 30 days by logging in (login surfaces a restore option).
exports.deleteAccount = async (req, res) => {
  try {
    const { currentPassword } = req.body;
    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password is required to delete your account",
      });
    }

    const Model = getModel(req.accountType);
    const account = await Model.findById(req.userId);
    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    const ok = await account.comparePassword(currentPassword);
    if (!ok) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    account.isDeleted = true;
    account.deletedAt = new Date();
    await account.save();

    clearAuthCookie(res);
    res.status(200).json({
      success: true,
      message: "Account scheduled for deletion. You can restore it within 30 days by logging back in.",
    });
  } catch (error) {
    console.error("deleteAccount error:", error);
    res.status(500).json({ success: false, message: "Failed to delete account" });
  }
};

// POST /api/auth/restore-account { email, password }
// Reverses a soft delete. Public so deleted users (who can't log in) can use it.
exports.restoreAccount = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const [user, org] = await Promise.all([
      User.findOne({ email, isDeleted: true }),
      OrganizationAccount.findOne({ email, isDeleted: true }),
    ]);
    const account = user || org;
    if (!account) {
      return res.status(400).json({ success: false, message: "No deleted account found for that email" });
    }

    const ok = await account.comparePassword(password);
    if (!ok) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    account.isDeleted = false;
    account.deletedAt = null;
    await account.save();

    res.status(200).json({
      success: true,
      message: "Account restored. You can now log in.",
    });
  } catch (error) {
    console.error("restoreAccount error:", error);
    res.status(500).json({ success: false, message: "Failed to restore account" });
  }
};
