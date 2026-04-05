const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const admin = require("../controllers/adminController");

// All routes require auth + admin
router.use(auth, adminAuth);

// Dashboard
router.get("/stats", admin.getAdminStats);

// Message Moderation
router.get("/messages/flagged", admin.getFlaggedMessages);
router.patch("/messages/:id/dismiss", admin.dismissReports);
router.patch("/messages/:id/delete", admin.deleteMessageAdmin);
router.patch("/messages/:id/warn-sender", admin.warnMessageSender);

// User Management
router.get("/users", admin.listUsers);
router.get("/users/:id", admin.getUserDetails);
router.post("/users/:id/warn", admin.warnUser);
router.post("/users/:id/suspend", admin.suspendUser);
router.post("/users/:id/ban", admin.banUser);
router.post("/users/:id/unban", admin.unbanUser);
router.post("/users/:id/unsuspend", admin.unsuspendUser);

// Stream Approval
router.get("/streams/pending", admin.getPendingStreams);
router.patch("/streams/:id/approve", admin.approveStream);
router.delete("/streams/:id/reject", admin.rejectStream);

// Tournament Oversight
router.get("/tournaments", admin.listAllTournaments);
router.post("/tournaments/:id/cancel", admin.cancelTournament);
router.post("/tournaments/:id/force-complete", admin.forceCompleteTournament);

// Organization Overview
router.get("/organizations", admin.listOrganizations);
router.get("/organizations/:id", admin.getOrganizationDetails);

// Audit Logs
router.get("/audit-logs", admin.getAuditLogs);

module.exports = router;
