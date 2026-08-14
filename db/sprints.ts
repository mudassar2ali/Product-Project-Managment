import { env } from "cloudflare:workers";
import type { SprintInput } from "../app/delivery/sprint-contract";

const sprintColumns = "s.id,s.business_id businessId,s.project_id projectId,p.name projectName,p.code projectCode,s.name,s.goal,s.origin,s.start_date startDate,s.end_date endDate,s.status,s.capacity_hours capacityHours,s.committed_points committedPoints,s.version,s.updated_at updatedAt";

export async function listSprints(input: { projectId: string; status: string; page: number; pageSize: number }) {
  const where = ["s.record_status='ACTIVE'"]; const values: unknown[] = [];
  if (input.projectId) { where.push("s.project_id=?"); values.push(input.projectId); }
  if (input.status) { where.push("s.status=?"); values.push(input.status); }
  const clause = where.join(" AND ");
  const [rows, count] = await Promise.all([
    env.DB.prepare(`SELECT ${sprintColumns},COUNT(m.id) itemCount,COALESCE(SUM(m.planned_hours),0) plannedHours FROM sprints s JOIN projects p ON p.id=s.project_id LEFT JOIN sprint_memberships m ON m.sprint_id=s.id AND m.removed_at IS NULL WHERE ${clause} GROUP BY s.id ORDER BY s.start_date DESC,s.business_id DESC LIMIT ? OFFSET ?`).bind(...values, input.pageSize, (input.page - 1) * input.pageSize).all(),
    env.DB.prepare(`SELECT COUNT(*) total FROM sprints s WHERE ${clause}`).bind(...values).first<{ total: number }>(),
  ]);
  return { items: rows.results, total: count?.total ?? 0 };
}

export async function createSprint(input: SprintInput, actor: string, correlationId: string) {
  if (!await env.DB.prepare("SELECT id FROM projects WHERE id=? AND record_status='ACTIVE'").bind(input.projectId).first()) return { kind: "invalid_project" as const };
  const id = crypto.randomUUID();
  const sequence = await env.DB.prepare("INSERT INTO business_sequences(entity_type,next_value,updated_at) VALUES('SPRINT',2,CURRENT_TIMESTAMP) ON CONFLICT(entity_type) DO UPDATE SET next_value=next_value+1,updated_at=CURRENT_TIMESTAMP RETURNING next_value-1 value").first<{ value: number }>();
  const businessId = `SPR-${String(sequence?.value ?? 1).padStart(5, "0")}`;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sprints(id,business_id,project_id,name,goal,origin,start_date,end_date,status,capacity_hours,created_by,updated_by) VALUES(?,?,?,?,?,'LOCAL',?,?,'PLANNED',?,?,?)").bind(id, businessId, input.projectId, input.name, input.goal, input.startDate, input.endDate, input.capacityHours, actor, actor),
    env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)").bind(crypto.randomUUID(), "Sprint", id, "CREATE", JSON.stringify({ businessId, ...input }), actor, correlationId),
  ]);
  return { kind: "ok" as const, id, businessId };
}

export async function getSprint(id: string) {
  const sprint = await env.DB.prepare(`SELECT ${sprintColumns} FROM sprints s JOIN projects p ON p.id=s.project_id WHERE s.id=? AND s.record_status='ACTIVE'`).bind(id).first();
  if (!sprint) return { kind: "not_found" as const };
  const memberships = await env.DB.prepare("SELECT m.id,m.backlog_item_id backlogItemId,m.planned_points plannedPoints,m.planned_hours plannedHours,m.sequence,b.business_id businessId,b.item_type itemType,b.title,b.status,b.blocked,(SELECT COUNT(*) FROM backlog_dependencies d JOIN backlog_items predecessor ON predecessor.id=d.predecessor_item_id WHERE d.successor_item_id=b.id AND d.dependency_type IN ('BLOCKS','REQUIRES') AND predecessor.status<>'DONE') unresolvedDependencies FROM sprint_memberships m JOIN backlog_items b ON b.id=m.backlog_item_id WHERE m.sprint_id=? AND m.removed_at IS NULL ORDER BY m.sequence").bind(id).all();
  const available = await env.DB.prepare("SELECT b.id,b.business_id businessId,b.item_type itemType,b.title,b.status,b.story_points storyPoints,b.estimate_hours estimateHours,b.blocked,(SELECT COUNT(*) FROM backlog_dependencies d JOIN backlog_items predecessor ON predecessor.id=d.predecessor_item_id WHERE d.successor_item_id=b.id AND d.dependency_type IN ('BLOCKS','REQUIRES') AND predecessor.status<>'DONE') unresolvedDependencies FROM backlog_items b WHERE b.project_id=? AND b.origin='LOCAL' AND b.record_status='ACTIVE' AND b.status='READY' AND b.item_type IN ('STORY','TASK','BUG') AND NOT EXISTS(SELECT 1 FROM sprint_memberships m JOIN sprints assigned ON assigned.id=m.sprint_id WHERE m.backlog_item_id=b.id AND m.removed_at IS NULL AND assigned.status IN ('PLANNED','ACTIVE') AND assigned.record_status='ACTIVE') ORDER BY b.priority DESC,b.business_id").bind((sprint as { projectId: string }).projectId).all();
  return { kind: "ok" as const, sprint, memberships: memberships.results, available: available.results };
}

export async function updateSprint(id: string, input: SprintInput, version: number, actor: string, correlationId: string) {
  const before = await env.DB.prepare("SELECT * FROM sprints WHERE id=? AND record_status='ACTIVE'").bind(id).first<Record<string, unknown>>();
  if (!before) return { kind: "not_found" as const };
  if (before.origin !== "LOCAL") return { kind: "read_only" as const };
  if (before.status !== "PLANNED") return { kind: "locked" as const };
  if (!await env.DB.prepare("SELECT id FROM projects WHERE id=? AND record_status='ACTIVE'").bind(input.projectId).first()) return { kind: "invalid_project" as const };
  if (before.project_id !== input.projectId && await env.DB.prepare("SELECT id FROM sprint_memberships WHERE sprint_id=? AND removed_at IS NULL LIMIT 1").bind(id).first()) return { kind: "has_items" as const };
  const result = await env.DB.prepare("UPDATE sprints SET project_id=?,name=?,goal=?,start_date=?,end_date=?,capacity_hours=?,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND status='PLANNED' AND origin='LOCAL'").bind(input.projectId, input.name, input.goal, input.startDate, input.endDate, input.capacityHours, actor, id, version).run();
  if (!result.meta.changes) return { kind: "conflict" as const };
  await env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,?,'APPLICATION',?)").bind(crypto.randomUUID(), "Sprint", id, "UPDATE", JSON.stringify(before), JSON.stringify(input), actor, correlationId).run();
  return { kind: "ok" as const, version: version + 1 };
}

export async function addSprintItem(sprintId: string, backlogItemId: string, version: number, actor: string, correlationId: string) {
  const sprint = await env.DB.prepare("SELECT id,project_id projectId,origin,status,version FROM sprints WHERE id=? AND record_status='ACTIVE'").bind(sprintId).first<{ id: string; projectId: string; origin: string; status: string; version: number }>();
  if (!sprint) return { kind: "not_found" as const };
  if (sprint.origin !== "LOCAL") return { kind: "read_only" as const };
  if (sprint.status !== "PLANNED") return { kind: "locked" as const };
  if (sprint.version !== version) return { kind: "conflict" as const };
  const item = await env.DB.prepare("SELECT id,project_id projectId,origin,status,item_type itemType,COALESCE(story_points,0) points,COALESCE(estimate_hours,0) hours FROM backlog_items WHERE id=? AND record_status='ACTIVE'").bind(backlogItemId).first<{ id: string; projectId: string; origin: string; status: string; itemType: string; points: number; hours: number }>();
  if (!item) return { kind: "item_not_found" as const };
  if (item.projectId !== sprint.projectId || item.origin !== "LOCAL") return { kind: "scope" as const };
  if (item.status !== "READY" || !["STORY", "TASK", "BUG"].includes(item.itemType)) return { kind: "not_ready" as const };
  if (await env.DB.prepare("SELECT m.id FROM sprint_memberships m JOIN sprints s ON s.id=m.sprint_id WHERE m.backlog_item_id=? AND m.removed_at IS NULL AND s.status IN ('PLANNED','ACTIVE') AND s.record_status='ACTIVE'").bind(item.id).first()) return { kind: "already_assigned" as const };
  const unresolved = await env.DB.prepare("SELECT d.id FROM backlog_dependencies d JOIN backlog_items p ON p.id=d.predecessor_item_id WHERE d.successor_item_id=? AND d.dependency_type IN ('BLOCKS','REQUIRES') AND p.status<>'DONE' LIMIT 1").bind(item.id).first();
  if (unresolved) return { kind: "unresolved" as const };
  const next = await env.DB.prepare("SELECT COALESCE(MAX(sequence),0)+1 value FROM sprint_memberships WHERE sprint_id=? AND removed_at IS NULL").bind(sprint.id).first<{ value: number }>();
  const membershipId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sprint_memberships(id,sprint_id,backlog_item_id,planned_points,planned_hours,sequence,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?)").bind(membershipId, sprint.id, item.id, item.points, item.hours, next?.value ?? 1, actor, actor),
    env.DB.prepare("UPDATE sprints SET committed_points=(SELECT COALESCE(SUM(planned_points),0) FROM sprint_memberships WHERE sprint_id=? AND removed_at IS NULL),version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=?").bind(sprint.id, actor, sprint.id, version),
    env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)").bind(crypto.randomUUID(), "Sprint", sprint.id, "ITEM_ASSIGN", JSON.stringify({ membershipId, backlogItemId: item.id, plannedPoints: item.points, plannedHours: item.hours }), actor, correlationId),
  ]);
  return { kind: "ok" as const, version: version + 1 };
}

export async function removeSprintItem(sprintId: string, membershipId: string, version: number, actor: string, correlationId: string) {
  const sprint = await env.DB.prepare("SELECT id,origin,status,version FROM sprints WHERE id=? AND record_status='ACTIVE'").bind(sprintId).first<{ id: string; origin: string; status: string; version: number }>();
  if (!sprint) return { kind: "not_found" as const };
  if (sprint.origin !== "LOCAL") return { kind: "read_only" as const };
  if (sprint.status !== "PLANNED") return { kind: "locked" as const };
  if (sprint.version !== version) return { kind: "conflict" as const };
  const membership = await env.DB.prepare("SELECT id,backlog_item_id backlogItemId FROM sprint_memberships WHERE id=? AND sprint_id=? AND removed_at IS NULL").bind(membershipId, sprintId).first();
  if (!membership) return { kind: "membership_not_found" as const };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sprint_memberships WHERE id=? AND sprint_id=?").bind(membershipId, sprintId),
    env.DB.prepare("UPDATE sprints SET committed_points=(SELECT COALESCE(SUM(planned_points),0) FROM sprint_memberships WHERE sprint_id=? AND removed_at IS NULL),version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=?").bind(sprintId, actor, sprintId, version),
    env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)").bind(crypto.randomUUID(), "Sprint", sprintId, "ITEM_REMOVE", JSON.stringify(membership), actor, correlationId),
  ]);
  return { kind: "ok" as const, version: version + 1 };
}

export async function reorderSprintItems(sprintId: string, membershipIds: string[], version: number, actor: string, correlationId: string) {
  const sprint = await env.DB.prepare("SELECT id,origin,status,version FROM sprints WHERE id=? AND record_status='ACTIVE'").bind(sprintId).first<{ id: string; origin: string; status: string; version: number }>();
  if (!sprint) return { kind: "not_found" as const };
  if (sprint.origin !== "LOCAL") return { kind: "read_only" as const };
  if (sprint.status !== "PLANNED") return { kind: "locked" as const };
  if (sprint.version !== version) return { kind: "conflict" as const };
  const existing = await env.DB.prepare("SELECT id FROM sprint_memberships WHERE sprint_id=? AND removed_at IS NULL ORDER BY sequence").bind(sprintId).all<{ id: string }>();
  if (membershipIds.length !== existing.results.length || new Set(membershipIds).size !== membershipIds.length || existing.results.some(row => !membershipIds.includes(row.id))) return { kind: "invalid_order" as const };
  const statements = membershipIds.map((id, index) => env.DB.prepare("UPDATE sprint_memberships SET sequence=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND sprint_id=?").bind(index + 1, actor, id, sprintId));
  statements.push(env.DB.prepare("UPDATE sprints SET version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=?").bind(actor, sprintId, version));
  statements.push(env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)").bind(crypto.randomUUID(), "Sprint", sprintId, "ITEM_REORDER", JSON.stringify(membershipIds), actor, correlationId));
  await env.DB.batch(statements);
  return { kind: "ok" as const, version: version + 1 };
}
