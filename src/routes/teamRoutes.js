const express = require("express");
const router = express.Router();
const teamController = require("../controllers/teamController");
const authMiddleware = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");

// Public routes (static paths before dynamic /:id)
router.get("/", teamController.getAllTeams);
router.get("/players", teamController.getPlayers);

// Admin-only: data-repair utility that mutates team docs
router.get("/debug/all", authMiddleware, adminAuth, teamController.debugAllTeams);

// Protected static routes (must be before /:id)
router.get("/my/teams", authMiddleware, teamController.getMyTeams);
router.post("/", authMiddleware, teamController.createTeam);
router.post("/leave", authMiddleware, teamController.leaveTeam);

// Dynamic routes (/:id must come after all static routes)
router.get("/:id", teamController.getTeamById);
router.put("/:id", authMiddleware, teamController.updateTeam);
router.delete("/:id", authMiddleware, teamController.deleteTeam);

// Game roster management
router.post("/:id/games", authMiddleware, teamController.addGameRoster);
router.post("/:id/roster", authMiddleware, teamController.addPlayerToRoster);
router.delete("/:id/roster", authMiddleware, teamController.removePlayerFromRoster);

// Team member management
router.post("/:id/members", authMiddleware, teamController.addMember);
router.delete("/:id/members/:gameIndex/:memberIndex", authMiddleware, teamController.removeMember);

module.exports = router;
