const express = require("express");
const router = express.Router();
const statsController = require("../controllers/statsController");

router.get("/overview", statsController.getOverview);
router.get("/game-counts", statsController.getGameCounts);
router.get("/player/:playerId", statsController.getPlayerStats);
router.get("/player/:playerId/game/:game", statsController.getPlayerGameStats);

module.exports = router;
