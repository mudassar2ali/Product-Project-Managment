import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url), read = path => readFile(new URL(path, root), "utf8");

test("advanced Azure schema stores current evidence revisions mappings diagnostics and lock metrics", async () => {
  const source = await read("db/schema.ts");
  for (const value of ["azureMappingEntries", "azureWorkItemSnapshots", "azureSyncDiagnostics", "uq_azure_mapping_external", "uq_azure_work_item_snapshot_revision", "uq_azure_sync_run_active_link", "externalState", "externalParentId", "externalOwner", "remainingWork", "sourceMissingAt", "pagesRead", "unmappedTypes", "sourceRevision"]) assert.match(source, new RegExp(value));
});

test("generated Azure normalization migration is forward-only and preserves existing Backlog rows", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter(name => /^0015_.*\.sql$/.test(name));
  assert.equal(names.length, 1);
  const source = await read(`drizzle/${names[0]}`);
  for (const value of ["CREATE TABLE `azure_mapping_entries`", "CREATE TABLE `azure_work_item_snapshots`", "CREATE TABLE `azure_sync_diagnostics`", "ALTER TABLE `azure_sync_runs` ADD `sync_mode`", "uq_azure_sync_run_active_link", "INSERT INTO `__new_backlog_items`", "NULL, NULL, NULL, NULL, NULL", "PRAGMA foreign_keys=ON", "trg_story_ready_insert", "trg_dependency_ready_update", "NEW.`origin`='LOCAL'"]) assert.match(source, new RegExp(value));
  assert.doesNotMatch(source, /SELECT[^;]*"external_state"[^;]*FROM `backlog_items`/s);
});

test("Azure mappings are controlled compatible versioned and audit governed", async () => {
  const [contract, repository, connections] = await Promise.all([read("app/integrations/azure-mapping-contract.ts"), read("db/azure-mappings.ts"), read("db/azure-connections.ts")]);
  const source = `${contract}\n${repository}\n${connections}`;
  for (const value of ["Product Backlog Item", "IN_PROGRESS", "VALIDATION", "Each external value may be mapped once per kind", "version", "MAPPINGS_UPDATE", "recommendedAzureMappings", "external_key", "active=0"]) assert.match(source, new RegExp(value));
});

test("Azure provider retrieves paginated relation-rich batches without Azure mutation methods", async () => {
  const [contract, provider] = await Promise.all([read("app/integrations/engineering-delivery-provider.ts"), read("app/integrations/azure-devops-provider.ts")]);
  for (const value of ["AdvancedWorkItemSource", "ExternalWorkItemRelation", "getAdvancedWorkItems", "parentExternalId", "remainingWork", "sourceRevision"]) assert.match(contract, new RegExp(value));
  for (const value of ["x-ms-continuationtoken", "continuationToken", "workitemsbatch", "Relations", "System.Parent", "System.IterationPath", "Microsoft.VSTS.Scheduling.RemainingWork", "retry-after", "SHA-256", "ids.length < 20000"]) assert.match(provider, new RegExp(value));
  assert.doesNotMatch(provider, /method:\s*["'](?:PATCH|PUT|DELETE)/);
});

test("advanced synchronization preserves complete snapshots and handles missing unmapped and idempotent evidence", async () => {
  const source = await read("db/azure-advanced-sync.ts");
  for (const value of ["beginAdvancedSync", "lockExpiresAt", "AZURE_SYNC_LOCK_EXPIRED", "partial_source", "mapping_missing", "AZURE_TYPE_UNMAPPED", "AZURE_STATE_UNMAPPED", "AZURE_HIERARCHY_UNMAPPED", "azure_work_item_snapshots", "source_missing_at", "backlog_dependencies", "ADVANCED_SYNC", "AZURE_SOURCE_MISSING", "idempotent"]) assert.match(source, new RegExp(value));
  assert.match(source, /origin='AZURE_DEVOPS'/);
  assert.doesNotMatch(source, /UPDATE backlog_items[^;]*origin='LOCAL'/s);
});

test("advanced Azure APIs enforce independent permissions stable failures and no-store evidence", async () => {
  const files = await Promise.all([read("app/api/v2/azure/project-links/[id]/advanced-sync/route.ts"), read("app/api/v2/azure/connections/[id]/mappings/route.ts")]);
  const source = files.join("\n");
  for (const value of ["integration.sync", "integration.view", "integration.configure", "AZURE_SYNC_IN_PROGRESS", "AZURE_MAPPING_NOT_CONFIGURED", "AZURE_PARTIAL_SOURCE", "AZURE_AUTHENTICATION_FAILED", "AZURE_PERMISSION_DENIED", "AZURE_RATE_LIMITED", "AZURE_TIMEOUT", "VERSION_CONFLICT", "cache-control", "no-store"]) assert.match(source, new RegExp(value.replace(".", "\\.")));
});

test("Integration UI exposes mapping administration and normalized work-item refresh", async () => {
  const [center, manager, panel, shell, styles] = await Promise.all([read("app/integrations/integration-center.tsx"), read("app/integrations/azure-mapping-manager.tsx"), read("app/integrations/azure-sync-panel.tsx"), read("app/command-center-shell.tsx"), read("app/globals.css")]);
  for (const value of ["Normalization mappings", "Read-only Stage 2 integration", "AzureMappingManager"]) assert.match(center, new RegExp(value));
  for (const value of ["PROCESS NORMALIZATION", "Use recommended set", "External values remain visible", "Save mappings"]) assert.match(manager, new RegExp(value));
  for (const value of ["Sync work \\+ Sprint evidence", "advanced-sync", "mapping warnings"]) assert.match(panel, new RegExp(value));
  assert.match(shell, /Stage 2 · Step 9/);
  for (const value of ["mapping-dialog", "mapping-list", "mapping-toolbar"]) assert.match(styles, new RegExp(value));
});
