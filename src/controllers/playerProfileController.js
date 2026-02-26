const PlayerProfile = require("../models/PlayerProfile");
const User = require("../models/User");

// Get or create player profile
exports.getMyProfile = async (req, res) => {
  try {
    let profile = await PlayerProfile.findOne({ user: req.userId })
      .populate("user", "username email")
      .populate("currentTeam", "name tag")
      .populate("teams", "name tag")
      .populate("organizations.organization", "name tag");

    // Create profile if doesn't exist
    if (!profile) {
      profile = new PlayerProfile({
        user: req.userId,
      });
      await profile.save();
      profile = await PlayerProfile.findById(profile._id)
        .populate("user", "username email")
        .populate("currentTeam", "name tag")
        .populate("teams", "name tag")
        .populate("organizations.organization", "name tag");
    }

    res.status(200).json({
      success: true,
      data: { profile },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
};

// Update player profile
exports.updateProfile = async (req, res) => {
  try {
    const {
      realName,
      bio,
      country,
      city,
      isNepal,
      avatar,
      dateOfBirth,
      socialLinks,
    } = req.body;

    let profile = await PlayerProfile.findOne({ user: req.userId });

    if (!profile) {
      profile = new PlayerProfile({ user: req.userId });
    }

    // Update fields
    if (realName !== undefined) profile.realName = realName;
    if (bio !== undefined) profile.bio = bio;
    if (country !== undefined) profile.country = country;
    if (city !== undefined) profile.city = city;
    if (isNepal !== undefined) profile.isNepal = isNepal;
    if (avatar !== undefined) profile.avatar = avatar;
    if (dateOfBirth !== undefined) profile.dateOfBirth = dateOfBirth;
    if (socialLinks !== undefined) profile.socialLinks = socialLinks;

    await profile.save();

    profile = await PlayerProfile.findById(profile._id).populate(
      "user",
      "username email"
    );

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: { profile },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update profile",
    });
  }
};

// Add or update game
exports.addGame = async (req, res) => {
  try {
    const { game, rank, role, inGameName, isPrimary } = req.body;

    if (!game || !rank) {
      return res.status(400).json({
        success: false,
        message: "Game and rank are required",
      });
    }

    let profile = await PlayerProfile.findOne({ user: req.userId });

    if (!profile) {
      profile = new PlayerProfile({ user: req.userId });
    }

    // Check if game already exists
    const existingGameIndex = profile.games.findIndex(
      (g) => g.game === game
    );

    if (existingGameIndex > -1) {
      // Update existing game
      profile.games[existingGameIndex] = {
        game,
        rank,
        role: role || profile.games[existingGameIndex].role,
        inGameName:
          inGameName || profile.games[existingGameIndex].inGameName,
        isPrimary: isPrimary !== undefined ? isPrimary : profile.games[existingGameIndex].isPrimary,
      };
    } else {
      // Add new game
      profile.games.push({
        game,
        rank,
        role,
        inGameName,
        isPrimary: isPrimary || false,
      });
    }

    // If isPrimary is true, set all other games to false
    if (isPrimary) {
      profile.games.forEach((g) => {
        if (g.game !== game) g.isPrimary = false;
      });
    }

    await profile.save();

    res.status(200).json({
      success: true,
      message: "Game added/updated successfully",
      data: { profile },
    });
  } catch (error) {
    console.error("Add game error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add game",
    });
  }
};

// Remove game
exports.removeGame = async (req, res) => {
  try {
    const { game } = req.params;

    const profile = await PlayerProfile.findOne({ user: req.userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    profile.games = profile.games.filter((g) => g.game !== game);
    await profile.save();

    res.status(200).json({
      success: true,
      message: "Game removed successfully",
      data: { profile },
    });
  } catch (error) {
    console.error("Remove game error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove game",
    });
  }
};

// Add achievement
exports.addAchievement = async (req, res) => {
  try {
    const { title, description, date } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Title is required",
      });
    }

    let profile = await PlayerProfile.findOne({ user: req.userId });

    if (!profile) {
      profile = new PlayerProfile({ user: req.userId });
    }

    profile.achievements.push({ title, description, date });
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
      message: "Failed to add achievement",
    });
  }
};

// Get public profile by user ID
exports.getProfileByUserId = async (req, res) => {
  try {
    const profile = await PlayerProfile.findOne({
      user: req.params.userId,
    }).populate("user", "username email");

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { profile },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
};
