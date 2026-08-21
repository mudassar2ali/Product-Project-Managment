import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test, { after } from "node:test";

// This file is the ONLY test that exercises the real built Worker bundle (dist/server/index.js)
// end to end, including any code path that touches the D1 binding. The bundle's db/*.ts modules
// import `env` from the built-in "cloudflare:workers" module, which only resolves inside an
// actual Workers runtime (workerd) -- plain Node's ESM loader cannot resolve the "cloudflare:"
// URL scheme at all. Earlier revisions of this helper loaded dist/server/index.js with a bare
// `import()` and called `.fetch(request, env, ctx)` directly; that happened to work only because
// no test here had ever previously exercised a route that reaches the DB (every DB-touching route
// was reached only through the in-memory node:sqlite migration-replay tests in the other test
// files, which test SQL/migrations directly rather than through this application's db/*.ts
// modules). Stage 5 Step 2 added a DB-backed role lookup to the SSR home route and to
// authorizeApi(), which every authenticated request now passes through -- so this file now boots
// a real Miniflare (workerd) instance and dispatches requests through it, matching how `wrangler
// dev`/production actually run this Worker, instead of a bare Node import.
let workerReady;

async function walkJsFiles(dir, base = dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkJsFiles(full, base, out);
    else if (/\.m?js$/.test(entry.name)) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

async function createWorker() {
  const { Miniflare } = await import("miniflare");
  const serverRoot = fileURLToPath(new URL("../dist/server/", import.meta.url));
  const wranglerConfig = JSON.parse(await readFile(path.join(serverRoot, "wrangler.json"), "utf8"));
  const [d1Binding] = wranglerConfig.d1_databases;
  if (!d1Binding) throw new Error("dist/server/wrangler.json has no d1_databases binding -- run `npm run build` first.");

  // Enumerate every built .js/.mjs file explicitly (matching wrangler.json's own
  // `{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }` rule for this no_bundle Worker):
  // the app resolves several of its dynamic import() specifiers (RSC references, lazy db/*.ts
  // modules) from a runtime manifest rather than a static string literal, which Miniflare's own
  // static-analysis module discovery cannot follow, so every module has to be listed up front.
  const relativeFiles = await walkJsFiles(serverRoot);
  relativeFiles.sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
  const modules = relativeFiles.map((relativePath) => ({ type: "ESModule", path: path.join(serverRoot, relativePath) }));

  const mf = new Miniflare({
    modules,
    modulesRoot: serverRoot,
    compatibilityDate: wranglerConfig.compatibility_date,
    compatibilityFlags: wranglerConfig.compatibility_flags,
    d1Databases: { [d1Binding.binding]: "rendered-html-test" },
    d1Persist: false,
    serviceBindings: {
      ASSETS: () => new Response("Not found", { status: 404 }),
    },
  });
  await mf.ready;

  // Replay every migration against this test run's isolated, in-memory D1 database -- the same
  // split-on-statement-breakpoint approach the other test files use against node:sqlite (see
  // e.g. tests/stage2-final-acceptance.test.mjs), applied here against a real D1Database instead.
  const db = await mf.getD1Database(d1Binding.binding);
  const migrationsDir = fileURLToPath(new URL("../drizzle/", import.meta.url));
  const migrationFiles = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of migrationFiles) {
    const source = await readFile(path.join(migrationsDir, file), "utf8");
    for (const statement of source.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }

  return { mf, db };
}

function getWorker() {
  workerReady ??= createWorker();
  return workerReady;
}

after(async () => {
  if (!workerReady) return;
  const { mf } = await workerReady;
  await mf.dispose();
});

async function render(path = "/", authenticated = true, init = {}) {
  const { mf } = await getWorker();
  return mf.dispatchFetch(`http://localhost${path}`, {
    // Unlike the bare `worker.fetch(request, env, ctx)` call this replaced, Miniflare's
    // dispatchFetch defaults to following redirects like a normal browser fetch() -- without
    // this, the 307 the app issues to /signin-with-chatgpt gets silently followed and re-rendered
    // (as a 404, since that path isn't an actual page route), rather than being returned so the
    // test below can assert on the raw redirect status and Location header.
    redirect: "manual",
    ...init,
    headers: {
      accept: path.startsWith("/api/") ? "application/json" : "text/html",
      ...(authenticated
        ? {
            "oai-authenticated-user-id": "test-user-1",
            "oai-authenticated-user-email": "alex.morgan@example.com",
            "oai-authenticated-user-full-name": "Alex%20Morgan",
            "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
          }
        : {}),
      ...(init.headers ?? {}),
    },
  });
}

test("server-renders the Stage 1 application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Product Development/);
  assert.match(html, /Command Center/);
  assert.match(html, /Primary navigation/);
  assert.match(html, /Loading portfolio evidence/);
  assert.match(html, /Alex Morgan/);
  assert.match(html, /Sign out/);
  assert.match(html, /single operational view of products, projects, delivery health/i);
  assert.match(html, /Skip to content/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("enforces Product write permission before database access", async () => {
  const response = await render("/api/v1/products", true, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Unauthorized Product", code: "NOPE" }),
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, "FORBIDDEN");
});

test("enforces Project write permission before database access", async () => {
  const response = await render("/api/v1/projects", true, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Unauthorized Project", code: "NOPE", productId: "x" }),
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, "FORBIDDEN");
});

test("redirects anonymous browser requests to the platform sign-in flow", async () => {
  const response = await render("/", false);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/signin-with-chatgpt?return_to=%2F");
});

test("rejects anonymous API access and returns authenticated identity safely", async () => {
  const anonymous = await render("/api/v1/me", false);
  assert.equal(anonymous.status, 401);
  const anonymousBody = await anonymous.json();
  assert.equal(anonymousBody.error.code, "AUTHENTICATION_REQUIRED");
  assert.ok(anonymousBody.error.correlationId);

  const authenticated = await render("/api/v1/me", true);
  assert.equal(authenticated.status, 200);
  const authenticatedBody = await authenticated.json();
  assert.equal(authenticatedBody.data.id, "test-user-1");
  assert.equal(authenticatedBody.data.displayName, "Alex Morgan");
  assert.equal(authenticatedBody.data.email, "alex.morgan@example.com");
  assert.deepEqual(authenticatedBody.data.roles, ["EXECUTIVE_VIEWER"]);
  assert.ok(authenticatedBody.data.permissions.includes("dashboard.view"));
  assert.ok(!authenticatedBody.data.permissions.includes("admin.users"));
});

test("resolves the owner's permanent Administrator override from the database-managed role catalog", async () => {
  const response = await render("/api/v1/me", true, {
    headers: {
      "oai-authenticated-user-id": "owner-user-1",
      "oai-authenticated-user-email": "mudassar2ali@gmail.com",
      "oai-authenticated-user-full-name": "Site%20Owner",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.data.roles.includes("ADMINISTRATOR"));
  assert.ok(body.data.permissions.includes("admin.users"));
  assert.ok(body.data.permissions.includes("admin.roles"));
});

test("resolves a real database role assignment for a non-owner user, and reflects its revocation on the next request", async () => {
  const { db } = await getWorker();
  const userId = "assigned-user-1";

  const beforeAssignment = await render("/api/v1/me", true, {
    headers: {
      "oai-authenticated-user-id": userId,
      "oai-authenticated-user-email": "jordan.lee@example.com",
      "oai-authenticated-user-full-name": "Jordan%20Lee",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    },
  });
  const beforeBody = await beforeAssignment.json();
  assert.deepEqual(beforeBody.data.roles, ["EXECUTIVE_VIEWER"]);
  assert.ok(!beforeBody.data.permissions.includes("release.readiness"));

  // Assign PRODUCT_MANAGER directly through the same user_role_assignments table Step 3's
  // (not-yet-built) assignment API will write to -- this is the "critical journey" scenario from
  // the Stage 5 blueprint's test strategy (Section 19), proving role resolution reads real
  // assignment rows, not just the empty-table default already covered above. `user_role_assignments.
  // user_id` references `users.id`, so the referenced user row has to exist first -- this route
  // (/api/v1/me) never persists one itself (only authorizeApi's identity-persistence path does).
  await db
    .prepare(
      `INSERT INTO users (id, external_user_id, email, display_name, created_by, updated_by)
       VALUES (?, ?, 'jordan.lee@example.com', 'Jordan Lee', 'SYSTEM', 'SYSTEM')`,
    )
    .bind(userId, userId)
    .run();
  await db
    .prepare(
      `INSERT INTO user_role_assignments (id, user_id, role_id, scope_type, scope_id, created_by, updated_by)
       VALUES (?, ?, 'role_product_manager', 'GLOBAL', '*', 'SYSTEM', 'SYSTEM')`,
    )
    .bind(`assignment-${userId}`, userId)
    .run();

  const afterAssignment = await render("/api/v1/me", true, {
    headers: {
      "oai-authenticated-user-id": userId,
      "oai-authenticated-user-email": "jordan.lee@example.com",
      "oai-authenticated-user-full-name": "Jordan%20Lee",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    },
  });
  const afterBody = await afterAssignment.json();
  assert.deepEqual(afterBody.data.roles, ["PRODUCT_MANAGER"]);
  assert.ok(afterBody.data.permissions.includes("release.readiness"));
  assert.ok(!afterBody.data.permissions.includes("admin.users"));

  await db.prepare(`DELETE FROM user_role_assignments WHERE id = ?`).bind(`assignment-${userId}`).run();

  const afterRevocation = await render("/api/v1/me", true, {
    headers: {
      "oai-authenticated-user-id": userId,
      "oai-authenticated-user-email": "jordan.lee@example.com",
      "oai-authenticated-user-full-name": "Jordan%20Lee",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    },
  });
  const revokedBody = await afterRevocation.json();
  assert.deepEqual(revokedBody.data.roles, ["EXECUTIVE_VIEWER"]);
});

const ownerHeaders = {
  "oai-authenticated-user-id": "owner-user-1",
  "oai-authenticated-user-email": "mudassar2ali@gmail.com",
  "oai-authenticated-user-full-name": "Site%20Owner",
  "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
};

test("rejects every /api/v5 Administration route for a caller without admin.users/admin.roles", async () => {
  const list = await render("/api/v5/administration/users");
  assert.equal(list.status, 403);
  const roles = await render("/api/v5/administration/roles");
  assert.equal(roles.status, 403);
  const userRoles = await render("/api/v5/administration/users/test-user-1/roles");
  assert.equal(userRoles.status, 403);
  const assign = await render("/api/v5/administration/users/test-user-1/roles", true, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleCode: "PRODUCT_MANAGER" }),
  });
  assert.equal(assign.status, 403);
  const revoke = await render("/api/v5/administration/users/test-user-1/roles/whatever", true, { method: "DELETE" });
  assert.equal(revoke.status, 403);
});

test("lists users and the eleven-role catalog for an Administrator", async () => {
  const users = await render("/api/v5/administration/users", true, { headers: ownerHeaders });
  assert.equal(users.status, 200);
  const usersBody = await users.json();
  assert.ok(Array.isArray(usersBody.data));
  assert.equal(usersBody.meta.pageSize, 30);

  const roles = await render("/api/v5/administration/roles", true, { headers: ownerHeaders });
  assert.equal(roles.status, 200);
  const rolesBody = await roles.json();
  assert.equal(rolesBody.data.length, 11);
  const productManager = rolesBody.data.find((role) => role.code === "PRODUCT_MANAGER");
  assert.ok(productManager);
  assert.equal(productManager.name, "Product Manager");
  assert.ok(productManager.description.length > 0);
  assert.ok(productManager.permissionGroups.includes("Release"));
});

test("assigns and revokes a role through /api/v5, audit-logs both actions, and rejects duplicates, unknown users/roles, and cross-user assignment IDs", async () => {
  const { db } = await getWorker();
  const userId = "api-target-user-1";
  await db
    .prepare(`INSERT INTO users (id, external_user_id, email, display_name, created_by, updated_by) VALUES (?, ?, 'sam.rivera@example.com', 'Sam Rivera', 'SYSTEM', 'SYSTEM')`)
    .bind(userId, userId)
    .run();

  const assignToUnknownUser = await render("/api/v5/administration/users/no-such-user/roles", true, {
    method: "POST", headers: { ...ownerHeaders, "content-type": "application/json" }, body: JSON.stringify({ roleCode: "PRODUCT_MANAGER" }),
  });
  assert.equal(assignToUnknownUser.status, 404);
  assert.equal((await assignToUnknownUser.json()).error.code, "USER_NOT_FOUND");

  const assignInvalidRole = await render(`/api/v5/administration/users/${userId}/roles`, true, {
    method: "POST", headers: { ...ownerHeaders, "content-type": "application/json" }, body: JSON.stringify({ roleCode: "NOT_A_REAL_ROLE" }),
  });
  assert.equal(assignInvalidRole.status, 422);
  assert.equal((await assignInvalidRole.json()).error.code, "INVALID_ROLE");

  const assign = await render(`/api/v5/administration/users/${userId}/roles`, true, {
    method: "POST", headers: { ...ownerHeaders, "content-type": "application/json" }, body: JSON.stringify({ roleCode: "PRODUCT_MANAGER" }),
  });
  assert.equal(assign.status, 201);
  const assignBody = await assign.json();
  assert.equal(assignBody.data.length, 1);
  assert.equal(assignBody.data[0].roleCode, "PRODUCT_MANAGER");
  const assignmentId = assignBody.data[0].id;

  const duplicate = await render(`/api/v5/administration/users/${userId}/roles`, true, {
    method: "POST", headers: { ...ownerHeaders, "content-type": "application/json" }, body: JSON.stringify({ roleCode: "PRODUCT_MANAGER" }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, "DUPLICATE_ASSIGNMENT");

  const meAfterAssign = await render("/api/v1/me", true, {
    headers: { "oai-authenticated-user-id": userId, "oai-authenticated-user-email": "sam.rivera@example.com", "oai-authenticated-user-full-name": "Sam%20Rivera", "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8" },
  });
  assert.deepEqual((await meAfterAssign.json()).data.roles, ["PRODUCT_MANAGER"]);

  const auditRows = await db.prepare("SELECT action, after_json afterJson FROM audit_logs WHERE entity_type='UserRoleAssignment' AND entity_id=?").bind(assignmentId).all();
  assert.equal(auditRows.results.length, 1);
  assert.equal(auditRows.results[0].action, "ROLE_ASSIGN");
  assert.deepEqual(JSON.parse(auditRows.results[0].afterJson), { userId, roleCode: "PRODUCT_MANAGER" });

  const revokeWrongUser = await render(`/api/v5/administration/users/test-user-1/roles/${assignmentId}`, true, { method: "DELETE", headers: ownerHeaders });
  assert.equal(revokeWrongUser.status, 404);
  assert.equal((await revokeWrongUser.json()).error.code, "ASSIGNMENT_NOT_FOUND");

  const revoke = await render(`/api/v5/administration/users/${userId}/roles/${assignmentId}`, true, { method: "DELETE", headers: ownerHeaders });
  assert.equal(revoke.status, 200);
  assert.deepEqual((await revoke.json()).data, []);

  const meAfterRevoke = await render("/api/v1/me", true, {
    headers: { "oai-authenticated-user-id": userId, "oai-authenticated-user-email": "sam.rivera@example.com", "oai-authenticated-user-full-name": "Sam%20Rivera", "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8" },
  });
  assert.deepEqual((await meAfterRevoke.json()).data.roles, ["EXECUTIVE_VIEWER"]);

  const revokeAuditRows = await db.prepare("SELECT action FROM audit_logs WHERE entity_type='UserRoleAssignment' AND entity_id=? AND action='ROLE_REVOKE'").bind(assignmentId).all();
  assert.equal(revokeAuditRows.results.length, 1);
});

test("keeps the shell accessible and the starter preview removed", async () => {
  const [shell, css, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/command-center-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(shell, /aria-label="Primary navigation"/);
  assert.match(shell, /aria-current=/);
  assert.match(shell, /id="main-content"/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /principal\.roleNames/);
  assert.match(shell, /principal\.permissions\.includes/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /button:focus-visible/);
  assert.match(page, /<CommandCenterShell principal=\{principal\} \/>/);
  assert.match(page, /requireChatGPTUser\("\/"\)/);
  assert.match(page, /requirePermission\(principal, "dashboard\.view"\)/);
  assert.match(layout, /Product Development Command Center/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
