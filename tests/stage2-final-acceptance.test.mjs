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

test("all Stage 1 and Stage 2 migrations replay without integrity loss", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 17).length, 18);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  assert.ok(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count >= 34);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name IN('trg_audit_logs_immutable_update','trg_audit_logs_immutable_delete')").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM operational_policies").get().count, 6);
  database.close();
});

test("release navigation preserves Stage 2 capability and keeps unauthorized future modules absent", async () => {
  const shell = await read("app/command-center-shell.tsx");
  for (const featureLabel of ["Dashboard", "Products", "Projects", "Backlog", "Sprints", "Milestones", "Ideas", "RAID", "Reports", "Integrations", "Audit Trail", "BRD / PRD", "Requirements"]) assert.match(shell, new RegExp(`label: "${featureLabel.replaceAll("/", "\\/")}"`));
  for (const deferred of ["Administration", "Market Intelligence", "TAM", "SAM", "SOM", "Financial", "Scorecards", "Release Management", "AI Assistant"]) assert.doesNotMatch(shell, new RegExp(`label: "${deferred}"`));
  for (const stale of ["Search and notifications are scheduled", "The command center shell is ready", "1 of 18 in progress"]) assert.doesNotMatch(shell, new RegExp(stale));
  assert.match(shell, /Stage 3 build/);
  assert.match(shell, /BRD &amp; PRD authoring active/);
});

test("Stage 2 API surface covers Backlog Story dependency Sprint metric Azure and operations contracts", async () => {
  const required = [
    "app/api/v2/backlog/route.ts", "app/api/v2/backlog/[id]/route.ts", "app/api/v2/backlog/[id]/criteria/route.ts",
    "app/api/v2/backlog/[id]/dependencies/route.ts", "app/api/v2/backlog/[id]/dependencies/[dependencyId]/route.ts",
    "app/api/v2/sprints/route.ts", "app/api/v2/sprints/[id]/route.ts", "app/api/v2/sprints/[id]/items/route.ts",
    "app/api/v2/sprints/[id]/activate/route.ts", "app/api/v2/sprints/[id]/complete/route.ts", "app/api/v2/sprints/[id]/metrics/route.ts",
    "app/api/v2/azure/connections/[id]/mappings/route.ts", "app/api/v2/azure/project-links/[id]/advanced-sync/route.ts", "app/api/v2/operations/route.ts",
  ];
  for (const path of required) assert.ok((await read(path)).length > 80, `${path} is missing`);
});

test("Stage 2 permissions remain atomic deny-by-default and server enforced", async () => {
  const [authorization, helpers, routes] = await Promise.all([
    read("app/authorization.ts"), read("app/api/v1/api-helpers.ts"),
    Promise.all([read("app/api/v2/backlog/route.ts"), read("app/api/v2/sprints/route.ts"), read("app/api/v2/azure/project-links/[id]/advanced-sync/route.ts"), read("app/api/v2/operations/route.ts")]),
  ]);
  for (const permission of ["backlog.view", "backlog.create", "backlog.edit", "backlog.archive", "sprint.view", "sprint.create", "sprint.plan", "sprint.activate", "sprint.complete", "delivery.metrics.view", "integration.sync", "integration.diagnostics"]) assert.match(authorization, new RegExp(permission.replace(".", "\\.")));
  assert.match(helpers, /if \(!hasPermission\(principal, permission\)\) return apiError\(403/);
  assert.match(helpers, /persistedUserId = await ensureAuthenticatedUser/);
  assert.doesNotMatch(authorization.match(/const viewerPermissions[\s\S]*?];/)?.[0] ?? "", /create|edit|archive|plan|activate|complete|sync|configure|diagnostics/);
  assert.match(routes.join("\n"), /authorizeApi\(/);
});

test("local workflow rules preserve hierarchy readiness dependency and Sprint lifecycle evidence", async () => {
  const [contract, backlog, criteria, dependencies, lifecycle, migration] = await Promise.all([
    read("app/delivery/stage2-contract.ts"), read("db/backlog.ts"), read("db/acceptance-criteria.ts"), read("db/backlog-dependencies.ts"), read("db/sprint-lifecycle.ts"), read("drizzle/0011_story_readiness.sql"),
  ]);
  for (const value of ["EPIC", "FEATURE", "STORY", "TASK", "BUG", "allowedParent"]) assert.match(contract, new RegExp(value));
  assert.match(backlog, /before\.origin\s*!==?\s*'LOCAL'/);
  assert.match(criteria, /ACCEPTANCE_CRITERIA_REPLACE/);
  for (const value of ["cycle", "duplicate", "scope", "read_only"]) assert.match(dependencies, new RegExp(value));
  for (const value of ["sprint_baselines", "ACTIVE_SCOPE_ADD", "ACTIVE_SCOPE_REMOVE", "CARRYOVER", "incomplete_dispositions"]) assert.match(lifecycle, new RegExp(value));
  assert.match(migration, /STORY_NOT_READY/);
});

test("Azure boundary is read-only bounded encoded and protects incomplete source evidence", async () => {
  const [provider, sync, route, credential] = await Promise.all([
    read("app/integrations/azure-devops-provider.ts"), read("db/azure-advanced-sync.ts"), read("app/api/v2/azure/project-links/[id]/advanced-sync/route.ts"), read("db/azure-connections.ts"),
  ]);
  assert.match(provider, /https:\/\/dev\.azure\.com/);
  for (const value of ["encodeURIComponent", "pages >= 50", "ids.length < 20000", "ids.slice(index, index + 200)", "x-ms-continuationtoken", "errorPolicy: \"Omit\""]) assert.match(provider, new RegExp(value.replace(/[()+.]/g, "\\$&")));
  assert.doesNotMatch(provider, /method:\s*["'](?:PATCH|PUT|DELETE)["']/);
  for (const value of ["partial_source", "source_missing_at", "idempotent", "AZURE_SOURCE_MISSING", "AZURE_SYNC_LOCK_EXPIRED"]) assert.match(sync, new RegExp(value));
  assert.match(route, /consumeRateLimit\("ADVANCED_SYNC"/);
  assert.match(credential, /Record<string,unknown>\)\[binding\]/);
  assert.doesNotMatch(credential, /NEXT_PUBLIC|localStorage|sessionStorage/);
});

test("security controls cover response isolation audit protection telemetry and safe export", async () => {
  const [proxy, audit, operations, reports, auth, schema] = await Promise.all([read("proxy.ts"), read("db/audit.ts"), read("db/operations.ts"), read("db/reports.ts"), read("app/chatgpt-auth.ts"), read("db/schema.ts")]);
  for (const header of ["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options", "X-Content-Type-Options", "Cross-Origin-Resource-Policy", "Permissions-Policy", "Cache-Control"]) assert.match(proxy, new RegExp(header));
  assert.match(audit, /\[REDACTED\]/);
  assert.match(audit, /replaceAll\("%", "\\\\%"\)/);
  assert.match(operations, /SHA-256/);
  assert.match(operations, /sensitive\.test\(key\)/);
  assert.match(reports, /\^\[=\+\\-@\]/);
  assert.match(auth, /code <= 31 \|\| code === 127/);
  assert.doesNotMatch(schema, /password|accessToken|refreshToken|personalAccessToken|patSecret/i);
});

test("accessible responsive evidence remains available without color-only meaning", async () => {
  const [shell, backlog, sprint, reports, audit, operations, css] = await Promise.all([read("app/command-center-shell.tsx"), read("app/delivery/backlog-center.tsx"), read("app/delivery/sprint-center.tsx"), read("app/reports/report-center.tsx"), read("app/audit/audit-center.tsx"), read("app/operations/operational-control-center.tsx"), read("app/globals.css")]);
  assert.match(shell, /Skip to content/);
  assert.match(shell, /aria-current=/);
  assert.match(backlog, /role=\{mode === "HIERARCHY" \? "treeitem"/);
  assert.match(backlog, /aria-level=\{mode === "HIERARCHY"/);
  assert.match(sprint, /aria-modal="true"/);
  assert.match(reports, /role="img"/);
  assert.match(reports, /<table/);
  assert.match(audit, /event\.key === "Escape"/);
  assert.match(operations, /role="status"/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media \(max-width: 620px\)/);
});

test("production surfaces use persisted APIs and disclose unavailable evidence instead of fake values", async () => {
  const files = await Promise.all(["app/dashboard/executive-dashboard.tsx", "app/products/product-portfolio.tsx", "app/projects/project-portfolio.tsx", "app/delivery/backlog-center.tsx", "app/delivery/sprint-center.tsx", "app/reports/report-center.tsx", "app/operations/operational-control-center.tsx"].map(read));
  const source = files.join("\n");
  assert.doesNotMatch(source, /Math\.random|sample data|lorem ipsum|mock API/i);
  for (const value of ["fetch(\"/api/", "AbortController", "empty", "unavailable"]) assert.match(source.toLowerCase(), new RegExp(value.toLowerCase().replace("(", "\\(")));
});

test("10,000-item hierarchy and 2,000-item Sprint evidence remain bounded and indexed", async (context) => {
  const { database } = await migratedDatabase();
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Scale Product','SCALE')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Scale Project','SCALE-P','product-1')");
  const insertItem = database.prepare("INSERT INTO backlog_items(id,business_id,project_id,parent_id,item_type,origin,title,status,delivery_state) VALUES(?,?,?,?,?,'LOCAL',?,'DRAFT','PROPOSED')");
  database.exec("BEGIN");
  for (let index = 0; index < 10_000; index += 1) {
    const type = index < 100 ? "EPIC" : index < 1_000 ? "FEATURE" : index < 5_000 ? "STORY" : "TASK";
    const parent = index < 100 ? null : index < 1_000 ? `item-${index % 100}` : index < 5_000 ? `item-${100 + (index % 900)}` : `item-${1_000 + (index % 4_000)}`;
    insertItem.run(`item-${index}`, `WORK-${String(index).padStart(5, "0")}`, "project-1", parent, type, `Work item ${index}`);
  }
  database.exec("INSERT INTO sprints(id,business_id,project_id,name,start_date,end_date,status,capacity_hours) VALUES('sprint-1','SPR-00001','project-1','Scale Sprint','2026-08-01','2026-08-14','PLANNED',4000)");
  const insertMembership = database.prepare("INSERT INTO sprint_memberships(id,sprint_id,backlog_item_id,planned_points,planned_hours,sequence) VALUES(?,'sprint-1',?,1,2,?)");
  for (let index = 0; index < 2_000; index += 1) insertMembership.run(`membership-${index}`, `item-${1_000 + index}`, index + 1);
  database.exec("COMMIT");

  const hierarchyStarted = performance.now();
  const hierarchy = database.prepare(`WITH RECURSIVE tree(id,depth,path) AS(SELECT id,0,printf('%08s',business_id) FROM backlog_items WHERE parent_id IS NULL UNION ALL SELECT child.id,tree.depth+1,tree.path||'/'||printf('%08s',child.business_id) FROM backlog_items child JOIN tree ON child.parent_id=tree.id) SELECT item.id,tree.depth,EXISTS(SELECT 1 FROM backlog_items child WHERE child.parent_id=item.id AND child.record_status='ACTIVE') hasChildren FROM backlog_items item JOIN tree ON tree.id=item.id WHERE item.project_id=? AND item.record_status='ACTIVE' ORDER BY tree.path,item.business_id LIMIT 100`).all("project-1");
  const hierarchyMs = performance.now() - hierarchyStarted;

  const sprintStarted = performance.now();
  const sprintEvidence = database.prepare("SELECT membership.id,membership.sequence,item.item_type itemType,item.title,item.blocked,(SELECT COUNT(*) FROM backlog_dependencies dependency JOIN backlog_items predecessor ON predecessor.id=dependency.predecessor_item_id WHERE dependency.successor_item_id=item.id AND dependency.dependency_type IN ('BLOCKS','REQUIRES') AND predecessor.status<>'DONE') unresolvedDependencies FROM sprint_memberships membership JOIN backlog_items item ON item.id=membership.backlog_item_id WHERE membership.sprint_id=? AND membership.removed_at IS NULL ORDER BY membership.sequence").all("sprint-1");
  const sprintMs = performance.now() - sprintStarted;

  const backlogPlan = database.prepare("EXPLAIN QUERY PLAN SELECT id FROM backlog_items WHERE project_id=? AND status='DRAFT' AND record_status='ACTIVE'").all("project-1").map((row) => String(row.detail)).join(" ");
  const sprintPlan = database.prepare("EXPLAIN QUERY PLAN SELECT id FROM sprint_memberships WHERE sprint_id=? AND removed_at IS NULL ORDER BY sequence").all("sprint-1").map((row) => String(row.detail)).join(" ");
  assert.equal(hierarchy.length, 100);
  assert.equal(sprintEvidence.length, 2_000);
  assert.ok(hierarchyMs < 1_500, `hierarchy query took ${hierarchyMs}ms`);
  assert.ok(sprintMs < 1_500, `Sprint evidence query took ${sprintMs}ms`);
  assert.match(backlogPlan, /idx_backlog_items_project_status/);
  assert.match(sprintPlan, /uq_sprint_membership_sequence/);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  context.diagnostic(JSON.stringify({ hierarchyItems: 10_000, hierarchyPageMs: Math.round(hierarchyMs * 100) / 100, sprintItems: 2_000, sprintEvidenceMs: Math.round(sprintMs * 100) / 100 }));
  database.close();
});

test("Stage 2 implementation record contains every sequential gate before final acceptance", async () => {
  const record = await read("outputs/STAGE-2-IMPLEMENTATION-RECORD.md");
  for (let step = 1; step <= 13; step += 1) assert.match(record, new RegExp(`## Step ${step} —`));
  assert.match(record, /Acceptance decision:/);
  assert.match(record, /READY WITH CONDITIONS/);
});
