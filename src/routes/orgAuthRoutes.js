const express = require("express");
const router = express.Router();
const orgAuthController = require("../controllers/orgAuthController");
const authMiddleware = require("../middleware/auth");
const { authLimiter, probeLimiter } = require("../middleware/rateLimiters");

// Public routes
router.post("/signup", authLimiter, orgAuthController.signup);
router.post("/login", authLimiter, orgAuthController.login);
router.post("/logout", orgAuthController.logout);
router.get("/verify/:token", probeLimiter, orgAuthController.verifyEmail);
router.get("/all", orgAuthController.getAllOrganizationAccounts);

// Protected routes
router.get("/me", authMiddleware, orgAuthController.getCurrentOrganization);
router.put("/profile", authMiddleware, orgAuthController.updateProfile);

// Admin staff access to organization data
router.get("/admin-org", authMiddleware, orgAuthController.getAdminOrganization);

// Staff management
router.post("/my/staff", authMiddleware, orgAuthController.addStaff);
router.delete("/my/staff/:userId", authMiddleware, orgAuthController.removeStaff);

module.exports = router;
