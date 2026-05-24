const User = require("../models/User");
const PlayerProfile = require("../models/PlayerProfile");
const jwt = require("jsonwebtoken");
const { sendVerificationEmail } = require("../utils/mailer");

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// Signup Controller
exports.signup = async (req, res) => {
  try {
    const { username, email, password, confirmPassword, profileData } = req.body;

    // Validation
    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message:
          existingUser.email === email
            ? "Email already registered"
            : "Username already taken",
      });
    }

    const verificationToken = require("crypto").randomBytes(32).toString("hex");
    const verificationTokenExpiration = Date.now() + 24*60*60*1000;
    // Create new user
    const user = await User.create({
      username,
      email,
      password,
      verificationToken,
      verificationTokenExpiration,
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5050';
    const url = `${frontendUrl}/verify-email?token=${verificationToken}`;
        // Send verification email via Resend (HTTP API — works on Render, unlike SMTP)
    await sendVerificationEmail({ to: email, username, url });

    // Create player profile with provided data
    if (profileData) {
      const profile = new PlayerProfile({
        user: user._id,
        realName: profileData.realName,
        country: profileData.country,
        isNepal: profileData.isNepal,
      });

      // Add games if provided
      if (profileData.games && Array.isArray(profileData.games)) {
        profile.games = profileData.games.map(game => ({
          game: game.game,
          rank: game.rank,
          role: game.role,
          inGameName: game.inGameName,
          isPrimary: game.isPrimary || false,
        }));
      }

      await profile.save();
    }

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
        },
      },
    });
  } catch (error) {
    console.error("Signup error:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0],
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error during registration",
    });
  }
};

// Login Controller
exports.login = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email/username and password",
      });
    }

    // Find user by email or username
    const user = await User.findOne({
      $or: [{ email: email }, { username: email }],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email/username or password",
      });
    }

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email before logging in. Check your inbox for the verification link.",
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email/username or password",
      });
    }

    // Check if user is banned
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: `Your account has been banned. Reason: ${user.banReason || "Not specified"}`,
      });
    }

    // Check if user is suspended
    if (user.isSuspended && user.suspendedUntil) {
      if (new Date(user.suspendedUntil) > new Date()) {
        return res.status(403).json({
          success: false,
          message: `Your account is suspended until ${new Date(user.suspendedUntil).toLocaleDateString()}`,
        });
      }
      // Suspension expired — auto-clear
      user.isSuspended = false;
      user.suspendedUntil = null;
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token (longer expiry if remember me is checked)
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "your-secret-key-change-in-production",
      { expiresIn: rememberMe ? "30d" : "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          isAdmin: user.isAdmin || false,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

// Get Current User (for protected routes)
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.logout = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.status(200).json({ success: true, message: "Logged out successfully" });
};

exports.verifyEmail = async (req, res) => {
  const { token } = req.params;
  try {
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpiration: { $gt: Date.now() },
    });
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiration = undefined;
    await user.save();

    res
      .status(200)
      .json({ message: "Email verified successfully. You can now log in." });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ message: "Verification failed", error: error.message });
  }
};
