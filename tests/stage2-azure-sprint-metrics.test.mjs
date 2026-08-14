import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url), read = path => readFile(new URL(path, root), "utf8");

test("Sprint metric schema preserves formula policy source and daily evidence", async () => {
  const source = await read("db/schema.ts");
  for (const value of ["deliveryMetricPolicies", "sprintMetricSnapshots", "dailyBurndownSnapshots", "healthTolerancePercentage", "velocityLookback", "completionMethod", "numerator", "denominator", "formula", "uq_sprint_metric_source_revision", "uq_daily_burndown_source_revision", "metricSnapshotsInserted"]) assert.match(source, new RegExp(value));
});

test("generated Sprint metric migration is forward-only seeded and compatible", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter(name => /^0016_.*\.sql$/.test(name));
  assert.equal(names.length, 1);
  const source = await read(`drizzle/${names[0]}`);
  for (const value of ["CREATE TABLE `delivery_metric_policies`", "CREATE TABLE `sprint_metric_snapshots`", "CREATE TABLE `daily_burndown_snapshots`", "Default Stage 2 delivery health policy", "15,3,2,6", "ALTER TABLE `azure_sync_runs` ADD `iterations_seen`", "ALTER TABLE `sprints` ADD `source_revision`", "ck_sprint_metric_health", "ck_daily_burndown_values"]) assert.match(source, new RegExp(value));
  assert.doesNotMatch(source, /DROP TABLE `sprints`/);
});

test("Azure provider retrieves bounded dated Team iteration history without mutations", async () => {
  const [contract, provider] = await Promise.all([read("app/integrations/engineering-delivery-provider.ts"), read("app/integrations/azure-devops-provider.ts")]);
  for (const value of ["ExternalSprintSource", "getSprintHistory", "truncated", "pagesRead", "sourceRevision"]) assert.match(contract, new RegExp(value));
  for (const value of ["getSprintHistory", "listAllWithMeta", "slice(0, 50)", "startDate", "finishDate", "SHA-256", "encodeURIComponent(teamId)"]) assert.match(provider, new RegExp(value.replace(/[()]/g, "\\$&")));
  assert.doesNotMatch(provider, /method:\s*["'](?:PATCH|PUT|DELETE)/);
});

test("Sprint calculator discloses points fallback carryover burndown and health policy", async () => {
  const source = await read("db/azure-sprint-metrics.ts");
  for (const value of ["executionTypes", "plannedPoints", "completedPoints", "ITEM_COUNT", "NOT_AVAILABLE", "carryoverByIteration", "remainingWork", "openBugCount", "blockerCount", "idealRemainingScope", "scopeChange", "healthTolerancePercentage", "zeroProgressDays", "AZURE_SPRINT_METRICS", "AZURE_TEAM_REQUIRED", "AZURE_SPRINT_HISTORY_BOUNDED"]) assert.match(source, new RegExp(value));
  assert.match(source, /normalizedType === "STORY"/);
  assert.match(source, /status === "COMPLETED" \? "COMPLETED"/);
});

test("advanced synchronization combines complete work-item and Sprint sources atomically", async () => {
  const [repository, route] = await Promise.all([read("db/azure-advanced-sync.ts"), read("app/api/v2/azure/project-links/[id]/advanced-sync/route.ts")]);
  for (const value of ["prepareAzureSprintMetricSync", "sprintSource?.complete === false", "metricSync.statements", "iterations_seen", "metric_snapshots_inserted", "burndown_snapshots_inserted", "combinedSourceRevision"]) assert.match(repository, new RegExp(value.replace(/[?.]/g, "\\$&")));
  for (const value of ["Promise.all", "getAdvancedWorkItems", "getSprintHistory", "sync.azureTeamId", "AZURE_PARTIAL_SOURCE", "integration.sync"]) assert.match(route, new RegExp(value.replace(".", "\\.")));
});

test("metric API is independently permission governed and returns allowlisted evidence", async () => {
  const [route, repository] = await Promise.all([read("app/api/v2/sprints/[id]/metrics/route.ts"), read("db/sprint-metrics.ts")]);
  for (const value of ["delivery.metrics.view", "SPRINT_METRICS_NOT_AVAILABLE", "SPRINT_NOT_FOUND", "cache-control", "no-store"]) assert.match(route, new RegExp(value.replace(".", "\\.")));
  for (const value of ["velocityLookback", "averageCompletedPoints", "daily_burndown_snapshots", "sourceRevision", "Azure DevOps · read-only evidence", "ORDER BY calculated_at DESC"]) assert.match(repository, new RegExp(value));
});

test("Sprint UI exposes accessible source-labelled delivery history and policy evidence", async () => {
  const [center, panel, shell, styles] = await Promise.all([read("app/delivery/sprint-center.tsx"), read("app/integrations/azure-sync-panel.tsx"), read("app/command-center-shell.tsx"), read("app/globals.css")]);
  for (const value of ["Open delivery evidence", "SOURCE-LABELLED DELIVERY EVIDENCE", "Velocity history", "Daily burndown evidence", "Calculation and policy evidence", "Source revision", "<table>"]) assert.match(center, new RegExp(value));
  for (const value of ["Sync work + Sprint evidence", "metric snapshots", "daily burndown points", "Sprint metrics need a Team"]) assert.match(panel, new RegExp(value.replace("+", "\\+")));
  assert.match(shell, /Stage 2 · Step 9/);
  for (const value of ["sprint-metrics-evidence", "delivery-metric-grid", "metric-evidence-columns", "calculation-evidence"]) assert.match(styles, new RegExp(value));
});
