const Team = require("../models/Team");
const OrganizationAccount = require("../models/OrganizationAccount");
const Tournament = require("../models/Tournament");
const PlayerProfile = require("../models/PlayerProfile");

// Get per-game counts (teams + players) for the games sidebar
exports.getGameCounts = async (req, res) => {
  try {
    const gameNames = [
      "Valorant",
      "CS2",
      "PUBG Mobile",
      "Dota 2",
      "League of Legends",
      "Free Fire",
    ];

    // Get team counts per game using aggregation
    const teamCounts = await Team.aggregate([
      { $match: { isActive: { $ne: false }, game: { $in: gameNames } } },
      { $group: { _id: "$game", count: { $sum: 1 } } },
    ]);

    // Get unique player IDs per game from team rosters
    const rosterPlayerCounts = await Team.aggregate([
      { $match: { isActive: { $ne: false } } },
      { $unwind: "$games" },
      { $match: { "games.game": { $in: gameNames } } },
      { $unwind: "$games.roster" },
      { $match: { "games.roster.player": { $exists: true } } },
      {
        $group: {
          _id: "$games.game",
          players: { $addToSet: "$games.roster.player" },
        },
      },
      { $project: { _id: 1, count: { $size: "$players" } } },
    ]);

    // Get player counts per game from PlayerProfile.games
    const profilePlayerCounts = await PlayerProfile.aggregate([
      { $unwind: "$games" },
      { $match: { "games.game": { $in: gameNames } } },
      { $group: { _id: "$games.game", players: { $addToSet: "$user" } } },
      { $project: { _id: 1, count: { $size: "$players" } } },
    ]);

    const teamMap = {};
    teamCounts.forEach((t) => {
      teamMap[t._id] = t.count;
    });

    const rosterPlayerMap = {};
    rosterPlayerCounts.forEach((p) => {
      rosterPlayerMap[p._id] = p.count;
    });

    const profilePlayerMap = {};
    profilePlayerCounts.forEach((p) => {
      profilePlayerMap[p._id] = p.count;
    });

    const counts = {};
    gameNames.forEach((name) => {
      // Use the higher count between roster players and profile players
      const rosterCount = rosterPlayerMap[name] || 0;
      const profileCount = profilePlayerMap[name] || 0;
      counts[name] = {
        teams: teamMap[name] || 0,
        players: Math.max(rosterCount, profileCount),
      };
    });

    res.status(200).json({
      success: true,
      data: { counts },
    });
  } catch (error) {
    console.error("Get game counts error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch game counts",
    });
  }
};

exports.getOverview = async (req, res) => {
  try {
    const [teamCount, orgCount, tournaments, teams, profileCount] =
      await Promise.all([
        Team.countDocuments({ isActive: { $ne: false } }),
        OrganizationAccount.countDocuments({ isActive: { $ne: false } }),
        Tournament.find({ isPublished: true }).select("prizePool matches"),
        Team.find({ isActive: { $ne: false } }).select("games"),
        PlayerProfile.countDocuments({ "games.0": { $exists: true } }),
      ]);

    // Count unique players from team rosters
    const playerIds = new Set();
    teams.forEach((team) => {
      team.games.forEach((gameEntry) => {
        gameEntry.roster.forEach((member) => {
          if (member.player) {
            playerIds.add(member.player.toString());
          }
        });
      });
    });

    // Use the higher count: roster players or profile players
    const totalPlayers = Math.max(playerIds.size, profileCount);

    // Sum prize pools and match counts
    let totalPrizePool = 0;
    let totalMatches = 0;
    tournaments.forEach((t) => {
      totalPrizePool += t.prizePool?.amount || 0;
      totalMatches += t.matches?.length || 0;
    });

    res.status(200).json({
      success: true,
      data: {
        totalTeams: teamCount,
        totalOrganizations: orgCount,
        totalPlayers,
        totalMatches,
        totalPrizePool,
        totalTournaments: tournaments.length,
        currency: "NPR",
      },
    });
  } catch (error) {
    console.error("Get overview stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stats",
    });
  }
};
