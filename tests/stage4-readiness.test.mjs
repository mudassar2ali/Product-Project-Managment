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
  database.exec("INSERT INTO releases(id,business_id,project_id,name,owner_user_id) VALUES('release-1','REL-0001','project-1','2026.09 Release','user-1')");
}

test("Step 7 schema defines release_readiness_snapshots mirroring the sprint_metric_snapshots shape", async () => {
  const schema = await read("db/schema.ts");
  for (const value of [
    "export const releaseReadinessSnapshots", "uq_release_readiness_source_revision", "idx_release_readiness_release_time",
    "ck_release_readiness_state", "ck_release_readiness_signoff_status", "ck_release_readiness_values",
  ]) assert.match(schema, new RegExp(value));
});

test("generated forward migration 0029 adds release_readiness_snapshots with a foreign key to releases", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0029_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  assert.match(migration, /CREATE TABLE `release_readiness_snapshots`/);
  assert.match(migration, /FOREIGN KEY \(`release_id`\) REFERENCES `releases`/);
  assert.match(migration, /CREATE UNIQUE INDEX `uq_release_readiness_source_revision`/);
});

test("all 30 migrations replay cleanly with referential integrity intact", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 29).length, 30);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("database constraints enforce a controlled readiness/signoff vocabulary, bounded counts and one snapshot per source revision", async () => {
  const { database } = await migratedDatabase();
  seedRelease(database);
  const base = "id,release_id,source_revision,scope_item_count,scope_done_count,uat_test_case_count,uat_passed_count,uat_failed_count,uat_blocked_count,uat_not_executed_count,open_defect_count,critical_open_defect_count,readiness,formula,calculated_at";
  const values = "'snap-1','release-1','rev-1',1,1,0,0,0,0,0,0,0,'READY','stage4-contract@4.0','2026-08-20T00:00:00Z'";
  assert.throws(() => database.exec(`INSERT INTO release_readiness_snapshots(${base}) VALUES('snap-bad','release-1','rev-bad',1,1,0,0,0,0,0,0,0,'NOT_A_STATE','stage4-contract@4.0','2026-08-20T00:00:00Z')`), /CHECK/, "readiness must be a valid state");
  assert.throws(() => database.exec(`INSERT INTO release_readiness_snapshots(${base.replace(",readiness", ",signoff_status,readiness")}) VALUES('snap-bad2','release-1','rev-bad2',1,1,0,0,0,0,0,0,0,'NOT_A_STATUS','READY','stage4-contract@4.0','2026-08-20T00:00:00Z')`), /CHECK/, "signoff_status must be a valid status or null");
  assert.throws(() => database.exec(`INSERT INTO release_readiness_snapshots(${base}) VALUES('snap-bad3','release-1','rev-bad3',1,2,0,0,0,0,0,0,0,'READY','stage4-contract@4.0','2026-08-20T00:00:00Z')`), /CHECK/, "scope_done_count cannot exceed scope_item_count");
  assert.throws(() => database.exec(`INSERT INTO release_readiness_snapshots(${base}) VALUES('snap-bad4','release-1','rev-bad4',1,1,0,0,0,0,0,1,2,'READY','stage4-contract@4.0','2026-08-20T00:00:00Z')`), /CHECK/, "critical_open_defect_count cannot exceed open_defect_count");
  database.exec(`INSERT INTO release_readiness_snapshots(${base}) VALUES(${values})`);
  assert.throws(() => database.exec(`INSERT INTO release_readiness_snapshots(${base}) VALUES('snap-2','release-1','rev-1',1,1,0,0,0,0,0,0,0,'READY','stage4-contract@4.0','2026-08-20T00:01:00Z')`), /UNIQUE/, "one snapshot per (release_id, source_revision)");
  database.close();
});

test("a representative latest-snapshot query for a Release selects the release/time index", async () => {
  const { database } = await migratedDatabase();
  seedRelease(database);
  database.exec("INSERT INTO release_readiness_snapshots(id,release_id,source_revision,scope_item_count,scope_done_count,uat_test_case_count,uat_passed_count,uat_failed_count,uat_blocked_count,uat_not_executed_count,open_defect_count,critical_open_defect_count,readiness,formula,calculated_at) VALUES('snap-1','release-1','rev-1',1,1,0,0,0,0,0,0,0,'READY','stage4-contract@4.0','2026-08-20T00:00:00Z')");
  const plan = (sql, ...parameters) => database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters).map((row) => String(row.detail)).join(" ");
  assert.match(plan("SELECT * FROM release_readiness_snapshots WHERE release_id=? ORDER BY calculated_at DESC,id DESC LIMIT 1", "release-1"), /idx_release_readiness_release_time/);
  database.close();
});

test("the readiness repository scopes UAT evidence to Ready test cases, filters defects to the open lifecycle, and hashes evidence for idempotent snapshots", async () => {
  const source = await read("db/release-readiness.ts");
  for (const value of [
    "calculateReleaseReadiness", "stage4ContractVersion",
    "WHERE c.release_id=? AND t.status='READY'",
    "COALESCE(latest.result,'NOT_EXECUTED')",
    "status NOT IN ('CLOSED','DUPLICATE','DEFERRED')",
    "crypto.subtle.digest(\"SHA-256\"",
    "WHERE release_id=? AND source_revision=?",
    "signoffStatus: null",
    "READINESS_CALCULATE",
  ]) assert.ok(source.includes(value), `missing ${value}`);
});

test("getRelease now surfaces the latest readiness snapshot, fulfilling the endpoint's own documented contract", async () => {
  const source = await read("db/releases.ts");
  assert.match(source, /import \{ getLatestReadinessSnapshot \} from "\.\/release-readiness";/);
  assert.match(source, /readiness: \(await getLatestReadinessSnapshot\(id\)\) \?\? null/);
});

test("the readiness API is permission-scoped, recalculates on demand with a default (200) status, and returns stable no-store responses", async () => {
  const source = await read("app/api/v4/releases/[id]/readiness/route.ts");
  assert.match(source, /authorizeApi\("release\.readiness"\)/);
  assert.match(source, /RELEASE_NOT_FOUND/);
  assert.match(source, /apiHeaders/);
  assert.doesNotMatch(source, /status:\s*201/, "a recalculate-and-return action returns the default status, not a resource-creation 201");
});

test("Stage 4 Release navigation and UI remain unexposed after Step 7", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.doesNotMatch(shell, /label: "Releases"/);
});
