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
  database.exec("INSERT INTO backlog_items(id,business_id,project_id,item_type,title) VALUES('item-1','BL-0001','project-1','STORY','Story one')");
  database.exec("INSERT INTO releases(id,business_id,project_id,name,owner_user_id) VALUES('release-1','REL-0001','project-1','2026.09 Release','user-1')");
}

test("Step 2 schema defines a Release registry with scope items and lifecycle constraints", async () => {
  const schema = await read("db/schema.ts");
  for (const value of [
    "export const releases", "export const releaseScopeItems",
    "uq_releases_business_id", "idx_releases_project_status", "idx_releases_planned_date",
    "uq_release_scope_active", "idx_release_scope_backlog_item", "idx_release_scope_release",
  ]) assert.match(schema, new RegExp(value.replace(/[()]/g, "\\$&")));
  for (const constraint of ["ck_release_type", "ck_release_status", "ck_release_fields", "ck_release_scope_locked_consistency", "ck_release_released_consistency"]) assert.match(schema, new RegExp(constraint));
});

test("generated forward migration 0025 adds releases and release_scope_items with foreign keys", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0025_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  for (const value of [
    "CREATE TABLE `releases`", "CREATE TABLE `release_scope_items`",
    "FOREIGN KEY (`project_id`) REFERENCES `projects`", "FOREIGN KEY (`release_id`) REFERENCES `releases`", "FOREIGN KEY (`backlog_item_id`) REFERENCES `backlog_items`",
    "uq_release_scope_active", "uq_releases_business_id",
  ]) assert.match(migration, new RegExp(value.replace(/[()`]/g, "\\$&")));
});

test("all 26 migrations replay cleanly with referential integrity intact", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 25).length, 26);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("database constraints enforce controlled Release vocabulary and one active scope entry per item", async () => {
  const { database } = await migratedDatabase();
  seedRelease(database);
  assert.throws(() => database.exec("INSERT INTO releases(id,business_id,project_id,name,release_type) VALUES('release-2','REL-0002','project-1','Bad type','NOT_A_TYPE')"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO releases(id,business_id,project_id,name,status) VALUES('release-3','REL-0003','project-1','Bad status','NOT_A_STATUS')"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO releases(id,business_id,project_id,name,status) VALUES('release-4','REL-0004','project-1','Released without date','RELEASED')"), /CHECK/);
  database.exec("INSERT INTO release_scope_items(id,release_id,backlog_item_id) VALUES('scope-1','release-1','item-1')");
  assert.throws(() => database.exec("INSERT INTO release_scope_items(id,release_id,backlog_item_id) VALUES('scope-2','release-1','item-1')"), /UNIQUE/);
  database.exec("UPDATE release_scope_items SET removed_at=CURRENT_TIMESTAMP WHERE id='scope-1'");
  assert.doesNotThrow(() => database.exec("INSERT INTO release_scope_items(id,release_id,backlog_item_id) VALUES('scope-3','release-1','item-1')"));
  database.close();
});

test("representative Release queries select their intended indexes", async () => {
  const { database } = await migratedDatabase();
  seedRelease(database);
  const plan = (sql, ...parameters) => database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters).map((row) => String(row.detail)).join(" ");
  assert.match(plan("SELECT * FROM releases WHERE project_id=? AND status=?", "project-1", "PLANNING"), /idx_releases_project_status/);
  assert.match(plan("SELECT * FROM release_scope_items WHERE release_id=? AND removed_at IS NULL", "release-1"), /idx_release_scope_release|uq_release_scope_active/);
  database.close();
});

test("Release repository allocates business IDs, enforces Project scope and single-active-Release exclusivity", async () => {
  const source = await read("db/releases.ts");
  for (const value of [
    "REL-", "entity_type,next_value,updated_at) VALUES('RELEASE'",
    "status !== \"PLANNING\"", "already_in_another_release",
    "r.status<>'CANCELLED'", "assertReleaseTransition",
  ]) assert.ok(source.includes(value), `missing ${value}`);
  assert.doesNotMatch(source, /requestBody|responseBody|authorizationHeader/i);
});

test("Release contract validates registration, metadata and scope input", async () => {
  const source = await read("app/releases/release-contract.ts");
  for (const control of [
    "validateReleaseRegistrationInput", "validateReleaseMetadataInput", "validateScopeItemInput", "parseReleaseType",
    "Select an active Project.", "Enter a Release name.", "Select a valid Release type.", "Enter a valid planned date.", "Select a Backlog item.",
  ]) assert.match(source, new RegExp(control.replace(/[.]/g, "\\$&")));
  assert.match(source, /isoDate\.test\(plannedDate\)/);
});

test("Release APIs are permission-scoped and use stable no-store responses", async () => {
  const [list, detail, scope, scopeItem, lockScope] = await Promise.all([
    read("app/api/v4/releases/route.ts"),
    read("app/api/v4/releases/[id]/route.ts"),
    read("app/api/v4/releases/[id]/scope/route.ts"),
    read("app/api/v4/releases/[id]/scope/[backlogItemId]/route.ts"),
    read("app/api/v4/releases/[id]/lock-scope/route.ts"),
  ]);
  assert.match(list, /authorizeApi\("release\.view"\)/);
  assert.match(list, /authorizeApi\("release\.create"\)/);
  assert.match(detail, /authorizeApi\("release\.view"\)/);
  assert.match(detail, /authorizeApi\("release\.edit"\)/);
  assert.match(detail, /VERSION_CONFLICT/);
  assert.match(scope, /authorizeApi\("release\.scope"\)/);
  assert.match(scopeItem, /authorizeApi\("release\.scope"\)/);
  assert.match(lockScope, /authorizeApi\("release\.scope"\)/);
  assert.match(lockScope, /RELEASE_STATUS_TRANSITION_INVALID/);
  for (const source of [list, detail, scope, scopeItem, lockScope]) assert.match(source, /apiHeaders/);
});

test("Stage 4 Release navigation is wired to the Release Center as of Step 10 (this file's own Step 2 unexposed check is superseded)", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.match(shell, /label: "Releases"/);
});
