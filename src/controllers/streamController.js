const Stream = require("../models/Stream");
const User = require("../models/User");
const OrganizationAccount = require("../models/OrganizationAccount");
const Tournament = require("../models/Tournament");

// Create a new stream (Organizers only)
exports.createStream = async (req, res) => {
  try {
    const {
      title,
      description,
      youtubeUrl,
      game,
      tournament,
      startTime,
      endTime,
      isNepal,
    } = req.body;

    // Validate required fields
    if (!title || !youtubeUrl || !game || !tournament || !startTime) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // Get organizer details — support both User and OrganizationAccount
    let organizer = null;
    let organizerModel = "User";
    let organizerName = "";

    if (req.accountType === "organization") {
      organizer = await OrganizationAccount.findById(req.userId);
      organizerModel = "OrganizationAccount";
      organizerName = organizer?.organizationName || "";
    } else {
      organizer = await User.findById(req.userId);
      organizerModel = "User";
      organizerName = organizer?.username || "";
    }

    if (!organizer) {
      return res.status(404).json({
        success: false,
        message: "Organizer not found",
      });
    }

    // Validate tournament exists
    const tournamentDoc = await Tournament.findById(tournament);
    if (!tournamentDoc) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Create stream
    const stream = new Stream({
      title,
      description,
      youtubeUrl,
      game,
      tournament: tournamentDoc._id,
      tournamentName: tournamentDoc.name,
      organizer: req.userId,
      organizerModel,
      organizerName,
      startTime,
      endTime,
      isNepal: isNepal !== undefined ? isNepal : true,
    });

    // Update status based on time
    stream.updateStatus();

    await stream.save();

    res.status(201).json({
      success: true,
      message: "Stream created successfully. Pending approval.",
      data: { stream },
    });
  } catch (error) {
    console.error("Create stream error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create stream",
    });
  }
};

// Get all streams (public)
exports.getAllStreams = async (req, res) => {
  try {
    const { game, status, search, isApproved } = req.query;

    // Build filter
    let filter = {};

    // Only show approved streams for public
    if (isApproved !== "false") {
      filter.isApproved = true;
    }

    if (game && game !== "all") {
      filter.game = game;
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { tournamentName: { $regex: search, $options: "i" } },
        { organizerName: { $regex: search, $options: "i" } },
      ];
    }

    const streams = await Stream.find(filter)
      .populate("tournament", "name game status")
      .populate("organizer", "username email organizationName")
      .sort({ startTime: -1 })
      .limit(50);

    // Update status for each stream
    streams.forEach((stream) => stream.updateStatus());

    res.status(200).json({
      success: true,
      data: { streams, count: streams.length },
    });
  } catch (error) {
    console.error("Get streams error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch streams",
    });
  }
};

// Get stream by ID
exports.getStreamById = async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id)
      .populate("tournament", "name game status")
      .populate("organizer", "username email organizationName");

    if (!stream) {
      return res.status(404).json({
        success: false,
        message: "Stream not found",
      });
    }

    // Update status
    stream.updateStatus();

    res.status(200).json({
      success: true,
      data: { stream },
    });
  } catch (error) {
    console.error("Get stream error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stream",
    });
  }
};

// Get organizer's own streams
exports.getMyStreams = async (req, res) => {
  try {
    const streams = await Stream.find({ organizer: req.userId }).sort({
      startTime: -1,
    });

    // Update status for each stream
    streams.forEach((stream) => stream.updateStatus());

    res.status(200).json({
      success: true,
      data: { streams, count: streams.length },
    });
  } catch (error) {
    console.error("Get my streams error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your streams",
    });
  }
};

// Update stream (Organizers only - their own streams)
exports.updateStream = async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id);

    if (!stream) {
      return res.status(404).json({
        success: false,
        message: "Stream not found",
      });
    }

    // Check if user is the organizer
    if (stream.organizer.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own streams",
      });
    }

    const {
      title,
      description,
      youtubeUrl,
      game,
      tournament,
      startTime,
      endTime,
      status,
      isNepal,
    } = req.body;

    // If tournament changed, validate and update name
    if (tournament && tournament !== stream.tournament?.toString()) {
      const tournamentDoc = await Tournament.findById(tournament);
      if (!tournamentDoc) {
        return res.status(404).json({ success: false, message: "Tournament not found" });
      }
      stream.tournament = tournamentDoc._id;
      stream.tournamentName = tournamentDoc.name;
    }

    // Update fields
    if (title) stream.title = title;
    if (description) stream.description = description;
    if (youtubeUrl) stream.youtubeUrl = youtubeUrl;
    if (game) stream.game = game;
    if (startTime) stream.startTime = startTime;
    if (endTime) stream.endTime = endTime;
    if (status) stream.status = status;
    if (isNepal !== undefined) stream.isNepal = isNepal;

    // If updating, set approval back to false (needs re-approval)
    stream.isApproved = false;
    stream.approvedBy = null;
    stream.approvedAt = null;

    await stream.save();

    res.status(200).json({
      success: true,
      message: "Stream updated successfully. Pending re-approval.",
      data: { stream },
    });
  } catch (error) {
    console.error("Update stream error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update stream",
    });
  }
};

// Delete stream (Organizers only - their own streams)
exports.deleteStream = async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id);

    if (!stream) {
      return res.status(404).json({
        success: false,
        message: "Stream not found",
      });
    }

    // Check if user is the organizer
    if (stream.organizer.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own streams",
      });
    }

    await Stream.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Stream deleted successfully",
    });
  } catch (error) {
    console.error("Delete stream error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete stream",
    });
  }
};

// Approve stream (Admin only - will implement when admin role is added)
exports.approveStream = async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id);

    if (!stream) {
      return res.status(404).json({
        success: false,
        message: "Stream not found",
      });
    }

    stream.isApproved = true;
    stream.approvedBy = req.userId;
    stream.approvedAt = new Date();

    await stream.save();

    res.status(200).json({
      success: true,
      message: "Stream approved successfully",
      data: { stream },
    });
  } catch (error) {
    console.error("Approve stream error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to approve stream",
    });
  }
};

// Update viewer count (can be called periodically)
exports.updateViewerCount = async (req, res) => {
  try {
    const { viewers } = req.body;

    if (viewers === undefined) {
      return res.status(400).json({
        success: false,
        message: "Viewer count is required",
      });
    }

    const stream = await Stream.findById(req.params.id);

    if (!stream) {
      return res.status(404).json({
        success: false,
        message: "Stream not found",
      });
    }

    stream.viewers = viewers;
    await stream.save();

    res.status(200).json({
      success: true,
      data: { viewers: stream.viewers },
    });
  } catch (error) {
    console.error("Update viewer count error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update viewer count",
    });
  }
};
