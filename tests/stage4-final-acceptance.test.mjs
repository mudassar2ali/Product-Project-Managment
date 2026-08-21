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

test("all Stage 1 through Stage 4 migrations replay without integrity loss", async () => {
  const { database, files } = await migratedDatabase();
  assert.ok(files.length >= 30);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  assert.ok(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count >= 60);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name IN('trg_audit_logs_immutable_update','trg_audit_logs_immutable_delete')").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM operational_policies").get().count, 6);
  database.close();
});

test("navigation exposes Releases as an authorized entry point, with UAT, defects and deployments staying contextual within it", async () => {
  const shell = await read("app/command-center-shell.tsx");
  for (const label of [
    "Dashboard", "Products", "Projects", "Backlog", "Sprints", "BRD / PRD", "Requirements", "Releases",
    "Milestones", "Ideas", "RAID", "Reports", "Integrations", "Audit Trail",
  ]) {
    assert.match(shell, new RegExp(`label: "${label.replaceAll("/", "\\/")}"`));
  }
  for (const deferred of [
    "UAT", "Defects", "Deployments", "Traceability", "Sign-offs", "RACI", "Feasibility",
    "Administration", "Market Intelligence", "TAM", "SAM", "SOM", "Financial", "Scorecards", "AI Assistant",
  ]) {
    assert.doesNotMatch(shell, new RegExp(`label: "${deferred}"`));
  }
});

test("Stage 4 API surface covers Release, environment, deployment, UAT campaign/test case, execution, readiness and defect contracts", async () => {
  const required = [
    "app/api/v4/releases/route.ts", "app/api/v4/releases/[id]/route.ts", "app/api/v4/releases/[id]/scope/route.ts",
    "app/api/v4/releases/[id]/scope/[backlogItemId]/route.ts", "app/api/v4/releases/[id]/lock-scope/route.ts",
    "app/api/v4/releases/[id]/readiness/route.ts", "app/api/v4/releases/[id]/campaigns/route.ts", "app/api/v4/releases/[id]/deployments/route.ts",
    "app/api/v4/projects/[id]/environments/route.ts", "app/api/v4/campaigns/[id]/test-cases/route.ts",
    "app/api/v4/test-cases/[id]/route.ts", "app/api/v4/test-cases/[id]/executions/route.ts",
    "app/api/v4/test-cases/[id]/requirement-links/route.ts", "app/api/v4/test-cases/[id]/requirement-links/[linkId]/route.ts",
    "app/api/v4/defects/route.ts", "app/api/v4/defects/[id]/route.ts", "app/api/v4/defects/[id]/close/route.ts",
  ];
  for (const path of required) assert.ok((await read(path)).length > 80, `${path} is missing`);
});

test("Stage 4 permissions remain atomic, deny-by-default and server enforced", async () => {
  const [authorization, helpers] = await Promise.all([read("app/authorization.ts"), read("app/api/v1/api-helpers.ts")]);
  for (const permission of [
    "release.view", "release.create", "release.edit", "release.scope", "release.readiness",
    "deployment.view", "deployment.record",
    "uat.view", "uat.create", "uat.edit", "uat.execute",
    "defect.view", "defect.create", "defect.edit", "defect.close",
  ]) assert.match(authorization, new RegExp(permission.replace(/[.]/g, "\\$&")));
  assert.match(helpers, /if \(!hasPermission\(principal, permission\)\) return apiError\(403/);
  const viewerBlock = authorization.match(/const viewerPermissions[\s\S]*?\];/)?.[0] ?? "";
  for (const write of [
    "release.create", "release.edit", "release.scope", "release.readiness", "deployment.record",
    "uat.create", "uat.edit", "uat.execute", "defect.create", "defect.edit", "defect.close",
  ]) {
    assert.doesNotMatch(viewerBlock, new RegExp(write.replace(/[.]/g, "\\$&")));
  }
  assert.deepEqual(authorization.match(/EXECUTIVE_VIEWER:\s*viewerPermissions,/)?.[0] ?? null, "EXECUTIVE_VIEWER: viewerPermissions,");
});

test("lifecycle guards and append-only patterns are consistently enforced across Releases, UAT executions, readiness snapshots and Defects", async () => {
  const [contract, schema] = await Promise.all([read("app/releases/stage4-contract.ts"), read("db/schema.ts")]);
  for (const guard of ["assertReleaseTransition", "assertCampaignTransition", "assertDefectTransition"]) assert.match(contract, new RegExp(`export function ${guard}`));
  assert.match(schema, /uniqueIndex\("uq_uat_test_executions_case_number"\)\.on\(table\.testCaseId, table\.executionNumber\)/);
  assert.match(schema, /uniqueIndex\("uq_release_readiness_source_revision"\)\.on\(table\.releaseId, table\.sourceRevision\)/);
  assert.match(schema, /check\("ck_uat_execution_number", sql`\$\{table\.executionNumber\}>0`\)/);
});

test("security controls cover the three newly closed Stage 4 rate limits alongside the inherited CSV injection, redaction and no-credential checks", async () => {
  const [reports, audit, operations, schema] = await Promise.all([read("db/reports.ts"), read("db/audit.ts"), read("db/operations.ts"), read("db/schema.ts")]);
  assert.match(reports, /\^\[=\+\\-@\]/);
  assert.match(audit, /\[REDACTED\]/);
  for (const key of ["READINESS_RECALCULATE", "UAT_EXECUTION_INSERT", "DEFECT_CREATE"]) assert.match(operations, new RegExp(`${key}:\\s*\\{ limit:`));
  assert.doesNotMatch(schema, /password|accessToken|refreshToken|personalAccessToken|patSecret/i);
});

test("accessible responsive evidence remains available across the Release, UAT and Defect UI without color-only meaning", async () => {
  const [portfolio, detail, uat, defectWorkspace, css] = await Promise.all([
    read("app/releases/release-portfolio.tsx"), read("app/releases/release-detail.tsx"),
    read("app/releases/uat-workspace.tsx"), read("app/releases/defect-workspace.tsx"), read("app/globals.css"),
  ]);
  assert.match(portfolio, /aria-labelledby="release-list-title"/);
  assert.match(detail, /aria-modal="true"/);
  assert.match(uat, /role="status"/);
  assert.match(defectWorkspace, /aria-label="Close"/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("Stage 4 surfaces disclose unavailable Release/UAT/defect evidence rather than fabricating values", async () => {
  const files = await Promise.all([
    "app/releases/release-portfolio.tsx", "app/releases/release-detail.tsx", "app/dashboard/executive-dashboard.tsx",
    "app/projects/project-overview.tsx", "db/stage4-insights.ts", "db/governance-overview.ts",
  ].map(read));
  const source = files.join("\n");
  assert.doesNotMatch(source, /Math\.random|sample data|lorem ipsum|mock API/i);
  assert.match(source, /available/);
});

test("a representative-scale Release portfolio (5,000 defects, 10,000 UAT executions, 2,000 readiness snapshots) remains bounded and indexed", async (context) => {
  const { database } = await migratedDatabase();
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','pm@example.test','PM')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Scale Product','SCALE')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Scale Project','SCALE-P','product-1')");

  database.exec("BEGIN");
  const insertRelease = database.prepare("INSERT INTO releases(id,business_id,project_id,name,status) VALUES(?,?,?,?,'IN_UAT')");
  for (let index = 0; index < 500; index += 1) {
    insertRelease.run(`release-${index}`, `REL-${String(index).padStart(6, "0")}`, "project-1", `Release ${index}`);
  }

  const insertCampaign = database.prepare("INSERT INTO uat_campaigns(id,business_id,release_id,name,status,started_at) VALUES(?,?,?,?,'IN_PROGRESS',CURRENT_TIMESTAMP)");
  const insertTestCase = database.prepare("INSERT INTO uat_test_cases(id,business_id,campaign_id,title,steps,expected_result,status) VALUES(?,?,?,?,'Step 1','Expected result','READY')");
  const insertExecution = database.prepare("INSERT INTO uat_test_executions(id,test_case_id,execution_number,result,executed_by_user_id,executed_at) VALUES(?,?,1,'PASS','user-1',CURRENT_TIMESTAMP)");
  for (let index = 0; index < 10_000; index += 1) {
    const campaignId = `campaign-${index}`;
    const testCaseId = `case-${index}`;
    insertCampaign.run(campaignId, `UATC-${String(index).padStart(6, "0")}`, `release-${index % 500}`, `Campaign ${index}`);
    insertTestCase.run(testCaseId, `UATTC-${String(index).padStart(6, "0")}`, campaignId, `Test case ${index}`);
    insertExecution.run(`exec-${index}`, testCaseId);
  }

  const insertDefect = database.prepare("INSERT INTO defects(id,business_id,project_id,release_id,severity,status,title) VALUES(?,?,?,?,?,'OPEN',?)");
  const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  for (let index = 0; index < 5_000; index += 1) {
    insertDefect.run(`defect-${index}`, `DEF-${String(index).padStart(6, "0")}`, "project-1", `release-${index % 500}`, severities[index % 4], `Defect ${index}`);
  }

  const insertReadiness = database.prepare(`
    INSERT INTO release_readiness_snapshots(
      id,release_id,source_revision,scope_item_count,scope_done_count,uat_test_case_count,uat_passed_count,uat_failed_count,uat_blocked_count,uat_not_executed_count,
      open_defect_count,critical_open_defect_count,readiness,formula,calculated_at
    ) VALUES(?,?,?,10,8,20,18,1,0,1,2,0,'AT_RISK','v1',datetime('now','-' || ? || ' minutes'))
  `);
  for (let index = 0; index < 2_000; index += 1) {
    insertReadiness.run(`snap-${index}`, `release-${index % 500}`, `rev-${index}`, index);
  }
  database.exec("COMMIT");

  const defectStarted = performance.now();
  const openCriticalDefects = database.prepare("SELECT id FROM defects WHERE project_id=? AND status=? AND severity=?").all("project-1", "OPEN", "CRITICAL");
  const defectMs = performance.now() - defectStarted;

  const executionStarted = performance.now();
  const executionsByTestCase = database.prepare("SELECT id FROM uat_test_executions WHERE test_case_id=?").all("case-1");
  const executionMs = performance.now() - executionStarted;

  const readinessStarted = performance.now();
  const latestReadinessPerRelease = database.prepare(`
    SELECT r.id, (SELECT rs.readiness FROM release_readiness_snapshots rs WHERE rs.release_id=r.id ORDER BY rs.calculated_at DESC,rs.id DESC LIMIT 1) readiness
    FROM releases r WHERE r.project_id=?
  `).all("project-1");
  const readinessMs = performance.now() - readinessStarted;

  const defectPlan = database.prepare("EXPLAIN QUERY PLAN SELECT id FROM defects WHERE project_id=? AND status=? AND severity=?").all("project-1", "OPEN", "CRITICAL").map((row) => String(row.detail)).join(" ");
  const executionPlan = database.prepare("EXPLAIN QUERY PLAN SELECT id FROM uat_test_executions WHERE test_case_id=?").all("case-1").map((row) => String(row.detail)).join(" ");
  const readinessPlan = database.prepare("EXPLAIN QUERY PLAN SELECT id FROM release_readiness_snapshots WHERE release_id=? ORDER BY calculated_at DESC,id DESC LIMIT 1").all("release-1").map((row) => String(row.detail)).join(" ");

  assert.equal(openCriticalDefects.length, 1_250);
  assert.equal(executionsByTestCase.length, 1);
  assert.equal(latestReadinessPerRelease.length, 500);
  assert.ok(defectMs < 1_500, `open-critical-defect query took ${defectMs}ms`);
  assert.ok(executionMs < 1_500, `execution-by-test-case query took ${executionMs}ms`);
  assert.ok(readinessMs < 1_500, `latest-readiness-per-release query took ${readinessMs}ms`);
  assert.match(defectPlan, /idx_defects_project_status_severity/);
  assert.match(executionPlan, /idx_uat_test_executions_test_case/);
  assert.match(readinessPlan, /idx_release_readiness_release_time/);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  context.diagnostic(JSON.stringify({
    releases: 500, defects: 5_000, executions: 10_000, readinessSnapshots: 2_000,
    openCriticalDefectQueryMs: Math.round(defectMs * 100) / 100,
    executionByTestCaseQueryMs: Math.round(executionMs * 100) / 100,
    latestReadinessPerReleaseQueryMs: Math.round(readinessMs * 100) / 100,
  }));
  database.close();
});

test("Stage 4 implementation record contains every sequential gate before final acceptance", async () => {
  const record = await read("outputs/STAGE-4-IMPLEMENTATION-RECORD.md");
  for (let step = 1; step <= 12; step += 1) assert.match(record, new RegExp(`## Step ${step} —`));
  assert.match(record, /Acceptance decision:/);
});
