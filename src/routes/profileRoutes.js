const express = require("express");
const router = express.Router();
const playerProfileController = require("../controllers/playerProfileController");
const authMiddleware = require("../middleware/auth");

// Protected routes
router.get("/my", authMiddleware, playerProfileController.getMyProfile);
router.put("/", authMiddleware, playerProfileController.updateProfile);
router.post("/games", authMiddleware, playerProfileController.addGame);
router.delete("/games/:game", authMiddleware, playerProfileController.removeGame);
router.post("/achievements", authMiddleware, playerProfileController.addAchievement);

// Public routes
router.get("/user/:userId", playerProfileController.getProfileByUserId);

module.exports = router;
