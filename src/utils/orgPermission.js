const OrganizationAccount = require("../models/OrganizationAccount");
const StaffProfile = require("../models/StaffProfile");

/**
 * Resolves whether a user has organization-level permission.
 *
 * Case 1: accountType === "organization" → user IS the org account
 * Case 2: accountType === "user" + orgId → check if user is active Admin staff in that org
 * Case 3: accountType === "user" no orgId → find org from StaffProfile.currentOrganization
 *
 * @param {string} userId - req.userId from auth middleware
 * @param {string} accountType - req.accountType from auth middleware
 * @param {string|null} orgId - optional org ID (e.g. from tournament.organizer)
 * @returns {{ authorized: boolean, organization: object|null, orgId: string|null }}
 */
async function resolveOrgPermission(userId, accountType, orgId = null) {
  // Case 1: Direct organization account
  if (accountType === "organization") {
    const org = await OrganizationAccount.findById(userId);
    if (!org) return { authorized: false, organization: null, orgId: null };

    // If orgId specified, verify it matches this org
    if (orgId && org._id.toString() !== orgId.toString()) {
      return { authorized: false, organization: null, orgId: null };
    }
    return { authorized: true, organization: org, orgId: org._id.toString() };
  }

  // Case 2 & 3: Player user — check if Admin staff
  let targetOrgId = orgId;

  // Case 3: No orgId given, find from staff profile first
  if (!targetOrgId) {
    const staffProfile = await StaffProfile.findOne({ user: userId });
    if (staffProfile && staffProfile.currentOrganization) {
      targetOrgId = staffProfile.currentOrganization;
    }
  }

  // Fallback: If no StaffProfile or currentOrganization, search all orgs for this user as Admin staff
  if (!targetOrgId) {
    const org = await OrganizationAccount.findOne({
      "staff.user": userId,
      "staff.role": "Admin",
    });
    if (!org) return { authorized: false, organization: null, orgId: null };

    const staffEntry = org.staff.find(
      (s) =>
        s.user.toString() === userId.toString() &&
        s.role === "Admin" &&
        s.isActive !== false
    );
    if (!staffEntry) return { authorized: false, organization: null, orgId: null };

    // Auto-fix: create/update StaffProfile so future lookups are fast
    let staffProfile = await StaffProfile.findOne({ user: userId });
    if (staffProfile) {
      staffProfile.currentOrganization = org._id;
      if (!staffProfile.organizations.includes(org._id)) {
        staffProfile.organizations.push(org._id);
      }
      await staffProfile.save();
    } else {
      await StaffProfile.create({
        user: userId,
        currentOrganization: org._id,
        currentRole: staffEntry.role,
        organizations: [org._id],
      });
    }

    return { authorized: true, organization: org, orgId: org._id.toString() };
  }

  // Look up the organization and verify user is active Admin
  const org = await OrganizationAccount.findById(targetOrgId);
  if (!org) return { authorized: false, organization: null, orgId: null };

  const staffEntry = org.staff.find(
    (s) =>
      s.user.toString() === userId.toString() &&
      s.role === "Admin" &&
      s.isActive !== false
  );

  if (!staffEntry) {
    return { authorized: false, organization: null, orgId: null };
  }

  return { authorized: true, organization: org, orgId: org._id.toString() };
}

module.exports = { resolveOrgPermission };
