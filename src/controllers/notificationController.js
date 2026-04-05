const Notification = require("../models/Notification");

// Map accountType from JWT to recipientModel used in Notification schema
const toRecipientModel = (accountType) =>
  accountType === "organization" ? "OrganizationAccount" : "User";

// GET /api/notifications — paginated list for the logged-in user
exports.getMyNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const recipientModel = toRecipientModel(req.accountType);

    const [notifications, total] = await Promise.all([
      Notification.find({ recipient: req.userId, recipientModel })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Notification.countDocuments({ recipient: req.userId, recipientModel }),
    ]);

    res.json({
      success: true,
      data: {
        notifications,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
};

// GET /api/notifications/unread-count
exports.getUnreadCount = async (req, res) => {
  try {
    const recipientModel = toRecipientModel(req.accountType);
    const count = await Notification.countDocuments({
      recipient: req.userId,
      recipientModel,
      isRead: false,
    });
    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch unread count" });
  }
};

// PATCH /api/notifications/:id/read — mark a single notification as read
exports.markAsRead = async (req, res) => {
  try {
    const recipientModel = toRecipientModel(req.accountType);
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.userId, recipientModel },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    res.json({ success: true, data: { notification } });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({ success: false, message: "Failed to mark notification as read" });
  }
};

// PATCH /api/notifications/read-all — mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const recipientModel = toRecipientModel(req.accountType);
    await Notification.updateMany(
      { recipient: req.userId, recipientModel, isRead: false },
      { isRead: true }
    );
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    console.error("Mark all as read error:", error);
    res.status(500).json({ success: false, message: "Failed to mark all as read" });
  }
};

// DELETE /api/notifications/:id
exports.deleteNotification = async (req, res) => {
  try {
    const recipientModel = toRecipientModel(req.accountType);
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.userId,
      recipientModel,
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    res.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({ success: false, message: "Failed to delete notification" });
  }
};
