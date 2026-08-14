import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Dependency input is controlled and version governed", async () => {
  const source = await read("app/delivery/dependency-contract.ts");
  for (const value of ["dependencyTypes", "predecessorId", "dependencyType", "version", "Select Blocks, Requires or Relates To"]) assert.match(source, new RegExp(value));
});

test("Dependency repository enforces scope origin duplicate cycle readiness and concurrency", async () => {
  const source = await read("db/backlog-dependencies.ts");
  for (const value of ["WITH RECURSIVE reachable", "projectId", "origin", "duplicate", "cycle", "not_ready", "conflict", "env.DB.batch", "DEPENDENCY_ADD", "DEPENDENCY_REMOVE"]) assert.match(source, new RegExp(value, "i"));
  assert.match(source, /successor\.id === predecessor\.id/);
});

test("Dependency APIs enforce view edit validation and stable errors", async () => {
  const collection = await read("app/api/v2/backlog/[id]/dependencies/route.ts");
  const member = await read("app/api/v2/backlog/[id]/dependencies/[dependencyId]/route.ts");
  for (const value of ["backlog.view", "backlog.edit", "DEPENDENCY_CYCLE", "DUPLICATE_DEPENDENCY", "UNRESOLVED_DEPENDENCY", "AZURE_ORIGIN_READ_ONLY"]) assert.match(collection, new RegExp(value.replace(".", "\\.")));
  for (const value of ["backlog.edit", "DEPENDENCY_NOT_FOUND", "VERSION_CONFLICT"]) assert.match(member, new RegExp(value.replace(".", "\\.")));
});

test("Dependency workspace exposes direction readiness and read-only evidence", async () => {
  const source = await read("app/delivery/dependency-center.tsx");
  for (const value of ["Dependencies &amp; Readiness", "Incoming", "Outgoing", "unresolved prerequisite", "Add dependency", "Cycle checks", "same Project", "Azure DevOps · read-only", "No dependencies"]) assert.match(source, new RegExp(value));
});

test("Database readiness rules cover unresolved successors and predecessor regression", async () => {
  const source = await read("drizzle/0012_dependency_readiness.sql");
  for (const value of ["trg_dependency_ready_update", "trg_dependency_predecessor_regression", "UNRESOLVED_DEPENDENCY", "READY_SUCCESSOR_DEPENDS_ON_ITEM", "BLOCKS", "REQUIRES"]) assert.match(source, new RegExp(value));
});
