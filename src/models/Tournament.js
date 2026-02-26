const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema({
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
  },
  teamName: String,
  seed: Number,
  checkedIn: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ["registered", "confirmed", "eliminated", "winner"],
    default: "registered",
  },
  placement: Number,
  joinedAt: {
    type: Date,
    default: Date.now,
  },
});

const matchSchema = new mongoose.Schema({
  matchNumber: Number,
  round: Number,
  bracket: {
    type: String,
    enum: ["winners", "losers", "finals", "main"],
    default: "main",
  },
  participant1: participantSchema,
  participant2: participantSchema,
  winner: participantSchema,
  loser: participantSchema,
  score: {
    participant1Score: Number,
    participant2Score: Number,
  },
  scheduledTime: Date,
  status: {
    type: String,
    enum: ["pending", "in_progress", "completed", "cancelled"],
    default: "pending",
  },
  nextMatchWinner: Number, // Match number where winner advances
  nextMatchLoser: Number, // Match number where loser goes (for double elimination)
  streamUrl: String,
  completedAt: Date,
});

const tournamentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100,
    },
    description: {
      type: String,
      maxlength: 2000,
    },
    game: {
      type: String,
      required: true,
      enum: [
        "Valorant",
        "CS2",
        "PUBG Mobile",
        "Dota 2",
        "League of Legends",
        "Free Fire",
        "Mobile Legends",
        "Apex Legends",
        "Call of Duty",
        "Rainbow Six Siege",
        "Other",
      ],
    },
    customGame: {
      type: String, // For when game is "Other"
    },
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizationAccount",
      required: true,
    },
    organizerName: String,
    matchmakingType: {
      type: String,
      required: true,
      enum: [
        "single_elimination",
        "double_elimination",
        "round_robin",
        "swiss",
        "battle_royale",
      ],
    },
    totalSlots: {
      type: Number,
      required: true,
      min: 2,
      max: 128,
    },
    teamSize: {
      type: Number,
      default: 5, // Default for 5v5 games like Valorant, CS2
      min: 1,
      max: 100, // For battle royale
    },
    prizePool: {
      amount: Number,
      currency: {
        type: String,
        default: "NPR",
      },
      distribution: [
        {
          position: Number,
          percentage: Number,
          amount: Number,
        },
      ],
    },
    registrationStartDate: {
      type: Date,
      required: true,
    },
    registrationEndDate: {
      type: Date,
      required: true,
    },
    tournamentStartDate: {
      type: Date,
      required: true,
    },
    tournamentEndDate: Date,
    status: {
      type: String,
      enum: [
        "draft",
        "registration_open",
        "registration_closed",
        "ongoing",
        "completed",
        "cancelled",
      ],
      default: "draft",
    },
    participants: [participantSchema],
    matches: [matchSchema],
    rules: [String],
    requirements: {
      minRank: String,
      region: String,
      isNepalOnly: {
        type: Boolean,
        default: false,
      },
      ageRestriction: Number,
    },
    settings: {
      checkInRequired: {
        type: Boolean,
        default: false,
      },
      checkInDuration: Number, // minutes before match
      autoSchedule: {
        type: Boolean,
        default: false,
      },
      matchDuration: Number, // minutes
      allowSubstitutes: {
        type: Boolean,
        default: true,
      },
      maxSubstitutes: {
        type: Number,
        default: 2,
      },
    },
    banner: String,
    logo: String,
    streamUrl: String,
    discordUrl: String,
    isPublished: {
      type: Boolean,
      default: false,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    tags: [String],
    winner: {
      team: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
      },
      teamName: String,
    },
    runnerUp: {
      team: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
      },
      teamName: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
tournamentSchema.index({ game: 1, status: 1 });
tournamentSchema.index({ organizer: 1, status: 1 });
tournamentSchema.index({ tournamentStartDate: 1 });
tournamentSchema.index({ isPublished: 1, status: 1 });

// Virtual for checking if registration is open
tournamentSchema.virtual("isRegistrationOpen").get(function () {
  const now = new Date();
  return (
    this.status === "registration_open" &&
    now >= this.registrationStartDate &&
    now <= this.registrationEndDate
  );
});

// Virtual for available slots
tournamentSchema.virtual("availableSlots").get(function () {
  return this.totalSlots - this.participants.length;
});

// Virtual for checking if tournament is full
tournamentSchema.virtual("isFull").get(function () {
  return this.participants.length >= this.totalSlots;
});

// Method to generate bracket structure
tournamentSchema.methods.generateBracket = function () {
  const participantCount = this.participants.length;

  if (this.matchmakingType === "single_elimination") {
    return this.generateSingleEliminationBracket(participantCount);
  } else if (this.matchmakingType === "double_elimination") {
    return this.generateDoubleEliminationBracket(participantCount);
  }
  // Add other bracket generation methods as needed
};

tournamentSchema.methods.generateSingleEliminationBracket = function (
  participantCount
) {
  const matches = [];

  // Use next power of 2 as bracket size to handle byes properly
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(participantCount)));
  const rounds = Math.log2(bracketSize);
  const byes = bracketSize - participantCount;
  let matchNumber = 1;

  console.log("=== Generating Single Elimination Bracket ===");
  console.log("Participant count:", participantCount);
  console.log("Bracket size (next power of 2):", bracketSize);
  console.log("Total rounds:", rounds);
  console.log("Byes:", byes);

  // Seed participants: top seeds get byes
  // Byes are distributed to the first N matches in round 1
  const firstRoundMatches = bracketSize / 2;

  // Build match structure for all rounds
  // First, calculate match counts per round
  const matchesPerRound = [];
  let matchesInRound = firstRoundMatches;
  for (let r = 1; r <= rounds; r++) {
    matchesPerRound.push(matchesInRound);
    matchesInRound = matchesInRound / 2;
  }

  // Calculate starting match number for each round
  const roundStartMatch = [0]; // 0-indexed placeholder for round 0
  let cumulative = 1;
  for (let r = 0; r < rounds; r++) {
    roundStartMatch.push(cumulative);
    cumulative += matchesPerRound[r];
  }

  console.log("Matches per round:", matchesPerRound);
  console.log("Round start match numbers:", roundStartMatch);

  // Generate all matches
  for (let round = 1; round <= rounds; round++) {
    const numMatches = matchesPerRound[round - 1];

    for (let i = 0; i < numMatches; i++) {
      const match = {
        matchNumber: matchNumber,
        round: round,
        bracket: "main",
        status: "pending",
      };

      // Assign participants for first round
      if (round === 1) {
        const slot1Index = i * 2;
        const slot2Index = i * 2 + 1;

        // For bye handling: if a slot index >= participantCount, that slot is a bye
        if (slot1Index < participantCount) {
          match.participant1 = {
            team: this.participants[slot1Index].team,
            teamName: this.participants[slot1Index].teamName,
            status: "confirmed",
          };
        }
        if (slot2Index < participantCount) {
          match.participant2 = {
            team: this.participants[slot2Index].team,
            teamName: this.participants[slot2Index].teamName,
            status: "confirmed",
          };
        }
      }

      // Set next match for winner (except for final match)
      if (round < rounds) {
        const nextRoundStart = roundStartMatch[round + 1];
        match.nextMatchWinner = nextRoundStart + Math.floor(i / 2);
        console.log(`Match ${matchNumber}: nextMatchWinner = ${match.nextMatchWinner}`);
      } else {
        console.log(`Match ${matchNumber}: FINAL (no nextMatchWinner)`);
      }

      matches.push(match);
      matchNumber++;
    }
  }

  // Handle byes: auto-advance teams with byes to round 2
  // A bye match is one where only one participant exists (the other slot is empty)
  for (const match of matches) {
    if (match.round !== 1) continue;

    const hasP1 = match.participant1 && match.participant1.team;
    const hasP2 = match.participant2 && match.participant2.team;

    if (hasP1 && !hasP2) {
      // P1 gets a bye — auto-advance to next match
      match.winner = { ...match.participant1.toObject ? match.participant1.toObject() : match.participant1 };
      match.winner.status = "winner";
      match.participant1.status = "winner";
      match.status = "completed";
      match.completedAt = new Date();

      if (match.nextMatchWinner) {
        const nextMatch = matches.find(m => m.matchNumber === match.nextMatchWinner);
        if (nextMatch) {
          if (!nextMatch.participant1 || !nextMatch.participant1.team) {
            nextMatch.participant1 = {
              team: match.participant1.team,
              teamName: match.participant1.teamName,
              status: "confirmed",
            };
          } else if (!nextMatch.participant2 || !nextMatch.participant2.team) {
            nextMatch.participant2 = {
              team: match.participant1.team,
              teamName: match.participant1.teamName,
              status: "confirmed",
            };
          }
        }
      }
      console.log(`Match ${match.matchNumber}: BYE — ${match.participant1.teamName} auto-advanced`);
    } else if (!hasP1 && hasP2) {
      // P2 gets a bye
      match.winner = { ...match.participant2.toObject ? match.participant2.toObject() : match.participant2 };
      match.winner.status = "winner";
      match.participant2.status = "winner";
      match.status = "completed";
      match.completedAt = new Date();

      if (match.nextMatchWinner) {
        const nextMatch = matches.find(m => m.matchNumber === match.nextMatchWinner);
        if (nextMatch) {
          if (!nextMatch.participant1 || !nextMatch.participant1.team) {
            nextMatch.participant1 = {
              team: match.participant2.team,
              teamName: match.participant2.teamName,
              status: "confirmed",
            };
          } else if (!nextMatch.participant2 || !nextMatch.participant2.team) {
            nextMatch.participant2 = {
              team: match.participant2.team,
              teamName: match.participant2.teamName,
              status: "confirmed",
            };
          }
        }
      }
      console.log(`Match ${match.matchNumber}: BYE — ${match.participant2.teamName} auto-advanced`);
    } else if (!hasP1 && !hasP2) {
      // Empty match (both byes) — mark as completed
      match.status = "completed";
      match.completedAt = new Date();
      console.log(`Match ${match.matchNumber}: EMPTY — both slots are byes`);
    }
  }

  console.log("\n=== Generated matches summary ===");
  matches.forEach(m => {
    console.log(`Match ${m.matchNumber} (Round ${m.round}): nextMatchWinner=${m.nextMatchWinner || 'FINAL'}, p1=${m.participant1?.teamName || 'TBD'}, p2=${m.participant2?.teamName || 'TBD'}, status=${m.status}`);
  });

  return matches;
};

tournamentSchema.methods.generateDoubleEliminationBracket = function (
  participantCount
) {
  const matches = [];
  let matchNumber = 1;

  // Calculate winners bracket rounds
  const winnersRounds = Math.ceil(Math.log2(participantCount));

  // WINNERS BRACKET - First Round
  const firstRoundMatches = Math.floor(participantCount / 2);
  let winnersNextRoundStart = firstRoundMatches + 1;

  // Generate Winners Bracket Round 1
  for (let i = 0; i < firstRoundMatches; i++) {
    const match = {
      matchNumber: matchNumber,
      round: 1,
      bracket: "winners",
      status: "pending",
      participant1: this.participants[i * 2] ? {
        team: this.participants[i * 2].team,
        teamName: this.participants[i * 2].teamName,
        status: "confirmed",
      } : null,
      participant2: this.participants[i * 2 + 1] ? {
        team: this.participants[i * 2 + 1].team,
        teamName: this.participants[i * 2 + 1].teamName,
        status: "confirmed",
      } : null,
      nextMatchWinner: winnersNextRoundStart + Math.floor(i / 2),
      // Losers go to first round of losers bracket
      nextMatchLoser: (participantCount - 1) + Math.floor(i / 2) + 1,
    };
    matches.push(match);
    matchNumber++;
  }

  // Generate remaining Winners Bracket rounds
  let currentRoundMatches = Math.ceil(firstRoundMatches / 2);
  let currentRoundStart = winnersNextRoundStart;

  for (let round = 2; round <= winnersRounds; round++) {
    const nextRoundStart = currentRoundStart + currentRoundMatches;

    for (let i = 0; i < currentRoundMatches; i++) {
      const match = {
        matchNumber: currentRoundStart + i,
        round: round,
        bracket: "winners",
        status: "pending",
        participant1: null,
        participant2: null,
      };

      // Set next match for winner (except for winners final)
      if (round < winnersRounds) {
        match.nextMatchWinner = nextRoundStart + Math.floor(i / 2);
      } else {
        // Winners bracket final goes to grand finals
        match.nextMatchWinner = matchNumber + (participantCount - 1) * 2 - firstRoundMatches;
      }

      // Losers from winners bracket go to losers bracket
      const losersRoundOffset = (participantCount - 1) + firstRoundMatches;
      match.nextMatchLoser = losersRoundOffset + (round - 2) * Math.ceil(currentRoundMatches / 2) + i;

      matchNumber++;
    }

    currentRoundMatches = Math.ceil(currentRoundMatches / 2);
    currentRoundStart = nextRoundStart;
  }

  // LOSERS BRACKET
  // Losers bracket has approximately 2 * winnersRounds - 1 rounds
  const losersBracketStart = matchNumber;
  let losersRound = 1;
  let losersMatches = Math.ceil(firstRoundMatches / 2);

  // Generate Losers Bracket rounds
  for (let lr = 0; lr < winnersRounds * 2 - 2; lr++) {
    for (let i = 0; i < losersMatches; i++) {
      const match = {
        matchNumber: matchNumber,
        round: losersRound,
        bracket: "losers",
        status: "pending",
        participant1: null,
        participant2: null,
        nextMatchWinner: matchNumber + losersMatches + (lr % 2 === 0 ? i : Math.floor(i / 2)),
      };

      matches.push(match);
      matchNumber++;
    }

    // Adjust losers matches for next round
    if (lr % 2 === 1) {
      losersMatches = Math.ceil(losersMatches / 2);
    }
    losersRound++;

    if (losersMatches === 0) break;
  }

  // GRAND FINALS
  const grandFinalsMatch = {
    matchNumber: matchNumber,
    round: 1,
    bracket: "finals",
    status: "pending",
    participant1: null, // Winner from winners bracket
    participant2: null, // Winner from losers bracket
  };
  matches.push(grandFinalsMatch);

  return matches;
};

// Auto-update status based on dates
tournamentSchema.methods.updateStatus = function () {
  const now = new Date();

  if (this.status === "draft" && now >= this.registrationStartDate) {
    this.status = "registration_open";
  } else if (
    this.status === "registration_open" &&
    now > this.registrationEndDate
  ) {
    this.status = "registration_closed";
  } else if (
    this.status === "registration_closed" &&
    now >= this.tournamentStartDate
  ) {
    this.status = "ongoing";
  } else if (this.tournamentEndDate && now > this.tournamentEndDate) {
    this.status = "completed";
  }

  return this.status;
};

module.exports = mongoose.model("Tournament", tournamentSchema);
