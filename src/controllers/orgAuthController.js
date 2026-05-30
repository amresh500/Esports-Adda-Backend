const OrganizationAccount = require("../models/OrganizationAccount");
const Team = require("../models/Team");
const jwt = require("jsonwebtoken");
const { sendVerificationEmail } = require("../utils/mailer");
const { validatePassword } = require("../utils/passwordPolicy");

// Generate JWT Token for organization
const generateToken = (orgId) => {
  return jwt.sign(
    { id: orgId, accountType: "organization" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// Organization Signup Controller
exports.signup = async (req, res) => {
  try {
    const {
      email,
      password,
      confirmPassword,
      organizationName,
      tag,
      country,
      isNepal,
      description,
    } = req.body;

    // Validation
    if (!email || !password || !confirmPassword || !organizationName || !tag) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields (email, password, organization name, and tag)",
      });
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // Enforce password strength
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ success: false, message: pwCheck.message });
    }

    // Check if organization email already exists
    const existingOrgByEmail = await OrganizationAccount.findOne({ email });
    if (existingOrgByEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Check if organization name already exists
    const existingOrgByName = await OrganizationAccount.findOne({
      organizationName: organizationName.trim(),
    });
    if (existingOrgByName) {
      return res.status(400).json({
        success: false,
        message: "Organization name already taken",
      });
    }

    // Check if organization tag already exists
    const existingOrgByTag = await OrganizationAccount.findOne({
      tag: tag.trim().toUpperCase(),
    });
    if (existingOrgByTag) {
      return res.status(400).json({
        success: false,
        message: "Organization tag already taken",
      });
    }

    // Check if tag matches any team name or tag
    const existingTeam = await Team.findOne({
      $or: [
        { name: organizationName.trim() },
        { tag: tag.trim().toUpperCase() },
      ],
    });
    if (existingTeam) {
      return res.status(400).json({
        success: false,
        message: "Organization name or tag conflicts with an existing team. Please choose a different name or tag.",
      });
    }

    const verificationToken = require("crypto").randomBytes(32).toString("hex");
    const verificationTokenExpiration = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Create new organization account
    const organization = await OrganizationAccount.create({
      email,
      password,
      organizationName: organizationName.trim(),
      tag: tag.trim().toUpperCase(),
      country: country || "",
      isNepal: isNepal || false,
      description: description || "",
      verificationToken,
      verificationTokenExpiration,
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5050";
    const url = `${frontendUrl}/verify-organization?token=${verificationToken}`;
    // Send verification email. Failure must NOT 500 the signup — the org
    // account is already created, so we log and let them resend later.
    let emailSent = true;
    try {
      await sendVerificationEmail({
        to: email,
        username: organizationName,
        url,
        accountType: "organization",
      });
    } catch (mailError) {
      emailSent = false;
      console.error("Org verification email failed to send:", mailError.message);
    }

    res.status(201).json({
      success: true,
      message: emailSent
        ? "Organization registered successfully. Please check your email to verify your account."
        : "Organization registered, but we couldn't send the verification email. Please try resending it later.",
      data: {
        emailSent,
        organization: {
          id: organization._id,
          organizationName: organization.organizationName,
          tag: organization.tag,
          email: organization.email,
        },
      },
    });
  } catch (error) {
    console.error("Organization signup error:", error);

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

// Organization Login Controller
exports.login = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    // Find organization by email
    const organization = await OrganizationAccount.findOne({ email });

    if (!organization) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Block deleted accounts — but tell them how to restore.
    if (organization.isDeleted) {
      return res.status(403).json({
        success: false,
        message: "This account has been deleted. You can restore it within 30 days from the login page.",
        code: "ACCOUNT_DELETED",
      });
    }

    // Check if email is verified
    if (!organization.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email before logging in. Check your inbox for the verification link.",
      });
    }

    // Check password
    const isPasswordValid = await organization.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Update last login
    organization.lastLogin = new Date();
    await organization.save();

    // Generate token (longer expiry if remember me is checked)
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const token = jwt.sign(
      { id: organization._id, accountType: "organization" },
      process.env.JWT_SECRET,
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
        organization: {
          id: organization._id,
          organizationName: organization.organizationName,
          tag: organization.tag,
          email: organization.email,
          accountType: "organization",
        },
      },
    });
  } catch (error) {
    console.error("Organization login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

// Get Current Organization (for protected routes)
exports.getCurrentOrganization = async (req, res) => {
  try {
    const organization = await OrganizationAccount.findById(req.userId)
      .select("-password")
      .populate("teams", "name tag games");

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { organization },
    });
  } catch (error) {
    console.error("Get organization error:", error);
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

// Verify Organization Email
exports.verifyEmail = async (req, res) => {
  const { token } = req.params;
  try {
    const organization = await OrganizationAccount.findOne({
      verificationToken: token,
      verificationTokenExpiration: { $gt: Date.now() },
    });

    if (!organization) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    organization.isVerified = true;
    organization.verificationToken = undefined;
    organization.verificationTokenExpiration = undefined;
    await organization.save();

    res.status(200).json({
      success: true,
      message: "Email verified successfully. You can now log in.",
    });
  } catch (error) {
    console.error("Organization verification error:", error);
    res.status(500).json({
      success: false,
      message: "Verification failed",
      error: error.message,
    });
  }
};

// Update Organization Profile
exports.updateProfile = async (req, res) => {
  try {
    const organization = await OrganizationAccount.findById(req.userId);

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    const {
      organizationName,
      tag,
      description,
      country,
      isNepal,
      foundedDate,
      contactEmail,
      contactPhone,
      socialLinks,
    } = req.body;

    // Update fields (organizationName and tag are immutable after creation)
    if (description !== undefined) organization.description = description;
    if (country !== undefined) organization.country = country;
    if (isNepal !== undefined) organization.isNepal = isNepal;
    if (foundedDate !== undefined) organization.foundedDate = foundedDate;
    if (contactEmail !== undefined) organization.contactEmail = contactEmail;
    if (contactPhone !== undefined) organization.contactPhone = contactPhone;
    if (socialLinks !== undefined) organization.socialLinks = socialLinks;

    await organization.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        organization: await OrganizationAccount.findById(req.userId)
          .select("-password")
          .populate("teams", "name tag games"),
      },
    });
  } catch (error) {
    console.error("Update organization profile error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update profile",
    });
  }
};

// Add Staff Member
exports.addStaff = async (req, res) => {
  try {
    const { username, role, department } = req.body;

    if (!username || !role) {
      return res.status(400).json({
        success: false,
        message: "Username and role are required",
      });
    }

    // Resolve permission: org account OR admin staff
    const { resolveOrgPermission } = require("../utils/orgPermission");
    const { authorized, organization } = await resolveOrgPermission(
      req.userId,
      req.accountType
    );

    if (!authorized || !organization) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage staff",
      });
    }

    // Find the user by username
    const User = require("../models/User");
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with that username",
      });
    }

    // Check if user is already a staff member
    const existingStaff = organization.staff.find(
      (s) => s.user.toString() === user._id.toString()
    );

    if (existingStaff) {
      return res.status(400).json({
        success: false,
        message: "User is already a staff member",
      });
    }

    // Add staff member
    organization.staff.push({
      user: user._id,
      username: user.username,
      role,
      department,
      joinedDate: new Date(),
      isActive: true,
    });

    await organization.save();

    // Update or create staff profile
    const StaffProfile = require("../models/StaffProfile");
    let staffProfile = await StaffProfile.findOne({ user: user._id });

    if (staffProfile) {
      staffProfile.currentOrganization = organization._id;
      if (!staffProfile.organizations.includes(organization._id)) {
        staffProfile.organizations.push(organization._id);
      }
      await staffProfile.save();
    } else {
      await StaffProfile.create({
        user: user._id,
        currentOrganization: organization._id,
        currentRole: role,
        organizations: [organization._id],
      });
    }

    res.status(200).json({
      success: true,
      message: "Staff member added successfully",
      data: {
        organization: await OrganizationAccount.findById(organization._id)
          .select("-password")
          .populate("staff.user", "username email"),
      },
    });
  } catch (error) {
    console.error("Add staff error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add staff member",
    });
  }
};

// Remove Staff Member
exports.removeStaff = async (req, res) => {
  try {
    const { userId } = req.params;

    // Resolve permission: org account OR admin staff
    const { resolveOrgPermission } = require("../utils/orgPermission");
    const { authorized, organization } = await resolveOrgPermission(
      req.userId,
      req.accountType
    );

    if (!authorized || !organization) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage staff",
      });
    }

    // Admin staff cannot remove themselves
    if (req.accountType === "user" && userId === req.userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot remove yourself from staff",
      });
    }

    // Find staff member
    const staffIndex = organization.staff.findIndex(
      (s) => s.user.toString() === userId
    );

    if (staffIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found",
      });
    }

    // Remove staff member
    organization.staff.splice(staffIndex, 1);
    await organization.save();

    // Update staff profile
    const StaffProfile = require("../models/StaffProfile");
    const staffProfile = await StaffProfile.findOne({ user: userId });

    if (staffProfile) {
      if (staffProfile.currentOrganization && staffProfile.currentOrganization.toString() === organization._id.toString()) {
        staffProfile.currentOrganization = null;
      }
      staffProfile.organizations = staffProfile.organizations.filter(
        (orgId) => orgId.toString() !== organization._id.toString()
      );
      await staffProfile.save();
    }

    res.status(200).json({
      success: true,
      message: "Staff member removed successfully",
      data: {
        organization: await OrganizationAccount.findById(organization._id)
          .select("-password")
          .populate("staff.user", "username email"),
      },
    });
  } catch (error) {
    console.error("Remove staff error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to remove staff member",
    });
  }
};

// Get organization data for admin staff members
exports.getAdminOrganization = async (req, res) => {
  try {
    const { resolveOrgPermission } = require("../utils/orgPermission");
    const { authorized, organization } = await resolveOrgPermission(
      req.userId,
      req.accountType
    );

    if (!authorized || !organization) {
      return res.status(403).json({
        success: false,
        message: "You are not an admin of any organization",
      });
    }

    const orgData = await OrganizationAccount.findById(organization._id)
      .select("-password")
      .populate("teams", "name tag games");

    res.status(200).json({
      success: true,
      data: { organization: orgData },
    });
  } catch (error) {
    console.error("Get admin organization error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Get all organization accounts (public)
exports.getAllOrganizationAccounts = async (req, res) => {
  try {
    const { search } = req.query;

    let filter = { isActive: { $ne: false } };

    if (search) {
      filter.$or = [
        { organizationName: { $regex: search, $options: "i" } },
        { tag: { $regex: search, $options: "i" } },
      ];
    }

    const organizations = await OrganizationAccount.find(filter)
      .select("-password -verificationToken -verificationTokenExpiration")
      .populate("teams", "name tag game logo")
      .limit(200);

    res.status(200).json({
      success: true,
      data: { organizations, count: organizations.length },
    });
  } catch (error) {
    console.error("Get all organization accounts error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch organizations",
    });
  }
};
