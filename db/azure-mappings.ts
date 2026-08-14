import { env } from "cloudflare:workers";
import { mappingKey, type AzureMappingEntryInput } from "../app/integrations/azure-mapping-contract";

export type AzureMappingRecord = AzureMappingEntryInput & { id: string; active: number; version: number };

export async function listAzureMappings(connectionId: string) {
  const connection = await env.DB.prepare("SELECT id,version FROM azure_connections WHERE id=? AND record_status='ACTIVE'").bind(connectionId).first<{ id: string; version: number }>();
  if (!connection) return { kind: "not_found" as const };
  const result = await env.DB.prepare("SELECT id,mapping_kind mappingKind,external_value externalValue,normalized_value normalizedValue,active,version FROM azure_mapping_entries WHERE connection_id=? AND active=1 ORDER BY mapping_kind,external_key").bind(connectionId).all<AzureMappingRecord>();
  return { kind: "ok" as const, connectionVersion: connection.version, entries: result.results };
}

export async function saveAzureMappings(connectionId: string, entries: AzureMappingEntryInput[], version: number, actor: string, correlationId: string) {
  const before = await listAzureMappings(connectionId);
  if (before.kind === "not_found") return before;
  if (before.connectionVersion !== version) return { kind: "conflict" as const };
  const statements = [env.DB.prepare("UPDATE azure_mapping_entries SET active=0,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE connection_id=? AND active=1").bind(actor, connectionId)];
  for (const entry of entries) statements.push(env.DB.prepare("INSERT INTO azure_mapping_entries(id,connection_id,mapping_kind,external_value,external_key,normalized_value,active,created_by,updated_by) VALUES(?,?,?,?,?,?,1,?,?) ON CONFLICT(connection_id,mapping_kind,external_key) DO UPDATE SET external_value=excluded.external_value,normalized_value=excluded.normalized_value,active=1,version=azure_mapping_entries.version+1,updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by").bind(crypto.randomUUID(), connectionId, entry.mappingKind, entry.externalValue, mappingKey(entry.externalValue), entry.normalizedValue, actor, actor));
  statements.push(env.DB.prepare("UPDATE azure_connections SET version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND record_status='ACTIVE'").bind(actor, connectionId, version));
  statements.push(env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,?,'APPLICATION',?)").bind(crypto.randomUUID(), "AzureConnection", connectionId, "MAPPINGS_UPDATE", JSON.stringify(before.entries), JSON.stringify(entries), actor, correlationId));
  await env.DB.batch(statements);
  return listAzureMappings(connectionId);
}

export async function getActiveAzureMappingMap(connectionId: string) {
  const result = await env.DB.prepare("SELECT mapping_kind mappingKind,external_key externalKey,normalized_value normalizedValue FROM azure_mapping_entries WHERE connection_id=? AND active=1").bind(connectionId).all<{ mappingKind: "TYPE" | "STATE"; externalKey: string; normalizedValue: string }>();
  const types = new Map<string, string>(), states = new Map<string, string>();
  for (const entry of result.results) (entry.mappingKind === "TYPE" ? types : states).set(entry.externalKey, entry.normalizedValue);
  return { types, states };
}
