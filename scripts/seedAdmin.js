/**
 * Promote an existing user to admin.
 *
 * Usage:
 *   node scripts/seedAdmin.js <email>
 *
 * Example:
 *   node scripts/seedAdmin.js amresh@example.com
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../src/config/db");
const User = require("../src/models/User");

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node scripts/seedAdmin.js <email>");
    process.exit(1);
  }

  await connectDB();

  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  if (user.isAdmin) {
    console.log(`${user.username} (${email}) is already an admin.`);
    process.exit(0);
  }

  user.isAdmin = true;
  await user.save();

  console.log(`✓ ${user.username} (${email}) is now an admin.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
