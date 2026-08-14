import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("unified Backlog read model filters source attention Sprint and readiness evidence", async () => {
  const source = await read("db/backlog.ts");
  for (const value of ["origin:string", "attention:string", "sprintId:string", "BLOCKED", "UNMAPPED", "SOURCE_MISSING", "UNSPRINTED", "external_iteration_id", "criteriaCount", "unresolvedDependencies", "hasChildren", "sprintBusinessId"]) assert.match(source, new RegExp(value));
  assert.match(source, /WITH RECURSIVE tree/);
  assert.match(source, /record_status='ACTIVE'/);
});

test("work-item workspace consolidates Sprint criteria dependency child and activity evidence", async () => {
  const source = await read("db/backlog.ts");
  for (const value of ["getBacklogWorkspace", "sprints:sprints.results", "criteria:criteria.results", "dependencies:dependencies.results", "children:children.results", "localActivity", "azureActivity", "SOURCE_REVISION", "AZURE_DEVOPS"]) assert.match(source, new RegExp(value));
  assert.match(source, /audit_logs/);
  assert.match(source, /azure_work_item_snapshots/);
});

test("Backlog APIs govern composite evidence and bounded workspace filters", async () => {
  const [collection, detail] = await Promise.all([read("app/api/v2/backlog/route.ts"), read("app/api/v2/backlog/[id]/route.ts")]);
  for (const value of ["backlog.view", "origin", "attention", "sprintId", "pageSize", "100", "cache-control", "no-store"]) assert.match(collection, new RegExp(value.replace(".", "\\.")));
  for (const value of ["backlog.view", "getBacklogWorkspace", "BACKLOG_ITEM_NOT_FOUND", "cache-control", "no-store"]) assert.match(detail, new RegExp(value.replace(".", "\\.")));
});

test("Backlog workspace exposes hierarchy semantics source truth and attention controls", async () => {
  const source = await read("app/delivery/backlog-center.tsx");
  for (const value of ["UNIFIED DELIVERY WORKSPACE", "Visible Backlog summary", "All sources", "All attention states", "Hierarchy", "List", "treeitem", "aria-level", "aria-expanded", "AZURE", "LOCAL", "Source missing", "Unmapped", "No Sprint"]) assert.match(source, new RegExp(value));
});

test("one accessible work-item drawer keeps Azure read-only and local actions distinct", async () => {
  const source = await read("app/delivery/backlog-center.tsx");
  for (const value of ["work-item-drawer", "aria-modal=\"true\"", "AZURE DEVOPS · READ-ONLY", "Open in Azure", "Normalized state", "Acceptance Criteria", "Dependencies &amp; readiness", "Child work", "Evidence activity", "Edit local item", "Archive"]) assert.match(source, new RegExp(value));
  assert.match(source, /canEdit && item\.origin === "LOCAL"/);
  assert.match(source, /canArchive && item\.origin === "LOCAL"/);
});

test("Sprint portfolio shares Project and source context with Backlog", async () => {
  const [center, route, repository] = await Promise.all([read("app/delivery/sprint-center.tsx"), read("app/api/v2/sprints/route.ts"), read("db/sprints.ts")]);
  for (const value of ["initialProjectId", "onProjectChange", "onOpenBacklog", "All sources", "Azure DevOps", "View Backlog", "origin"]) assert.match(center, new RegExp(value));
  assert.match(route, /searchParams\.get\("origin"\)/);
  assert.match(repository, /s\.origin=\?/);
});

test("command shell preserves delivery context with responsive Step 10 presentation", async () => {
  const [shell, styles] = await Promise.all([read("app/command-center-shell.tsx"), read("app/globals.css")]);
  for (const value of ["deliveryProjectId", "setDeliveryProjectId", "onOpenSprints", "onOpenBacklog", "Stage 2 · Step 10"]) assert.match(shell, new RegExp(value));
  for (const value of ["delivery-summary", "unified-filters", "view-toggle", "work-item-backdrop", "work-item-drawer", "evidence-grid", "source-evidence", "@media (max-width: 620px)"]) assert.match(styles, new RegExp(value.replace(/[()]/g, "\\$&")));
});
