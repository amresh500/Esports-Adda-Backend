const rateLimit = require("express-rate-limit");

// Global limiter — last-resort flood guard for the whole API.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please slow down." },
});

// Strict limiter for credential-handling endpoints. Counts every hit (success
// or fail) against the IP so attackers can't burn through password guesses.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many auth attempts. Try again in 15 minutes." },
});

// For endpoints that can be used to enumerate users (availability checks,
// forgot-password). Looser than authLimiter but still IP-bound.
const probeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please slow down." },
});

module.exports = { globalLimiter, authLimiter, probeLimiter };
