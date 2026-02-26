const express = require("express");
const router = express.Router();
const streamController = require("../controllers/streamController");
const authMiddleware = require("../middleware/auth");

// Public routes
router.get("/", streamController.getAllStreams);
router.get("/:id", streamController.getStreamById);

// Protected routes (Organizers)
router.post("/", authMiddleware, streamController.createStream);
router.get("/my/streams", authMiddleware, streamController.getMyStreams);
router.put("/:id", authMiddleware, streamController.updateStream);
router.delete("/:id", authMiddleware, streamController.deleteStream);

// Admin routes (will add role check later)
router.patch("/:id/approve", authMiddleware, streamController.approveStream);
router.patch("/:id/viewers", streamController.updateViewerCount);

module.exports = router;
