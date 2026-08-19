import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON");
  const files = (await readdir(new URL("drizzle/", root))).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const migration = await read(`drizzle/${file}`);
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) database.exec(statement);
  }
  return { database, files };
}

function seedGraph(database) {
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','pm@example.test','PM')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Governed Product','GOV')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Governed Project','GOV-P','product-1')");
  database.exec("INSERT INTO governance_stakeholders(id,project_id,display_name) VALUES('stakeholder-1','project-1','Alex Approver')");
  database.exec("INSERT INTO governance_stakeholders(id,project_id,display_name) VALUES('stakeholder-2','project-1','Riley Responsible')");
  database.exec("INSERT INTO raci_matrices(id,business_id,project_id,title,created_by,updated_by) VALUES('matrix-1','RACI-0001','project-1','Checkout RACI','user-1','user-1')");
  database.exec("INSERT INTO raci_activities(id,matrix_id,activity_key,name) VALUES('activity-1','matrix-1','BRD_APPROVAL','Approve BRD')");
}

test("Step 9 schema defines RACI stakeholders, matrices, activities and assignments with controlled fields", async () => {
  const schema = await read("db/schema.ts");
  for (const value of [
    "governanceStakeholders", "raciMatrices", "raciActivities", "raciAssignments",
    "uq_raci_matrices_one_draft", "uq_raci_activities_matrix_key", "uq_raci_assignments_activity_stakeholder",
  ]) assert.match(schema, new RegExp(value));
  for (const constraint of [
    "ck_raci_matrix_status", "ck_raci_matrix_lock", "ck_raci_activity_key", "ck_raci_activity_subject", "ck_raci_assignment_responsibility",
  ]) assert.match(schema, new RegExp(constraint));
});

test("generated Step 9 migration creates all four tables with lock-while-not-draft triggers", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0023_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  for (const value of [
    "CREATE TABLE `governance_stakeholders`", "CREATE TABLE `raci_matrices`", "CREATE TABLE `raci_activities`", "CREATE TABLE `raci_assignments`",
    "trg_raci_matrices_transition", "trg_raci_matrices_locked_delete",
    "trg_raci_activities_locked_insert", "trg_raci_activities_locked_update", "trg_raci_activities_locked_delete",
    "trg_raci_assignments_locked_insert", "trg_raci_assignments_locked_delete",
  ]) assert.match(migration, new RegExp(value.replace(/[()]/g, "\\$&")));
});

test("all 24 migrations replay with RACI integrity", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 23).length, 24);
  assert.ok(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count >= 48);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("database allows only one draft matrix per project and blocks a second concurrent draft", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  assert.throws(() => database.exec("INSERT INTO raci_matrices(id,business_id,project_id,title,created_by,updated_by) VALUES('matrix-2','RACI-0002','project-1','Second Draft','user-1','user-1')"), /UNIQUE/);
  database.close();
});

test("activities and assignments are locked once their matrix leaves DRAFT", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  database.exec("INSERT INTO raci_assignments(id,activity_id,stakeholder_id,responsibility) VALUES('assign-1','activity-1','stakeholder-1','ACCOUNTABLE')");
  database.exec("INSERT INTO raci_assignments(id,activity_id,stakeholder_id,responsibility) VALUES('assign-2','activity-1','stakeholder-2','RESPONSIBLE')");
  database.exec("UPDATE raci_matrices SET status='PUBLISHED',published_at=CURRENT_TIMESTAMP WHERE id='matrix-1'");
  assert.throws(() => database.exec("INSERT INTO raci_activities(id,matrix_id,activity_key,name) VALUES('activity-2','matrix-1','LATE_ADD','Too Late')"), /RACI_MATRIX_LOCKED/);
  assert.throws(() => database.exec("UPDATE raci_activities SET name='Renamed' WHERE id='activity-1'"), /RACI_MATRIX_LOCKED/);
  assert.throws(() => database.exec("INSERT INTO raci_assignments(id,activity_id,stakeholder_id,responsibility) VALUES('assign-3','activity-1','stakeholder-1','INFORMED')"), /RACI_MATRIX_LOCKED/);
  assert.throws(() => database.exec("DELETE FROM raci_assignments WHERE id='assign-1'"), /RACI_MATRIX_LOCKED/);
  assert.throws(() => database.exec("DELETE FROM raci_matrices WHERE id='matrix-1'"), /RACI_MATRIX_LOCKED/);
  database.close();
});

test("database rejects an unknown responsibility and a duplicate stakeholder assignment on the same activity", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  assert.throws(() => database.exec("INSERT INTO raci_assignments(id,activity_id,stakeholder_id,responsibility) VALUES('assign-1','activity-1','stakeholder-1','OWNER')"), /CHECK/);
  database.exec("INSERT INTO raci_assignments(id,activity_id,stakeholder_id,responsibility) VALUES('assign-1','activity-1','stakeholder-1','ACCOUNTABLE')");
  assert.throws(() => database.exec("INSERT INTO raci_assignments(id,activity_id,stakeholder_id,responsibility) VALUES('assign-2','activity-1','stakeholder-1','INFORMED')"), /UNIQUE/);
  database.close();
});

test("raci contract validates matrix input, requires unique keys and enforces per-activity publication rules", async () => {
  const source = await read("app/governance/raci-contract.ts");
  for (const control of [
    "validateRaciMatrixPutInput", "validateRaciForPublication",
    "at most one responsibility per activity", "At least one activity is required before publication",
    "exactly one Accountable and at least one Responsible",
  ]) assert.match(source, new RegExp(control.replace(/[.]/g, "\\$&")));
});

test("raci repository resolves stakeholder references, replaces draft content atomically and supersedes on publish", async () => {
  const source = await read("db/raci.ts");
  for (const operation of ["getRaciWorkspace", "putRaciMatrix"]) assert.match(source, new RegExp(operation));
  assert.match(source, /invalid_stakeholder_reference/);
  assert.match(source, /DELETE FROM raci_assignments/);
  assert.match(source, /status='SUPERSEDED'/);
  assert.match(source, /ON CONFLICT\(project_id,display_name\)/);
});

test("RACI API enforces view/manage/publish permissions independently and returns stable errors", async () => {
  const source = await read("app/api/v3/projects/[id]/raci/route.ts");
  assert.match(source, /authorizeApi\("raci\.view"\)/);
  assert.match(source, /authorizeApi\("raci\.manage"\)/);
  assert.match(source, /hasPermission\(context\.principal, "raci\.publish"\)/);
  for (const error of ["VALIDATION_FAILED", "PUBLISH_FORBIDDEN", "PROJECT_NOT_FOUND", "INVALID_STAKEHOLDER_REFERENCE", "VERSION_CONFLICT"]) assert.match(source, new RegExp(error));
  assert.match(source, /apiHeaders\(context\.correlationId\)/);
});

test("RACI remains unexposed in navigation while Feasibility stays absent", async () => {
  const shell = await read("app/command-center-shell.tsx");
  for (const deferred of ["Traceability", "Sign-offs", "RACI", "Feasibility"]) assert.doesNotMatch(shell, new RegExp(`label: "${deferred}"`));
});
