const express = require("express");
const router = express.Router();
const tournamentController = require("../controllers/tournamentController");
const authMiddleware = require("../middleware/auth");

// Public routes
router.get("/", tournamentController.getAllTournaments);
router.get("/:id", tournamentController.getTournamentById);

// Protected routes (Organization only)
router.post("/", authMiddleware, tournamentController.createTournament);
router.get("/my/tournaments", authMiddleware, tournamentController.getMyTournaments);
router.put("/:id", authMiddleware, tournamentController.updateTournament);
router.delete("/:id", authMiddleware, tournamentController.deleteTournament);
router.patch("/:id/publish", authMiddleware, tournamentController.publishTournament);
router.patch("/:id/registration-dates", authMiddleware, tournamentController.updateRegistrationDates);
router.post("/:id/generate-bracket", authMiddleware, tournamentController.generateBracket);

// Protected routes (Team registration)
router.post("/:id/register", authMiddleware, tournamentController.registerTeam);
router.post("/:id/unregister", authMiddleware, tournamentController.unregisterTeam);

// Protected routes (Payment verification - organizer only)
router.patch("/:id/participants/:teamId/verify", authMiddleware, tournamentController.verifyRegistration);
router.get("/:id/participants/:teamId/screenshot", authMiddleware, tournamentController.getPaymentScreenshot);

// Protected routes (Bracket management)
router.patch("/:id/bracket", authMiddleware, tournamentController.updateBracket);

// Match management routes
router.post("/:tournamentId/matches/:matchNumber/result", authMiddleware, tournamentController.reportMatchResult);
router.get("/:tournamentId/matches/:matchNumber", tournamentController.getMatch);
router.patch("/:tournamentId/matches/:matchNumber/schedule", authMiddleware, tournamentController.updateMatchSchedule);
router.post("/:tournamentId/matches/:matchNumber/reset", authMiddleware, tournamentController.resetMatch);

module.exports = router;
