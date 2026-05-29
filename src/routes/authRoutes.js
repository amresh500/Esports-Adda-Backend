const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const passwordResetController = require("../controllers/passwordResetController");
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

// Protected routes
router.get("/me", authMiddleware, authController.getCurrentUser);

module.exports = router;
