const Message = require("../models/Message");
const User = require("../models/User");
const OrganizationAccount = require("../models/OrganizationAccount");
const PlayerProfile = require("../models/PlayerProfile");
const { checkContent } = require("../utils/contentFilter");

const VALID_GAMES = [
  "Valorant",
  "CS2",
  "PUBG Mobile",
  "Dota 2",
  "League of Legends",
  "Free Fire",
];

// GET /api/chat/:game?cursor=<lastMessageId>&limit=50
// Public — anyone can read messages
exports.getMessages = async (req, res) => {
  try {
    const { game } = req.params;
    const { cursor, limit = 50 } = req.query;

    if (!VALID_GAMES.includes(game)) {
      return res.status(400).json({ success: false, message: "Invalid game" });
    }

    const query = { game, isDeleted: false };

    // Cursor-based pagination: fetch messages older than the cursor
    if (cursor) {
      query._id = { $lt: cursor };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    // Return in chronological order for display
    messages.reverse();

    // Fetch pinned messages separately (always show at top)
    const pinned = await Message.find({ game, isPinned: true, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        messages,
        pinned,
        hasMore: messages.length === Number(limit),
        nextCursor:
          messages.length > 0 ? messages[0]._id : null,
      },
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch messages" });
  }
};

// POST /api/chat/:game
// Auth required — send a regular message
exports.sendMessage = async (req, res) => {
  try {
    const { game } = req.params;
    const { content } = req.body;

    if (!VALID_GAMES.includes(game)) {
      return res.status(400).json({ success: false, message: "Invalid game" });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: "Message content is required" });
    }

    if (content.trim().length > 2000) {
      return res.status(400).json({ success: false, message: "Message too long (max 2000 chars)" });
    }

    // Content moderation filter
    const filterResult = checkContent(content.trim());
    if (!filterResult.allowed) {
      return res.status(400).json({ success: false, message: "Your message contains inappropriate content." });
    }

    const { userId, accountType } = req;
    const senderInfo = await resolveSenderInfo(userId, accountType);

    if (!senderInfo) {
      return res.status(404).json({ success: false, message: "Sender not found" });
    }

    const message = await Message.create({
      game,
      sender: userId,
      senderModel: senderInfo.senderModel,
      senderType: senderInfo.senderType,
      senderName: senderInfo.senderName,
      senderTag: senderInfo.senderTag,
      senderAvatar: senderInfo.senderAvatar,
      content: content.trim(),
      messageType: "message",
      ...(filterResult.flagged && {
        isFlagged: true,
        autoFlagged: true,
        autoFlagReason: filterResult.matchedWord,
      }),
    });

    res.status(201).json({ success: true, data: { message } });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ success: false, message: "Failed to send message" });
  }
};

// POST /api/chat/:game/announcement
// Auth required + org account only
exports.sendAnnouncement = async (req, res) => {
  try {
    const { game } = req.params;
    const { content } = req.body;

    if (!VALID_GAMES.includes(game)) {
      return res.status(400).json({ success: false, message: "Invalid game" });
    }

    if (req.accountType !== "organization") {
      return res.status(403).json({
        success: false,
        message: "Only organization accounts can post announcements",
      });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: "Announcement content is required" });
    }

    // Content moderation filter
    const annFilterResult = checkContent(content.trim());
    if (!annFilterResult.allowed) {
      return res.status(400).json({ success: false, message: "Your announcement contains inappropriate content." });
    }

    const senderInfo = await resolveSenderInfo(req.userId, req.accountType);
    if (!senderInfo) {
      return res.status(404).json({ success: false, message: "Sender not found" });
    }

    const message = await Message.create({
      game,
      sender: req.userId,
      senderModel: "OrganizationAccount",
      senderType: "organization",
      senderName: senderInfo.senderName,
      senderTag: senderInfo.senderTag,
      senderAvatar: senderInfo.senderAvatar,
      content: content.trim(),
      messageType: "announcement",
      ...(annFilterResult.flagged && {
        isFlagged: true,
        autoFlagged: true,
        autoFlagReason: annFilterResult.matchedWord,
      }),
    });

    res.status(201).json({ success: true, data: { message } });
  } catch (error) {
    console.error("Send announcement error:", error);
    res.status(500).json({ success: false, message: "Failed to send announcement" });
  }
};

// DELETE /api/chat/:game/:messageId
// Auth required — own message, or org account for any message in their hub
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId, accountType } = req;

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    const isOwner = message.sender.toString() === userId;

    if (!isOwner) {
      return res.status(403).json({ success: false, message: "Not authorized to delete this message" });
    }

    message.isDeleted = true;
    await message.save();

    res.status(200).json({ success: true, message: "Message deleted" });
  } catch (error) {
    console.error("Delete message error:", error);
    res.status(500).json({ success: false, message: "Failed to delete message" });
  }
};

// PUT /api/chat/:game/:messageId/pin
// Auth required + org account only
exports.pinMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    if (req.accountType !== "organization") {
      return res.status(403).json({
        success: false,
        message: "Only organization accounts can pin messages",
      });
    }

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    message.isPinned = !message.isPinned;
    await message.save();

    res.status(200).json({
      success: true,
      data: { message, pinned: message.isPinned },
    });
  } catch (error) {
    console.error("Pin message error:", error);
    res.status(500).json({ success: false, message: "Failed to pin message" });
  }
};

// GET /api/chat/:game/online
// Public — returns current online count (tracked by socket server)
exports.getOnlineCount = async (req, res) => {
  try {
    const { game } = req.params;
    if (!VALID_GAMES.includes(game)) {
      return res.status(400).json({ success: false, message: "Invalid game" });
    }
    // Online count is managed by socketHandler via global Map
    const count = global.onlineCounts?.[game] || 0;
    res.status(200).json({ success: true, data: { game, online: count } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to get online count" });
  }
};

// POST /api/chat/:game/:messageId/report
// Auth required — report a message (cannot report own messages)
exports.reportMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { reason, details } = req.body;
    const { userId, accountType } = req;

    const VALID_REASONS = [
      "Harassment",
      "Hate Speech",
      "Spam",
      "Inappropriate Content",
      "Misinformation",
      "Other",
    ];

    if (!reason || !VALID_REASONS.includes(reason)) {
      return res.status(400).json({ success: false, message: "Valid reason is required" });
    }

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    // Cannot report your own message
    if (message.sender.toString() === userId) {
      return res.status(400).json({ success: false, message: "You cannot report your own message" });
    }

    // Check if already reported by this user
    const alreadyReported = message.reports.some(
      (r) => r.reporter.toString() === userId
    );
    if (alreadyReported) {
      return res.status(400).json({ success: false, message: "You have already reported this message" });
    }

    const reporterModel = accountType === "organization" ? "OrganizationAccount" : "User";

    message.reports.push({
      reporter: userId,
      reporterModel,
      reason,
      details: details?.trim().slice(0, 500) || "",
    });
    message.reportCount = message.reports.length;

    // Auto-flag after 3 reports
    if (message.reportCount >= 3) {
      message.isFlagged = true;
    }

    await message.save();

    res.status(200).json({
      success: true,
      message: "Message reported successfully",
      data: { reportCount: message.reportCount, isFlagged: message.isFlagged },
    });
  } catch (error) {
    console.error("Report message error:", error);
    res.status(500).json({ success: false, message: "Failed to report message" });
  }
};

// Helper: resolve sender display info from DB
async function resolveSenderInfo(userId, accountType) {
  if (accountType === "organization") {
    const org = await OrganizationAccount.findById(userId).select(
      "organizationName tag logo"
    );
    if (!org) return null;
    return {
      senderModel: "OrganizationAccount",
      senderType: "organization",
      senderName: org.organizationName,
      senderTag: org.tag || null,
      senderAvatar: org.logo || null,
    };
  } else {
    const user = await User.findById(userId).select("username");
    if (!user) return null;
    const profile = await PlayerProfile.findOne({ user: userId }).select("avatar");
    return {
      senderModel: "User",
      senderType: "player",
      senderName: user.username,
      senderTag: null,
      senderAvatar: profile?.avatar || null,
    };
  }
}
