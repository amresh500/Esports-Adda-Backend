const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const passwordResetController = require("../controllers/passwordResetController");
const accountSettingsController = require("../controllers/accountSettingsController");
const authMiddleware = require("../middleware/auth");

// Public routes
router.get("/check-availability", authController.checkAvailability);
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.get("/verify-email/:token", authController.verifyEmail);

// Password reset (works for both player and organization accounts)
router.post("/forgot-password", passwordResetController.forgotPassword);
router.post("/verify-reset-otp", passwordResetController.verifyResetOTP);
router.post("/reset-password", passwordResetController.resetPassword);

// Account settings (require auth except verify-email-change and restore-account)
router.post("/change-password", authMiddleware, accountSettingsController.changePassword);
router.post("/change-email", authMiddleware, accountSettingsController.requestEmailChange);
router.get("/verify-email-change/:token", accountSettingsController.verifyEmailChange);
router.post("/delete-account", authMiddleware, accountSettingsController.deleteAccount);
router.post("/restore-account", accountSettingsController.restoreAccount);

// Protected routes
router.get("/me", authMiddleware, authController.getCurrentUser);

module.exports = router;
