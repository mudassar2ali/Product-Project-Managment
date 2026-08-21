import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

// Blueprint Section 21 ("Security and privacy controls") mandates: "Rate limits cover readiness
// recalculation, execution insert and defect create, using the existing Stage 2 fixed-window
// limiter (operational_rate_limits) rather than a new mechanism." This was not implemented in
// Steps 5, 6, 7 or 11 and is closed here in Step 12 as a zero-schema-change remediation of
// already-authorized scope, per the project's established gap-discovery-and-remediation practice.

test("rate limit policies cover readiness recalculation, UAT execution insert and defect create", async () => {
  const source = await read("db/operations.ts");
  for (const key of ["READINESS_RECALCULATE", "UAT_EXECUTION_INSERT", "DEFECT_CREATE"]) {
    assert.match(source, new RegExp(`${key}:\\s*\\{ limit:`));
  }
});

test("release readiness recalculation is rate limited and records operational events on both outcomes", async () => {
  const source = await read("app/api/v4/releases/[id]/readiness/route.ts");
  assert.match(source, /consumeRateLimit\("READINESS_RECALCULATE"/);
  assert.match(source, /OPERATION_RATE_LIMITED/);
  assert.match(source, /recordOperationalEvent\(\{ operation: "READINESS_RECALCULATE", outcome: "ERROR"/);
  assert.match(source, /recordOperationalEvent\(\{ operation: "READINESS_RECALCULATE", outcome: "SUCCESS"/);
  assert.match(source, /rateLimitHeaders\(rateLimit\)/);
});

test("UAT test execution insert is rate limited independently of readiness recalculation and defect create", async () => {
  const source = await read("app/api/v4/test-cases/[id]/executions/route.ts");
  assert.match(source, /consumeRateLimit\("UAT_EXECUTION_INSERT"/);
  assert.match(source, /OPERATION_RATE_LIMITED/);
  assert.match(source, /recordOperationalEvent\(\{ operation: "UAT_EXECUTION_INSERT", outcome: "ERROR"/);
  assert.match(source, /recordOperationalEvent\(\{ operation: "UAT_EXECUTION_INSERT", outcome: "SUCCESS"/);
});

test("defect creation is rate limited and records operational events on both outcomes", async () => {
  const source = await read("app/api/v4/defects/route.ts");
  assert.match(source, /consumeRateLimit\("DEFECT_CREATE"/);
  assert.match(source, /OPERATION_RATE_LIMITED/);
  assert.match(source, /recordOperationalEvent\(\{ operation: "DEFECT_CREATE", outcome: "ERROR"/);
  assert.match(source, /recordOperationalEvent\(\{ operation: "DEFECT_CREATE", outcome: "SUCCESS"/);
});

test("all three new Stage 4 rate limit policies use the shared 20-per-5-minutes governance-write-path shape", async () => {
  const source = await read("db/operations.ts");
  for (const key of ["READINESS_RECALCULATE", "UAT_EXECUTION_INSERT", "DEFECT_CREATE"]) {
    assert.match(source, new RegExp(`${key}: \\{ limit: 20, windowSeconds: 300 \\}`));
  }
});
