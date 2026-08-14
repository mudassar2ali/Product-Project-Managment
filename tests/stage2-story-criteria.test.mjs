import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Acceptance Criteria input is bounded structured and status governed", async () => {
  const source = await read("app/delivery/acceptance-criteria-contract.ts");
  for (const value of ["validateAcceptanceCriteria", "criterionStatuses", "up to 50", "given", "when", "then"]) assert.match(source, new RegExp(value, "i"));
});

test("Story Criteria repository replaces ordered evidence atomically and audits it", async () => {
  const source = await read("db/acceptance-criteria.ts");
  for (const value of ["ORDER BY sequence", "DELETE FROM acceptance_criteria", "INSERT INTO acceptance_criteria", "env.DB.batch", "ACCEPTANCE_CRITERIA_REPLACE"]) assert.match(source, new RegExp(value));
  assert.match(source, /version\s*=\s*version\s*\+\s*1/);
  assert.match(source, /origin !== "LOCAL"/);
});

test("Story Criteria API enforces view edit validation concurrency and Azure read-only", async () => {
  const source = await read("app/api/v2/backlog/[id]/criteria/route.ts");
  for (const value of ["backlog.view", "backlog.edit", "VALIDATION_FAILED", "VERSION_CONFLICT", "AZURE_ORIGIN_READ_ONLY", "NOT_A_STORY"]) assert.match(source, new RegExp(value.replace(".", "\\.")));
});

test("Story workspace renders narratives ordered criteria readiness and honest states", async () => {
  const source = await read("app/delivery/story-criteria-center.tsx");
  for (const value of ["User Stories &amp; Acceptance Criteria", "As a", "I want", "so that", "Given", "When", "Then", "Ready evidence present", "No Stories yet", "Azure DevOps · read-only", "Add criterion"]) assert.match(source, new RegExp(value));
  assert.match(source, /move\(index/);
});

test("Database migration prevents Stories becoming Ready without evidence", async () => {
  const source = await read("drizzle/0011_story_readiness.sql");
  assert.match(source, /trg_story_ready_insert/);
  assert.match(source, /trg_story_ready_update/);
  assert.match(source, /NOT EXISTS/);
  assert.match(source, /STORY_NOT_READY/);
});
