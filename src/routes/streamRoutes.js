const express = require("express");
const router = express.Router();
const streamController = require("../controllers/streamController");
const authMiddleware = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");

// Public routes
router.get("/", streamController.getAllStreams);

// Protected routes (Organizers) — must come before /:id to avoid clash
router.post("/", authMiddleware, streamController.createStream);
router.get("/my/streams", authMiddleware, streamController.getMyStreams);

// Public param routes
router.get("/:id", streamController.getStreamById);
router.put("/:id", authMiddleware, streamController.updateStream);
router.delete("/:id", authMiddleware, streamController.deleteStream);

// Admin routes
router.patch("/:id/approve", authMiddleware, adminAuth, streamController.approveStream);
router.patch("/:id/viewers", streamController.updateViewerCount);

module.exports = router;
