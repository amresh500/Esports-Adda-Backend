const express = require("express");
const router = express.Router();
const orgAuthController = require("../controllers/orgAuthController");
const authMiddleware = require("../middleware/auth");

// Public routes
router.post("/signup", orgAuthController.signup);
router.post("/login", orgAuthController.login);
router.get("/verify/:token", orgAuthController.verifyEmail);
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
