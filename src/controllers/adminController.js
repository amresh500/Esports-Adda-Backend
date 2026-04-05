const User = require("../models/User");
const OrganizationAccount = require("../models/OrganizationAccount");
const Team = require("../models/Team");
const Tournament = require("../models/Tournament");
const Stream = require("../models/Stream");
const Message = require("../models/Message");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");
const { emitNotification } = require("../socket/socketHandler");

// Helper: create + emit a notification (fire-and-forget)
async function sendNotification({ recipientId, recipientModel, type, title, message, link = null, refId = null, refModel = null }) {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      recipientModel,
      type,
      title,
      message,
      link,
      refId,
      refModel,
    });
    emitNotification(recipientId, notification);
  } catch (err) {
    console.error("sendNotification error (non-fatal):", err.message);
  }
}

// ── Dashboard Stats ─────────────────────────────────────────────────────────

exports.getAdminStats = async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalOrgs,
      totalTournaments,
      totalTeams,
      activeUsers7d,
      messagesToday,
      flaggedMessages,
      pendingStreams,
    ] = await Promise.all([
      User.countDocuments(),
      OrganizationAccount.countDocuments({ isActive: true }),
      Tournament.countDocuments(),
      Team.countDocuments({ isActive: true }),
      User.countDocuments({ lastLogin: { $gte: sevenDaysAgo } }),
      Message.countDocuments({ createdAt: { $gte: todayStart }, isDeleted: false }),
      Message.countDocuments({ isFlagged: true, isDeleted: false, "moderationAction.action": { $exists: false } }),
      Stream.countDocuments({ isApproved: false }),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalOrgs,
        totalTournaments,
        totalTeams,
        activeUsers7d,
        messagesToday,
        flaggedMessages,
        pendingStreams,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch stats" });
  }
};

// ── Message Moderation ──────────────────────────────────────────────────────

exports.getFlaggedMessages = async (req, res) => {
  try {
    const { game, minReports = 1, page = 1, limit = 20 } = req.query;

    const filter = {
      isFlagged: true,
      isDeleted: false,
      "moderationAction.action": { $exists: false },
      reportCount: { $gte: Number(minReports) },
    };
    if (game) filter.game = game;

    const [messages, total] = await Promise.all([
      Message.find(filter)
        .sort({ reportCount: -1, createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      Message.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { messages, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    console.error("Get flagged messages error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch flagged messages" });
  }
};

exports.dismissReports = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ success: false, message: "Message not found" });

    message.isFlagged = false;
    message.moderationAction = {
      action: "dismissed",
      actionBy: req.userId,
      actionAt: new Date(),
      note: req.body.note || "",
    };
    await message.save();

    await AuditLog.create({
      admin: req.userId,
      action: "message_dismissed",
      targetType: "Message",
      targetId: message._id,
      details: `Dismissed ${message.reportCount} reports on message in ${message.game}`,
    });

    res.json({ success: true, message: "Reports dismissed" });
  } catch (error) {
    console.error("Dismiss reports error:", error);
    res.status(500).json({ success: false, message: "Failed to dismiss reports" });
  }
};

exports.deleteMessageAdmin = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ success: false, message: "Message not found" });

    message.isDeleted = true;
    message.moderationAction = {
      action: "deleted",
      actionBy: req.userId,
      actionAt: new Date(),
      note: req.body.note || "",
    };
    await message.save();

    await AuditLog.create({
      admin: req.userId,
      action: "message_deleted",
      targetType: "Message",
      targetId: message._id,
      details: `Deleted flagged message by ${message.senderName} in ${message.game}`,
    });

    res.json({ success: true, message: "Message deleted" });
  } catch (error) {
    console.error("Admin delete message error:", error);
    res.status(500).json({ success: false, message: "Failed to delete message" });
  }
};

exports.warnMessageSender = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ success: false, message: "Message not found" });

    // Only warn User senders (not OrganizationAccount)
    if (message.senderModel === "User") {
      const sender = await User.findById(message.sender);
      if (sender) {
        sender.warnings.push({
          reason: req.body.reason || `Warned for flagged message in ${message.game} chat`,
          issuedBy: req.userId,
        });
        await sender.save();
      }
    }

    message.isFlagged = false;
    message.moderationAction = {
      action: "warned",
      actionBy: req.userId,
      actionAt: new Date(),
      note: req.body.note || "",
    };
    await message.save();

    await AuditLog.create({
      admin: req.userId,
      action: "message_sender_warned",
      targetType: "Message",
      targetId: message._id,
      details: `Warned sender ${message.senderName} for message in ${message.game}`,
    });

    res.json({ success: true, message: "Sender warned and reports resolved" });
  } catch (error) {
    console.error("Warn message sender error:", error);
    res.status(500).json({ success: false, message: "Failed to warn sender" });
  }
};

// ── User Management ─────────────────────────────────────────────────────────

exports.listUsers = async (req, res) => {
  try {
    const { search, isBanned, isSuspended, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (isBanned === "true") filter.isBanned = true;
    if (isSuspended === "true") filter.isSuspended = true;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password -verificationToken -verificationTokenExpiration")
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { users, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

exports.getUserDetails = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password -verificationToken -verificationTokenExpiration")
      .lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const [messageCount, teams] = await Promise.all([
      Message.countDocuments({ sender: user._id, senderModel: "User" }),
      Team.find({ $or: [{ owner: user._id }, { "games.roster.player": user._id }] })
        .select("name tag game")
        .lean(),
    ]);

    res.json({ success: true, data: { user, messageCount, teams } });
  } catch (error) {
    console.error("Get user details error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch user details" });
  }
};

exports.warnUser = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: "Reason is required" });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.warnings.push({ reason, issuedBy: req.userId });
    await user.save();

    await AuditLog.create({
      admin: req.userId,
      action: "user_warned",
      targetType: "User",
      targetId: user._id,
      details: `Warning: ${reason}`,
    });

    await sendNotification({
      recipientId: user._id,
      recipientModel: "User",
      type: "user_warned",
      title: "Account Warning",
      message: `You have received a warning. Reason: ${reason}`,
      refId: user._id,
      refModel: "User",
    });

    res.json({ success: true, message: "User warned" });
  } catch (error) {
    console.error("Warn user error:", error);
    res.status(500).json({ success: false, message: "Failed to warn user" });
  }
};

exports.suspendUser = async (req, res) => {
  try {
    const { until, reason } = req.body;
    if (!until) return res.status(400).json({ success: false, message: "Suspension end date is required" });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.isAdmin) return res.status(400).json({ success: false, message: "Cannot suspend an admin" });

    user.isSuspended = true;
    user.suspendedUntil = new Date(until);
    await user.save();

    await AuditLog.create({
      admin: req.userId,
      action: "user_suspended",
      targetType: "User",
      targetId: user._id,
      details: `Suspended until ${until}. Reason: ${reason || "Not specified"}`,
    });

    await sendNotification({
      recipientId: user._id,
      recipientModel: "User",
      type: "user_suspended",
      title: "Account Suspended",
      message: `Your account has been suspended until ${new Date(until).toLocaleDateString()}. Reason: ${reason || "Not specified"}`,
      refId: user._id,
      refModel: "User",
    });

    res.json({ success: true, message: "User suspended" });
  } catch (error) {
    console.error("Suspend user error:", error);
    res.status(500).json({ success: false, message: "Failed to suspend user" });
  }
};

exports.banUser = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: "Ban reason is required" });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.isAdmin) return res.status(400).json({ success: false, message: "Cannot ban an admin" });

    user.isBanned = true;
    user.banReason = reason;
    await user.save();

    await AuditLog.create({
      admin: req.userId,
      action: "user_banned",
      targetType: "User",
      targetId: user._id,
      details: `Banned: ${reason}`,
    });

    await sendNotification({
      recipientId: user._id,
      recipientModel: "User",
      type: "user_banned",
      title: "Account Banned",
      message: `Your account has been permanently banned. Reason: ${reason}`,
      refId: user._id,
      refModel: "User",
    });

    res.json({ success: true, message: "User banned" });
  } catch (error) {
    console.error("Ban user error:", error);
    res.status(500).json({ success: false, message: "Failed to ban user" });
  }
};

exports.unbanUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.isBanned = false;
    user.banReason = null;
    await user.save();

    await AuditLog.create({
      admin: req.userId,
      action: "user_unbanned",
      targetType: "User",
      targetId: user._id,
      details: "User unbanned",
    });

    res.json({ success: true, message: "User unbanned" });
  } catch (error) {
    console.error("Unban user error:", error);
    res.status(500).json({ success: false, message: "Failed to unban user" });
  }
};

exports.unsuspendUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.isSuspended = false;
    user.suspendedUntil = null;
    await user.save();

    await AuditLog.create({
      admin: req.userId,
      action: "user_unsuspended",
      targetType: "User",
      targetId: user._id,
      details: "User unsuspended",
    });

    res.json({ success: true, message: "User unsuspended" });
  } catch (error) {
    console.error("Unsuspend user error:", error);
    res.status(500).json({ success: false, message: "Failed to unsuspend user" });
  }
};

// ── Stream Approval ─────────────────────────────────────────────────────────

exports.getPendingStreams = async (req, res) => {
  try {
    const streams = await Stream.find({ isApproved: false })
      .populate("tournament", "name game status")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: { streams } });
  } catch (error) {
    console.error("Get pending streams error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch pending streams" });
  }
};

exports.approveStream = async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id);
    if (!stream) return res.status(404).json({ success: false, message: "Stream not found" });

    stream.isApproved = true;
    stream.approvedBy = req.userId;
    stream.approvedAt = new Date();
    await stream.save();

    await AuditLog.create({
      admin: req.userId,
      action: "stream_approved",
      targetType: "Stream",
      targetId: stream._id,
      details: `Approved stream: ${stream.title}`,
    });

    if (stream.organizer) {
      await sendNotification({
        recipientId: stream.organizer,
        recipientModel: stream.organizerModel || "OrganizationAccount",
        type: "stream_approved",
        title: "Stream Approved",
        message: `Your stream "${stream.title}" has been approved and is now live on Watch Now.`,
        link: "/watch-now",
        refId: stream._id,
        refModel: "Stream",
      });
    }

    res.json({ success: true, message: "Stream approved" });
  } catch (error) {
    console.error("Approve stream error:", error);
    res.status(500).json({ success: false, message: "Failed to approve stream" });
  }
};

exports.rejectStream = async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id);
    if (!stream) return res.status(404).json({ success: false, message: "Stream not found" });

    // Capture organizer info before deletion
    const organizerId = stream.organizer;
    const organizerModel = stream.organizerModel || "OrganizationAccount";
    const streamTitle = stream.title;
    const streamId = stream._id;

    await Stream.findByIdAndDelete(req.params.id);

    await AuditLog.create({
      admin: req.userId,
      action: "stream_rejected",
      targetType: "Stream",
      targetId: streamId,
      details: `Rejected stream: ${streamTitle}`,
    });

    if (organizerId) {
      await sendNotification({
        recipientId: organizerId,
        recipientModel: organizerModel,
        type: "stream_rejected",
        title: "Stream Rejected",
        message: `Your stream "${streamTitle}" was rejected by the admin and has been removed.`,
        refId: streamId,
        refModel: "Stream",
      });
    }

    res.json({ success: true, message: "Stream rejected" });
  } catch (error) {
    console.error("Reject stream error:", error);
    res.status(500).json({ success: false, message: "Failed to reject stream" });
  }
};

// ── Tournament Oversight ────────────────────────────────────────────────────

exports.listAllTournaments = async (req, res) => {
  try {
    const { status, game, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (game) filter.game = game;

    const [tournaments, total] = await Promise.all([
      Tournament.find(filter)
        .select("name game organizerName status totalSlots participants tournamentStartDate prizePool isPublished")
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      Tournament.countDocuments(filter),
    ]);

    // Add participant count
    const data = tournaments.map((t) => ({
      ...t,
      participantCount: t.participants ? t.participants.length : 0,
    }));

    res.json({
      success: true,
      data: { tournaments: data, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    console.error("List tournaments error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch tournaments" });
  }
};

exports.cancelTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, message: "Tournament not found" });

    tournament.status = "cancelled";
    await tournament.save();

    await AuditLog.create({
      admin: req.userId,
      action: "tournament_cancelled",
      targetType: "Tournament",
      targetId: tournament._id,
      details: `Cancelled tournament: ${tournament.name}`,
    });

    res.json({ success: true, message: "Tournament cancelled" });
  } catch (error) {
    console.error("Cancel tournament error:", error);
    res.status(500).json({ success: false, message: "Failed to cancel tournament" });
  }
};

exports.forceCompleteTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, message: "Tournament not found" });

    tournament.status = "completed";
    await tournament.save();

    await AuditLog.create({
      admin: req.userId,
      action: "tournament_force_completed",
      targetType: "Tournament",
      targetId: tournament._id,
      details: `Force-completed tournament: ${tournament.name}`,
    });

    res.json({ success: true, message: "Tournament marked as completed" });
  } catch (error) {
    console.error("Force complete tournament error:", error);
    res.status(500).json({ success: false, message: "Failed to complete tournament" });
  }
};

// ── Organization Overview ───────────────────────────────────────────────────

exports.listOrganizations = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    const filter = { isActive: true };
    if (search) {
      filter.$or = [
        { organizationName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const [orgs, total] = await Promise.all([
      OrganizationAccount.find(filter)
        .select("-password -verificationToken -verificationTokenExpiration")
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      OrganizationAccount.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { organizations: orgs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    console.error("List organizations error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch organizations" });
  }
};

exports.getOrganizationDetails = async (req, res) => {
  try {
    const org = await OrganizationAccount.findById(req.params.id)
      .select("-password -verificationToken -verificationTokenExpiration")
      .populate("teams", "name tag game")
      .lean();
    if (!org) return res.status(404).json({ success: false, message: "Organization not found" });

    const tournamentCount = await Tournament.countDocuments({ organizer: org._id });

    res.json({ success: true, data: { organization: org, tournamentCount } });
  } catch (error) {
    console.error("Get org details error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch organization details" });
  }
};

// ── Audit Logs ──────────────────────────────────────────────────────────────

exports.getAuditLogs = async (req, res) => {
  try {
    const { action, targetType, page = 1, limit = 30 } = req.query;

    const filter = {};
    if (action) filter.action = action;
    if (targetType) filter.targetType = targetType;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate("admin", "username")
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { logs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    console.error("Get audit logs error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch audit logs" });
  }
};
