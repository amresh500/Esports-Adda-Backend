const mongoose = require("mongoose");

/**
 * Per-player stats for a single tournament match.
 * One MatchStats doc = one player's performance in one match.
 */
const matchStatsSchema = new mongoose.Schema(
  {
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    matchNumber: { type: Number, required: true },
    game: { type: String, required: true, index: true },

    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    playerUsername: String,
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
    teamName: String,

    // Universal core stats
    kills:       { type: Number, default: 0, min: 0 },
    deaths:      { type: Number, default: 0, min: 0 },
    assists:     { type: Number, default: 0, min: 0 },
    damageDealt: { type: Number, default: 0, min: 0 },
    rating:      { type: Number, default: 0, min: 0, max: 10 },
    isMVP:       { type: Boolean, default: false },

    // Match outcome from this player's perspective
    won: { type: Boolean, default: false },

    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizationAccount",
    },
  },
  { timestamps: true }
);

// One stat-row per (tournament, match, player)
matchStatsSchema.index(
  { tournament: 1, matchNumber: 1, player: 1 },
  { unique: true }
);
matchStatsSchema.index({ player: 1, game: 1, createdAt: -1 });

/**
 * Aggregate a single player's stats for a given game.
 * Returns averages, totals, and derived ratios.
 */
matchStatsSchema.statics.getPlayerGameStats = async function (playerId, game) {
  const pid =
    typeof playerId === "string"
      ? new mongoose.Types.ObjectId(playerId)
      : playerId;

  const rows = await this.aggregate([
    { $match: { player: pid, game } },
    {
      $group: {
        _id: null,
        matches:     { $sum: 1 },
        wins:        { $sum: { $cond: ["$won", 1, 0] } },
        mvps:        { $sum: { $cond: ["$isMVP", 1, 0] } },
        totalKills:  { $sum: "$kills" },
        totalDeaths: { $sum: "$deaths" },
        totalAssists:{ $sum: "$assists" },
        totalDamage: { $sum: "$damageDealt" },
        avgRating:   { $avg: "$rating" },
        avgKills:    { $avg: "$kills" },
        avgDeaths:   { $avg: "$deaths" },
        avgAssists:  { $avg: "$assists" },
        avgDamage:   { $avg: "$damageDealt" },
      },
    },
  ]);

  if (!rows.length) {
    return {
      matches: 0, wins: 0, losses: 0, winRate: 0, mvps: 0,
      totalKills: 0, totalDeaths: 0, totalAssists: 0, totalDamage: 0,
      avgKills: 0, avgDeaths: 0, avgAssists: 0, avgDamage: 0,
      avgRating: 0, kdRatio: 0, kdaRatio: 0,
    };
  }

  const r = rows[0];
  const losses = r.matches - r.wins;
  return {
    matches:     r.matches,
    wins:        r.wins,
    losses,
    winRate:     r.matches ? +(r.wins / r.matches * 100).toFixed(1) : 0,
    mvps:        r.mvps,
    totalKills:  r.totalKills,
    totalDeaths: r.totalDeaths,
    totalAssists:r.totalAssists,
    totalDamage: r.totalDamage,
    avgKills:    +r.avgKills.toFixed(2),
    avgDeaths:   +r.avgDeaths.toFixed(2),
    avgAssists:  +r.avgAssists.toFixed(2),
    avgDamage:   Math.round(r.avgDamage),
    avgRating:   +r.avgRating.toFixed(2),
    kdRatio:     r.totalDeaths ? +(r.totalKills / r.totalDeaths).toFixed(2) : r.totalKills,
    kdaRatio:    r.totalDeaths ? +((r.totalKills + r.totalAssists) / r.totalDeaths).toFixed(2) : r.totalKills + r.totalAssists,
  };
};

/**
 * Recent match history (latest N) for a player in a specific game.
 * Used to plot trends.
 */
matchStatsSchema.statics.getRecentMatches = async function (playerId, game, limit = 10) {
  return this.find({ player: playerId, game })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("tournament", "name")
    .lean();
};

/**
 * Game-average stats across ALL players for "you vs average" comparison.
 */
matchStatsSchema.statics.getGameAverages = async function (game) {
  const rows = await this.aggregate([
    { $match: { game } },
    {
      $group: {
        _id: null,
        avgKills:   { $avg: "$kills" },
        avgDeaths:  { $avg: "$deaths" },
        avgAssists: { $avg: "$assists" },
        avgDamage:  { $avg: "$damageDealt" },
        avgRating:  { $avg: "$rating" },
      },
    },
  ]);
  if (!rows.length) {
    return { avgKills: 0, avgDeaths: 0, avgAssists: 0, avgDamage: 0, avgRating: 0 };
  }
  const r = rows[0];
  return {
    avgKills:   +r.avgKills.toFixed(2),
    avgDeaths:  +r.avgDeaths.toFixed(2),
    avgAssists: +r.avgAssists.toFixed(2),
    avgDamage:  Math.round(r.avgDamage),
    avgRating:  +r.avgRating.toFixed(2),
  };
};

module.exports = mongoose.model("MatchStats", matchStatsSchema);
