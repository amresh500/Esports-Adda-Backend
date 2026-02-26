const express = require("express");
const router = express.Router();
const statsController = require("../controllers/statsController");

router.get("/overview", statsController.getOverview);
router.get("/game-counts", statsController.getGameCounts);

module.exports = router;
