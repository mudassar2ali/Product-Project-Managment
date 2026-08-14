import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Project delivery insights are permission layered and source labelled", async () => {
  const source = await read("db/stage2-insights.ts");
  for (const permission of ["access.backlog", "access.sprints", "access.metrics"]) assert.match(source, new RegExp(permission.replace(".", "\\.")));
  for (const evidence of ["acceptance_criteria", "sprint_metric_snapshots", "sprint_completion_dispositions", "azure_mapping_entries", "azure_sync_runs"]) assert.match(source, new RegExp(evidence));
  assert.match(source, /metricWithheld/);
  assert.match(source, /No governed Azure Project link is configured/);
});

test("Project Overview API applies atomic delivery permissions without caching", async () => {
  const route = await read("app/api/v1/projects/[id]/overview/route.ts");
  for (const permission of ["backlog.view", "sprint.view", "delivery.metrics.view"]) assert.match(route, new RegExp(permission.replace(".", "\\.")));
  assert.match(route, /getProjectOverview\(id/);
  assert.match(route, /no-store/);
});

test("Project Overview exposes accessible evidence and governed edit controls", async () => {
  const [ui, portfolio] = await Promise.all([read("app/projects/project-overview.tsx"), read("app/projects/project-portfolio.tsx")]);
  for (const label of ["STAGE 2 DELIVERY EVIDENCE", "Ready Stories", "Velocity history", "Carryover", "Source attention", "Milestones and RAID"]) assert.match(ui, new RegExp(label));
  assert.match(ui, /role="img"/);
  assert.match(ui, /aria-label=\{`Velocity history/);
  assert.match(ui, /canEdit &&/);
  assert.match(portfolio, /canEdit=\{canEdit\}/);
  assert.doesNotMatch(ui, /Math\.random|sample data/i);
});

test("Dashboard read model merges permission-aware Stage 2 attention", async () => {
  const [repo, route] = await Promise.all([read("db/dashboard.ts"), read("app/api/v1/dashboard/route.ts")]);
  assert.match(repo, /getPortfolioDeliveryInsights/);
  assert.match(repo, /delivery\.attention/);
  assert.match(repo, /destination/);
  for (const permission of ["backlog.view", "sprint.view", "delivery.metrics.view"]) assert.match(route, new RegExp(permission.replace(".", "\\.")));
  assert.match(route, /no-store/);
});

test("Dashboard renders safe drill-through and honest unavailable evidence", async () => {
  const ui = await read("app/dashboard/executive-dashboard.tsx");
  for (const label of ["Stage 2 portfolio delivery evidence", "Portfolio readiness", "Delivery pulse", "Evidence unavailable", "Summary only"]) assert.match(ui, new RegExp(label));
  assert.match(ui, /availableModules\.includes/);
  assert.match(ui, /disabled=\{!canNavigate/);
  assert.doesNotMatch(ui, /Math\.random|sample data/i);
});

test("report allowlist adds eight persisted Stage 2 delivery reports", async () => {
  const source = await read("db/reports.ts");
  for (const key of ["backlog-composition", "story-readiness", "sprint-performance", "velocity", "carryover", "delivery-attention", "burndown", "azure-coverage"]) assert.match(source, new RegExp(`(?:"${key}"|\\b${key}\\b)`));
  for (const table of ["backlog_items", "acceptance_criteria", "sprints", "sprint_metric_snapshots", "daily_burndown_snapshots", "azure_mapping_entries", "azure_sync_runs"]) assert.match(source, new RegExp(table));
  assert.match(source, /satisfies Record<string, ReportDefinition>/);
  assert.match(source, /buildSummary/);
});

test("report route exports the complete bounded filter with safe response headers", async () => {
  const [route, repo] = await Promise.all([read("app/api/v1/reports/[key]/route.ts"), read("db/reports.ts")]);
  assert.match(route, /slice\(0,140\)/);
  assert.match(route, /exportAll:csv/);
  assert.match(route, /report\.export/);
  assert.match(route, /nosniff/);
  assert.match(repo, /Math\.min\(100/);
  assert.match(repo, /input\.exportAll \? filtered/);
  assert.match(repo, /\^\[=\+\\-@\]/);
});

test("report center keeps accessible summaries paired with full data tables", async () => {
  const [ui, css, shell] = await Promise.all([read("app/reports/report-center.tsx"), read("app/globals.css"), read("app/command-center-shell.tsx")]);
  assert.match(ui, /Stage 2 delivery/i);
  assert.match(ui, /report-summary/);
  assert.match(ui, /role="img"/);
  assert.match(ui, /report-table/);
  assert.match(ui, /AbortController/);
  assert.match(css, /\.report-summary/);
  assert.match(css, /\.portfolio-delivery-grid/);
  assert.match(css, /\.stage2-project-evidence/);
  assert.match(shell, /Stage 2 · Step 11/);
});
