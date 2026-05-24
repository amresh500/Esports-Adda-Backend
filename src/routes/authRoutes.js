const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");

// Public routes
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.get("/verify-email/:token", authController.verifyEmail);

// Protected routes
router.get("/me", authMiddleware, authController.getCurrentUser);

module.exports = router;
