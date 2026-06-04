const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const passwordResetController = require("../controllers/passwordResetController");
const accountSettingsController = require("../controllers/accountSettingsController");
const authMiddleware = require("../middleware/auth");
const { authLimiter, probeLimiter } = require("../middleware/rateLimiters");

// Public routes
router.get("/check-availability", probeLimiter, authController.checkAvailability);
router.post("/signup", authLimiter, authController.signup);
router.post("/login", authLimiter, authController.login);
router.post("/logout", authController.logout);
router.get("/verify-email/:token", probeLimiter, authController.verifyEmail);

// Password reset (works for both player and organization accounts)
router.post("/forgot-password", authLimiter, passwordResetController.forgotPassword);
router.post("/verify-reset-otp", authLimiter, passwordResetController.verifyResetOTP);
router.post("/reset-password", authLimiter, passwordResetController.resetPassword);

// Account settings (require auth except verify-email-change and restore-account)
router.post("/change-password", authMiddleware, accountSettingsController.changePassword);
router.post("/change-email", authMiddleware, accountSettingsController.requestEmailChange);
router.get("/verify-email-change/:token", probeLimiter, accountSettingsController.verifyEmailChange);
router.post("/delete-account", authMiddleware, accountSettingsController.deleteAccount);
router.post("/restore-account", authLimiter, accountSettingsController.restoreAccount);

// Protected routes
router.get("/me", authMiddleware, authController.getCurrentUser);

module.exports = router;
