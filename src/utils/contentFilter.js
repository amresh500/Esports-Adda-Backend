const {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} = require("obscenity");

const blocklist = require("../data/blocklist.json");

// ── Setup (runs once at module load) ────────────────────────────────────────

// Build the matcher with the built-in English dataset (~600 words)
// Includes l33t speak, spacing, unicode confusables handling out of the box
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// Build a whitelist set for fast gaming term lookups
const gamingWhitelist = new Set(blocklist.gamingWhitelist.map((w) => w.toLowerCase()));

// Build severe word set for severity classification
const severeWords = new Set(blocklist.severe.map((w) => w.toLowerCase()));

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Check message content for profanity.
 *
 * Uses the `obscenity` package which handles:
 * - 600+ English profanity words
 * - L33t speak (sh1t, f4ck, etc.)
 * - Spacing evasion (f u c k)
 * - Unicode confusables
 * - Duplicate characters (fuuuck)
 *
 * @param {string} text - The raw message content
 * @returns {{ allowed: boolean, severity: "clean"|"mild"|"severe", flagged: boolean, matchedWord: string|null }}
 */
function checkContent(text) {
  // Check if obscenity detects any matches
  if (matcher.hasMatch(text)) {
    const matches = matcher.getAllMatches(text);

    for (const match of matches) {
      // Extract the matched word from the original text
      const matchedText = text.substring(match.startIndex, match.endIndex + 1).toLowerCase();

      // Skip if it's a whitelisted gaming term
      if (gamingWhitelist.has(matchedText)) {
        continue;
      }

      // Check if any severe word is part of the match
      const isSevere = severeWords.has(matchedText) ||
        [...severeWords].some((sw) => matchedText.includes(sw));

      if (isSevere) {
        return {
          allowed: false,
          severity: "severe",
          flagged: false,
          matchedWord: matchedText,
        };
      }

      // Mild profanity — also block
      return {
        allowed: false,
        severity: "mild",
        flagged: false,
        matchedWord: matchedText,
      };
    }
  }

  // Clean
  return {
    allowed: true,
    severity: "clean",
    flagged: false,
    matchedWord: null,
  };
}

module.exports = { checkContent };
