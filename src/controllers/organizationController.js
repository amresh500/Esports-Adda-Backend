const Organization = require("../models/Organization");
const Team = require("../models/Team");
const User = require("../models/User");

// Create organization
exports.createOrganization = async (req, res) => {
  try {
    const {
      name,
      tag,
      logo,
      description,
      country,
      isNepal,
      foundedDate,
      socialLinks,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Organization name is required",
      });
    }

    // Check if organization name already exists
    const existingOrg = await Organization.findOne({ name });

    if (existingOrg) {
      return res.status(400).json({
        success: false,
        message: "Organization name already exists",
      });
    }

    const organization = new Organization({
      name,
      tag: tag ? tag.toUpperCase() : undefined,
      logo,
      description,
      owner: req.userId,
      country,
      isNepal: isNepal || false,
      foundedDate,
      socialLinks,
    });

    // Add owner as staff
    const owner = await User.findById(req.userId);
    organization.staff.push({
      user: req.userId,
      username: owner.username,
      role: "Owner",
    });

    await organization.save();

    res.status(201).json({
      success: true,
      message: "Organization created successfully",
      data: { organization },
    });
  } catch (error) {
    console.error("Create organization error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create organization",
    });
  }
};

// Get my organizations
exports.getMyOrganizations = async (req, res) => {
  try {
    const organizations = await Organization.find({
      owner: req.userId,
    }).populate("owner", "username email");

    res.status(200).json({
      success: true,
      data: { organizations, count: organizations.length },
    });
  } catch (error) {
    console.error("Get my organizations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch organizations",
    });
  }
};

// Get organization by ID
exports.getOrganizationById = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.id)
      .populate("owner", "username email")
      .populate("teams");

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { organization },
    });
  } catch (error) {
    console.error("Get organization error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch organization",
    });
  }
};

// Update organization
exports.updateOrganization = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.id);

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    if (organization.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own organizations",
      });
    }

    const {
      name,
      tag,
      logo,
      description,
      country,
      isNepal,
      foundedDate,
      socialLinks,
    } = req.body;

    if (name) organization.name = name;
    if (tag) organization.tag = tag.toUpperCase();
    if (logo !== undefined) organization.logo = logo;
    if (description !== undefined) organization.description = description;
    if (country !== undefined) organization.country = country;
    if (isNepal !== undefined) organization.isNepal = isNepal;
    if (foundedDate !== undefined) organization.foundedDate = foundedDate;
    if (socialLinks !== undefined) organization.socialLinks = socialLinks;

    await organization.save();

    res.status(200).json({
      success: true,
      message: "Organization updated successfully",
      data: { organization },
    });
  } catch (error) {
    console.error("Update organization error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update organization",
    });
  }
};

// Add staff member
exports.addStaff = async (req, res) => {
  try {
    const { username, role, department } = req.body;

    if (!username || !role) {
      return res.status(400).json({
        success: false,
        message: "Username and role are required",
      });
    }

    const organization = await Organization.findById(req.params.id);

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    if (organization.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "You can only modify your own organizations",
      });
    }

    // Get user details by username
    const user = await User.findOne({ username: username.trim() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please check the username.",
      });
    }

    // Check if user already in staff
    const existingStaff = organization.staff.find(
      (s) => s.user.toString() === user._id.toString()
    );

    if (existingStaff) {
      return res.status(400).json({
        success: false,
        message: "User already in staff",
      });
    }

    organization.staff.push({
      user: user._id,
      username: user.username,
      role,
      department,
    });

    await organization.save();

    res.status(200).json({
      success: true,
      message: "Staff member added successfully",
      data: { organization },
    });
  } catch (error) {
    console.error("Add staff error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add staff member",
    });
  }
};

// Remove staff member
exports.removeStaff = async (req, res) => {
  try {
    const { userId } = req.body;

    const organization = await Organization.findById(req.params.id);

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    if (organization.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "You can only modify your own organizations",
      });
    }

    // Cannot remove owner
    if (userId === req.userId) {
      return res.status(400).json({
        success: false,
        message: "Cannot remove organization owner",
      });
    }

    organization.staff = organization.staff.filter(
      (s) => s.user.toString() !== userId
    );

    await organization.save();

    res.status(200).json({
      success: true,
      message: "Staff member removed",
      data: { organization },
    });
  } catch (error) {
    console.error("Remove staff error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove staff member",
    });
  }
};

// Add team to organization
exports.addTeam = async (req, res) => {
  try {
    const { teamName, game } = req.body;

    if (!teamName) {
      return res.status(400).json({
        success: false,
        message: "Team name or tag is required",
      });
    }

    const organization = await Organization.findById(req.params.id);

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    if (organization.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "You can only modify your own organizations",
      });
    }

    // Find team by name or tag
    const team = await Team.findOne({
      $or: [
        { name: teamName.trim() },
        { tag: teamName.trim() }
      ]
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found. Please check the team name or tag.",
      });
    }

    const teamId = team._id;

    // Check if team already in organization
    if (organization.teams.includes(teamId)) {
      return res.status(400).json({
        success: false,
        message: "Team already in organization",
      });
    }

    organization.teams.push(teamId);

    // Add to game-specific teams if game is provided
    if (game) {
      let gameEntry = organization.games.find((g) => g.game === game);
      if (!gameEntry) {
        gameEntry = { game, teams: [], isActive: true };
        organization.games.push(gameEntry);
      }
      if (!gameEntry.teams.includes(teamId)) {
        gameEntry.teams.push(teamId);
      }
    }

    organization.stats.totalTeams = organization.teams.length;

    // Update team to reference organization
    team.organization = organization._id;
    await team.save();

    await organization.save();

    res.status(200).json({
      success: true,
      message: "Team added to organization successfully",
      data: { organization },
    });
  } catch (error) {
    console.error("Add team error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add team",
    });
  }
};

// Get all organizations (public)
exports.getAllOrganizations = async (req, res) => {
  try {
    const { search } = req.query;

    let filter = { isActive: true };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { tag: { $regex: search, $options: "i" } },
      ];
    }

    const organizations = await Organization.find(filter)
      .populate("owner", "username")
      .limit(50);

    res.status(200).json({
      success: true,
      data: { organizations, count: organizations.length },
    });
  } catch (error) {
    console.error("Get organizations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch organizations",
    });
  }
};

// Delete organization
exports.deleteOrganization = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.id);

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    if (organization.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own organizations",
      });
    }

    await Organization.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Organization deleted successfully",
    });
  } catch (error) {
    console.error("Delete organization error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete organization",
    });
  }
};
