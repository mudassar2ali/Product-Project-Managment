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

test("all Stage 1, 2 and 3 migrations replay without integrity loss", async () => {
  const { database, files } = await migratedDatabase();
  assert.ok(files.length >= 25);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  assert.ok(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count >= 53);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name IN('trg_audit_logs_immutable_update','trg_audit_logs_immutable_delete')").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM operational_policies").get().count, 6);
  database.close();
});

test("release navigation exposes exactly the two authorized Stage 3 entry points and no future module", async () => {
  const shell = await read("app/command-center-shell.tsx");
  for (const label of ["Dashboard", "Products", "Projects", "Backlog", "Sprints", "Milestones", "Ideas", "RAID", "Reports", "Integrations", "Audit Trail", "BRD / PRD", "Requirements"]) {
    assert.match(shell, new RegExp(`label: "${label.replaceAll("/", "\\/")}"`));
  }
  // "Administration" shipped in Stage 5 and is intentionally no longer in this deferred list --
  // every other entry here was still deferred as of Stage 5 and stays checked.
  for (const deferred of ["Traceability", "Sign-offs", "RACI", "Feasibility", "Market Intelligence", "TAM", "SAM", "SOM", "Financial", "Scorecards", "AI Assistant"]) {
    assert.doesNotMatch(shell, new RegExp(`label: "${deferred}"`));
  }
});

test("Stage 3 API surface covers documents, requirements, traceability, sign-off, RACI and feasibility contracts", async () => {
  const required = [
    "app/api/v3/documents/route.ts", "app/api/v3/documents/[id]/route.ts", "app/api/v3/documents/[id]/versions/route.ts",
    "app/api/v3/document-versions/[id]/sections/route.ts", "app/api/v3/document-versions/[id]/submit/route.ts",
    "app/api/v3/requirements/route.ts", "app/api/v3/requirements/[id]/route.ts", "app/api/v3/requirements/[id]/submit/route.ts",
    "app/api/v3/requirements/[id]/relationships/route.ts", "app/api/v3/requirements/[id]/backlog-links/route.ts", "app/api/v3/requirements/[id]/evidence/route.ts",
    "app/api/v3/requirements/[id]/traceability/route.ts", "app/api/v3/traceability/route.ts",
    "app/api/v3/signoffs/route.ts", "app/api/v3/signoff-lanes/[id]/decisions/route.ts", "app/api/v3/signoff-conditions/[id]/route.ts",
    "app/api/v3/projects/[id]/raci/route.ts", "app/api/v3/feasibility/[id]/route.ts", "app/api/v3/feasibility/[id]/submit/route.ts", "app/api/v3/projects/[id]/feasibility/route.ts",
  ];
  for (const path of required) assert.ok((await read(path)).length > 80, `${path} is missing`);
});

test("Stage 3 permissions remain atomic, deny-by-default and server enforced", async () => {
  const [authorization, helpers] = await Promise.all([read("app/authorization.ts"), read("app/api/v1/api-helpers.ts")]);
  for (const permission of [
    "document.view", "document.create", "document.edit", "document.version", "document.submit",
    "requirement.view", "requirement.create", "requirement.edit", "requirement.archive", "requirement.submit", "requirement.link",
    "traceability.view", "traceability.manage", "traceability.evidence", "traceability.export",
    "signoff.view", "signoff.request", "signoff.decide", "signoff.manage", "signoff.waive_condition",
    "raci.view", "raci.manage", "raci.publish", "feasibility.view", "feasibility.edit", "feasibility.submit",
  ]) assert.match(authorization, new RegExp(permission.replace(/[.]/g, "\\$&")));
  assert.match(helpers, /if \(!hasPermission\(principal, permission\)\) return apiError\(403/);
  const viewerBlock = authorization.match(/const viewerPermissions[\s\S]*?\];/)?.[0] ?? "";
  for (const write of ["document.create", "document.edit", "document.submit", "requirement.create", "requirement.edit", "requirement.archive", "requirement.submit", "traceability.manage", "signoff.request", "signoff.decide", "signoff.manage", "raci.manage", "raci.publish", "feasibility.edit", "feasibility.submit"]) {
    assert.doesNotMatch(viewerBlock, new RegExp(write.replace(/[.]/g, "\\$&")));
  }
  assert.deepEqual(authorization.match(/EXECUTIVE_VIEWER:\s*viewerPermissions,/)?.[0] ?? null, "EXECUTIVE_VIEWER: viewerPermissions,");
});

test("governance content-hash-and-lock pattern is consistently enforced across documents, requirements and feasibility", async () => {
  const schema = await read("db/schema.ts");
  for (const constraint of ["ck_governance_version_lock", "ck_requirement_revision_lock", "ck_technical_feasibility_revision_lock"]) {
    assert.match(schema, new RegExp(constraint));
  }
  for (const table of ["ck_signoff_decision_not_self", "ck_signoff_decision_value", "uq_signoff_requests_active_document_version", "uq_signoff_requests_active_requirement_revision", "uq_signoff_requests_active_feasibility_revision"]) {
    assert.match(schema, new RegExp(table));
  }
});

test("security controls cover CSV injection, redaction, rate limiting and no credential exposure across Stage 3 evidence", async () => {
  const [reports, audit, operations, schema] = await Promise.all([read("db/reports.ts"), read("db/audit.ts"), read("db/operations.ts"), read("db/schema.ts")]);
  assert.match(reports, /\^\[=\+\\-@\]/);
  assert.match(audit, /\[REDACTED\]/);
  assert.match(operations, /GOVERNANCE_SUBMIT:\s*\{ limit:/);
  assert.match(operations, /SIGNOFF_DECISION:\s*\{ limit:/);
  assert.match(operations, /TRACEABILITY_QUERY:\s*\{ limit:/);
  assert.doesNotMatch(schema, /password|accessToken|refreshToken|personalAccessToken|patSecret/i);
});

test("accessible responsive evidence remains available across the governance UI without color-only meaning", async () => {
  const [signoff, raci, requirementCenter, traceability, css] = await Promise.all([
    read("app/governance/signoff-panel.tsx"), read("app/governance/raci-panel.tsx"), read("app/governance/requirement-center.tsx"), read("app/governance/traceability-panel.tsx"), read("app/globals.css"),
  ]);
  assert.match(signoff, /aria-modal="true"/);
  assert.match(raci, /<table/);
  assert.match(requirementCenter, /aria-label=/);
  assert.match(traceability, /Coverage gaps/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("Stage 3 surfaces disclose unavailable governance evidence rather than fabricating values", async () => {
  const files = await Promise.all([
    "app/governance/governance-center.tsx", "app/governance/traceability-panel.tsx", "app/projects/project-overview.tsx",
  ].map(read));
  const source = files.join("\n");
  assert.doesNotMatch(source, /Math\.random|sample data|lorem ipsum|mock API/i);
  assert.match(source, /available/);
});

test("20,000-requirement portfolio with 50,000 traceability links and 2,000 pending sign-off lanes remains bounded and indexed", async (context) => {
  const { database } = await migratedDatabase();
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','pm@example.test','PM')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Scale Product','SCALE')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Scale Project','SCALE-P','product-1')");

  database.exec("BEGIN");
  const insertRequirement = database.prepare("INSERT INTO requirements(id,business_id,requirement_type,product_id,project_id) VALUES(?,?,?,?,?)");
  const insertRevision = database.prepare("INSERT INTO requirement_revisions(id,requirement_id,revision_number,title,governance_status) VALUES(?,?,1,?,'DRAFT')");
  for (let index = 0; index < 20_000; index += 1) {
    const id = `req-${index}`;
    insertRequirement.run(id, `REQ-${String(index).padStart(6, "0")}`, "FUNCTIONAL", "product-1", "project-1");
    insertRevision.run(`rev-${index}`, id, `Requirement ${index}`);
  }

  const insertBacklogItem = database.prepare("INSERT INTO backlog_items(id,business_id,project_id,item_type,origin,title,status,delivery_state) VALUES(?,?,?,?,'LOCAL',?,'DONE','DONE')");
  const insertLink = database.prepare("INSERT INTO requirement_backlog_links(id,requirement_id,backlog_item_id,link_type) VALUES(?,?,?,'IMPLEMENTS')");
  for (let index = 0; index < 50_000; index += 1) {
    const itemId = `item-${index}`;
    insertBacklogItem.run(itemId, `WORK-${String(index).padStart(6, "0")}`, "project-1", index % 4 === 0 ? "STORY" : "TASK", `Work item ${index}`);
    insertLink.run(`link-${index}`, `req-${index % 20_000}`, itemId);
  }

  const insertSignoffRequest = database.prepare("INSERT INTO signoff_requests(id,requirement_revision_id,status,requested_by) VALUES(?,?,'PENDING',?)");
  const insertSignoffLane = database.prepare("INSERT INTO signoff_lanes(id,signoff_request_id,lane_type,assigned_approver_user_id,status) VALUES(?,?,'PRODUCT',?,'PENDING')");
  for (let index = 0; index < 2_000; index += 1) {
    database.exec(`UPDATE requirement_revisions SET governance_status='IN_REVIEW',content_hash='${"a".repeat(64)}',submitted_at=CURRENT_TIMESTAMP,approved_at=NULL WHERE id='rev-${index}'`);
    insertSignoffRequest.run(`sr-${index}`, `rev-${index}`, "user-1");
    insertSignoffLane.run(`lane-${index}`, `sr-${index}`, "user-1");
  }
  database.exec("COMMIT");

  const registerStarted = performance.now();
  const registerPage = database.prepare("SELECT r.id FROM requirements r WHERE r.product_id=? AND r.requirement_type=? AND r.record_status='ACTIVE' ORDER BY r.business_id LIMIT 25").all("product-1", "FUNCTIONAL");
  const registerMs = performance.now() - registerStarted;

  const traceabilityStarted = performance.now();
  const traceabilityCoverage = database.prepare(`
    SELECT r.id, (SELECT COUNT(*) FROM requirement_backlog_links l WHERE l.requirement_id=r.id) linkCount
    FROM requirements r WHERE r.product_id=? AND r.record_status='ACTIVE'
  `).all("product-1");
  const traceabilityMs = performance.now() - traceabilityStarted;

  const agingStarted = performance.now();
  const agingLanes = database.prepare("SELECT l.id FROM signoff_lanes l JOIN signoff_requests sr ON sr.id=l.signoff_request_id WHERE l.status IN ('PENDING','UNDER_REVIEW') ORDER BY sr.requested_at DESC").all();
  const agingMs = performance.now() - agingStarted;

  const registerPlan = database.prepare("EXPLAIN QUERY PLAN SELECT id FROM requirements WHERE product_id=? AND requirement_type=? AND record_status='ACTIVE'").all("product-1", "FUNCTIONAL").map((row) => String(row.detail)).join(" ");
  const linkPlan = database.prepare("EXPLAIN QUERY PLAN SELECT id FROM requirement_backlog_links WHERE requirement_id=?").all("req-1").map((row) => String(row.detail)).join(" ");
  const lanePlan = database.prepare("EXPLAIN QUERY PLAN SELECT id FROM signoff_lanes WHERE assigned_approver_user_id=? AND status=?").all("user-1", "PENDING").map((row) => String(row.detail)).join(" ");

  assert.equal(registerPage.length, 25);
  assert.equal(traceabilityCoverage.length, 20_000);
  assert.equal(traceabilityCoverage.reduce((total, row) => total + Number(row.linkCount), 0), 50_000);
  assert.equal(agingLanes.length, 2_000);
  assert.ok(registerMs < 1_500, `requirement register page query took ${registerMs}ms`);
  assert.ok(traceabilityMs < 3_000, `traceability coverage query took ${traceabilityMs}ms`);
  assert.ok(agingMs < 1_500, `approval aging query took ${agingMs}ms`);
  assert.match(registerPlan, /idx_requirements_product_type_status/);
  assert.match(linkPlan, /idx_requirement_backlog_links_requirement/);
  assert.match(lanePlan, /idx_signoff_lanes_approver_status/);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  context.diagnostic(JSON.stringify({ requirements: 20_000, links: 50_000, pendingLanes: 2_000, registerPageMs: Math.round(registerMs * 100) / 100, traceabilityCoverageMs: Math.round(traceabilityMs * 100) / 100, approvalAgingMs: Math.round(agingMs * 100) / 100 }));
  database.close();
});

test("Stage 3 implementation record contains every sequential gate before final acceptance", async () => {
  const record = await read("outputs/STAGE-3-IMPLEMENTATION-RECORD.md");
  for (let step = 1; step <= 13; step += 1) assert.match(record, new RegExp(`## Step ${step} —`));
  assert.match(record, /Acceptance decision:/);
});
