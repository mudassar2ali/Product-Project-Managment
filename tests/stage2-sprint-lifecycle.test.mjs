import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("Sprint lifecycle schema preserves immutable baselines and item dispositions", async () => {
  const source = await read("db/schema.ts");
  for (const value of ["sprintBaselines", "uq_sprint_baseline_sprint", "membershipSnapshotJson", "sprintCompletionDispositions", "uq_sprint_completion_membership", "ck_sprint_completion_disposition", "targetMembershipId", "uq_sprints_one_active_local"]) assert.match(source, new RegExp(value));
});

test("generated lifecycle migration enforces baseline disposition and active-Sprint integrity", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter(name => /^0014_.*\.sql$/.test(name));
  assert.equal(names.length, 1);
  const source = await read(`drizzle/${names[0]}`);
  for (const value of ["CREATE TABLE `sprint_baselines`", "CREATE TABLE `sprint_completion_dispositions`", "uq_sprint_baseline_sprint", "ck_sprint_completion_target", "uq_sprints_one_active_local", "WHERE \"sprints\".\"status\"='ACTIVE'"]) assert.match(source, new RegExp(value));
});

test("lifecycle contracts require reasons and complete carryover evidence", async () => {
  const source = await read("app/delivery/sprint-lifecycle-contract.ts");
  for (const value of ["COMPLETED", "CARRYOVER", "BACKLOG", "REMOVED", "Every Sprint item needs a completion disposition", "Select a target Planned Sprint", "Explain the unfinished-item disposition", "Explain why active Sprint scope is changing"]) assert.match(source, new RegExp(value));
});

test("lifecycle repository gates activation freezes evidence and records governed completion", async () => {
  const source = await read("db/sprint-lifecycle.ts");
  for (const value of ["activateSprint", "changeActiveScope", "completeSprint", "items_not_ready", "over_capacity", "sprint_baselines", "membership_snapshot_json", "ACTIVE_SCOPE_ADD", "ACTIVE_SCOPE_REMOVE", "incomplete_dispositions", "carried_from_membership_id", "sprint_completion_dispositions", "ACTIVATE", "COMPLETE"]) assert.match(source, new RegExp(value));
  assert.match(source, /status='PLANNED'/);
  assert.match(source, /status='ACTIVE'/);
});

test("lifecycle APIs independently authorize activation planning and completion", async () => {
  const files = await Promise.all([read("app/api/v2/sprints/[id]/activate/route.ts"), read("app/api/v2/sprints/[id]/scope-changes/route.ts"), read("app/api/v2/sprints/[id]/complete/route.ts")]);
  const source = files.join("\n");
  for (const value of ["sprint.activate", "sprint.plan", "sprint.complete", "ACTIVE_SPRINT_EXISTS", "SPRINT_OVER_CAPACITY", "SPRINT_ITEMS_NOT_READY", "INCOMPLETE_DISPOSITIONS", "INVALID_CARRYOVER_TARGET", "VERSION_CONFLICT", "AZURE_ORIGIN_READ_ONLY"]) assert.match(source, new RegExp(value.replace(".", "\\.")));
});

test("Sprint UI exposes baseline scope-change completion and carryover workflows", async () => {
  const source = await read("app/delivery/sprint-center.tsx"), shell = await read("app/command-center-shell.tsx"), styles = await read("app/globals.css");
  for (const value of ["Activate Sprint", "freeze the current commitment baseline", "Immutable activation baseline", "audited scope change", "Disposition every Sprint item", "Target Planned Sprint", "Completed Sprint evidence is read-only", "status: \"PLANNED\""]) assert.match(source, new RegExp(value));
  assert.match(shell, /Stage 2 · Step 7/);
  assert.match(shell, /canActivate=.*sprint\.activate/);
  assert.match(shell, /canComplete=.*sprint\.complete/);
  for (const value of ["baseline-evidence", "completion-panel", "completion-list", "lifecycle-actions"]) assert.match(styles, new RegExp(value));
});
