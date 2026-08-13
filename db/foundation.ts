import { and, eq } from "drizzle-orm";
import { getDb } from "./index";
import { auditLogs, businessSequences, permissions, rolePermissions, roles, userRoleAssignments, users } from "./schema";

export const foundationTables = {
  users,
  roles,
  permissions,
  rolePermissions,
  userRoleAssignments,
  businessSequences,
  auditLogs,
};

export async function findUserByExternalId(externalUserId: string) {
  return getDb().query.users.findFirst({ where: eq(users.externalUserId, externalUserId) });
}

export async function hasGlobalRole(userId: string, roleId: string) {
  return getDb().query.userRoleAssignments.findFirst({
    where: and(
      eq(userRoleAssignments.userId, userId),
      eq(userRoleAssignments.roleId, roleId),
      eq(userRoleAssignments.scopeType, "GLOBAL"),
      eq(userRoleAssignments.scopeId, "*"),
    ),
  });
}
