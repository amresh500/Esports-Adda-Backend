// Escapes regex metacharacters so user-supplied strings can be safely embedded
// in a `new RegExp(...)` or Mongoose `{ $regex }` query without enabling ReDoS
// or accidentally matching unintended patterns.
//
//   escapeRegex("a+b*?")  ->  "a\\+b\\*\\?"
//
// Always run user input through this before constructing a regex for search.

function escapeRegex(input) {
  if (typeof input !== "string") return "";
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { escapeRegex };
