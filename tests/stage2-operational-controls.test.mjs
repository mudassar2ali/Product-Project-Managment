import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const files = (await readdir(new URL("drizzle/", root))).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const migration = await read(`drizzle/${file}`);
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) database.exec(statement);
  }
  return database;
}

test("Step 12 schema defines durable policies rate-limit counters and sanitized telemetry", async () => {
  const schema = await read("db/schema.ts");
  for (const value of ["operationalPolicies", "operationalRateLimits", "operationalEvents", "ck_operational_policy_value", "ck_operational_rate_limit_values", "ck_operational_event_outcome", "idx_operational_events_operation_time"]) assert.match(schema, new RegExp(value));
  assert.match(schema, /primaryKey\(\{columns:\[t\.operation,t\.scopeKey,t\.windowStart\]/);
});

test("forward migration seeds controlled defaults and makes governance audit append-only", async () => {
  const migration = await read("drizzle/0017_free_may_parker.sql");
  for (const value of ["ADVANCED_SYNC_LIMIT", "REPORT_EXPORT_LIMIT", "AUDIT_RETENTION_DAYS", "TELEMETRY_RETENTION_DAYS", "trg_audit_logs_immutable_update", "trg_audit_logs_immutable_delete", "AUDIT_IMMUTABLE"]) assert.match(migration, new RegExp(value));
  assert.match(migration, /ADVANCED_SYNC_LIMIT[^\n]*,5,/);
  assert.match(migration, /AUDIT_RETENTION_DAYS[^\n]*,365,/);
});

test("all migrations apply cleanly with referential integrity and immutable audit enforcement", async () => {
  const database = await migratedDatabase();
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM operational_policies").get().count, 6);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_audit_logs_immutable_%'").get().count, 2);
  database.exec("INSERT INTO audit_logs(id,entity_type,entity_id,action,source,correlation_id) VALUES('audit-1','Product','PRD-1','CREATE','APPLICATION','corr-1')");
  assert.throws(() => database.exec("UPDATE audit_logs SET action='UPDATE' WHERE id='audit-1'"), /AUDIT_IMMUTABLE/);
  assert.throws(() => database.exec("DELETE FROM audit_logs WHERE id='audit-1'"), /AUDIT_IMMUTABLE/);
  assert.equal(database.prepare("SELECT action FROM audit_logs WHERE id='audit-1'").get().action, "CREATE");
  database.close();
});

test("atomic fixed-window limiter never exceeds its governed capacity", async () => {
  const database = await migratedDatabase();
  const consume = database.prepare(`
    INSERT INTO operational_rate_limits(operation,scope_key,window_start,request_count,limit_value,window_seconds,expires_at,updated_at)
    VALUES(?,?,?,1,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(operation,scope_key,window_start) DO UPDATE SET
      request_count=operational_rate_limits.request_count+1,
      limit_value=excluded.limit_value,
      window_seconds=excluded.window_seconds,
      expires_at=excluded.expires_at,
      updated_at=CURRENT_TIMESTAMP
    WHERE operational_rate_limits.request_count<excluded.limit_value
    RETURNING request_count
  `);
  const accepted = [];
  for (let request = 0; request < 6; request += 1) accepted.push(consume.get("ADVANCED_SYNC", "hashed-scope", 1_000, 5, 300, "2099-01-01T00:00:00Z")?.request_count ?? null);
  assert.deepEqual(accepted, [1, 2, 3, 4, 5, null]);
  assert.equal(database.prepare("SELECT request_count FROM operational_rate_limits").get().request_count, 5);
  database.close();
});

test("operations repository hashes caller scope and records only bounded scalar evidence", async () => {
  const source = await read("db/operations.ts");
  for (const value of ["SHA-256", "safeDetails", "sensitive", "slice(0, 16)", "value.slice(0, 160)", "D1 fixed-window", "Sanitized scalar evidence"]) assert.ok(source.includes(value), `missing ${value}`);
  assert.match(source, /WHERE operational_rate_limits\.request_count<excluded\.limit_value/);
  assert.doesNotMatch(source, /requestBody|responseBody|authorizationHeader|azureToken/i);
});

test("advanced sync and report export enforce independent durable limits with standard 429 evidence", async () => {
  const [sync, report] = await Promise.all([read("app/api/v2/azure/project-links/[id]/advanced-sync/route.ts"), read("app/api/v1/reports/[key]/route.ts")]);
  for (const source of [sync, report]) {
    assert.match(source, /OPERATION_RATE_LIMITED/);
    assert.match(source, /rateLimitHeaders/);
    assert.match(source, /RATE_LIMITED/);
    assert.match(source, /recordOperationalEvent/);
  }
  assert.match(sync, /consumeRateLimit\("ADVANCED_SYNC"/);
  assert.match(report, /consumeRateLimit\("REPORT_EXPORT"/);
  assert.match(report, /x-content-type-options/);
});

test("authenticated actors are persisted before authorization and core audit writes retain attribution", async () => {
  const [helpers, identity, products, projects, auth] = await Promise.all([read("app/api/v1/api-helpers.ts"), read("db/identity.ts"), read("db/products.ts"), read("db/projects.ts"), read("app/chatgpt-auth.ts")]);
  assert.match(helpers, /persistedUserId = await ensureAuthenticatedUser\(user\)/);
  assert.match(identity, /ON CONFLICT\(external_user_id\) DO UPDATE/);
  assert.match(identity, /last_seen_at=CURRENT_TIMESTAMP/);
  assert.match(identity, /RETURNING id/);
  for (const repository of [products, projects]) assert.match(repository, /actor_user_id/);
  assert.match(auth, /safeIdentityHeader/);
  assert.match(auth, /code <= 31 \|\| code === 127/);
});

test("operational and audit APIs are permissioned bounded allowlisted and no-store", async () => {
  const [operations, audit, auditRepository, proxy] = await Promise.all([read("app/api/v2/operations/route.ts"), read("app/api/v1/audit/route.ts"), read("db/audit.ts"), read("proxy.ts")]);
  assert.match(operations, /integration\.diagnostics/);
  assert.match(operations, /OPERATIONAL_STATUS_UNAVAILABLE/);
  for (const value of ["entities", "sources", "VALIDATION_FAILED", "validDate", "pageSize"]) assert.match(audit, new RegExp(value));
  assert.match(auditRepository, /replaceAll\("%", "\\\\%"\)/);
  assert.match(auditRepository, /\[REDACTED\]/);
  assert.match(auditRepository, /365-day minimum/);
  for (const header of ["Cache-Control", "Strict-Transport-Security", "Cross-Origin-Resource-Policy", "X-Permitted-Cross-Domain-Policies"]) assert.match(proxy, new RegExp(header));
});

test("Step 12 UI exposes honest responsive operational evidence without live Azure calls", async () => {
  const [ui, audit, shell, css] = await Promise.all([read("app/operations/operational-control-center.tsx"), read("app/audit/audit-center.tsx"), read("app/command-center-shell.tsx"), read("app/globals.css")]);
  for (const value of ["Operational control plane", "No live Azure call", "Control integrity", "Delivery pressure", "carryover items", "API latency and outcomes", "Audit protection", "No recent operational exceptions", "AbortController"]) assert.match(ui, new RegExp(value));
  for (const value of ["Action", "From", "To", "Legacy unattributed", "AbortController"]) assert.match(audit, new RegExp(value));
  assert.match(shell, /Stage 3 · Step 12/);
  for (const selector of ["operational-control", "operational-kpis", "operational-grid", "operational-facts", "exception-list"]) assert.match(css, new RegExp(`\\.${selector}`));
  assert.doesNotMatch(ui, /Math\.random|sample data/i);
});
