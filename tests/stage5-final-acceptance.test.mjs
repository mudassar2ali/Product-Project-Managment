import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const files = (await readdir(new URL("drizzle/", root))).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const source = await read(`drizzle/${file}`);
    for (const statement of source.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) database.exec(statement);
  }
  return { database, files };
}

test("all Stage 1 through Stage 5 migrations replay without integrity loss, seeding exactly eleven roles", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.at(-1), "0032_stage5_role_assignment_global_scope.sql");
  assert.equal(database.prepare("SELECT COUNT(*) count FROM roles").get().count, 11);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM user_role_assignments").get().count, 0);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  const roleCodes = database.prepare("SELECT code FROM roles ORDER BY code").all().map((row) => row.code);
  assert.deepEqual(roleCodes, [
    "ADMINISTRATOR", "BUSINESS_ANALYST", "COMPLIANCE_LEGAL", "DEVELOPER", "ENGINEERING_LEAD", "EXECUTIVE_VIEWER",
    "FINANCE", "PRODUCT_DEVELOPMENT_MANAGER", "PRODUCT_MANAGER", "QA", "STAKEHOLDER_APPROVER",
  ]);
  database.close();
});

test("navigation exposes Administration as the one authorized Stage 5 entry point, with no future module leaking early", async () => {
  const shell = await read("app/command-center-shell.tsx");
  for (const label of [
    "Dashboard", "Products", "Projects", "Backlog", "Sprints", "BRD / PRD", "Requirements", "Releases",
    "Milestones", "Ideas", "RAID", "Reports", "Integrations", "Audit Trail", "Administration",
  ]) {
    assert.match(shell, new RegExp(`label: "${label.replaceAll("/", "\\/")}"`));
  }
  for (const deferred of ["Market Intelligence", "TAM", "SAM", "SOM", "Financial", "Scorecards", "AI Assistant", "User Deactivation"]) {
    assert.doesNotMatch(shell, new RegExp(`label: "${deferred}"`));
  }
});

test("Stage 5 API surface covers the user directory, role catalog, per-user roles, assign and revoke contracts", async () => {
  const required = [
    "app/api/v5/administration/users/route.ts",
    "app/api/v5/administration/roles/route.ts",
    "app/api/v5/administration/users/[id]/roles/route.ts",
    "app/api/v5/administration/users/[id]/roles/[assignmentId]/route.ts",
  ];
  for (const path of required) assert.ok((await read(path)).length > 80, `${path} is missing`);
});

test("Stage 5 permissions remain atomic, deny-by-default and server enforced -- admin.users/admin.roles granted only to ADMINISTRATOR", async () => {
  const [authorization, helpers] = await Promise.all([read("app/authorization.ts"), read("app/api/v1/api-helpers.ts")]);
  assert.match(authorization, /admin\.users.*admin\.roles.*admin\.settings/);
  assert.match(helpers, /if \(!hasPermission\(principal, permission\)\) return apiError\(403/);
  const nonAdministratorBlocks = authorization.match(/(PRODUCT_DEVELOPMENT_MANAGER|PRODUCT_MANAGER|BUSINESS_ANALYST|ENGINEERING_LEAD|DEVELOPER|QA|FINANCE|COMPLIANCE_LEGAL|STAKEHOLDER_APPROVER):\s*[\s\S]*?(?=\n {2}[A-Z_]+:|\n\})/g) ?? [];
  for (const block of nonAdministratorBlocks) assert.doesNotMatch(block, /"admin\.(users|roles|settings)"/);
  const viewerBlock = authorization.match(/const viewerPermissions[\s\S]*?\];/)?.[0] ?? "";
  assert.doesNotMatch(viewerBlock, /"admin\.(users|roles|settings)"/);
});

test("role assignment is an append, revocation is a real hard DELETE -- never a soft-remove -- with history preserved only in the audit log", async () => {
  const [repository, schema] = await Promise.all([read("db/administration.ts"), read("db/schema.ts")]);
  assert.match(repository, /DELETE FROM user_role_assignments WHERE id=\?/);
  assert.doesNotMatch(repository, /removed_at|is_removed|deleted_at/);
  assert.match(schema, /check\("ck_user_role_assignment_scope_global"/);
  assert.match(schema, /uniqueIndex\("uq_user_role_scope"\)\.on\(table\.userId, table\.roleId, table\.scopeType, table\.scopeId\)/);
});

test("security controls: ROLE_ASSIGN rate limiting, allowlisted roleCode, no mass-assignable columns, duplicate/cross-user protection", async () => {
  const [operations, userRolesRoute, repository] = await Promise.all([
    read("db/operations.ts"),
    read("app/api/v5/administration/users/[id]/roles/route.ts"),
    read("db/administration.ts"),
  ]);
  assert.match(operations, /ROLE_ASSIGN:\s*\{ limit:/);
  assert.match(userRolesRoute, /consumeRateLimit\("ROLE_ASSIGN"/);
  assert.match(repository, /SELECT id FROM roles WHERE code=\?/);
  assert.match(repository, /VALUES \(\?, \?, \?, 'GLOBAL', '\*', \?, \?\)/);
  assert.match(repository, /WHERE a\.id=\? AND a\.user_id=\?/);
  assert.match(repository, /if \(error instanceof Error && \/unique\/i\.test\(error\.message\)\) return \{ kind: "duplicate" as const \}/);
});

test("accessible responsive evidence remains available on the Administration screen without color-only meaning", async () => {
  const [center, css] = await Promise.all([read("app/administration/administration-center.tsx"), read("app/globals.css")]);
  assert.match(center, /aria-modal="true"/);
  assert.match(center, /aria-labelledby="role-panel-title"/);
  assert.match(center, /role="status"/);
  assert.match(center, /aria-label={`Manage roles for/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /role-catalog-grid \{ grid-template-columns:1fr; \}/);
});

test("Stage 5 surfaces real database role data rather than fabricating values", async () => {
  const files = await Promise.all(["app/administration/administration-center.tsx", "db/administration.ts"].map(read));
  const source = files.join("\n");
  assert.doesNotMatch(source, /Math\.random|sample data|lorem ipsum|mock API/i);
});

test("a representative-scale user directory (2,000 users, 2,000 role assignments) remains bounded and indexed", async (context) => {
  const { database } = await migratedDatabase();

  database.exec("BEGIN");
  const insertUser = database.prepare("INSERT INTO users(id,external_user_id,email,display_name) VALUES(?,?,?,?)");
  const roleIds = database.prepare("SELECT id FROM roles ORDER BY code").all().map((row) => row.id);
  const insertAssignment = database.prepare("INSERT INTO user_role_assignments(id,user_id,role_id,scope_type,scope_id,created_by,updated_by) VALUES(?,?,?,'GLOBAL','*','SYSTEM','SYSTEM')");
  for (let index = 0; index < 2_000; index += 1) {
    const userId = `user-${index}`;
    insertUser.run(userId, `external-${index}`, `user${index}@example.test`, `User ${index}`);
    insertAssignment.run(`assignment-${index}`, userId, roleIds[index % roleIds.length]);
  }
  database.exec("COMMIT");

  const resolveStarted = performance.now();
  const resolved = database.prepare(`
    SELECT r.code code FROM user_role_assignments a JOIN roles r ON r.id=a.role_id
    WHERE a.user_id=? AND a.scope_type='GLOBAL' AND a.scope_id='*'
  `).all("user-1000");
  const resolveMs = performance.now() - resolveStarted;

  const directoryStarted = performance.now();
  const directoryPage = database.prepare(`
    SELECT u.id id, (SELECT GROUP_CONCAT(r.code) FROM user_role_assignments a JOIN roles r ON r.id=a.role_id WHERE a.user_id=u.id) roles
    FROM users u ORDER BY u.display_name LIMIT 20 OFFSET 0
  `).all();
  const directoryMs = performance.now() - directoryStarted;

  const resolvePlan = database.prepare(`
    EXPLAIN QUERY PLAN SELECT r.code FROM user_role_assignments a JOIN roles r ON r.id=a.role_id WHERE a.user_id=? AND a.scope_type='GLOBAL' AND a.scope_id='*'
  `).all("user-1000").map((row) => String(row.detail)).join(" ");

  assert.equal(resolved.length, 1);
  assert.equal(directoryPage.length, 20);
  assert.ok(resolveMs < 1_500, `role-resolution query took ${resolveMs}ms`);
  assert.ok(directoryMs < 1_500, `directory-page query took ${directoryMs}ms`);
  assert.match(resolvePlan, /USING (COVERING )?INDEX (idx_user_role_assignments_user|uq_user_role_scope)/);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  context.diagnostic(JSON.stringify({
    users: 2_000, assignments: 2_000,
    roleResolutionQueryMs: Math.round(resolveMs * 100) / 100,
    directoryPageQueryMs: Math.round(directoryMs * 100) / 100,
  }));
  database.close();
});

test("Stage 5 implementation record contains every sequential gate before final acceptance", async () => {
  const record = await read("outputs/STAGE-5-IMPLEMENTATION-RECORD.md");
  for (let step = 1; step <= 5; step += 1) assert.match(record, new RegExp(`## Step ${step} —`));
  assert.match(record, /Acceptance decision:/);
});
