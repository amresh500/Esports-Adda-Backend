const Tournament = require("../models/Tournament");
const OrganizationAccount = require("../models/OrganizationAccount");
const { resolveOrgPermission } = require("../utils/orgPermission");
const Notification = require("../models/Notification");
const { emitNotification } = require("../socket/socketHandler");

// Helper: create + emit a single notification (fire-and-forget, errors are non-fatal)
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

// Notify all registered participants when a tournament is cancelled due to insufficient teams
async function notifyLowTeamsCancellation(tournament) {
  const Team = require("../models/Team");
  const minTeams = tournament.minimumTeams || 2;
  for (const participant of tournament.participants) {
    if (!participant.team) continue;
    const team = await Team.findById(participant.team).select("owner");
    if (team?.owner) {
      await sendNotification({
        recipientId: team.owner,
        recipientModel: "User",
        type: "tournament_registration_rejected",
        title: "Tournament Cancelled",
        message: `"${tournament.name}" has been cancelled because the minimum team requirement of ${minTeams} was not met by registration close.`,
        link: `/tournaments`,
        refId: tournament._id,
        refModel: "Tournament",
      });
    }
  }
}

// Helper function to update tournament status based on dates
// Returns { tournament, statusChanged, cancelledDueToLowTeams }
const updateTournamentStatus = (tournament) => {
  if (!tournament || tournament.status === 'completed' || tournament.status === 'cancelled' || tournament.status === 'overdue') {
    return { tournament, statusChanged: false, cancelledDueToLowTeams: false };
  }

  const now = new Date();
  const regStart = new Date(tournament.registrationStartDate);
  const regEnd = new Date(tournament.registrationEndDate);
  const tourStart = new Date(tournament.tournamentStartDate);
  const tourEnd = tournament.tournamentEndDate ? new Date(tournament.tournamentEndDate) : null;
  const minTeams = tournament.minimumTeams || 2;

  let newStatus = tournament.status;
  let cancelledDueToLowTeams = false;

  if (tournament.isPublished) {
    if (now < regStart) {
      newStatus = 'registration_open';
    } else if (now >= regStart && now <= regEnd) {
      newStatus = 'registration_open';
    } else if (now > regEnd && now < tourStart) {
      // Registration closed — check if minimum teams threshold is met
      const eligibleCount = tournament.participants.filter(
        (p) => p.status === 'approved' || p.status === 'confirmed' || p.status === 'registered'
      ).length;

      if (eligibleCount < minTeams) {
        // Not enough teams — cancel and flag so caller can notify participants
        newStatus = 'cancelled';
        cancelledDueToLowTeams = true;
      } else {
        newStatus = 'registration_closed';
      }
    } else if (now >= tourStart && (tourEnd === null || now <= tourEnd)) {
      newStatus = 'ongoing';
    } else if (tourEnd && now > tourEnd) {
      // Tournament end date passed
      if (tournament.winner && tournament.winner.team) {
        // Winner declared → mark completed
        newStatus = 'completed';
      } else {
        // Bracket unfinished past end date → overdue so organizer is forced to act
        newStatus = 'overdue';
      }
    }
  }

  if (newStatus !== tournament.status) {
    tournament.status = newStatus;
    return { tournament, statusChanged: true, cancelledDueToLowTeams };
  }

  return { tournament, statusChanged: false, cancelledDueToLowTeams: false };
};

// Create tournament
exports.createTournament = async (req, res) => {
  try {
    const {
      name,
      description,
      game,
      customGame,
      matchmakingType,
      totalSlots,
      minimumTeams,
      teamSize,
      prizePool,
      registrationStartDate,
      registrationEndDate,
      tournamentStartDate,
      tournamentEndDate,
      rules,
      requirements,
      settings,
      streamUrl,
      discordUrl,
      entryFee,
    } = req.body;

    // Validation
    if (!name || !game || !matchmakingType || !totalSlots) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields (name, game, matchmaking type, and total slots)",
      });
    }

    // Validate slot count based on matchmaking type
    if (matchmakingType === "single_elimination" || matchmakingType === "double_elimination") {
      // Check if slots is a power of 2
      if (!Number.isInteger(Math.log2(totalSlots))) {
        return res.status(400).json({
          success: false,
          message: `For ${matchmakingType.replace("_", " ")}, total slots must be a power of 2 (2, 4, 8, 16, 32, 64, 128)`,
        });
      }
    }

    // Validate minimumTeams
    if (minimumTeams && minimumTeams > totalSlots) {
      return res.status(400).json({
        success: false,
        message: "Minimum teams cannot exceed total slots",
      });
    }

    // Validate dates
    const regStart = new Date(registrationStartDate);
    const regEnd = new Date(registrationEndDate);
    const tourStart = new Date(tournamentStartDate);

    if (regEnd <= regStart) {
      return res.status(400).json({
        success: false,
        message: "Registration end date must be after start date",
      });
    }

    if (tourStart <= regEnd) {
      return res.status(400).json({
        success: false,
        message: "Tournament start date must be after registration end date",
      });
    }

    // Get organizer info — org account or admin staff
    const { authorized, organization: organizer, orgId } = await resolveOrgPermission(
      req.userId,
      req.accountType
    );
    if (!authorized || !organizer) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to create tournaments",
      });
    }

    const tournament = new Tournament({
      name,
      description,
      game,
      customGame: game === "Other" ? customGame : undefined,
      organizer: orgId,
      organizerName: organizer.organizationName,
      matchmakingType,
      totalSlots,
      minimumTeams: minimumTeams || 2,
      teamSize: teamSize || 5,
      prizePool,
      entryFee: entryFee || { amount: 0, currency: "NPR" },
      registrationStartDate,
      registrationEndDate,
      tournamentStartDate,
      tournamentEndDate,
      rules: rules || [],
      requirements: requirements || {},
      settings: settings || {},
      streamUrl,
      discordUrl,
      status: "draft",
    });

    await tournament.save();

    res.status(201).json({
      success: true,
      message: "Tournament created successfully",
      data: { tournament },
    });
  } catch (error) {
    console.error("Create tournament error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create tournament",
    });
  }
};

// Get all tournaments (public)
exports.getAllTournaments = async (req, res) => {
  try {
    const { game, status, search, isNepalOnly } = req.query;

    let filter = { isPublished: true };

    if (game) filter.game = game;
    if (status) filter.status = status;
    if (isNepalOnly === "true") filter["requirements.isNepalOnly"] = true;

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const tournaments = await Tournament.find(filter)
      .select("-participants.paymentScreenshot")
      .populate("organizer", "organizationName tag logo")
      .sort({ tournamentStartDate: 1 })
      .limit(50);

    // Update status for each tournament based on dates
    const updatedTournaments = [];
    for (const tournament of tournaments) {
      const { statusChanged, cancelledDueToLowTeams } = updateTournamentStatus(tournament);
      if (statusChanged) {
        await tournament.save();
        // Notify registered participants if cancelled due to insufficient teams
        if (cancelledDueToLowTeams) {
          notifyLowTeamsCancellation(tournament).catch((e) =>
            console.error("low-teams cancellation notification error:", e.message)
          );
        }
      }
      updatedTournaments.push(tournament);
    }

    res.status(200).json({
      success: true,
      data: { tournaments: updatedTournaments, count: updatedTournaments.length },
    });
  } catch (error) {
    console.error("Get tournaments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tournaments",
    });
  }
};

// Get tournament by ID
exports.getTournamentById = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .select("-participants.paymentScreenshot")
      .populate("organizer", "organizationName tag logo contactEmail")
      .populate("participants.team", "name tag logo");

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Update tournament status based on dates
    const { statusChanged, cancelledDueToLowTeams } = updateTournamentStatus(tournament);

    // Increment view count
    tournament.viewCount += 1;

    // Save if status changed or view count incremented
    await tournament.save();

    if (cancelledDueToLowTeams) {
      notifyLowTeamsCancellation(tournament).catch((e) =>
        console.error("low-teams cancellation notification error:", e.message)
      );
    }

    res.status(200).json({
      success: true,
      data: { tournament },
    });
  } catch (error) {
    console.error("Get tournament error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tournament",
    });
  }
};

// Get my tournaments (organizer or admin staff)
exports.getMyTournaments = async (req, res) => {
  try {
    let organizerId = req.userId;

    if (req.accountType === "user") {
      const { authorized, orgId } = await resolveOrgPermission(req.userId, req.accountType);
      if (!authorized) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to view organization tournaments",
        });
      }
      organizerId = orgId;
    }

    const tournaments = await Tournament.find({
      organizer: organizerId,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: { tournaments, count: tournaments.length },
    });
  } catch (error) {
    console.error("Get my tournaments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tournaments",
    });
  }
};

// Update tournament
exports.updateTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    const { authorized: isAuthorized } = await resolveOrgPermission(
      req.userId, req.accountType, tournament.organizer
    );
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage this tournament",
      });
    }

    // Prevent certain updates once tournament has started
    if (tournament.status === "ongoing" || tournament.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot update tournament that is ongoing or completed",
      });
    }

    const {
      name,
      description,
      prizePool,
      rules,
      requirements,
      settings,
      streamUrl,
      discordUrl,
      banner,
      logo,
      entryFee,
    } = req.body;

    // Update allowed fields
    if (name !== undefined) tournament.name = name;
    if (description !== undefined) tournament.description = description;
    if (prizePool !== undefined) tournament.prizePool = prizePool;
    if (entryFee !== undefined) tournament.entryFee = entryFee;
    if (rules !== undefined) tournament.rules = rules;
    if (requirements !== undefined) tournament.requirements = requirements;
    if (settings !== undefined) tournament.settings = settings;
    if (streamUrl !== undefined) tournament.streamUrl = streamUrl;
    if (discordUrl !== undefined) tournament.discordUrl = discordUrl;
    if (banner !== undefined) tournament.banner = banner;
    if (logo !== undefined) tournament.logo = logo;

    await tournament.save();

    res.status(200).json({
      success: true,
      message: "Tournament updated successfully",
      data: { tournament },
    });
  } catch (error) {
    console.error("Update tournament error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update tournament",
    });
  }
};

// Update tournament dates (registration and tournament duration)
exports.updateRegistrationDates = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    const { authorized: isAuthorized } = await resolveOrgPermission(
      req.userId, req.accountType, tournament.organizer
    );
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage this tournament",
      });
    }

    // Prevent updates once tournament has started or completed
    if (tournament.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot update dates for a completed tournament",
      });
    }

    // Ongoing tournaments: only allow extending the end date (to fix overdue situations)
    const ongoingOrOverdue = tournament.status === "ongoing" || tournament.status === "overdue";
    if (ongoingOrOverdue) {
      const { tournamentEndDate } = req.body;
      if (!tournamentEndDate) {
        return res.status(400).json({
          success: false,
          message: "Only the tournament end date can be extended once a tournament is ongoing or overdue",
        });
      }
      const newEnd = new Date(tournamentEndDate);
      if (newEnd <= new Date(tournament.tournamentStartDate)) {
        return res.status(400).json({
          success: false,
          message: "Tournament end date must be after the tournament start date",
        });
      }
      tournament.tournamentEndDate = newEnd;
      // If overdue and new end is in the future, revert status to ongoing
      if (tournament.status === "overdue" && newEnd > new Date()) {
        tournament.status = "ongoing";
      }
      await tournament.save();
      return res.status(200).json({
        success: true,
        message: "Tournament end date extended successfully",
        data: { tournament },
      });
    }

    const { registrationStartDate, registrationEndDate, tournamentStartDate, tournamentEndDate } = req.body;

    if (!registrationStartDate && !registrationEndDate && !tournamentStartDate && !tournamentEndDate) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one date to update",
      });
    }

    const newRegStart = registrationStartDate ? new Date(registrationStartDate) : tournament.registrationStartDate;
    const newRegEnd = registrationEndDate ? new Date(registrationEndDate) : tournament.registrationEndDate;
    const newTourStart = tournamentStartDate ? new Date(tournamentStartDate) : tournament.tournamentStartDate;
    const newTourEnd = tournamentEndDate ? new Date(tournamentEndDate) : tournament.tournamentEndDate;

    // Validate registration dates
    if (newRegEnd <= newRegStart) {
      return res.status(400).json({
        success: false,
        message: "Registration end date must be after registration start date",
      });
    }

    // Validate tournament dates
    if (newTourEnd <= newTourStart) {
      return res.status(400).json({
        success: false,
        message: "Tournament end date must be after tournament start date",
      });
    }

    // Registration end date should be before or equal to tournament start
    if (newRegEnd > newTourStart) {
      return res.status(400).json({
        success: false,
        message: "Registration end date must be before or equal to tournament start date",
      });
    }

    // Update the registration dates
    if (registrationStartDate) {
      tournament.registrationStartDate = newRegStart;
    }
    if (registrationEndDate) {
      tournament.registrationEndDate = newRegEnd;
    }

    // Update the tournament dates
    if (tournamentStartDate) {
      tournament.tournamentStartDate = newTourStart;
    }
    if (tournamentEndDate) {
      tournament.tournamentEndDate = newTourEnd;
    }

    // Recalculate status after date change
    const now = new Date();
    if (now >= newRegStart && now <= newRegEnd) {
      // Registration window is open — reopen regardless of previous status
      if (tournament.status === "draft" || tournament.status === "registration_closed") {
        tournament.status = "registration_open";
      }
    } else if (now > newRegEnd && now < newTourStart) {
      if (tournament.status === "registration_open") {
        tournament.status = "registration_closed";
      }
    }

    await tournament.save();

    res.status(200).json({
      success: true,
      message: "Tournament dates updated successfully",
      data: {
        tournament,
        registrationStatus: now >= newRegStart && now <= newRegEnd ? "open" : now < newRegStart ? "not_started" : "closed"
      },
    });
  } catch (error) {
    console.error("Update tournament dates error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update tournament dates",
    });
  }
};

// Delete tournament
exports.deleteTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    const { authorized: canDelete } = await resolveOrgPermission(
      req.userId, req.accountType, tournament.organizer
    );
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage this tournament",
      });
    }

    // Prevent deletion if tournament is ongoing
    if (tournament.status === "ongoing") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete tournament that is ongoing",
      });
    }

    await Tournament.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Tournament deleted successfully",
    });
  } catch (error) {
    console.error("Delete tournament error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete tournament",
    });
  }
};

// Publish tournament
exports.publishTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    const { authorized: canPublish } = await resolveOrgPermission(
      req.userId, req.accountType, tournament.organizer
    );
    if (!canPublish) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage this tournament",
      });
    }

    tournament.isPublished = true;
    tournament.status = "registration_open";
    await tournament.save();

    res.status(200).json({
      success: true,
      message: "Tournament published successfully",
      data: { tournament },
    });
  } catch (error) {
    console.error("Publish tournament error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to publish tournament",
    });
  }
};

// Generate bracket
exports.generateBracket = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    const { authorized: canManage } = await resolveOrgPermission(
      req.userId, req.accountType, tournament.organizer
    );
    if (!canManage) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage this tournament",
      });
    }

    // For paid tournaments, only include approved participants in bracket
    const isPaid = tournament.entryFee && tournament.entryFee.amount > 0;
    if (isPaid) {
      const pendingCount = tournament.participants.filter(
        (p) => p.status === "pending_approval"
      ).length;
      if (pendingCount > 0) {
        console.log(`Warning: ${pendingCount} participants still pending approval`);
      }
      // Filter to only approved participants for bracket generation
      tournament.participants = tournament.participants.filter(
        (p) => p.status === "approved" || p.status === "confirmed"
      );
    }

    if (tournament.participants.length < 2) {
      return res.status(400).json({
        success: false,
        message: isPaid
          ? "Need at least 2 approved participants to generate bracket. Please verify pending payments first."
          : "Need at least 2 participants to generate bracket",
      });
    }

    // Ensure all participants have teamName (backfill for older registrations)
    const Team = require("../models/Team");
    let needsSave = false;
    for (let i = 0; i < tournament.participants.length; i++) {
      if (!tournament.participants[i].teamName && tournament.participants[i].team) {
        const team = await Team.findById(tournament.participants[i].team);
        if (team) {
          tournament.participants[i].teamName = team.name;
          needsSave = true;
        }
      }
    }

    // Check if regenerating and preserve existing results if requested
    const { preserveResults } = req.body;
    const existingMatchData = new Map();

    if (preserveResults && tournament.matches) {
      // Preserve complete match data including participants, winners, scores, etc.
      tournament.matches.forEach(match => {
        existingMatchData.set(match.matchNumber, {
          participant1: match.participant1,
          participant2: match.participant2,
          winner: match.winner,
          loser: match.loser,
          score: match.score,
          status: match.status,
          completedAt: match.completedAt,
          scheduledTime: match.scheduledTime,
          streamUrl: match.streamUrl,
        });
      });
      console.log(`Preserved data from ${existingMatchData.size} existing matches`);
    }

    const matches = tournament.generateBracket();

    // Re-apply existing match data
    if (preserveResults && existingMatchData.size > 0) {
      matches.forEach(match => {
        const existingData = existingMatchData.get(match.matchNumber);
        if (existingData) {
          // Preserve participant data if it exists in the old match
          if (existingData.participant1 && existingData.participant1.team) {
            match.participant1 = existingData.participant1;
          }
          if (existingData.participant2 && existingData.participant2.team) {
            match.participant2 = existingData.participant2;
          }

          // Preserve match results
          if (existingData.status === 'completed' && existingData.winner) {
            match.winner = existingData.winner;
            match.loser = existingData.loser;
            match.score = existingData.score;
            match.status = existingData.status;
            match.completedAt = existingData.completedAt;

            // Update participant statuses based on winner
            if (match.participant1 && match.winner) {
              const winnerId = match.winner.team?.toString() || match.winner.team;
              const p1Id = match.participant1.team?.toString() || match.participant1.team;
              match.participant1.status = winnerId === p1Id ? 'winner' : 'eliminated';
            }
            if (match.participant2 && match.winner) {
              const winnerId = match.winner.team?.toString() || match.winner.team;
              const p2Id = match.participant2.team?.toString() || match.participant2.team;
              match.participant2.status = winnerId === p2Id ? 'winner' : 'eliminated';
            }

            // Auto-advance winner to next match
            if (match.nextMatchWinner && match.winner) {
              const nextMatch = matches.find(m => m.matchNumber === match.nextMatchWinner);
              if (nextMatch) {
                // Check if winner is already in the next match
                const winnerTeamId = match.winner.team?.toString() || match.winner.team;
                const nextP1Id = nextMatch.participant1?.team?.toString() || nextMatch.participant1?.team;
                const nextP2Id = nextMatch.participant2?.team?.toString() || nextMatch.participant2?.team;

                if (winnerTeamId !== nextP1Id && winnerTeamId !== nextP2Id) {
                  if (!nextMatch.participant1 || !nextMatch.participant1.team) {
                    nextMatch.participant1 = {
                      team: match.winner.team,
                      teamName: match.winner.teamName,
                      status: 'confirmed',
                    };
                  } else if (!nextMatch.participant2 || !nextMatch.participant2.team) {
                    nextMatch.participant2 = {
                      team: match.winner.team,
                      teamName: match.winner.teamName,
                      status: 'confirmed',
                    };
                  }
                }
              }
            }
          }

          // Preserve schedule and stream info
          if (existingData.scheduledTime) {
            match.scheduledTime = existingData.scheduledTime;
          }
          if (existingData.streamUrl) {
            match.streamUrl = existingData.streamUrl;
          }
        }
      });

      console.log('Re-applied existing match data to regenerated bracket');
    }

    tournament.matches = matches;
    tournament.markModified('matches');
    await tournament.save();

    // Notify all approved participants that the bracket is ready (fire-and-forget)
    if (!preserveResults) {
      try {
        const Team = require("../models/Team");
        const approvedParticipants = tournament.participants.filter(
          (p) => p.status === "approved" || p.status === "confirmed" || p.status === "winner" || p.status === "eliminated"
        );
        for (const participant of approvedParticipants) {
          if (!participant.team) continue;
          const team = await Team.findById(participant.team).select("owner");
          if (team?.owner) {
            await sendNotification({
              recipientId: team.owner,
              recipientModel: "User",
              type: "tournament_bracket_generated",
              title: "Bracket is Live!",
              message: `The bracket for "${tournament.name}" has been generated. Check your match schedule now!`,
              link: `/tournament/${tournament._id}/bracket`,
              refId: tournament._id,
              refModel: "Tournament",
            });
          }
        }
      } catch (notifErr) {
        console.error("generateBracket notification error (non-fatal):", notifErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: preserveResults ? "Bracket regenerated with preserved results" : "Bracket generated successfully",
      data: { tournament },
    });
  } catch (error) {
    console.error("Generate bracket error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate bracket",
    });
  }
};

// Register team for tournament
exports.registerTeam = async (req, res) => {
  try {
    console.log("=== Tournament Registration Request ===");
    console.log("Tournament ID:", req.params.id);
    console.log("Team ID:", req.body.teamId);
    console.log("User ID:", req.userId);

    const { teamId, paymentScreenshot } = req.body;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: "Team ID is required",
      });
    }

    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      console.log("Tournament not found");
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    console.log("Tournament found:", tournament.name);

    // Check if tournament is published
    if (!tournament.isPublished) {
      console.log("Tournament not published");
      return res.status(400).json({
        success: false,
        message: "Tournament is not published yet",
      });
    }

    // Check if registration is open
    const now = new Date();
    console.log("Current date:", now);
    console.log("Registration start:", tournament.registrationStartDate);
    console.log("Registration end:", tournament.registrationEndDate);

    if (now < tournament.registrationStartDate) {
      console.log("Registration has not started yet");
      return res.status(400).json({
        success: false,
        message: `Registration has not started yet. Registration opens on ${tournament.registrationStartDate.toLocaleDateString()}`,
      });
    }

    if (now > tournament.registrationEndDate) {
      console.log("Registration has closed");
      return res.status(400).json({
        success: false,
        message: `Registration has closed. Registration ended on ${tournament.registrationEndDate.toLocaleDateString()}`,
      });
    }

    // Check if tournament is full (exclude rejected participants)
    const activeParticipants = tournament.participants.filter(p => p.status !== "rejected");
    if (activeParticipants.length >= tournament.totalSlots) {
      console.log("Tournament is full");
      return res.status(400).json({
        success: false,
        message: "Tournament is full",
      });
    }

    // Check if team is already registered
    const alreadyRegistered = tournament.participants.some(
      (p) => p.team.toString() === teamId
    );

    if (alreadyRegistered) {
      console.log("Team already registered");
      return res.status(400).json({
        success: false,
        message: "Team is already registered for this tournament",
      });
    }

    // Verify team exists and user has access to it
    const Team = require("../models/Team");
    const team = await Team.findById(teamId);

    if (!team) {
      console.log("Team not found");
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    console.log("Team found:", team.name);
    console.log("Team owner:", team.owner);
    console.log("Team leader:", team.teamLeader);
    console.log("Team organization:", team.organization);
    console.log("Team games:", team.games);
    console.log("Team game field:", team.game);
    console.log("Tournament game:", tournament.game);

    // Check if team's game matches tournament game
    // First check team.game field (for player-created teams)
    // Then check team.games array (for organization teams with rosters)
    const teamGameMatches = team.game === tournament.game;
    const hasGameRoster = team.games && team.games.some(g => g.game === tournament.game);

    if (!teamGameMatches && !hasGameRoster) {
      console.log("Team game does not match tournament game");
      return res.status(400).json({
        success: false,
        message: `This team is not registered for ${tournament.game}. The team needs to be for the same game as the tournament.`,
      });
    }

    // Check if user is the team owner, team leader, organization owner, or a roster member
    const isOwner = team.owner && team.owner.toString() === req.userId;
    const isTeamLeader = team.teamLeader && team.teamLeader.toString() === req.userId;
    const isOrgOwner = team.organization && team.organization.toString() === req.userId;

    // Check if user is in any game roster
    let isRosterMember = false;
    if (team.games && team.games.length > 0) {
      isRosterMember = team.games.some(game =>
        game.roster && game.roster.some(member =>
          member.player && member.player.toString() === req.userId
        )
      );
    }

    console.log("Permission check:", { isOwner, isTeamLeader, isOrgOwner, isRosterMember });

    if (!isOwner && !isTeamLeader && !isOrgOwner && !isRosterMember) {
      console.log("No permission to register this team");
      return res.status(403).json({
        success: false,
        message: "You do not have permission to register this team",
      });
    }

    // Determine if this is a paid tournament
    const isPaid = tournament.entryFee && tournament.entryFee.amount > 0;

    // For paid tournaments, require payment screenshot
    if (isPaid && !paymentScreenshot) {
      return res.status(400).json({
        success: false,
        message: "Payment screenshot is required for paid tournaments",
      });
    }

    // Validate screenshot size (~500KB max)
    if (paymentScreenshot && paymentScreenshot.length > 700000) {
      return res.status(400).json({
        success: false,
        message: "Screenshot is too large. Please upload an image under 500KB.",
      });
    }

    // Add team to participants
    console.log("Adding team to participants");
    tournament.participants.push({
      team: teamId,
      teamName: team.name,
      registrationDate: new Date(),
      status: isPaid ? "pending_approval" : "registered",
      paymentScreenshot: isPaid ? paymentScreenshot : undefined,
      paymentSubmittedAt: isPaid ? new Date() : undefined,
    });

    await tournament.save();
    console.log("Tournament saved successfully");

    res.status(200).json({
      success: true,
      message: isPaid
        ? "Team registered! Payment is pending verification by the organizer."
        : "Team registered successfully",
      data: {
        tournament,
        isPaidTournament: isPaid,
      },
    });
  } catch (error) {
    console.error("=== Register team error ===");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to register team: " + error.message,
    });
  }
};

// Unregister team from tournament
exports.unregisterTeam = async (req, res) => {
  try {
    const { teamId } = req.body;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Check if registration is still open
    const now = new Date();
    if (now > tournament.registrationEndDate) {
      return res.status(400).json({
        success: false,
        message: "Registration period has ended, cannot unregister",
      });
    }

    // Check if tournament has started
    if (tournament.status === "ongoing" || tournament.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot unregister from a tournament that has started or completed",
      });
    }

    // Find participant index
    const participantIndex = tournament.participants.findIndex(
      (p) => p.team.toString() === teamId
    );

    if (participantIndex === -1) {
      return res.status(400).json({
        success: false,
        message: "Team is not registered for this tournament",
      });
    }

    // Verify user has access to the team
    const Team = require("../models/Team");
    const team = await Team.findById(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const isMember = team.members.some(
      (member) => member.player.toString() === req.userId
    );
    const isLeader = team.teamLeader && team.teamLeader.toString() === req.userId;
    const isOrgOwner = team.organization && team.organization.toString() === req.userId;

    if (!isMember && !isLeader && !isOrgOwner) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to unregister this team",
      });
    }

    // Remove team from participants
    tournament.participants.splice(participantIndex, 1);
    await tournament.save();

    res.status(200).json({
      success: true,
      message: "Team unregistered successfully",
      data: { tournament },
    });
  } catch (error) {
    console.error("Unregister team error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unregister team",
    });
  }
};

// Verify registration (approve/reject) for paid tournaments
exports.verifyRegistration = async (req, res) => {
  try {
    const { action, reason } = req.body;
    const { id: tournamentId, teamId } = req.params;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be 'approve' or 'reject'",
      });
    }

    const tournament = await Tournament.findById(tournamentId);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Check organizer permission
    const { authorized } = await resolveOrgPermission(
      req.userId, req.accountType, tournament.organizer
    );
    if (!authorized) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage this tournament",
      });
    }

    // Find participant
    const participant = tournament.participants.find(
      (p) => p.team.toString() === teamId
    );

    if (!participant) {
      return res.status(404).json({
        success: false,
        message: "Team not found in tournament participants",
      });
    }

    if (action === "approve") {
      if (participant.status !== "pending_approval") {
        return res.status(400).json({
          success: false,
          message: `Cannot approve a participant with status '${participant.status}'`,
        });
      }
      participant.status = "approved";
      participant.approvedAt = new Date();
      participant.approvedBy = req.userId;
    } else {
      if (participant.status !== "pending_approval") {
        return res.status(400).json({
          success: false,
          message: `Cannot reject a participant with status '${participant.status}'`,
        });
      }
      participant.status = "rejected";
      participant.rejectedAt = new Date();
      participant.rejectionReason = reason || "Payment not verified";
    }

    tournament.markModified("participants");
    await tournament.save();

    // Notify the team owner about the registration decision
    try {
      const Team = require("../models/Team");
      const team = await Team.findById(teamId).select("owner");
      if (team?.owner) {
        const isApproved = action === "approve";
        await sendNotification({
          recipientId: team.owner,
          recipientModel: "User",
          type: isApproved ? "tournament_registration_approved" : "tournament_registration_rejected",
          title: isApproved ? "Registration Approved" : "Registration Rejected",
          message: isApproved
            ? `Your team's registration for "${tournament.name}" has been approved. Get ready to compete!`
            : `Your team's registration for "${tournament.name}" was rejected. Reason: ${reason || "Payment not verified"}`,
          link: `/tournament/${tournament._id}`,
          refId: tournament._id,
          refModel: "Tournament",
        });
      }
    } catch (notifErr) {
      console.error("verifyRegistration notification error (non-fatal):", notifErr.message);
    }

    res.status(200).json({
      success: true,
      message: action === "approve"
        ? "Registration approved successfully"
        : "Registration rejected",
      data: { participant },
    });
  } catch (error) {
    console.error("Verify registration error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify registration",
    });
  }
};

// Get payment screenshot for a participant (organizer only)
exports.getPaymentScreenshot = async (req, res) => {
  try {
    const { id: tournamentId, teamId } = req.params;

    const tournament = await Tournament.findById(tournamentId);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Check organizer permission
    const { authorized } = await resolveOrgPermission(
      req.userId, req.accountType, tournament.organizer
    );
    if (!authorized) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view this",
      });
    }

    const participant = tournament.participants.find(
      (p) => p.team.toString() === teamId
    );

    if (!participant || !participant.paymentScreenshot) {
      return res.status(404).json({
        success: false,
        message: "Payment screenshot not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { screenshot: participant.paymentScreenshot },
    });
  } catch (error) {
    console.error("Get payment screenshot error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get payment screenshot",
    });
  }
};

// Update tournament bracket/matches
exports.updateBracket = async (req, res) => {
  try {
    console.log("=== Update Bracket Request ===");
    const { matches } = req.body;
    console.log("Received matches:", JSON.stringify(matches, null, 2));

    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    console.log("Tournament organizer:", tournament.organizer);
    console.log("Request user ID:", req.userId);

    // Check if user is the organizer
    const { authorized: canUpdateBracket } = await resolveOrgPermission(
      req.userId, req.accountType, tournament.organizer
    );
    if (!canUpdateBracket) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage this tournament",
      });
    }

    // Get existing matches to preserve nextMatchWinner/nextMatchLoser
    const existingMatches = tournament.matches || [];
    const existingMatchMap = new Map();
    existingMatches.forEach(m => {
      existingMatchMap.set(m.matchNumber, m);
    });

    // Update matches with safe property access while preserving nextMatchWinner/nextMatchLoser
    tournament.matches = matches.map((match) => {
      try {
        const team1Id = match.team1?.team?._id || match.team1?._id;
        const team1Name = match.team1?.team?.name || match.team1?.name;
        const team2Id = match.team2?.team?._id || match.team2?._id;
        const team2Name = match.team2?.team?.name || match.team2?.name;
        const winnerId = match.winner?.team?._id || match.winner?._id;
        const winnerName = match.winner?.team?.name || match.winner?.name;

        // Preserve nextMatchWinner and nextMatchLoser from existing match
        const existingMatch = existingMatchMap.get(match.matchNumber);

        return {
          matchNumber: match.matchNumber,
          round: match.round,
          bracket: match.bracket || "main",
          participant1: team1Id ? {
            team: team1Id,
            teamName: team1Name,
            status: winnerId === team1Id ? "winner" : "registered",
          } : null,
          participant2: team2Id ? {
            team: team2Id,
            teamName: team2Name,
            status: winnerId === team2Id ? "winner" : "registered",
          } : null,
          winner: winnerId ? {
            team: winnerId,
            teamName: winnerName,
          } : null,
          score: {
            participant1Score: match.score?.team1 || 0,
            participant2Score: match.score?.team2 || 0,
          },
          status: winnerId ? "completed" : "pending",
          // Preserve the nextMatch fields from existing matches OR from incoming match
          nextMatchWinner: match.nextMatchWinner || existingMatch?.nextMatchWinner,
          nextMatchLoser: match.nextMatchLoser || existingMatch?.nextMatchLoser,
        };
      } catch (matchError) {
        console.error("Error processing match:", match, matchError);
        throw matchError;
      }
    });

    console.log("Processed matches:", tournament.matches.length);

    // Use findByIdAndUpdate to avoid version conflicts
    const updatedTournament = await Tournament.findByIdAndUpdate(
      req.params.id,
      { $set: { matches: tournament.matches } },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "Bracket updated successfully",
      data: { tournament: updatedTournament },
    });
  } catch (error) {
    console.error("=== Update bracket error ===");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to update bracket: " + error.message,
    });
  }
};

// Report match result and auto-advance teams
exports.reportMatchResult = async (req, res) => {
  try {
    const { tournamentId, matchNumber } = req.params;
    const { winnerId, participant1Score, participant2Score } = req.body;

    console.log("=== Report Match Result ===");
    console.log("Tournament ID:", tournamentId);
    console.log("Match Number:", matchNumber);
    console.log("Winner ID received:", winnerId);
    console.log("Scores:", { participant1Score, participant2Score });

    if (!winnerId) {
      return res.status(400).json({
        success: false,
        message: "Winner ID is required",
      });
    }

    const tournament = await Tournament.findById(tournamentId);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Check if user is the organizer
    const { authorized: canReport } = await resolveOrgPermission(
      req.userId, req.accountType, tournament.organizer
    );
    if (!canReport) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage this tournament",
      });
    }

    // Find the match
    const matchIndex = tournament.matches.findIndex(
      (m) => m.matchNumber === parseInt(matchNumber)
    );

    if (matchIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    const match = tournament.matches[matchIndex];

    // Validate match is not already completed
    if (match.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Match is already completed",
      });
    }

    // Validate winner is one of the participants
    const participant1Id = match.participant1?.team?.toString();
    const participant2Id = match.participant2?.team?.toString();

    console.log("Match participant1 team:", match.participant1?.team);
    console.log("Match participant2 team:", match.participant2?.team);
    console.log("Participant1 ID (string):", participant1Id);
    console.log("Participant2 ID (string):", participant2Id);
    console.log("Winner ID comparison:", {
      winnerId,
      matchesP1: winnerId === participant1Id,
      matchesP2: winnerId === participant2Id,
    });

    if (winnerId !== participant1Id && winnerId !== participant2Id) {
      console.log("ERROR: Winner ID does not match any participant!");
      return res.status(400).json({
        success: false,
        message: `Winner must be one of the match participants. Received: ${winnerId}, Expected: ${participant1Id} or ${participant2Id}`,
      });
    }

    // Determine winner and loser
    const winnerParticipant = winnerId === participant1Id ? match.participant1 : match.participant2;
    const loserParticipant = winnerId === participant1Id ? match.participant2 : match.participant1;

    // Update match with result
    match.winner = winnerParticipant;
    match.loser = loserParticipant;
    match.score = {
      participant1Score: participant1Score || 0,
      participant2Score: participant2Score || 0,
    };
    match.status = "completed";
    match.completedAt = new Date();

    // Update participant statuses
    if (match.participant1) {
      match.participant1.status = winnerId === participant1Id ? "winner" : "eliminated";
    }
    if (match.participant2) {
      match.participant2.status = winnerId === participant2Id ? "winner" : "eliminated";
    }

    // Auto-advance winner to next match
    if (match.nextMatchWinner) {
      const nextMatchIndex = tournament.matches.findIndex(
        (m) => m.matchNumber === match.nextMatchWinner
      );

      console.log("Auto-advance: nextMatchWinner =", match.nextMatchWinner, "nextMatchIndex =", nextMatchIndex);

      if (nextMatchIndex !== -1) {
        const nextMatch = tournament.matches[nextMatchIndex];

        const advanceData = {
          team: winnerParticipant.team,
          teamName: winnerParticipant.teamName,
          status: "confirmed",
        };

        // Determine which slot to fill (participant1 or participant2)
        if (!nextMatch.participant1 || !nextMatch.participant1.team) {
          tournament.matches[nextMatchIndex].participant1 = advanceData;
          console.log(`Advanced ${winnerParticipant.teamName} to Match #${match.nextMatchWinner} as participant1`);
        } else if (!nextMatch.participant2 || !nextMatch.participant2.team) {
          tournament.matches[nextMatchIndex].participant2 = advanceData;
          console.log(`Advanced ${winnerParticipant.teamName} to Match #${match.nextMatchWinner} as participant2`);
        } else {
          console.log("WARNING: Next match already has both participants filled!");
        }
      }
    }

    // Auto-advance loser to losers bracket (for double elimination)
    if (match.nextMatchLoser && tournament.matchmakingType === "double_elimination") {
      const loserMatchIndex = tournament.matches.findIndex(
        (m) => m.matchNumber === match.nextMatchLoser
      );

      if (loserMatchIndex !== -1) {
        const loserData = {
          team: loserParticipant.team,
          teamName: loserParticipant.teamName,
          status: "confirmed",
        };

        if (!tournament.matches[loserMatchIndex].participant1 || !tournament.matches[loserMatchIndex].participant1.team) {
          tournament.matches[loserMatchIndex].participant1 = loserData;
        } else if (!tournament.matches[loserMatchIndex].participant2 || !tournament.matches[loserMatchIndex].participant2.team) {
          tournament.matches[loserMatchIndex].participant2 = loserData;
        }
      }
    }

    // Check if this was the final match (no nextMatchWinner = finals)
    const isFinalMatch = !match.nextMatchWinner;
    let tournamentCompleted = false;

    if (isFinalMatch) {
      // This is the championship match — crown the winner
      tournament.winner = {
        team: winnerParticipant.team,
        teamName: winnerParticipant.teamName,
      };
      tournament.runnerUp = {
        team: loserParticipant.team,
        teamName: loserParticipant.teamName,
      };
      tournament.status = "completed";
      tournamentCompleted = true;

      // Update winner's participant status
      const winnerParticipantEntry = tournament.participants.find(
        p => p.team.toString() === winnerParticipant.team.toString()
      );
      if (winnerParticipantEntry) {
        winnerParticipantEntry.status = "winner";
        winnerParticipantEntry.placement = 1;
      }

      // Update runner-up's participant status
      const runnerUpEntry = tournament.participants.find(
        p => p.team.toString() === loserParticipant.team.toString()
      );
      if (runnerUpEntry) {
        runnerUpEntry.status = "eliminated";
        runnerUpEntry.placement = 2;
      }

      tournament.markModified('participants');
      console.log(`Tournament completed! Winner: ${winnerParticipant.teamName}, Runner-up: ${loserParticipant.teamName}`);
    }

    console.log("Saving tournament with updated match...");
    tournament.markModified('matches');
    await tournament.save();
    console.log("Tournament saved successfully!");

    // Update team stats after tournament completion
    if (tournamentCompleted) {
      try {
        const Team = require("../models/Team");

        // Update all participating teams' tournamentsPlayed
        for (const participant of tournament.participants) {
          if (participant.team) {
            await Team.findByIdAndUpdate(participant.team, {
              $inc: { "stats.tournamentsPlayed": 1 },
            });
          }
        }

        // Update winner's wins and championships
        if (tournament.winner?.team) {
          await Team.findByIdAndUpdate(tournament.winner.team, {
            $inc: { "stats.wins": 1, "stats.championships": 1 },
          });
        }

        console.log("Team stats updated successfully");
      } catch (statsError) {
        console.error("Error updating team stats (non-fatal):", statsError);
      }
    }

    // Notify all participants when the tournament is completed
    if (tournamentCompleted) {
      try {
        const Team = require("../models/Team");
        for (const participant of tournament.participants) {
          if (!participant.team) continue;
          const team = await Team.findById(participant.team).select("owner");
          if (team?.owner) {
            await sendNotification({
              recipientId: team.owner,
              recipientModel: "User",
              type: "tournament_completed",
              title: "Tournament Completed",
              message: `"${tournament.name}" has concluded. Champion: ${tournament.winner.teamName}. Check the final standings!`,
              link: `/tournament/${tournament._id}/bracket`,
              refId: tournament._id,
              refModel: "Tournament",
            });
          }
        }
      } catch (notifErr) {
        console.error("reportMatchResult tournament_completed notification error (non-fatal):", notifErr.message);
      }
    }

    // Log the updated match state
    const savedMatch = tournament.matches.find(m => m.matchNumber === parseInt(matchNumber));
    console.log("Saved match state:", {
      matchNumber: savedMatch.matchNumber,
      status: savedMatch.status,
      winner: savedMatch.winner?.teamName,
      nextMatchWinner: savedMatch.nextMatchWinner,
    });

    // Log next match state to verify auto-advancement persisted
    if (match.nextMatchWinner) {
      const nextMatchSaved = tournament.matches.find(m => m.matchNumber === match.nextMatchWinner);
      if (nextMatchSaved) {
        console.log("Next match state after save:", {
          matchNumber: nextMatchSaved.matchNumber,
          p1: nextMatchSaved.participant1?.teamName || 'TBD',
          p2: nextMatchSaved.participant2?.teamName || 'TBD',
        });
      }
    }

    res.status(200).json({
      success: true,
      message: tournamentCompleted
        ? `Tournament completed! ${winnerParticipant.teamName} is the champion!`
        : "Match result reported successfully",
      data: {
        tournament,
        tournamentCompleted,
        winner: tournamentCompleted ? tournament.winner : null,
      },
    });
  } catch (error) {
    console.error("Report match result error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to report match result",
    });
  }
};

// Get specific match details
exports.getMatch = async (req, res) => {
  try {
    const { tournamentId, matchNumber } = req.params;

    const tournament = await Tournament.findById(tournamentId)
      .populate("matches.participant1.team", "name tag logo")
      .populate("matches.participant2.team", "name tag logo")
      .populate("matches.winner.team", "name tag logo");

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    const match = tournament.matches.find(
      (m) => m.matchNumber === parseInt(matchNumber)
    );

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { match },
    });
  } catch (error) {
    console.error("Get match error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch match",
    });
  }
};

// Update match schedule
exports.updateMatchSchedule = async (req, res) => {
  try {
    const { tournamentId, matchNumber } = req.params;
    const { scheduledTime, streamUrl } = req.body;

    const tournament = await Tournament.findById(tournamentId);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Check if user is the organizer
    const { authorized: canSchedule } = await resolveOrgPermission(
      req.userId, req.accountType, tournament.organizer
    );
    if (!canSchedule) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage this tournament",
      });
    }

    const matchIndex = tournament.matches.findIndex(
      (m) => m.matchNumber === parseInt(matchNumber)
    );

    if (matchIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    const match = tournament.matches[matchIndex];

    if (scheduledTime) {
      match.scheduledTime = new Date(scheduledTime);
    }

    if (streamUrl !== undefined) {
      match.streamUrl = streamUrl;
    }

    tournament.markModified('matches');
    await tournament.save();

    // Notify both participants when a scheduled time is set
    if (scheduledTime) {
      try {
        const Team = require("../models/Team");
        const participantTeams = [match.participant1, match.participant2].filter(
          (p) => p && p.team
        );
        const formattedTime = new Date(scheduledTime).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        });
        for (const p of participantTeams) {
          const team = await Team.findById(p.team).select("owner");
          if (team?.owner) {
            await sendNotification({
              recipientId: team.owner,
              recipientModel: "User",
              type: "tournament_match_scheduled",
              title: "Match Scheduled",
              message: `Your match in "${tournament.name}" has been scheduled for ${formattedTime}.`,
              link: `/tournament/${tournament._id}/bracket`,
              refId: tournament._id,
              refModel: "Tournament",
            });
          }
        }
      } catch (notifErr) {
        console.error("updateMatchSchedule notification error (non-fatal):", notifErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "Match schedule updated successfully",
      data: { match },
    });
  } catch (error) {
    console.error("Update match schedule error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update match schedule",
    });
  }
};

// Reset match (in case of disputes or errors)
exports.resetMatch = async (req, res) => {
  try {
    const { tournamentId, matchNumber } = req.params;

    const tournament = await Tournament.findById(tournamentId);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Check if user is the organizer
    const { authorized: canReset } = await resolveOrgPermission(
      req.userId, req.accountType, tournament.organizer
    );
    if (!canReset) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage this tournament",
      });
    }

    const matchIndex = tournament.matches.findIndex(
      (m) => m.matchNumber === parseInt(matchNumber)
    );

    if (matchIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    const match = tournament.matches[matchIndex];

    // Reset match to pending state
    match.winner = null;
    match.loser = null;
    match.score = {
      participant1Score: 0,
      participant2Score: 0,
    };
    match.status = "pending";
    match.completedAt = null;

    // Reset participant statuses
    if (match.participant1) {
      match.participant1.status = "confirmed";
    }
    if (match.participant2) {
      match.participant2.status = "confirmed";
    }

    tournament.markModified('matches');
    await tournament.save();

    res.status(200).json({
      success: true,
      message: "Match reset successfully",
      data: { match },
    });
  } catch (error) {
    console.error("Reset match error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset match",
    });
  }
};

module.exports = exports;
