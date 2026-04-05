const User = require("../models/User");

const adminAuth = async (req, res, next) => {
  try {
    // auth middleware must run first — it sets req.userId and req.accountType
    if (req.accountType !== "user") {
      return res.status(403).json({
        success: false,
        message: "Admin access requires a player account",
      });
    }

    const user = await User.findById(req.userId).select("isAdmin");
    if (!user || !user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Admin access denied",
      });
    }

    next();
  } catch (error) {
    console.error("Admin auth error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = adminAuth;
