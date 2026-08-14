import { env } from "cloudflare:workers";
import type { DependencyInput } from "../app/delivery/dependency-contract";

export async function listDependencies(itemId: string) {
  const item = await env.DB.prepare("SELECT id,business_id businessId,title,project_id projectId,origin,status,version FROM backlog_items WHERE id=? AND record_status='ACTIVE'").bind(itemId).first();
  if (!item) return { kind: "not_found" as const };
  const result = await env.DB.prepare("SELECT d.id,d.dependency_type dependencyType,d.origin,d.predecessor_item_id predecessorId,p.business_id predecessorBusinessId,p.title predecessorTitle,p.status predecessorStatus,d.successor_item_id successorId,s.business_id successorBusinessId,s.title successorTitle,s.status successorStatus FROM backlog_dependencies d JOIN backlog_items p ON p.id=d.predecessor_item_id JOIN backlog_items s ON s.id=d.successor_item_id WHERE d.predecessor_item_id=? OR d.successor_item_id=? ORDER BY d.created_at,d.id").bind(itemId, itemId).all();
  return { kind: "ok" as const, item, dependencies: result.results };
}

export async function addDependency(successorId: string, input: DependencyInput, actor: string, correlationId: string) {
  const [successor, predecessor] = await Promise.all([
    env.DB.prepare("SELECT id,business_id businessId,project_id projectId,origin,status,version FROM backlog_items WHERE id=? AND record_status='ACTIVE'").bind(successorId).first<{ id: string; businessId: string; projectId: string; origin: string; status: string; version: number }>(),
    env.DB.prepare("SELECT id,business_id businessId,project_id projectId,origin,status FROM backlog_items WHERE id=? AND record_status='ACTIVE'").bind(input.predecessorId).first<{ id: string; businessId: string; projectId: string; origin: string; status: string }>(),
  ]);
  if (!successor || !predecessor) return { kind: "not_found" as const };
  if (successor.origin !== "LOCAL") return { kind: "read_only" as const };
  if (successor.id === predecessor.id) return { kind: "self" as const };
  if (successor.projectId !== predecessor.projectId || successor.origin !== predecessor.origin) return { kind: "scope" as const };
  if (successor.version !== input.version) return { kind: "conflict" as const };
  if (successor.status === "READY" && input.dependencyType !== "RELATES_TO" && predecessor.status !== "DONE") return { kind: "not_ready" as const };
  const duplicate = await env.DB.prepare("SELECT id FROM backlog_dependencies WHERE predecessor_item_id=? AND successor_item_id=? AND dependency_type=?").bind(predecessor.id, successor.id, input.dependencyType).first();
  if (duplicate) return { kind: "duplicate" as const };
  const cycle = await env.DB.prepare("WITH RECURSIVE reachable(id) AS (SELECT successor_item_id FROM backlog_dependencies WHERE predecessor_item_id=? UNION SELECT d.successor_item_id FROM backlog_dependencies d JOIN reachable r ON d.predecessor_item_id=r.id) SELECT id FROM reachable WHERE id=? LIMIT 1").bind(successor.id, predecessor.id).first();
  if (cycle) return { kind: "cycle" as const };
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO backlog_dependencies(id,predecessor_item_id,successor_item_id,dependency_type,origin,created_by,updated_by) VALUES(?,?,?,?, 'LOCAL',?,?)").bind(id, predecessor.id, successor.id, input.dependencyType, actor, actor),
    env.DB.prepare("UPDATE backlog_items SET version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=?").bind(actor, successor.id, input.version),
    env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)").bind(crypto.randomUUID(), "BacklogItem", successor.id, "DEPENDENCY_ADD", JSON.stringify({ id, predecessorId: predecessor.id, predecessorBusinessId: predecessor.businessId, dependencyType: input.dependencyType }), actor, correlationId),
  ]);
  return { kind: "ok" as const, id, version: input.version + 1 };
}

export async function removeDependency(itemId: string, dependencyId: string, version: number, actor: string, correlationId: string) {
  const item = await env.DB.prepare("SELECT id,origin,version FROM backlog_items WHERE id=? AND record_status='ACTIVE'").bind(itemId).first<{ id: string; origin: string; version: number }>();
  if (!item) return { kind: "not_found" as const };
  if (item.origin !== "LOCAL") return { kind: "read_only" as const };
  if (!Number.isInteger(version) || item.version !== version) return { kind: "conflict" as const };
  const dependency = await env.DB.prepare("SELECT id,predecessor_item_id predecessorId,successor_item_id successorId,dependency_type dependencyType,origin FROM backlog_dependencies WHERE id=? AND (predecessor_item_id=? OR successor_item_id=?)").bind(dependencyId, itemId, itemId).first<{ id: string; predecessorId: string; successorId: string; dependencyType: string; origin: string }>();
  if (!dependency) return { kind: "dependency_not_found" as const };
  if (dependency.origin !== "LOCAL") return { kind: "read_only" as const };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM backlog_dependencies WHERE id=? AND origin='LOCAL'").bind(dependencyId),
    env.DB.prepare("UPDATE backlog_items SET version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=?").bind(actor, itemId, version),
    env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)").bind(crypto.randomUUID(), "BacklogItem", itemId, "DEPENDENCY_REMOVE", JSON.stringify(dependency), actor, correlationId),
  ]);
  return { kind: "ok" as const, version: version + 1 };
}
