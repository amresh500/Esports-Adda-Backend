const Team = require("../models/Team");
const User = require("../models/User");
const PlayerProfile = require("../models/PlayerProfile");
const OrganizationAccount = require("../models/OrganizationAccount");

// Create team
exports.createTeam = async (req, res) => {
  try {
    const { name, tag, logo, description, country, isNepal, socialLinks, game } =
      req.body;

    if (!name || !tag || !game) {
      return res.status(400).json({
        success: false,
        message: "Name, tag, and game are required",
      });
    }

    // Check if team name or tag already exists
    const existingTeam = await Team.findOne({
      $or: [{ name }, { tag: tag.toUpperCase() }],
    });

    if (existingTeam) {
      return res.status(400).json({
        success: false,
        message: "Team name or tag already exists",
      });
    }

    // Check if team name or tag conflicts with any organization
    // EXCEPT if the organization creating the team has the same name/tag (allow org teams to use org name/tag)
    const existingOrg = await OrganizationAccount.findOne({
      $or: [
        { organizationName: name },
        { tag: tag.toUpperCase() },
      ],
    });

    // Only reject if there's a conflict AND it's NOT the organization creating the team
    if (existingOrg && existingOrg._id.toString() !== req.userId) {
      return res.status(400).json({
        success: false,
        message: "Team name or tag conflicts with an existing organization. Please choose a different name or tag.",
      });
    }

    // Check if the owner is an organization or player
    const isOrganization = await OrganizationAccount.findById(req.userId);
    const isPlayer = await User.findById(req.userId);

    // Determine the actual owner - could be from either collection
    let ownerId = req.userId;
    if (isOrganization) {
      ownerId = isOrganization._id;
    } else if (isPlayer) {
      ownerId = isPlayer._id;
    }

    // If organization, check if they already have a team for this game
    if (isOrganization) {
      const existingGameTeam = await Team.findOne({
        organization: ownerId,
        game: game,
      });

      if (existingGameTeam) {
        return res.status(400).json({
          success: false,
          message: `Your organization already has a team for ${game}. An organization can only have one team per game.`,
        });
      }
    }

    const team = new Team({
      name,
      tag: tag.toUpperCase(),
      logo,
      description,
      owner: ownerId,
      teamLeader: isPlayer ? ownerId : null, // Set team leader if created by player
      organization: isOrganization ? ownerId : null,
      game,
      country,
      isNepal: isNepal || false,
      socialLinks,
      games: [{ game, roster: [] }], // Auto-initialize game roster
    });

    await team.save();

    // If created by organization, add team to organization's teams array
    if (isOrganization) {
      await OrganizationAccount.findByIdAndUpdate(
        ownerId,
        { $addToSet: { teams: team._id } },
        { new: true }
      );
    }

    // If created by player, add team to player's profile teams array
    if (isPlayer) {
      await PlayerProfile.findOneAndUpdate(
        { user: ownerId },
        { $addToSet: { teams: team._id } },
        { new: true }
      );
    }

    res.status(201).json({
      success: true,
      message: "Team created successfully",
      data: { team },
    });
  } catch (error) {
    console.error("Create team error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create team",
    });
  }
};

// Get my teams
exports.getMyTeams = async (req, res) => {
  try {
    const teams = await Team.find({ owner: req.userId }).populate(
      "owner",
      "username email"
    );

    res.status(200).json({
      success: true,
      data: { teams, count: teams.length },
    });
  } catch (error) {
    console.error("Get my teams error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch teams",
    });
  }
};

// Get team by ID
exports.getTeamById = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate("owner", "username email")
      .populate("organization", "name tag logo");

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { team },
    });
  } catch (error) {
    console.error("Get team error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch team",
    });
  }
};

// Update team
exports.updateTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    if (team.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own teams",
      });
    }

    const { name, tag, logo, description, country, isNepal, socialLinks } =
      req.body;

    if (name) team.name = name;
    if (tag) team.tag = tag.toUpperCase();
    if (logo !== undefined) team.logo = logo;
    if (description !== undefined) team.description = description;
    if (country !== undefined) team.country = country;
    if (isNepal !== undefined) team.isNepal = isNepal;
    if (socialLinks !== undefined) team.socialLinks = socialLinks;

    await team.save();

    res.status(200).json({
      success: true,
      message: "Team updated successfully",
      data: { team },
    });
  } catch (error) {
    console.error("Update team error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update team",
    });
  }
};

// Add game roster
exports.addGameRoster = async (req, res) => {
  try {
    const { game } = req.body;

    if (!game) {
      return res.status(400).json({
        success: false,
        message: "Game is required",
      });
    }

    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    if (team.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "You can only modify your own teams",
      });
    }

    // Check if game already exists
    const existingGame = team.games.find((g) => g.game === game);

    if (existingGame) {
      return res.status(400).json({
        success: false,
        message: "Game roster already exists",
      });
    }

    team.games.push({ game, roster: [] });
    await team.save();

    res.status(200).json({
      success: true,
      message: "Game roster added successfully",
      data: { team },
    });
  } catch (error) {
    console.error("Add game roster error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add game roster",
    });
  }
};

// Add player to game roster
exports.addPlayerToRoster = async (req, res) => {
  try {
    const { game, username, role, inGameRole } = req.body;

    if (!game || !username) {
      return res.status(400).json({
        success: false,
        message: "Game and username are required",
      });
    }

    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    if (team.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "You can only modify your own teams",
      });
    }

    // Get player details by username
    const player = await User.findOne({ username: username.trim() });
    if (!player) {
      return res.status(404).json({
        success: false,
        message: "Player not found. Please check the username.",
      });
    }

    // Check if player is already in a team
    const playerProfile = await PlayerProfile.findOne({ user: player._id });
    if (playerProfile && playerProfile.currentTeam) {
      return res.status(400).json({
        success: false,
        message: "Player is already in a team. They must leave their current team first.",
      });
    }

    // Find game roster
    const gameRoster = team.games.find((g) => g.game === game);

    if (!gameRoster) {
      return res.status(404).json({
        success: false,
        message: "Game roster not found. Add game roster first.",
      });
    }

    // Check if player already in roster
    const existingPlayer = gameRoster.roster.find(
      (p) => p.player.toString() === player._id.toString()
    );

    if (existingPlayer) {
      return res.status(400).json({
        success: false,
        message: "Player already in roster",
      });
    }

    gameRoster.roster.push({
      player: player._id,
      playerName: player.username,
      role: role || "Player",
      inGameRole,
    });

    await team.save();

    // Update player profile to add team and set as current team
    if (playerProfile) {
      if (!playerProfile.teams.includes(team._id)) {
        playerProfile.teams.push(team._id);
      }
      playerProfile.currentTeam = team._id;
      await playerProfile.save();
    }

    res.status(200).json({
      success: true,
      message: "Player added to roster successfully",
      data: { team },
    });
  } catch (error) {
    console.error("Add player error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add player",
    });
  }
};

// Remove player from roster
exports.removePlayerFromRoster = async (req, res) => {
  try {
    const { game, playerId } = req.body;

    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    if (team.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "You can only modify your own teams",
      });
    }

    const gameRoster = team.games.find((g) => g.game === game);

    if (!gameRoster) {
      return res.status(404).json({
        success: false,
        message: "Game roster not found",
      });
    }

    gameRoster.roster = gameRoster.roster.filter(
      (p) => p.player.toString() !== playerId
    );

    await team.save();

    // Update player profile to remove current team if this was their only team
    const playerProfile = await PlayerProfile.findOne({ user: playerId });
    if (playerProfile && playerProfile.currentTeam && playerProfile.currentTeam.toString() === team._id.toString()) {
      playerProfile.currentTeam = null;
      await playerProfile.save();
    }

    res.status(200).json({
      success: true,
      message: "Player removed from roster",
      data: { team },
    });
  } catch (error) {
    console.error("Remove player error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove player",
    });
  }
};

// Leave team (for players)
exports.leaveTeam = async (req, res) => {
  try {
    const playerProfile = await PlayerProfile.findOne({ user: req.userId });

    if (!playerProfile || !playerProfile.currentTeam) {
      return res.status(400).json({
        success: false,
        message: "You are not currently in any team",
      });
    }

    const team = await Team.findById(playerProfile.currentTeam);

    if (!team) {
      // Team no longer exists, just clear the profile
      playerProfile.currentTeam = null;
      await playerProfile.save();
      return res.status(200).json({
        success: true,
        message: "Left team successfully",
      });
    }

    // Remove player from all game rosters
    team.games.forEach((gameRoster) => {
      gameRoster.roster = gameRoster.roster.filter(
        (p) => p.player.toString() !== req.userId
      );
    });

    await team.save();

    // Clear current team from player profile
    playerProfile.currentTeam = null;
    await playerProfile.save();

    res.status(200).json({
      success: true,
      message: "Left team successfully",
    });
  } catch (error) {
    console.error("Leave team error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to leave team",
    });
  }
};

// Delete team
exports.deleteTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // Check if user is team owner or organization owner
    const isOwner = team.owner.toString() === req.userId;
    const isOrgOwner = team.organization && team.organization.toString() === req.userId;

    if (!isOwner && !isOrgOwner) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this team",
      });
    }

    // Remove team from organization's teams array if it belongs to an organization
    if (team.organization) {
      await OrganizationAccount.findByIdAndUpdate(
        team.organization,
        { $pull: { teams: team._id } }
      );
    }

    // Remove team from player profiles that have this team
    await PlayerProfile.updateMany(
      { teams: team._id },
      { $pull: { teams: team._id } }
    );

    await Team.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Team deleted successfully",
    });
  } catch (error) {
    console.error("Delete team error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete team",
    });
  }
};

// Debug + fix: show all teams and fix missing game fields
exports.debugAllTeams = async (req, res) => {
  try {
    // Fix teams with no game field — default to "Valorant"
    const fixedNoField = await Team.updateMany(
      { game: { $exists: false } },
      { $set: { game: "Valorant" } }
    );
    const fixedNull = await Team.updateMany(
      { game: null },
      { $set: { game: "Valorant" } }
    );

    // Backfill games[] array for teams that have a game but empty games array
    const teamsNeedingGames = await Team.find({
      game: { $exists: true, $ne: null },
    });
    let gamesBackfilled = 0;
    for (const team of teamsNeedingGames) {
      if (!team.games.some((g) => g.game === team.game)) {
        team.games.push({ game: team.game, roster: [] });
        await team.save();
        gamesBackfilled++;
      }
    }

    const teams = await Team.find({}).select("name tag game isActive").lean();
    const gameDistribution = {};
    teams.forEach((t) => {
      const g = t.game || "(still no game)";
      gameDistribution[g] = (gameDistribution[g] || 0) + 1;
    });

    res.json({
      totalTeams: teams.length,
      fixed: fixedNoField.modifiedCount + fixedNull.modifiedCount,
      gamesArrayBackfilled: gamesBackfilled,
      gameDistribution,
      allTeams: teams,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all teams (public)
exports.getAllTeams = async (req, res) => {
  try {
    const { game, search } = req.query;

    let filter = { isActive: { $ne: false } };

    if (game) {
      filter.game = game;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { tag: { $regex: search, $options: "i" } },
      ];
    }

    const teams = await Team.find(filter)
      .populate("owner", "username")
      .populate("organization", "organizationName tag logo country isNepal")
      .limit(200);

    // Backfill: ensure each team has its primary game in the games[] array
    for (const team of teams) {
      if (team.game && !team.games.some((g) => g.game === team.game)) {
        team.games.push({ game: team.game, roster: [] });
        await team.save();
      }
    }

    res.status(200).json({
      success: true,
      data: { teams, count: teams.length },
    });
  } catch (error) {
    console.error("Get teams error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch teams",
    });
  }
};

// Add member to team
exports.addMember = async (req, res) => {
  try {
    const { game, playerUsername, role, inGameRole } = req.body;
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // Check if user is team owner or organization owner
    const isOwner = team.owner.toString() === req.userId;
    const isOrgOwner = team.organization && team.organization.toString() === req.userId;
    const isTeamLeader = team.teamLeader && team.teamLeader.toString() === req.userId;

    if (!isOwner && !isOrgOwner && !isTeamLeader) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to add members to this team",
      });
    }

    // Find the player by username
    const player = await User.findOne({ username: playerUsername });
    if (!player) {
      return res.status(404).json({
        success: false,
        message: "Player not found",
      });
    }

    // Find or create game entry
    let gameEntry = team.games.find((g) => g.game === game);
    if (!gameEntry) {
      team.games.push({
        game,
        roster: [],
      });
      gameEntry = team.games[team.games.length - 1];
    }

    // Check if player is already in roster
    const alreadyInRoster = gameEntry.roster.some(
      (member) => member.player.toString() === player._id.toString()
    );

    if (alreadyInRoster) {
      return res.status(400).json({
        success: false,
        message: "Player is already in the roster for this game",
      });
    }

    // Add member to roster
    gameEntry.roster.push({
      player: player._id,
      playerName: player.username,
      role: role || "Player",
      inGameRole: inGameRole || "",
      joinedDate: new Date(),
      isActive: true,
    });

    await team.save();

    // Add team to player's profile
    await PlayerProfile.findOneAndUpdate(
      { user: player._id },
      { $addToSet: { teams: team._id } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Member added successfully",
      data: { team },
    });
  } catch (error) {
    console.error("Add member error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add member: " + error.message,
    });
  }
};

// Remove member from team
exports.removeMember = async (req, res) => {
  try {
    const { gameIndex, memberIndex } = req.params;
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // Check if user is team owner or organization owner
    const isOwner = team.owner.toString() === req.userId;
    const isOrgOwner = team.organization && team.organization.toString() === req.userId;
    const isTeamLeader = team.teamLeader && team.teamLeader.toString() === req.userId;

    if (!isOwner && !isOrgOwner && !isTeamLeader) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to remove members from this team",
      });
    }

    // Validate indices
    if (!team.games[gameIndex] || !team.games[gameIndex].roster[memberIndex]) {
      return res.status(404).json({
        success: false,
        message: "Member not found",
      });
    }

    // Get the member to remove
    const memberToRemove = team.games[gameIndex].roster[memberIndex];

    // Remove member from roster
    team.games[gameIndex].roster.splice(memberIndex, 1);

    // If roster is now empty, optionally remove the game entry
    if (team.games[gameIndex].roster.length === 0) {
      team.games.splice(gameIndex, 1);
    }

    await team.save();

    // Remove team from player's profile if they're not in any other game roster
    const stillInTeam = team.games.some((game) =>
      game.roster.some((member) => member.player.toString() === memberToRemove.player.toString())
    );

    if (!stillInTeam) {
      await PlayerProfile.findOneAndUpdate(
        { user: memberToRemove.player },
        { $pull: { teams: team._id } }
      );
    }

    res.status(200).json({
      success: true,
      message: "Member removed successfully",
      data: { team },
    });
  } catch (error) {
    console.error("Remove member error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove member: " + error.message,
    });
  }
};

// Get all players from team rosters + player profiles (public)
exports.getPlayers = async (req, res) => {
  try {
    const { game, search } = req.query;

    // 1. Get players from team rosters
    let teamFilter = { isActive: { $ne: false } };
    if (game) {
      teamFilter.game = game;
    }

    const teams = await Team.find(teamFilter)
      .select("name tag game games logo country isNepal")
      .limit(200);

    // Backfill: ensure each team has its primary game in the games[] array
    for (const team of teams) {
      if (team.game && !team.games.some((g) => g.game === team.game)) {
        team.games.push({ game: team.game, roster: [] });
        await team.save();
      }
    }

    const playersMap = new Map();

    teams.forEach((team) => {
      team.games.forEach((gameEntry) => {
        if (game && gameEntry.game !== game) return;

        gameEntry.roster.forEach((member) => {
          if (!member.player) return;
          const playerId = member.player.toString();
          if (!playersMap.has(playerId)) {
            playersMap.set(playerId, {
              playerId: member.player,
              playerName: member.playerName,
              role: member.role,
              inGameRole: member.inGameRole,
              team: {
                _id: team._id,
                name: team.name,
                tag: team.tag,
                logo: team.logo,
              },
              game: gameEntry.game,
              country: team.country,
              isNepal: team.isNepal,
            });
          }
        });
      });
    });

    // 2. Also get players from PlayerProfile who have this game
    let profileFilter = {};
    if (game) {
      profileFilter["games.game"] = game;
    } else {
      profileFilter["games.0"] = { $exists: true }; // has at least one game
    }

    const profiles = await PlayerProfile.find(profileFilter)
      .populate("user", "username")
      .populate("currentTeam", "name tag logo")
      .limit(200);

    profiles.forEach((profile) => {
      if (!profile.user) return;
      const playerId = profile.user._id.toString();

      // Skip if already found in team rosters
      if (playersMap.has(playerId)) return;

      // Find the relevant game entry
      const gameEntries = game
        ? profile.games.filter((g) => g.game === game)
        : profile.games;

      gameEntries.forEach((gameEntry) => {
        const key = `${playerId}_${gameEntry.game}`;
        if (!playersMap.has(playerId)) {
          playersMap.set(playerId, {
            playerId: profile.user._id,
            playerName: profile.user.username,
            role: gameEntry.role || "Player",
            inGameRole: gameEntry.inGameName || gameEntry.role || "",
            team: profile.currentTeam
              ? {
                  _id: profile.currentTeam._id,
                  name: profile.currentTeam.name,
                  tag: profile.currentTeam.tag,
                  logo: profile.currentTeam.logo,
                }
              : { _id: null, name: "Free Agent", tag: null, logo: null },
            game: gameEntry.game,
            country: profile.country || "Unknown",
            isNepal: profile.isNepal || false,
          });
        }
      });
    });

    let players = Array.from(playersMap.values());

    if (search) {
      const searchLower = search.toLowerCase();
      players = players.filter(
        (p) =>
          (p.playerName && p.playerName.toLowerCase().includes(searchLower)) ||
          (p.team?.name && p.team.name.toLowerCase().includes(searchLower))
      );
    }

    res.status(200).json({
      success: true,
      data: { players, count: players.length },
    });
  } catch (error) {
    console.error("Get players error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch players",
    });
  }
};
