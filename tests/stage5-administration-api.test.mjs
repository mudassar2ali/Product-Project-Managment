import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Every /api/v5 Administration route enforces admin.users/admin.roles server-side", async () => {
  const [usersRoute, rolesRoute, userRolesRoute, revokeRoute] = await Promise.all([
    read("app/api/v5/administration/users/route.ts"),
    read("app/api/v5/administration/roles/route.ts"),
    read("app/api/v5/administration/users/[id]/roles/route.ts"),
    read("app/api/v5/administration/users/[id]/roles/[assignmentId]/route.ts"),
  ]);
  assert.match(usersRoute, /authorizeApi\("admin\.users"\)/);
  assert.match(rolesRoute, /authorizeApi\("admin\.roles"\)/);
  assert.match(userRolesRoute, /authorizeApi\("admin\.roles"\)/g);
  assert.equal([...userRolesRoute.matchAll(/authorizeApi\("admin\.roles"\)/g)].length, 2, "both GET and POST must authorize");
  assert.match(revokeRoute, /authorizeApi\("admin\.roles"\)/);
});

test("Role assignment is validated against a fixed allowlist and never mass-assigns id/scope/audit columns", async () => {
  const [userRolesRoute, repository] = await Promise.all([
    read("app/api/v5/administration/users/[id]/roles/route.ts"),
    read("db/administration.ts"),
  ]);
  assert.match(userRolesRoute, /typeof roleCode !== "string"/);
  assert.match(repository, /SELECT id FROM roles WHERE code=\?/);
  assert.doesNotMatch(repository, /\bbody\.(id|scopeType|scopeId|createdBy|updatedBy)\b/);
  assert.match(repository, /VALUES \(\?, \?, \?, 'GLOBAL', '\*', \?, \?\)/, "assignment rows are always GLOBAL/* -- never client-supplied scope");
});

test("Role assignment and revocation are audit-logged as ROLE_ASSIGN/ROLE_REVOKE against UserRoleAssignment", async () => {
  const repository = await read("db/administration.ts");
  assert.match(repository, /'UserRoleAssignment', \?, 'ROLE_ASSIGN'/);
  assert.match(repository, /'UserRoleAssignment', \?, 'ROLE_REVOKE'/);
  assert.match(repository, /if \(error instanceof Error && \/unique\/i\.test\(error\.message\)\) return \{ kind: "duplicate" as const \}/);
});

test("Revoking a role assignment scopes the delete to both the assignment id and the user id in the path", async () => {
  const repository = await read("db/administration.ts");
  assert.match(repository, /WHERE a\.id=\? AND a\.user_id=\?/, "a DELETE for an assignment ID that does not belong to :id must not silently succeed against another user's row");
});

test("The role catalog sources names from the roles table and descriptions/permission groups from code, not a live PermissionCode dump", async () => {
  const [repository, authorization] = await Promise.all([read("db/administration.ts"), read("app/authorization.ts")]);
  assert.match(repository, /SELECT code, name FROM roles ORDER BY name/);
  assert.match(authorization, /export const roleDescriptions: Record<RoleCode, string>/);
  assert.match(authorization, /export function summarizePermissionGroups/);
  for (const role of ["ADMINISTRATOR", "PRODUCT_DEVELOPMENT_MANAGER", "PRODUCT_MANAGER", "BUSINESS_ANALYST", "ENGINEERING_LEAD", "DEVELOPER", "QA", "FINANCE", "COMPLIANCE_LEGAL", "STAKEHOLDER_APPROVER", "EXECUTIVE_VIEWER"]) {
    assert.match(authorization, new RegExp(`${role}: "`));
  }
});

test("ROLE_ASSIGN is rate-limited on the write path like every other Stage 1-4 creation endpoint; revoke is not (matching every existing DELETE route)", async () => {
  const [operations, userRolesRoute, revokeRoute] = await Promise.all([
    read("db/operations.ts"),
    read("app/api/v5/administration/users/[id]/roles/route.ts"),
    read("app/api/v5/administration/users/[id]/roles/[assignmentId]/route.ts"),
  ]);
  assert.match(operations, /ROLE_ASSIGN: \{ limit: \d+, windowSeconds: \d+ \}/);
  assert.match(userRolesRoute, /consumeRateLimit\("ROLE_ASSIGN"/);
  assert.doesNotMatch(revokeRoute, /consumeRateLimit/);
});
