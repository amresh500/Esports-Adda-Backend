const jwt = require("jsonwebtoken");
const cookie = require("cookie");
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

// Track online users per game room: { "Valorant": Set<socketId> }
const roomOnlineUsers = {};
VALID_GAMES.forEach((g) => (roomOnlineUsers[g] = new Set()));

// Track authenticated sockets per user: { userId: Set<socketId> }
// Used to deliver real-time notifications to a specific user across all their open tabs.
const userSockets = {};

// Track typing users per game room: { "Valorant": Map<socketId, { name, timeout }> }
const typingUsers = {};
VALID_GAMES.forEach((g) => (typingUsers[g] = new Map()));

function initSocket(io) {
  // Store io globally so controllers can call emitNotification without circular deps
  global.io = io;

  // ─── Socket.io Auth Middleware ───────────────────────────────────────────
  // Runs before every new socket connection.
  // The JWT lives in an httpOnly cookie, which JS on the client can't read —
  // so we parse it from the handshake's Cookie header. We also accept
  // handshake.auth.token as a fallback (e.g. non-browser clients).
  // If no valid token: reject the connection (chat requires login).
  io.use(async (socket, next) => {
    let token = socket.handshake.auth?.token;

    if (!token && socket.handshake.headers?.cookie) {
      const parsed = cookie.parse(socket.handshake.headers.cookie);
      token = parsed.token;
    }

    if (!token) {
      // Reading chat now requires authentication — reject guest connections
      return next(new Error("Authentication required"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.accountType = decoded.accountType || "user";

      // Fetch display name once on connect for use in all events
      if (socket.accountType === "organization") {
        const org = await OrganizationAccount.findById(decoded.id).select(
          "organizationName tag logo"
        );
        socket.displayName = org?.organizationName || "Organization";
        socket.senderTag = org?.tag || null;
        socket.senderAvatar = org?.logo || null;
        socket.senderModel = "OrganizationAccount";
        socket.senderType = "organization";
      } else {
        const user = await User.findById(decoded.id).select("username");
        const profile = await PlayerProfile.findOne({ user: decoded.id }).select("avatar");
        socket.displayName = user?.username || "Player";
        socket.senderTag = null;
        socket.senderAvatar = profile?.avatar || null;
        socket.senderModel = "User";
        socket.senderType = "player";
      }

      next();
    } catch (err) {
      // Expired or invalid token — reject the connection
      return next(new Error("Authentication required"));
    }
  });

  // ─── Connection Handler ──────────────────────────────────────────────────
  io.on("connection", (socket) => {
    let currentGame = null; // The game room this socket is currently in

    // ── join personal notification room ──────────────────────────────────
    // All authenticated sockets join a room keyed to their userId so that
    // emitNotification() can target a specific user regardless of how many
    // tabs they have open.
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
      if (!userSockets[socket.userId]) userSockets[socket.userId] = new Set();
      userSockets[socket.userId].add(socket.id);
    }

    // ── join-game ────────────────────────────────────────────────────────
    // Client emits this when opening a game's community hub.
    // Socket joins the Socket.io room named after the game.
    // Online count for that room is incremented and broadcast to all in room.
    socket.on("join-game", (game) => {
      if (!VALID_GAMES.includes(game)) return;

      // Leave previous room if switching games
      if (currentGame && currentGame !== game) {
        socket.leave(currentGame);
        roomOnlineUsers[currentGame].delete(socket.id);
        updateOnlineCount(io, currentGame);
      }

      currentGame = game;
      socket.join(game);
      roomOnlineUsers[game].add(socket.id);
      updateOnlineCount(io, game);
    });

    // ── leave-game ───────────────────────────────────────────────────────
    // Client emits this when navigating away from a game's hub.
    socket.on("leave-game", (game) => {
      if (!VALID_GAMES.includes(game)) return;
      socket.leave(game);
      roomOnlineUsers[game].delete(socket.id);
      updateOnlineCount(io, game);
      if (currentGame === game) currentGame = null;
    });

    // ── send-message ─────────────────────────────────────────────────────
    // Client emits { game, content } when user hits Send.
    // Server validates auth, saves to MongoDB, then broadcasts to the entire room.
    // This is the core real-time flow:
    //   1. Server receives event
    //   2. Saves Message document to MongoDB
    //   3. Emits "new-message" to ALL sockets in the game room (including sender)
    socket.on("send-message", async (data, callback) => {
      try {
        if (!socket.userId) {
          return callback?.({ error: "You must be logged in to send messages" });
        }

        const { game, content } = data;

        if (!VALID_GAMES.includes(game)) {
          return callback?.({ error: "Invalid game" });
        }

        if (!content || !content.trim()) {
          return callback?.({ error: "Message cannot be empty" });
        }

        if (content.trim().length > 2000) {
          return callback?.({ error: "Message too long" });
        }

        // Content moderation filter
        const filterResult = checkContent(content.trim());
        if (!filterResult.allowed) {
          return callback?.({ error: "Your message contains inappropriate content and was not sent." });
        }

        const message = await Message.create({
          game,
          sender: socket.userId,
          senderModel: socket.senderModel,
          senderType: socket.senderType,
          senderName: socket.displayName,
          senderTag: socket.senderTag,
          senderAvatar: socket.senderAvatar || null,
          content: content.trim(),
          messageType: "message",
          ...(filterResult.flagged && {
            isFlagged: true,
            autoFlagged: true,
            autoFlagReason: filterResult.matchedWord,
          }),
        });

        // Broadcast to everyone in the room including the sender
        io.to(game).emit("new-message", message);

        // Clear typing indicator for this user
        clearTyping(io, game, socket);

        callback?.({ success: true, message });
      } catch (err) {
        console.error("Socket send-message error:", err);
        callback?.({ error: "Failed to send message" });
      }
    });

    // ── send-announcement ────────────────────────────────────────────────
    // Org accounts only. Same flow as send-message but messageType = "announcement".
    // Announcements are visually highlighted for all room members.
    socket.on("send-announcement", async (data, callback) => {
      try {
        if (!socket.userId || socket.accountType !== "organization") {
          return callback?.({ error: "Only organization accounts can post announcements" });
        }

        const { game, content } = data;

        if (!VALID_GAMES.includes(game)) {
          return callback?.({ error: "Invalid game" });
        }

        if (!content || !content.trim()) {
          return callback?.({ error: "Announcement cannot be empty" });
        }

        // Content moderation filter
        const annFilterResult = checkContent(content.trim());
        if (!annFilterResult.allowed) {
          return callback?.({ error: "Your announcement contains inappropriate content and was not sent." });
        }

        const message = await Message.create({
          game,
          sender: socket.userId,
          senderModel: "OrganizationAccount",
          senderType: "organization",
          senderName: socket.displayName,
          senderTag: socket.senderTag,
          senderAvatar: socket.senderAvatar || null,
          content: content.trim(),
          messageType: "announcement",
          ...(annFilterResult.flagged && {
            isFlagged: true,
            autoFlagged: true,
            autoFlagReason: annFilterResult.matchedWord,
          }),
        });

        io.to(game).emit("new-message", message);
        callback?.({ success: true, message });
      } catch (err) {
        console.error("Socket send-announcement error:", err);
        callback?.({ error: "Failed to send announcement" });
      }
    });

    // ── delete-message ───────────────────────────────────────────────────
    // Client emits { game, messageId } to soft-delete a message.
    // Server checks ownership, marks isDeleted=true, broadcasts "message-deleted"
    // so all clients remove/hide it from their UI instantly.
    socket.on("delete-message", async (data, callback) => {
      try {
        if (!socket.userId) {
          return callback?.({ error: "Not authenticated" });
        }

        const { game, messageId } = data;
        const message = await Message.findById(messageId);

        if (!message || message.isDeleted) {
          return callback?.({ error: "Message not found" });
        }

        const isOwner = message.sender.toString() === socket.userId;

        if (!isOwner) {
          return callback?.({ error: "Not authorized" });
        }

        message.isDeleted = true;
        await message.save();

        // Broadcast deletion to all in room — clients hide the message
        io.to(game).emit("message-deleted", { messageId });
        callback?.({ success: true });
      } catch (err) {
        console.error("Socket delete-message error:", err);
        callback?.({ error: "Failed to delete message" });
      }
    });

    // ── pin-message ──────────────────────────────────────────────────────
    // Org accounts only. Toggles isPinned on a message and broadcasts
    // "message-pinned" so all clients update their pinned message display.
    socket.on("pin-message", async (data, callback) => {
      try {
        if (!socket.userId || socket.accountType !== "organization") {
          return callback?.({ error: "Only organization accounts can pin messages" });
        }

        const { game, messageId } = data;
        const message = await Message.findById(messageId);

        if (!message || message.isDeleted) {
          return callback?.({ error: "Message not found" });
        }

        message.isPinned = !message.isPinned;
        await message.save();

        io.to(game).emit("message-pinned", {
          messageId,
          isPinned: message.isPinned,
          message,
        });

        callback?.({ success: true, isPinned: message.isPinned });
      } catch (err) {
        console.error("Socket pin-message error:", err);
        callback?.({ error: "Failed to pin message" });
      }
    });

    // ── report-message ───────────────────────────────────────────────────
    // Client emits { game, messageId, reason, details? } to report a message.
    // Server validates, stores the report, and auto-flags after threshold.
    socket.on("report-message", async (data, callback) => {
      try {
        if (!socket.userId) {
          return callback?.({ error: "You must be logged in to report messages" });
        }

        const { game, messageId, reason, details } = data;

        const VALID_REASONS = [
          "Harassment",
          "Hate Speech",
          "Spam",
          "Inappropriate Content",
          "Misinformation",
          "Other",
        ];

        if (!reason || !VALID_REASONS.includes(reason)) {
          return callback?.({ error: "Valid reason is required" });
        }

        const message = await Message.findById(messageId);
        if (!message || message.isDeleted) {
          return callback?.({ error: "Message not found" });
        }

        if (message.sender.toString() === socket.userId) {
          return callback?.({ error: "You cannot report your own message" });
        }

        const alreadyReported = message.reports.some(
          (r) => r.reporter.toString() === socket.userId
        );
        if (alreadyReported) {
          return callback?.({ error: "You have already reported this message" });
        }

        const reporterModel = socket.accountType === "organization" ? "OrganizationAccount" : "User";

        message.reports.push({
          reporter: socket.userId,
          reporterModel,
          reason,
          details: details?.trim().slice(0, 500) || "",
        });
        message.reportCount = message.reports.length;

        if (message.reportCount >= 3) {
          message.isFlagged = true;
        }

        await message.save();

        // Notify the room that this message was reported (for badge update)
        io.to(game).emit("message-reported", {
          messageId,
          reportCount: message.reportCount,
          isFlagged: message.isFlagged,
        });

        callback?.({ success: true, reportCount: message.reportCount, isFlagged: message.isFlagged });
      } catch (err) {
        console.error("Socket report-message error:", err);
        callback?.({ error: "Failed to report message" });
      }
    });

    // ── typing ───────────────────────────────────────────────────────────
    // Client emits { game } when the user starts typing.
    // Server broadcasts "user-typing" to others in the room (not the sender).
    // A timeout auto-clears the typing indicator after 3 seconds of no activity.
    socket.on("typing", (data) => {
      if (!socket.userId || !data?.game) return;
      const { game } = data;
      if (!VALID_GAMES.includes(game)) return;

      // Broadcast to everyone in room EXCEPT the sender
      socket.to(game).emit("user-typing", {
        userId: socket.userId,
        name: socket.displayName,
      });

      // Auto-clear after 3 seconds
      if (typingUsers[game].has(socket.id)) {
        clearTimeout(typingUsers[game].get(socket.id).timeout);
      }
      const timeout = setTimeout(() => {
        clearTyping(io, game, socket);
      }, 3000);
      typingUsers[game].set(socket.id, { name: socket.displayName, timeout });
    });

    // ── stop-typing ──────────────────────────────────────────────────────
    socket.on("stop-typing", (data) => {
      if (!data?.game) return;
      clearTyping(io, data.game, socket);
    });

    // ── disconnect ───────────────────────────────────────────────────────
    // Auto-triggered when a socket connection closes (user closes tab/navigates away).
    // Cleans up online count and typing state for all rooms this socket was in.
    socket.on("disconnect", () => {
      if (currentGame) {
        roomOnlineUsers[currentGame].delete(socket.id);
        updateOnlineCount(io, currentGame);
        clearTyping(io, currentGame, socket);
      }
      // Clean up personal notification room tracking
      if (socket.userId && userSockets[socket.userId]) {
        userSockets[socket.userId].delete(socket.id);
        if (userSockets[socket.userId].size === 0) {
          delete userSockets[socket.userId];
        }
      }
    });
  });
}

// Broadcast updated online count to all users in a game room
function updateOnlineCount(io, game) {
  const count = roomOnlineUsers[game].size;
  // Also expose via global for the REST endpoint
  if (!global.onlineCounts) global.onlineCounts = {};
  global.onlineCounts[game] = count;
  io.to(game).emit("online-count", { game, count });
}

// Clear typing indicator for a socket in a game room
function clearTyping(io, game, socket) {
  if (!typingUsers[game]) return;
  if (typingUsers[game].has(socket.id)) {
    clearTimeout(typingUsers[game].get(socket.id).timeout);
    typingUsers[game].delete(socket.id);
  }
  socket.to(game).emit("user-stop-typing", { userId: socket.userId });
}

// ── emitNotification ─────────────────────────────────────────────────────────
// Called by controllers after creating a Notification document.
// Delivers the notification in real-time to the recipient's personal room.
// If the user is offline the notification is already persisted in MongoDB and
// will be loaded the next time they open the bell dropdown.
//
// Usage:
//   const { emitNotification } = require("../socket/socketHandler");
//   emitNotification(io, recipientId, savedNotification);
function emitNotification(recipientId, notification) {
  const ioInstance = global.io;
  if (!ioInstance || !recipientId) return;
  ioInstance.to(`user:${recipientId.toString()}`).emit("new-notification", notification);
}

module.exports = { initSocket, emitNotification };
