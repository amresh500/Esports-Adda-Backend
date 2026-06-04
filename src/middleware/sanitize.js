// Strips MongoDB operator injection from request input.
//
// Blocks the `{ "$ne": null }` / `{ "$gt": "" }` family of payloads that turn
// `User.findOne({ email })` into an auth bypass when `email` is an object.
// Walks req.body and req.params recursively and removes any key that starts
// with `$` or contains `.` (Mongo's two reserved characters).
//
// req.query is left alone — Express 5's default "simple" query parser yields
// string-only values, so nested-operator injection isn't reachable there.

function scrub(value) {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) scrub(value[i]);
    return value;
  }

  for (const key of Object.keys(value)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete value[key];
      continue;
    }
    scrub(value[key]);
  }
  return value;
}

module.exports = function sanitizeMongo(req, _res, next) {
  if (req.body) scrub(req.body);
  if (req.params) scrub(req.params);
  next();
};
