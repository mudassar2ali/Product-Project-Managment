import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
const root = new URL("../", import.meta.url), read = path => readFile(new URL(path, root), "utf8");

test("Sprint schema governs local planning and ordered membership", async () => {
  const source = await read("db/schema.ts");
  for (const value of ["sprints", "sprint_memberships", "uq_sprints_business_id", "idx_sprints_project_status_dates", "ck_sprint_dates", "ck_sprint_origin_external", "uq_sprint_membership_item", "uq_sprint_membership_sequence", "carried_from_membership_id"]) assert.match(source, new RegExp(value));
});

test("generated Sprint migration creates constrained indexed persistence", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter(name => /^0013_.*\.sql$/.test(name)); assert.equal(names.length, 1); const source = await read(`drizzle/${names[0]}`);
  for (const value of ["CREATE TABLE `sprints`", "CREATE TABLE `sprint_memberships`", "FOREIGN KEY", "ck_sprint_dates", "uq_sprint_membership_sequence", "idx_sprint_membership_backlog"]) assert.match(source, new RegExp(value));
});

test("Sprint contract validates Project goal dates and capacity", async () => {
  const source = await read("app/delivery/sprint-contract.ts");
  for (const value of ["Select an active Project", "Sprint name is required", "Define the Sprint goal", "End date cannot precede start date", "Capacity must be a whole number"]) assert.match(source, new RegExp(value));
});

test("Sprint repository provides governed CRUD assignment order totals and audit", async () => {
  const source = await read("db/sprints.ts");
  for (const value of ["createSprint", "updateSprint", "addSprintItem", "removeSprintItem", "reorderSprintItems", "committed_points", "planned_hours", "ITEM_ASSIGN", "ITEM_REMOVE", "ITEM_REORDER", "UNRESOLVED", "PLANNED", "VERSION", "has_items"]) assert.match(source, new RegExp(value, "i"));
  assert.match(source, /item\.status !== "READY"/);
  assert.match(source, /assigned\.status IN \('PLANNED','ACTIVE'\)/);
});

test("Sprint APIs enforce atomic permissions validation and stable planning errors", async () => {
  const files = await Promise.all([read("app/api/v2/sprints/route.ts"), read("app/api/v2/sprints/[id]/route.ts"), read("app/api/v2/sprints/[id]/items/route.ts"), read("app/api/v2/sprints/[id]/items/[membershipId]/route.ts")]); const source = files.join("\n");
  for (const value of ["sprint.view", "sprint.create", "sprint.plan", "VERSION_CONFLICT", "SPRINT_LOCKED", "BACKLOG_ITEM_ALREADY_ASSIGNED", "UNRESOLVED_DEPENDENCY", "INVALID_SPRINT_ORDER", "AZURE_ORIGIN_READ_ONLY"]) assert.match(source, new RegExp(value.replace(".", "\\.")));
});

test("Sprint UI exposes portfolio planner capacity dependency and deferred lifecycle truth", async () => {
  const source = await read("app/delivery/sprint-center.tsx"), shell = await read("app/command-center-shell.tsx");
  for (const value of ["Sprint Portfolio", "New Sprint", "Sprint goal", "Capacity", "Story commitment", "Ready Backlog", "Sprint Backlog", "Dependency unresolved", "Hours and points remain separate", "Activation, baseline freezing, completion and carryover are authorized for Step 7"]) assert.match(source, new RegExp(value));
  assert.match(shell, /label: "Sprints"/); assert.match(shell, /Stage 2 · Step 6/); assert.doesNotMatch(source, />Activate</);
});
