const express = require("express");
const router = express.Router();
const staffProfileController = require("../controllers/staffProfileController");
const authMiddleware = require("../middleware/auth");

// Public routes
router.get("/username/:username", staffProfileController.getStaffProfileByUsername);
router.get("/available", staffProfileController.getAvailableStaff);

// Protected routes (require authentication)
router.get("/my", authMiddleware, staffProfileController.getStaffProfile);
router.put("/my", authMiddleware, staffProfileController.updateStaffProfile);

// Work history routes
router.post("/my/work-history", authMiddleware, staffProfileController.addWorkHistory);
router.delete("/my/work-history/:workHistoryId", authMiddleware, staffProfileController.removeWorkHistory);

// Achievement routes
router.post("/my/achievements", authMiddleware, staffProfileController.addAchievement);
router.delete("/my/achievements/:achievementId", authMiddleware, staffProfileController.removeAchievement);

// Certification routes
router.post("/my/certifications", authMiddleware, staffProfileController.addCertification);
router.delete("/my/certifications/:certificationId", authMiddleware, staffProfileController.removeCertification);

// Availability routes
router.put("/my/availability", authMiddleware, staffProfileController.updateAvailability);

module.exports = router;
