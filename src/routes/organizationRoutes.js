const express = require("express");
const router = express.Router();
const organizationController = require("../controllers/organizationController");
const authMiddleware = require("../middleware/auth");

// Public routes
router.get("/", organizationController.getAllOrganizations);
router.get("/:id", organizationController.getOrganizationById);

// Protected routes
router.post("/", authMiddleware, organizationController.createOrganization);
router.get("/my/organizations", authMiddleware, organizationController.getMyOrganizations);
router.put("/:id", authMiddleware, organizationController.updateOrganization);
router.delete("/:id", authMiddleware, organizationController.deleteOrganization);

// Staff management
router.post("/:id/staff", authMiddleware, organizationController.addStaff);
router.delete("/:id/staff", authMiddleware, organizationController.removeStaff);

// Team management
router.post("/:id/teams", authMiddleware, organizationController.addTeam);

module.exports = router;
