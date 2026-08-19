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

function seedDocument(database) {
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','owner@example.test','Owner')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Governed Product','GOV')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Governed Project','GOV-P','product-1')");
  database.exec("INSERT INTO governance_documents(id,business_id,document_type,product_id,project_id,title,owner_user_id) VALUES('document-1','BRD-0001','BRD','product-1','project-1','Customer onboarding BRD','user-1')");
  database.exec("INSERT INTO governance_document_versions(id,document_id,version_label,major_version,minor_version,lifecycle_status,change_summary) VALUES('version-1','document-1','Draft 0.1',0,1,'DRAFT','Initial governed draft')");
  database.exec("INSERT INTO governance_document_sections(id,document_version_id,section_key,heading,sequence,content_text,completion_status) VALUES('section-1','version-1','EXECUTIVE_SUMMARY','Executive Summary',1,'Initial summary','COMPLETE')");
}

test("Step 2 schema defines relational governance documents versions and sections", async () => {
  const schema = await read("db/schema.ts");
  for (const value of [
    "governanceDocuments", "governanceDocumentVersions", "governanceDocumentSections",
    "uq_governance_documents_business_id", "uq_governance_versions_one_draft", "uq_governance_versions_one_current_approved",
    "uq_governance_sections_key", "uq_governance_sections_sequence", "idx_governance_documents_product_type",
    "idx_governance_versions_document_status", "idx_governance_sections_version_completion",
  ]) assert.match(schema, new RegExp(value));
  for (const constraint of [
    "ck_governance_document_type", "ck_governance_document_archive", "ck_governance_version_status",
    "ck_governance_version_hash", "ck_governance_version_lock", "ck_governance_section_key", "ck_governance_section_completion",
  ]) assert.match(schema, new RegExp(constraint));
});

test("generated forward migration contains tables indexes foreign keys and immutability triggers", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0018_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  for (const value of [
    "CREATE TABLE `governance_documents`", "CREATE TABLE `governance_document_versions`", "CREATE TABLE `governance_document_sections`",
    "FOREIGN KEY (`product_id`)", "FOREIGN KEY (`document_id`)", "FOREIGN KEY (`document_version_id`)",
    "uq_governance_versions_one_draft", "uq_governance_versions_one_current_approved",
    "trg_governance_versions_transition", "trg_governance_versions_locked_identity_update", "trg_governance_versions_locked_delete",
    "trg_governance_sections_locked_insert", "trg_governance_sections_locked_update", "trg_governance_sections_locked_delete",
    "GOVERNANCE_VERSION_LOCKED",
  ]) assert.match(migration, new RegExp(value.replace(/[()]/g, "\\$&")));
});

test("all 19 migrations replay with governance integrity", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 18).length, 19);
  assert.ok(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count >= 37);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_governance_%'").get().count, 6);
  database.close();
});

test("database constraints enforce one draft one current approval and ordered controlled sections", async () => {
  const { database } = await migratedDatabase();
  seedDocument(database);
  assert.throws(() => database.exec("INSERT INTO governance_document_versions(id,document_id,version_label) VALUES('version-2','document-1','Draft 0.2')"), /UNIQUE/);
  assert.throws(() => database.exec("INSERT INTO governance_document_sections(id,document_version_id,section_key,heading,sequence) VALUES('section-2','version-1','UNKNOWN','Unknown',2)"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO governance_document_sections(id,document_version_id,section_key,heading,sequence) VALUES('section-3','version-1','BUSINESS_CONTEXT','Business Context',1)"), /UNIQUE/);
  database.exec("UPDATE governance_document_versions SET version_label='Review 0.9',major_version=0,minor_version=9,lifecycle_status='IN_REVIEW',content_hash=lower(hex(randomblob(32))),submitted_at='2026-08-14T00:00:00Z',locked_at='2026-08-14T00:00:00Z' WHERE id='version-1'");
  database.exec("UPDATE governance_document_versions SET lifecycle_status='APPROVED',approved_at='2026-08-14T01:00:00Z' WHERE id='version-1'");
  database.exec("INSERT INTO governance_document_versions(id,document_id,version_label,major_version,minor_version,lifecycle_status,change_summary,supersedes_version_id) VALUES('version-2','document-1','Revision 1.1',1,1,'DRAFT','Approved successor','version-1')");
  database.exec("UPDATE governance_document_versions SET lifecycle_status='IN_REVIEW',content_hash=lower(hex(randomblob(32))),submitted_at='2026-08-14T02:00:00Z',locked_at='2026-08-14T02:00:00Z' WHERE id='version-2'");
  assert.throws(() => database.exec("UPDATE governance_document_versions SET lifecycle_status='APPROVED',approved_at='2026-08-14T03:00:00Z' WHERE id='version-2'"), /UNIQUE/);
  database.close();
});

test("locked governance content rejects section and version tampering", async () => {
  const { database } = await migratedDatabase();
  seedDocument(database);
  database.exec("UPDATE governance_document_versions SET version_label='Review 0.9',major_version=0,minor_version=9,lifecycle_status='IN_REVIEW',content_hash=lower(hex(randomblob(32))),submitted_at='2026-08-14T00:00:00Z',locked_at='2026-08-14T00:00:00Z' WHERE id='version-1'");
  assert.throws(() => database.exec("UPDATE governance_document_sections SET content_text='Changed after review' WHERE id='section-1'"), /GOVERNANCE_VERSION_LOCKED/);
  assert.throws(() => database.exec("DELETE FROM governance_document_sections WHERE id='section-1'"), /GOVERNANCE_VERSION_LOCKED/);
  assert.throws(() => database.exec("INSERT INTO governance_document_sections(id,document_version_id,section_key,heading,sequence) VALUES('section-2','version-1','BUSINESS_CONTEXT','Business Context',2)"), /GOVERNANCE_VERSION_LOCKED/);
  assert.throws(() => database.exec("UPDATE governance_document_versions SET change_summary='Tampered' WHERE id='version-1'"), /GOVERNANCE_VERSION_LOCKED/);
  assert.throws(() => database.exec("DELETE FROM governance_document_versions WHERE id='version-1'"), /GOVERNANCE_VERSION_LOCKED/);
  assert.throws(() => database.exec("UPDATE governance_document_versions SET lifecycle_status='DRAFT',content_hash=NULL,submitted_at=NULL,locked_at=NULL WHERE id='version-1'"), /GOVERNANCE_VERSION_(?:LOCKED|TRANSITION_INVALID)/);
  database.close();
});

test("representative governance queries select their intended indexes", async () => {
  const { database } = await migratedDatabase();
  seedDocument(database);
  const plan = (sql, ...parameters) => database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters).map((row) => String(row.detail)).join(" ");
  assert.match(plan("SELECT * FROM governance_documents WHERE product_id=? AND document_type=? AND record_status=?", "product-1", "BRD", "ACTIVE"), /idx_governance_documents_product_type/);
  assert.match(plan("SELECT * FROM governance_documents WHERE project_id=? AND document_type=? AND record_status=?", "project-1", "BRD", "ACTIVE"), /idx_governance_documents_project_type/);
  assert.match(plan("SELECT * FROM governance_document_versions WHERE document_id=? AND lifecycle_status=? ORDER BY major_version,minor_version", "document-1", "DRAFT"), /idx_governance_versions_document_status/);
  assert.match(plan("SELECT * FROM governance_document_sections WHERE document_version_id=? ORDER BY sequence", "version-1"), /uq_governance_sections_sequence/);
  database.close();
});

test("governance persistence stores no credentials or blobs and exposes only authorized document UI", async () => {
  const [schema, shell, hosting] = await Promise.all([read("db/schema.ts"), read("app/command-center-shell.tsx"), read(".openai/hosting.json")]);
  const governanceSchema = schema.slice(schema.indexOf("export const governanceDocuments"));
  assert.doesNotMatch(governanceSchema, /credential|token|secret|password|blob/i);
  assert.match(shell, /label: "BRD \/ PRD"/);
  assert.match(shell, /label: "Requirements"/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": null/);
});
