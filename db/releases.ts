import { env } from "cloudflare:workers";
import { assertReleaseTransition } from "../app/releases/stage4-contract";
import type { ReleaseMetadataInput, ReleaseRegistrationInput } from "../app/releases/release-contract";

export type ReleaseRow = {
  id: string; businessId: string; projectId: string; projectName: string;
  name: string; releaseType: string; targetVersion: string; plannedDate: string | null;
  status: string; scopeLockedAt: string | null; releasedAt: string | null;
  ownerUserId: string | null; ownerName: string | null;
  recordStatus: string; version: number; createdAt: string; updatedAt: string;
};

export type ScopeItemRow = {
  id: string; releaseId: string; backlogItemId: string; businessId: string; title: string;
  itemType: string; status: string; deliveryState: string; addedAt: string;
};

const releaseColumns = `
  r.id,r.business_id businessId,r.project_id projectId,pr.name projectName,
  r.name,r.release_type releaseType,r.target_version targetVersion,r.planned_date plannedDate,
  r.status,r.scope_locked_at scopeLockedAt,r.released_at releasedAt,
  r.owner_user_id ownerUserId,u.display_name ownerName,
  r.record_status recordStatus,r.version,r.created_at createdAt,r.updated_at updatedAt
`;

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

async function nextBusinessId() {
  const result = await env.DB.prepare(`
    INSERT INTO business_sequences(entity_type,next_value,updated_at) VALUES('RELEASE',2,CURRENT_TIMESTAMP)
    ON CONFLICT(entity_type) DO UPDATE SET next_value=next_value+1,updated_at=CURRENT_TIMESTAMP
    RETURNING next_value-1 value
  `).bind().first<{ value: number }>();
  return `REL-${String(result?.value ?? 1).padStart(4, "0")}`;
}

export async function listReleases(input: { q: string; projectId: string; status: string; page: number; pageSize: number }) {
  const conditions = ["r.record_status='ACTIVE'"];
  const values: unknown[] = [];
  if (input.q) { const q = `%${escapeLike(input.q)}%`; conditions.push("(r.name LIKE ? ESCAPE '\\' OR r.business_id LIKE ? ESCAPE '\\')"); values.push(q, q); }
  if (input.projectId) { conditions.push("r.project_id=?"); values.push(input.projectId); }
  if (input.status) { conditions.push("r.status=?"); values.push(input.status); }
  const where = conditions.join(" AND ");
  const offset = (input.page - 1) * input.pageSize;
  const [rows, count] = await Promise.all([
    env.DB.prepare(`SELECT ${releaseColumns} FROM releases r JOIN projects pr ON pr.id=r.project_id LEFT JOIN users u ON u.id=r.owner_user_id WHERE ${where} ORDER BY r.updated_at DESC LIMIT ? OFFSET ?`).bind(...values, input.pageSize, offset).all<ReleaseRow>(),
    env.DB.prepare(`SELECT COUNT(*) total FROM releases r WHERE ${where}`).bind(...values).first<{ total: number }>(),
  ]);
  return { items: rows.results, total: Number(count?.total ?? 0) };
}

async function scopeItemsFor(releaseId: string) {
  const rows = await env.DB.prepare(`
    SELECT s.id,s.release_id releaseId,s.backlog_item_id backlogItemId,b.business_id businessId,b.title,
      b.item_type itemType,b.status,b.delivery_state deliveryState,s.added_at addedAt
    FROM release_scope_items s JOIN backlog_items b ON b.id=s.backlog_item_id
    WHERE s.release_id=? AND s.removed_at IS NULL ORDER BY s.added_at ASC
  `).bind(releaseId).all<ScopeItemRow>();
  return rows.results;
}

export async function getRelease(id: string) {
  const release = await env.DB.prepare(`SELECT ${releaseColumns} FROM releases r JOIN projects pr ON pr.id=r.project_id LEFT JOIN users u ON u.id=r.owner_user_id WHERE r.id=? AND r.record_status='ACTIVE'`).bind(id).first<ReleaseRow>();
  if (!release) return { kind: "not_found" as const };
  return { kind: "ok" as const, release, scope: await scopeItemsFor(id) };
}

async function validateProjectScope(projectId: string) {
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id=? AND record_status='ACTIVE'").bind(projectId).first<{ id: string }>();
  return Boolean(project);
}

export async function createRelease(input: ReleaseRegistrationInput, actor: string, correlationId: string) {
  if (!(await validateProjectScope(input.projectId))) return { kind: "invalid_project" as const };
  const id = crypto.randomUUID();
  const businessId = await nextBusinessId();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO releases(id,business_id,project_id,name,release_type,target_version,planned_date,owner_user_id,created_by,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?)
    `).bind(id, businessId, input.projectId, input.name, input.releaseType, input.targetVersion, input.plannedDate, input.ownerUserId, actor, actor),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)`)
      .bind(crypto.randomUUID(), "Release", id, "CREATE", JSON.stringify({ businessId, projectId: input.projectId, name: input.name, releaseType: input.releaseType }), actor, correlationId),
  ]);
  return { kind: "ok" as const, ...(await getRelease(id)) };
}

export async function updateReleaseMetadata(id: string, input: ReleaseMetadataInput, expectedVersion: number, actor: string, correlationId: string) {
  const before = await env.DB.prepare("SELECT id,name,release_type releaseType,target_version targetVersion,planned_date plannedDate,owner_user_id ownerUserId FROM releases WHERE id=? AND record_status='ACTIVE'").bind(id).first();
  if (!before) return { kind: "not_found" as const };
  const result = await env.DB.batch([
    env.DB.prepare(`
      UPDATE releases SET name=?,release_type=?,target_version=?,planned_date=?,owner_user_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=?
      WHERE id=? AND version=? AND record_status='ACTIVE'
    `).bind(input.name, input.releaseType, input.targetVersion, input.plannedDate, input.ownerUserId, actor, id, expectedVersion),
    env.DB.prepare(`
      INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,after_json,actor_user_id,source,correlation_id) SELECT ?,?,?,?,?,?,?,'APPLICATION',? WHERE EXISTS(SELECT 1 FROM releases WHERE id=? AND version=? AND record_status='ACTIVE')
    `).bind(crypto.randomUUID(), "Release", id, "UPDATE", JSON.stringify(before), JSON.stringify(input), actor, correlationId, id, expectedVersion),
  ]);
  if (result[0].meta.changes === 0) return { kind: "conflict" as const };
  return { kind: "ok" as const, ...(await getRelease(id)) };
}

export async function addScopeItem(releaseId: string, backlogItemId: string, actor: string, correlationId: string) {
  const release = await env.DB.prepare("SELECT id,project_id projectId,status FROM releases WHERE id=? AND record_status='ACTIVE'").bind(releaseId).first<{ id: string; projectId: string; status: string }>();
  if (!release) return { kind: "not_found" as const };
  if (release.status !== "PLANNING") return { kind: "scope_locked" as const };
  const item = await env.DB.prepare("SELECT id,project_id projectId FROM backlog_items WHERE id=? AND record_status='ACTIVE'").bind(backlogItemId).first<{ id: string; projectId: string }>();
  if (!item || item.projectId !== release.projectId) return { kind: "not_found" as const };
  const activeElsewhere = await env.DB.prepare(`
    SELECT s.id FROM release_scope_items s JOIN releases r ON r.id=s.release_id
    WHERE s.backlog_item_id=? AND s.removed_at IS NULL AND s.release_id<>? AND r.status<>'CANCELLED' AND r.record_status='ACTIVE'
  `).bind(backlogItemId, releaseId).first<{ id: string }>();
  if (activeElsewhere) return { kind: "already_in_another_release" as const };
  const scopeId = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO release_scope_items(id,release_id,backlog_item_id,created_by,updated_by) VALUES(?,?,?,?,?)").bind(scopeId, releaseId, backlogItemId, actor, actor),
      env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)`)
        .bind(crypto.randomUUID(), "Release", releaseId, "SCOPE_ADD", JSON.stringify({ backlogItemId }), actor, correlationId),
    ]);
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return { kind: "duplicate" as const };
    throw error;
  }
  return { kind: "ok" as const, ...(await getRelease(releaseId)) };
}

export async function removeScopeItem(releaseId: string, backlogItemId: string, actor: string, correlationId: string) {
  const release = await env.DB.prepare("SELECT id,status FROM releases WHERE id=? AND record_status='ACTIVE'").bind(releaseId).first<{ id: string; status: string }>();
  if (!release) return { kind: "not_found" as const };
  if (release.status !== "PLANNING") return { kind: "scope_locked" as const };
  const result = await env.DB.batch([
    env.DB.prepare("UPDATE release_scope_items SET removed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE release_id=? AND backlog_item_id=? AND removed_at IS NULL").bind(actor, releaseId, backlogItemId),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,actor_user_id,source,correlation_id) SELECT ?,?,?,?,?,?,'APPLICATION',? WHERE EXISTS(SELECT 1 FROM release_scope_items WHERE release_id=? AND backlog_item_id=? AND removed_at IS NOT NULL)`)
      .bind(crypto.randomUUID(), "Release", releaseId, "SCOPE_REMOVE", JSON.stringify({ backlogItemId }), actor, correlationId, releaseId, backlogItemId),
  ]);
  if (result[0].meta.changes === 0) return { kind: "not_found" as const };
  return { kind: "ok" as const, ...(await getRelease(releaseId)) };
}

export async function lockReleaseScope(releaseId: string, expectedVersion: number, actor: string, correlationId: string) {
  const release = await env.DB.prepare("SELECT id,status FROM releases WHERE id=? AND version=? AND record_status='ACTIVE'").bind(releaseId, expectedVersion).first<{ id: string; status: string }>();
  if (!release) {
    const exists = await env.DB.prepare("SELECT id FROM releases WHERE id=? AND record_status='ACTIVE'").bind(releaseId).first<{ id: string }>();
    return { kind: exists ? ("conflict" as const) : ("not_found" as const) };
  }
  try {
    assertReleaseTransition(release.status as never, "SCOPE_LOCKED");
  } catch {
    return { kind: "invalid_transition" as const };
  }
  const scopeCount = await env.DB.prepare("SELECT COUNT(*) total FROM release_scope_items WHERE release_id=? AND removed_at IS NULL").bind(releaseId).first<{ total: number }>();
  if (!scopeCount || scopeCount.total === 0) return { kind: "empty_scope" as const };
  const result = await env.DB.batch([
    env.DB.prepare("UPDATE releases SET status='SCOPE_LOCKED',scope_locked_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND record_status='ACTIVE'").bind(actor, releaseId, expectedVersion),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) SELECT ?,?,?,?,?,?,'APPLICATION',? WHERE EXISTS(SELECT 1 FROM releases WHERE id=? AND status='SCOPE_LOCKED')`)
      .bind(crypto.randomUUID(), "Release", releaseId, "SCOPE_LOCK", JSON.stringify({ scopeCount: scopeCount.total }), actor, correlationId, releaseId),
  ]);
  if (result[0].meta.changes === 0) return { kind: "conflict" as const };
  return { kind: "ok" as const, ...(await getRelease(releaseId)) };
}
