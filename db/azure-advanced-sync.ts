import { env } from "cloudflare:workers";
import type { AdvancedWorkItemSource, ExternalWorkItem } from "../app/integrations/engineering-delivery-provider";
import { mappingKey } from "../app/integrations/azure-mapping-contract";
import { getActiveAzureMappingMap } from "./azure-mappings";

type SyncContext = { id: string; projectId: string; connectionId: string; azureProjectId: string; azureTeamId: string | null; organization: string; authType: string; credentialBinding: string };
type ExistingItem = { id: string; externalId: string; externalRevision: string; itemType: string; deliveryState: string; parentId: string | null; sourceMissingAt: string | null };
type NormalizedItem = ExternalWorkItem & { normalizedType: string | null; normalizedState: string | null; backlogId: string | null; parentId: string | null };
type Diagnostic = { code: string; severity: "WARNING" | "ERROR"; mappingKind: "TYPE" | "STATE" | null; externalValue: string | null; occurrences: number; message: string };

export async function getAdvancedSyncContext(linkId: string) {
  return env.DB.prepare("SELECT l.id,l.project_id projectId,l.connection_id connectionId,l.azure_project_id azureProjectId,l.azure_team_id azureTeamId,c.organization,c.auth_type authType,c.credential_binding credentialBinding FROM azure_project_links l JOIN azure_connections c ON c.id=l.connection_id WHERE l.id=? AND l.record_status='ACTIVE' AND c.record_status='ACTIVE' AND c.enabled=1").bind(linkId).first<SyncContext>();
}

export async function beginAdvancedSync(linkId: string, actor: string, correlationId: string) {
  const id = crypto.randomUUID(), startedAt = new Date().toISOString(), lockExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE azure_sync_runs SET status='FAILED',completed_at=CURRENT_TIMESTAMP,error_code='AZURE_SYNC_LOCK_EXPIRED',error_message='A previous synchronization lease expired.',updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE link_id=? AND status='RUNNING' AND lock_expires_at IS NOT NULL AND datetime(lock_expires_at)<CURRENT_TIMESTAMP").bind(actor, linkId),
      env.DB.prepare("INSERT INTO azure_sync_runs(id,link_id,status,trigger,sync_mode,started_at,lock_expires_at,correlation_id,created_by,updated_by) VALUES(?,?,'RUNNING','MANUAL','ADVANCED',?,?,?,?,?)").bind(id, linkId, startedAt, lockExpiresAt, correlationId, actor, actor),
    ]);
  } catch (error) { if (error instanceof Error && /unique/i.test(error.message)) return { kind: "in_progress" as const }; throw error; }
  return { kind: "ok" as const, id, startedAt };
}

const localStatus = (deliveryState: string | null) => deliveryState === "READY" ? "READY" : deliveryState === "IN_PROGRESS" || deliveryState === "VALIDATION" ? "IN_PROGRESS" : deliveryState === "DONE" ? "DONE" : deliveryState === "REMOVED" ? "REMOVED" : "DRAFT";
const businessId = (connectionId: string, externalId: string) => `ADO-${connectionId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}-${externalId}`;
const relationTarget = (relation: { relationType: string; targetExternalId: string }, currentId: string) => relation.relationType === "System.LinkTypes.Dependency-Forward" ? { predecessor: currentId, successor: relation.targetExternalId } : relation.relationType === "System.LinkTypes.Dependency-Reverse" ? { predecessor: relation.targetExternalId, successor: currentId } : null;

function groupedDiagnostics(items: NormalizedItem[], invalidParents: string[]) {
  const groups = new Map<string, Diagnostic>();
  const add = (diagnostic: Diagnostic) => { const key = `${diagnostic.code}:${diagnostic.externalValue ?? ""}`, existing = groups.get(key); if (existing) existing.occurrences += diagnostic.occurrences; else groups.set(key, diagnostic); };
  for (const item of items) {
    if (!item.normalizedType) add({ code: "AZURE_TYPE_UNMAPPED", severity: "WARNING", mappingKind: "TYPE", externalValue: item.externalType, occurrences: 1, message: "Azure work-item type is preserved but excluded from the normalized Backlog until mapped." });
    if (!item.normalizedState) add({ code: "AZURE_STATE_UNMAPPED", severity: "WARNING", mappingKind: "STATE", externalValue: item.externalState, occurrences: 1, message: "Azure state is preserved and excluded from completion calculations until mapped." });
  }
  if (invalidParents.length) add({ code: "AZURE_HIERARCHY_UNMAPPED", severity: "WARNING", mappingKind: null, externalValue: null, occurrences: invalidParents.length, message: "Azure parent relationships that do not match the governed hierarchy were preserved in snapshots but not linked in the normalized Backlog." });
  return [...groups.values()];
}

export async function completeAdvancedSync(runId: string, context: SyncContext, source: AdvancedWorkItemSource, actor: string, correlationId: string) {
  if (!source.complete) return { kind: "partial_source" as const };
  const mappings = await getActiveAzureMappingMap(context.connectionId);
  if (!mappings.types.size || !mappings.states.size) return { kind: "mapping_missing" as const };
  const existingResult = await env.DB.prepare("SELECT id,external_id externalId,external_revision externalRevision,item_type itemType,delivery_state deliveryState,parent_id parentId,source_missing_at sourceMissingAt FROM backlog_items WHERE project_id=? AND origin='AZURE_DEVOPS'").bind(context.projectId).all<ExistingItem>();
  const existingByExternal = new Map(existingResult.results.map(item => [item.externalId, item]));
  const normalized: NormalizedItem[] = source.items.map(item => { const normalizedType = mappings.types.get(mappingKey(item.externalType)) ?? null, normalizedState = mappings.states.get(mappingKey(item.externalState)) ?? null, existing = existingByExternal.get(item.externalId); return { ...item, normalizedType, normalizedState, backlogId: normalizedType ? existing?.id ?? crypto.randomUUID() : null, parentId: null }; });
  const normalizedByExternal = new Map(normalized.filter(item => item.backlogId).map(item => [item.externalId, item]));
  const invalidParents: string[] = [], allowedParent: Record<string, string | null> = { EPIC: null, FEATURE: "EPIC", STORY: "FEATURE", TASK: "STORY", BUG: "STORY" };
  for (const item of normalized) if (item.backlogId && item.parentExternalId) { const parent = normalizedByExternal.get(item.parentExternalId), expected = allowedParent[item.normalizedType!]; if (parent?.backlogId && parent.normalizedType === expected) item.parentId = parent.backlogId; else invalidParents.push(item.externalId); }
  const diagnostics = groupedDiagnostics(normalized, invalidParents), received = new Set(source.items.map(item => item.externalId)), missing = existingResult.results.filter(item => !received.has(item.externalId) && !item.sourceMissingAt), now = source.retrievedAt;
  const snapshotRows = await env.DB.prepare("SELECT external_id externalId,external_revision externalRevision FROM azure_work_item_snapshots WHERE link_id=?").bind(context.id).all<{ externalId: string; externalRevision: string }>(), snapshotKeys = new Set(snapshotRows.results.map(row => `${row.externalId}:${row.externalRevision}`));
  const prior = await env.DB.prepare("SELECT id FROM azure_sync_runs WHERE link_id=? AND sync_mode='ADVANCED' AND status='SUCCEEDED' AND source_revision=? LIMIT 1").bind(context.id, source.sourceRevision).first(), idempotent = Boolean(prior);
  let inserted = 0, updated = 0, skipped = 0, snapshotsInserted = 0;
  const statements = [];
  for (const item of normalized) {
    const snapshotKey = `${item.externalId}:${item.externalRevision}`;
    if (!snapshotKeys.has(snapshotKey)) { snapshotsInserted += 1; statements.push(env.DB.prepare("INSERT INTO azure_work_item_snapshots(id,link_id,sync_run_id,external_id,external_revision,external_type,external_state,normalized_type,normalized_state,parent_external_id,title,owner,story_points,remaining_work,blocked,blocked_reason,iteration_id,iteration_path,relations_json,source_url,source_changed_at,synced_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), context.id, runId, item.externalId, item.externalRevision, item.externalType, item.externalState, item.normalizedType, item.normalizedState, item.parentExternalId, item.title, item.owner, item.storyPoints, item.remainingWork, item.blocked ? 1 : 0, item.blockedReason, item.iterationId, item.iterationPath, JSON.stringify(item.relations), item.sourceUrl, item.sourceChangedAt, now, actor, actor)); }
    const existing = existingByExternal.get(item.externalId);
    if (!item.backlogId || !item.normalizedType) { if (existing && (existing.externalRevision !== item.externalRevision || existing.deliveryState !== "UNMAPPED" || existing.sourceMissingAt)) { updated += 1; statements.push(env.DB.prepare("UPDATE backlog_items SET parent_id=NULL,external_type=?,external_state=?,external_parent_id=?,external_owner=?,external_iteration_id=?,external_iteration_path=?,status='DRAFT',delivery_state='UNMAPPED',blocked=?,blocked_reason=?,external_revision=?,source_url=?,source_updated_at=?,synced_at=?,source_missing_at=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND origin='AZURE_DEVOPS'").bind(item.externalType, item.externalState, item.parentExternalId, item.owner, item.iterationId, item.iterationPath, item.blocked ? 1 : 0, item.blockedReason, item.externalRevision, item.sourceUrl, item.sourceChangedAt, now, actor, existing.id)); } else skipped += 1; continue; }
    if (!existing) inserted += 1; else if (existing.externalRevision !== item.externalRevision || existing.itemType !== item.normalizedType || existing.deliveryState !== (item.normalizedState ?? "UNMAPPED") || existing.parentId !== item.parentId || existing.sourceMissingAt) updated += 1; else skipped += 1;
    const deliveryState = item.normalizedState ?? "UNMAPPED";
    statements.push(env.DB.prepare(`INSERT INTO backlog_items(id,business_id,project_id,parent_id,item_type,external_type,external_state,external_parent_id,external_owner,external_iteration_id,external_iteration_path,origin,title,priority,story_points,remaining_work,status,delivery_state,blocked,blocked_reason,external_id,external_revision,source_url,source_updated_at,synced_at,source_missing_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,'AZURE_DEVOPS',?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?) ON CONFLICT(project_id,origin,external_id) DO UPDATE SET parent_id=excluded.parent_id,item_type=excluded.item_type,external_type=excluded.external_type,external_state=excluded.external_state,external_parent_id=excluded.external_parent_id,external_owner=excluded.external_owner,external_iteration_id=excluded.external_iteration_id,external_iteration_path=excluded.external_iteration_path,title=excluded.title,story_points=excluded.story_points,remaining_work=excluded.remaining_work,status=excluded.status,delivery_state=excluded.delivery_state,blocked=excluded.blocked,blocked_reason=excluded.blocked_reason,external_revision=excluded.external_revision,source_url=excluded.source_url,source_updated_at=excluded.source_updated_at,synced_at=excluded.synced_at,source_missing_at=NULL,version=backlog_items.version+1,updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by WHERE backlog_items.external_revision<>excluded.external_revision OR backlog_items.item_type<>excluded.item_type OR backlog_items.delivery_state<>excluded.delivery_state OR backlog_items.parent_id IS NOT excluded.parent_id OR backlog_items.source_missing_at IS NOT NULL`).bind(item.backlogId, businessId(context.connectionId, item.externalId), context.projectId, item.parentId, item.normalizedType, item.externalType, item.externalState, item.parentExternalId, item.owner, item.iterationId, item.iterationPath, item.title, "MEDIUM", item.storyPoints, item.remainingWork, localStatus(item.normalizedState), deliveryState, item.blocked ? 1 : 0, item.blockedReason, item.externalId, item.externalRevision, item.sourceUrl, item.sourceChangedAt, now, actor, actor));
  }
  for (const item of missing) statements.push(env.DB.prepare("UPDATE backlog_items SET source_missing_at=?,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND origin='AZURE_DEVOPS' AND source_missing_at IS NULL").bind(now, actor, item.id));
  statements.push(env.DB.prepare("DELETE FROM backlog_dependencies WHERE origin='AZURE_DEVOPS' AND predecessor_item_id IN(SELECT id FROM backlog_items WHERE project_id=? AND origin='AZURE_DEVOPS')").bind(context.projectId));
  const dependencyKeys = new Set<string>();
  for (const item of normalized) if (item.backlogId) for (const relation of item.relations) { const target = relationTarget(relation, item.externalId); if (!target) continue; const predecessor = normalizedByExternal.get(target.predecessor)?.backlogId, successor = normalizedByExternal.get(target.successor)?.backlogId; if (!predecessor || !successor || predecessor === successor) continue; const key = `${predecessor}:${successor}:BLOCKS`; if (dependencyKeys.has(key)) continue; dependencyKeys.add(key); statements.push(env.DB.prepare("INSERT INTO backlog_dependencies(id,predecessor_item_id,successor_item_id,dependency_type,origin,external_relation_id,created_by,updated_by) VALUES(?,?,?,'BLOCKS','AZURE_DEVOPS',?,?,?)").bind(crypto.randomUUID(), predecessor, successor, `${target.predecessor}:${relation.relationType}:${target.successor}`, actor, actor)); }
  for (const diagnostic of diagnostics) statements.push(env.DB.prepare("INSERT INTO azure_sync_diagnostics(id,sync_run_id,link_id,code,severity,mapping_kind,external_value,occurrences,message,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), runId, context.id, diagnostic.code, diagnostic.severity, diagnostic.mappingKind, diagnostic.externalValue, diagnostic.occurrences, diagnostic.message, actor, actor));
  const unmappedTypes = normalized.filter(item => !item.normalizedType).length, unmappedStates = normalized.filter(item => !item.normalizedState).length;
  statements.push(env.DB.prepare("UPDATE azure_sync_runs SET status='SUCCEEDED',completed_at=?,lock_expires_at=NULL,pages_read=?,items_seen=?,items_inserted=?,items_updated=?,items_skipped=?,items_missing=?,unmapped_types=?,unmapped_states=?,source_revision=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND status='RUNNING'").bind(now, source.pagesRead, source.items.length, inserted, updated, skipped, missing.length, unmappedTypes, unmappedStates, source.sourceRevision, actor, runId));
  statements.push(env.DB.prepare("UPDATE azure_project_links SET last_validated_at=?,last_validation_status='ADVANCED_SYNCED',updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=?").bind(now, actor, context.id));
  if (!idempotent) statements.push(env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'AZURE_DEVOPS',?)").bind(crypto.randomUUID(), "AzureProjectLink", context.id, "ADVANCED_SYNC", JSON.stringify({ runId, sourceRevision: source.sourceRevision, pagesRead: source.pagesRead, itemsSeen: source.items.length, inserted, updated, skipped, snapshotsInserted, unmappedTypes, unmappedStates }), actor, correlationId));
  if (missing.length) statements.push(env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'AZURE_DEVOPS',?)").bind(crypto.randomUUID(), "AzureProjectLink", context.id, "AZURE_SOURCE_MISSING", JSON.stringify({ runId, count: missing.length, externalIds: missing.slice(0, 100).map(item => item.externalId) }), actor, correlationId));
  await env.DB.batch(statements);
  return { kind: "ok" as const, runId, sourceRevision: source.sourceRevision, syncedAt: now, pagesRead: source.pagesRead, itemsSeen: source.items.length, inserted, updated, skipped, snapshotsInserted, missing: missing.length, unmappedTypes, unmappedStates, idempotent };
}

export async function failAdvancedSync(runId: string, linkId: string, code: string, message: string, actor: string, correlationId: string) {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE azure_sync_runs SET status='FAILED',completed_at=?,lock_expires_at=NULL,error_code=?,error_message=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND status='RUNNING'").bind(now, code, message, actor, runId),
    env.DB.prepare("UPDATE azure_project_links SET last_validation_status='ADVANCED_SYNC_FAILED',updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=?").bind(actor, linkId),
    env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'AZURE_DEVOPS',?)").bind(crypto.randomUUID(), "AzureProjectLink", linkId, "ADVANCED_SYNC_FAILED", JSON.stringify({ runId, code }), actor, correlationId),
  ]);
}
