const StaffProfile = require("../models/StaffProfile");
const User = require("../models/User");
const OrganizationAccount = require("../models/OrganizationAccount");

// Get staff profile by user ID
exports.getStaffProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const profile = await StaffProfile.findOne({ user: userId })
      .populate("user", "username email")
      .populate("currentOrganization", "organizationName tag logo")
      .populate("organizations", "organizationName tag logo");

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { profile },
    });
  } catch (error) {
    console.error("Get staff profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching staff profile",
    });
  }
};

// Get staff profile by username (public)
exports.getStaffProfileByUsername = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const profile = await StaffProfile.findOne({ user: user._id })
      .populate("user", "username email")
      .populate("currentOrganization", "organizationName tag logo")
      .populate("organizations", "organizationName tag logo");

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found",
      });
    }

    // Check privacy settings
    if (!profile.isProfilePublic) {
      return res.status(403).json({
        success: false,
        message: "This profile is private",
      });
    }

    // Filter contact info based on privacy settings
    if (!profile.showContactInfo) {
      profile.contactEmail = undefined;
      profile.contactPhone = undefined;
    }

    res.status(200).json({
      success: true,
      data: { profile },
    });
  } catch (error) {
    console.error("Get staff profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching staff profile",
    });
  }
};

// Create or update staff profile
exports.updateStaffProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const updateData = req.body;

    // Remove sensitive fields that shouldn't be updated directly
    delete updateData.user;
    delete updateData.organizations;

    let profile = await StaffProfile.findOne({ user: userId });

    if (!profile) {
      // Create new profile
      profile = new StaffProfile({
        user: userId,
        ...updateData,
      });
    } else {
      // Update existing profile
      Object.keys(updateData).forEach((key) => {
        profile[key] = updateData[key];
      });
    }

    await profile.save();

    // Populate references before sending response
    await profile.populate("user", "username email");
    await profile.populate("currentOrganization", "organizationName tag logo");
    await profile.populate("organizations", "organizationName tag logo");

    res.status(200).json({
      success: true,
      message: "Staff profile updated successfully",
      data: { profile },
    });
  } catch (error) {
    console.error("Update staff profile error:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0],
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while updating staff profile",
    });
  }
};

// Add work history entry
exports.addWorkHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const { organizationName, role, department, startDate, endDate, description, isCurrent } = req.body;

    if (!organizationName || !role || !startDate) {
      return res.status(400).json({
        success: false,
        message: "Organization name, role, and start date are required",
      });
    }

    const profile = await StaffProfile.findOne({ user: userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found. Please create your profile first.",
      });
    }

    // If this is current position, set other positions to not current
    if (isCurrent) {
      profile.workHistory.forEach((work) => {
        work.isCurrent = false;
      });
    }

    profile.workHistory.push({
      organizationName,
      role,
      department,
      startDate,
      endDate,
      description,
      isCurrent,
    });

    await profile.save();

    res.status(200).json({
      success: true,
      message: "Work history added successfully",
      data: { profile },
    });
  } catch (error) {
    console.error("Add work history error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while adding work history",
    });
  }
};

// Remove work history entry
exports.removeWorkHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const { workHistoryId } = req.params;

    const profile = await StaffProfile.findOne({ user: userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found",
      });
    }

    profile.workHistory = profile.workHistory.filter(
      (work) => work._id.toString() !== workHistoryId
    );

    await profile.save();

    res.status(200).json({
      success: true,
      message: "Work history removed successfully",
      data: { profile },
    });
  } catch (error) {
    console.error("Remove work history error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while removing work history",
    });
  }
};

// Add achievement
exports.addAchievement = async (req, res) => {
  try {
    const userId = req.userId;
    const { title, description, organization, date } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Achievement title is required",
      });
    }

    const profile = await StaffProfile.findOne({ user: userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found",
      });
    }

    profile.achievements.push({
      title,
      description,
      organization,
      date,
    });

    await profile.save();

    res.status(200).json({
      success: true,
      message: "Achievement added successfully",
      data: { profile },
    });
  } catch (error) {
    console.error("Add achievement error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while adding achievement",
    });
  }
};

// Remove achievement
exports.removeAchievement = async (req, res) => {
  try {
    const userId = req.userId;
    const { achievementId } = req.params;

    const profile = await StaffProfile.findOne({ user: userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found",
      });
    }

    profile.achievements = profile.achievements.filter(
      (achievement) => achievement._id.toString() !== achievementId
    );

    await profile.save();

    res.status(200).json({
      success: true,
      message: "Achievement removed successfully",
      data: { profile },
    });
  } catch (error) {
    console.error("Remove achievement error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while removing achievement",
    });
  }
};

// Add certification
exports.addCertification = async (req, res) => {
  try {
    const userId = req.userId;
    const { name, issuer, date, expiryDate, credentialId } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Certification name is required",
      });
    }

    const profile = await StaffProfile.findOne({ user: userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found",
      });
    }

    profile.certifications.push({
      name,
      issuer,
      date,
      expiryDate,
      credentialId,
    });

    await profile.save();

    res.status(200).json({
      success: true,
      message: "Certification added successfully",
      data: { profile },
    });
  } catch (error) {
    console.error("Add certification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while adding certification",
    });
  }
};

// Remove certification
exports.removeCertification = async (req, res) => {
  try {
    const userId = req.userId;
    const { certificationId } = req.params;

    const profile = await StaffProfile.findOne({ user: userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found",
      });
    }

    profile.certifications = profile.certifications.filter(
      (cert) => cert._id.toString() !== certificationId
    );

    await profile.save();

    res.status(200).json({
      success: true,
      message: "Certification removed successfully",
      data: { profile },
    });
  } catch (error) {
    console.error("Remove certification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while removing certification",
    });
  }
};

// Update availability status
exports.updateAvailability = async (req, res) => {
  try {
    const userId = req.userId;
    const { availableForHire, preferredRoles } = req.body;

    const profile = await StaffProfile.findOne({ user: userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found",
      });
    }

    if (availableForHire !== undefined) {
      profile.availableForHire = availableForHire;
    }

    if (preferredRoles !== undefined) {
      profile.preferredRoles = preferredRoles;
    }

    await profile.save();

    res.status(200).json({
      success: true,
      message: "Availability updated successfully",
      data: { profile },
    });
  } catch (error) {
    console.error("Update availability error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating availability",
    });
  }
};

// Get all available staff (for organizations looking to hire)
exports.getAvailableStaff = async (req, res) => {
  try {
    const { game, specialization, role, yearsOfExperience } = req.query;

    const query = {
      availableForHire: true,
      isProfilePublic: true,
    };

    // Filter by game if provided
    if (game) {
      query["games.game"] = game;
    }

    // Filter by specialization if provided
    if (specialization) {
      query.specializations = specialization;
    }

    // Filter by preferred role if provided
    if (role) {
      query.preferredRoles = role;
    }

    // Filter by years of experience if provided
    if (yearsOfExperience) {
      query.yearsOfExperience = { $gte: parseInt(yearsOfExperience) };
    }

    const staffList = await StaffProfile.find(query)
      .populate("user", "username")
      .populate("currentOrganization", "organizationName tag logo")
      .select("-contactEmail -contactPhone")
      .limit(50);

    res.status(200).json({
      success: true,
      data: { staff: staffList, count: staffList.length },
    });
  } catch (error) {
    console.error("Get available staff error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching available staff",
    });
  }
};
