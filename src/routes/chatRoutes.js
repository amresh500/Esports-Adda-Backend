const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const authMiddleware = require("../middleware/auth");

// Public routes
router.get("/:game", chatController.getMessages);
router.get("/:game/online", chatController.getOnlineCount);

// Protected routes
router.post("/:game/announcement", authMiddleware, chatController.sendAnnouncement);
router.post("/:game", authMiddleware, chatController.sendMessage);
router.delete("/:game/:messageId", authMiddleware, chatController.deleteMessage);
router.put("/:game/:messageId/pin", authMiddleware, chatController.pinMessage);
router.post("/:game/:messageId/report", authMiddleware, chatController.reportMessage);

module.exports = router;
