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

function seedRelease(database) {
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','owner@example.test','Owner')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Governed Product','GOV')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Governed Project','GOV-P','product-1')");
  database.exec("INSERT INTO release_environments(id,project_id,code,name,tier) VALUES('env-uat','project-1','UAT','UAT','NON_PROD')");
  database.exec("INSERT INTO release_environments(id,project_id,code,name,tier) VALUES('env-prod','project-1','PRODUCTION','Production','PROD')");
  database.exec("INSERT INTO releases(id,business_id,project_id,name,owner_user_id) VALUES('release-1','REL-0001','project-1','2026.09 Release','user-1')");
}

test("Step 3 schema defines Project-scoped environments and status-guarded deployment evidence", async () => {
  const schema = await read("db/schema.ts");
  for (const value of [
    "export const releaseEnvironments", "export const deploymentRecords",
    "uq_release_environments_project_code", "idx_release_environments_project_active",
    "idx_deployment_records_release_status", "idx_deployment_records_environment",
  ]) assert.match(schema, new RegExp(value.replace(/[()]/g, "\\$&")));
  for (const constraint of ["ck_release_environment_tier", "ck_release_environment_fields", "ck_deployment_status", "ck_deployment_completion", "ck_deployment_rollback", "ck_deployment_rollback_not_self"]) assert.match(schema, new RegExp(constraint));
});

test("generated forward migration 0026 adds release_environments and deployment_records with foreign keys", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0026_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  for (const value of [
    "CREATE TABLE `release_environments`", "CREATE TABLE `deployment_records`",
    "FOREIGN KEY (`release_id`) REFERENCES `releases`", "FOREIGN KEY (`environment_id`) REFERENCES `release_environments`",
    "FOREIGN KEY (`rollback_of_id`) REFERENCES `deployment_records`",
  ]) assert.match(migration, new RegExp(value.replace(/[()`]/g, "\\$&")));
});

test("all 27 migrations replay cleanly with referential integrity intact", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 26).length, 27);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("database constraints enforce environment tier, deployment completion evidence and rollback linkage", async () => {
  const { database } = await migratedDatabase();
  seedRelease(database);
  assert.throws(() => database.exec("INSERT INTO release_environments(id,project_id,code,name,tier) VALUES('env-bad','project-1','BAD','Bad','NOT_A_TIER')"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO release_environments(id,project_id,code,name) VALUES('env-dup','project-1','UAT','Duplicate code')"), /UNIQUE/);
  assert.throws(() => database.exec("INSERT INTO deployment_records(id,release_id,environment_id,status) VALUES('dep-bad','release-1','env-uat','NOT_A_STATUS')"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO deployment_records(id,release_id,environment_id,status) VALUES('dep-1','release-1','env-uat','SUCCEEDED')"), /CHECK/, "SUCCEEDED requires completed_at");
  database.exec("INSERT INTO deployment_records(id,release_id,environment_id,status,completed_at) VALUES('dep-1','release-1','env-uat','SUCCEEDED','2026-08-20T00:00:00Z')");
  assert.throws(() => database.exec("INSERT INTO deployment_records(id,release_id,environment_id,status,completed_at) VALUES('dep-2','release-1','env-uat','ROLLED_BACK','2026-08-21T00:00:00Z')"), /CHECK/, "ROLLED_BACK requires rollback_of_id");
  database.exec("INSERT INTO deployment_records(id,release_id,environment_id,status,completed_at,rollback_of_id) VALUES('dep-2','release-1','env-uat','ROLLED_BACK','2026-08-21T00:00:00Z','dep-1')");
  assert.throws(() => database.exec("UPDATE deployment_records SET rollback_of_id='dep-2' WHERE id='dep-2'"), /CHECK/, "a deployment cannot roll back itself");
  database.close();
});

test("representative deployment queries select their intended indexes", async () => {
  const { database } = await migratedDatabase();
  seedRelease(database);
  database.exec("INSERT INTO deployment_records(id,release_id,environment_id,status,completed_at) VALUES('dep-1','release-1','env-uat','SUCCEEDED','2026-08-20T00:00:00Z')");
  const plan = (sql, ...parameters) => database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters).map((row) => String(row.detail)).join(" ");
  assert.match(plan("SELECT * FROM deployment_records WHERE release_id=? AND status=?", "release-1", "SUCCEEDED"), /idx_deployment_records_release_status/);
  assert.match(plan("SELECT * FROM release_environments WHERE project_id=? AND active=?", "project-1", 1), /idx_release_environments_project_active/);
  database.close();
});

test("deployment repository validates Project-matched environment, completion evidence and rollback target before writing", async () => {
  const source = await read("db/deployments.ts");
  for (const value of [
    "assertDeploymentCompletionConsistent", "assertReleaseTransition",
    "environment.projectId !== release.projectId", "release.status === \"CANCELLED\"",
    "status='SUCCEEDED'", "invalid_rollback_target",
  ]) assert.ok(source.includes(value), `missing ${value}`);
  assert.doesNotMatch(source, /requestBody|responseBody|authorizationHeader/i);
});

test("deployment contract validates environment registration and deployment record input", async () => {
  const source = await read("app/releases/deployment-contract.ts");
  for (const control of [
    "validateEnvironmentRegistrationInput", "validateDeploymentRecordInput", "parseDeploymentStatus", "parseEnvironmentTier",
    "Select an environment.", "A rollback requires the deployment it rolls back.",
  ]) assert.match(source, new RegExp(control.replace(/[.]/g, "\\$&")));
});

test("environment and deployment APIs are permission-scoped and return stable no-store responses", async () => {
  const [environments, deployments] = await Promise.all([
    read("app/api/v4/projects/[id]/environments/route.ts"),
    read("app/api/v4/releases/[id]/deployments/route.ts"),
  ]);
  assert.match(environments, /authorizeApi\("deployment\.view"\)/);
  assert.match(environments, /authorizeApi\("deployment\.record"\)/);
  assert.match(deployments, /authorizeApi\("deployment\.view"\)/);
  assert.match(deployments, /authorizeApi\("deployment\.record"\)/);
  assert.match(deployments, /RELEASE_CANCELLED/);
  assert.match(deployments, /INVALID_ROLLBACK_TARGET/);
  for (const source of [environments, deployments]) assert.match(source, /apiHeaders/);
});

test("Stage 4 Release navigation is wired to the Release Center as of Step 10 (this file's own Step 3 unexposed check is superseded)", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.match(shell, /label: "Releases"/);
});
