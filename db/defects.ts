import { env } from "cloudflare:workers";
import { assertDefectClosureConsistent, assertDefectTransition } from "../app/releases/stage4-contract";
import type { DefectClosureInput, DefectCreationInput, DefectProgressInput } from "../app/releases/defect-contract";

export type DefectRow = {
  id: string; businessId: string; projectId: string; releaseId: string | null; releaseBusinessId: string | null;
  source: string; severity: string; status: string;
  title: string; description: string; stepsToReproduce: string;
  reportedByUserId: string | null; reportedByName: string | null;
  assignedToUserId: string | null; assignedToName: string | null;
  backlogItemId: string | null; backlogItemBusinessId: string | null;
  duplicateOfId: string | null; duplicateOfBusinessId: string | null;
  reportedAt: string; resolvedAt: string | null; closedAt: string | null;
  version: number; createdAt: string; updatedAt: string;
};

const defectColumns = `
  d.id,d.business_id businessId,d.project_id projectId,d.release_id releaseId,rel.business_id releaseBusinessId,
  d.source,d.severity,d.status,d.title,d.description,d.steps_to_reproduce stepsToReproduce,
  d.reported_by_user_id reportedByUserId,ru.display_name reportedByName,
  d.assigned_to_user_id assignedToUserId,au.display_name assignedToName,
  d.backlog_item_id backlogItemId,bi.business_id backlogItemBusinessId,
  d.duplicate_of_id duplicateOfId,dup.business_id duplicateOfBusinessId,
  d.reported_at reportedAt,d.resolved_at resolvedAt,d.closed_at closedAt,
  d.version,d.created_at createdAt,d.updated_at updatedAt
`;

const defectJoins = `
  FROM defects d
  LEFT JOIN releases rel ON rel.id=d.release_id
  LEFT JOIN users ru ON ru.id=d.reported_by_user_id
  LEFT JOIN users au ON au.id=d.assigned_to_user_id
  LEFT JOIN backlog_items bi ON bi.id=d.backlog_item_id
  LEFT JOIN defects dup ON dup.id=d.duplicate_of_id
`;

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

async function nextBusinessId() {
  const result = await env.DB.prepare(`
    INSERT INTO business_sequences(entity_type,next_value,updated_at) VALUES('DEFECT',2,CURRENT_TIMESTAMP)
    ON CONFLICT(entity_type) DO UPDATE SET next_value=next_value+1,updated_at=CURRENT_TIMESTAMP
    RETURNING next_value-1 value
  `).bind().first<{ value: number }>();
  return `DEF-${String(result?.value ?? 1).padStart(4, "0")}`;
}

export async function listDefects(input: { projectId: string; releaseId: string; status: string; severity: string; assignedToUserId: string; q: string; page: number; pageSize: number }) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (input.projectId) { conditions.push("d.project_id=?"); values.push(input.projectId); }
  if (input.releaseId) { conditions.push("d.release_id=?"); values.push(input.releaseId); }
  if (input.status) { conditions.push("d.status=?"); values.push(input.status); }
  if (input.severity) { conditions.push("d.severity=?"); values.push(input.severity); }
  if (input.assignedToUserId) { conditions.push("d.assigned_to_user_id=?"); values.push(input.assignedToUserId); }
  if (input.q) { const q = `%${escapeLike(input.q)}%`; conditions.push("(d.title LIKE ? ESCAPE '\\' OR d.business_id LIKE ? ESCAPE '\\')"); values.push(q, q); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (input.page - 1) * input.pageSize;
  const [rows, count] = await Promise.all([
    env.DB.prepare(`SELECT ${defectColumns} ${defectJoins} ${where} ORDER BY d.updated_at DESC LIMIT ? OFFSET ?`).bind(...values, input.pageSize, offset).all<DefectRow>(),
    env.DB.prepare(`SELECT COUNT(*) total FROM defects d ${where}`).bind(...values).first<{ total: number }>(),
  ]);
  return { items: rows.results, total: Number(count?.total ?? 0) };
}

export async function getDefect(id: string) {
  return env.DB.prepare(`SELECT ${defectColumns} ${defectJoins} WHERE d.id=?`).bind(id).first<DefectRow>();
}

export async function createDefect(input: DefectCreationInput, actor: string, correlationId: string) {
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id=? AND record_status='ACTIVE'").bind(input.projectId).first<{ id: string }>();
  if (!project) return { kind: "invalid_project" as const };
  if (input.releaseId) {
    const release = await env.DB.prepare("SELECT id FROM releases WHERE id=? AND project_id=? AND record_status='ACTIVE'").bind(input.releaseId, input.projectId).first<{ id: string }>();
    if (!release) return { kind: "invalid_release" as const };
  }
  if (input.backlogItemId) {
    const backlogItem = await env.DB.prepare("SELECT id FROM backlog_items WHERE id=? AND project_id=? AND record_status='ACTIVE'").bind(input.backlogItemId, input.projectId).first<{ id: string }>();
    if (!backlogItem) return { kind: "invalid_backlog_item" as const };
  }
  const id = crypto.randomUUID();
  const businessId = await nextBusinessId();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO defects(id,business_id,project_id,release_id,source,severity,title,description,steps_to_reproduce,reported_by_user_id,assigned_to_user_id,backlog_item_id,created_by,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(id, businessId, input.projectId, input.releaseId, input.source, input.severity, input.title, input.description, input.stepsToReproduce, actor, input.assignedToUserId, input.backlogItemId, actor, actor),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)`)
      .bind(crypto.randomUUID(), "Defect", id, "CREATE", JSON.stringify({ businessId, projectId: input.projectId, releaseId: input.releaseId, severity: input.severity, title: input.title, source: input.source }), actor, correlationId),
  ]);
  return { kind: "ok" as const, defect: await getDefect(id) };
}

async function hasVerificationEvidence(defectId: string) {
  const origin = await env.DB.prepare("SELECT test_case_id testCaseId, execution_number executionNumber FROM uat_test_executions WHERE defect_id=?").bind(defectId).first<{ testCaseId: string; executionNumber: number }>();
  if (!origin) return false;
  const pass = await env.DB.prepare("SELECT id FROM uat_test_executions WHERE test_case_id=? AND execution_number>? AND result='PASS'").bind(origin.testCaseId, origin.executionNumber).first<{ id: string }>();
  return Boolean(pass);
}

export async function updateDefectProgress(id: string, input: DefectProgressInput, expectedVersion: number, actor: string, correlationId: string) {
  const current = await env.DB.prepare("SELECT id,project_id projectId,status FROM defects WHERE id=? AND version=?").bind(id, expectedVersion).first<{ id: string; projectId: string; status: string }>();
  if (!current) {
    const exists = await env.DB.prepare("SELECT id FROM defects WHERE id=?").bind(id).first<{ id: string }>();
    return { kind: exists ? ("conflict" as const) : ("not_found" as const) };
  }

  try {
    assertDefectTransition(current.status as never, input.status as never);
  } catch {
    return { kind: "invalid_transition" as const };
  }

  if (input.backlogItemId) {
    const backlogItem = await env.DB.prepare("SELECT id,status FROM backlog_items WHERE id=? AND project_id=? AND record_status='ACTIVE'").bind(input.backlogItemId, current.projectId).first<{ id: string; status: string }>();
    if (!backlogItem) return { kind: "invalid_backlog_item" as const };
    if (input.status === "FIXED" && backlogItem.status !== "DONE") return { kind: "fix_item_not_done" as const };
  } else if (input.status === "FIXED") {
    return { kind: "fix_item_not_done" as const };
  }

  if (input.status === "VERIFIED" && !(await hasVerificationEvidence(id))) {
    return { kind: "verification_evidence_missing" as const };
  }

  // resolved_at is preserved once set (moving FIXED -> VERIFIED keeps the original resolution time) and is only
  // populated the first time a defect enters the resolved zone (OPEN/IN_PROGRESS -> FIXED); reopening to OPEN
  // clears it, since the database check forbids resolved_at outside FIXED/VERIFIED/CLOSED. closed_at is always
  // cleared here too, since none of this endpoint's target statuses allow it (a DEFERRED -> OPEN reopen is the
  // one case that actually needs the clear).
  const result = await env.DB.batch([
    env.DB.prepare(`
      UPDATE defects SET status=?,assigned_to_user_id=?,backlog_item_id=?,
        resolved_at=CASE WHEN ? IN ('FIXED','VERIFIED') THEN COALESCE(resolved_at,CURRENT_TIMESTAMP) ELSE NULL END,
        closed_at=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=?
      WHERE id=? AND version=?
    `).bind(input.status, input.assignedToUserId, input.backlogItemId, input.status, actor, id, expectedVersion),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,after_json,actor_user_id,source,correlation_id) SELECT ?,?,?,?,?,?,?,'APPLICATION',? WHERE EXISTS(SELECT 1 FROM defects WHERE id=? AND version=?)`)
      .bind(crypto.randomUUID(), "Defect", id, "PROGRESS_UPDATE", JSON.stringify({ from: current.status }), JSON.stringify(input), actor, correlationId, id, expectedVersion + 1),
  ]);
  if (result[0].meta.changes === 0) return { kind: "conflict" as const };
  return { kind: "ok" as const, defect: await getDefect(id) };
}

export async function closeDefect(id: string, input: DefectClosureInput, expectedVersion: number, actor: string, correlationId: string) {
  const current = await env.DB.prepare("SELECT id,project_id projectId,status,resolved_at resolvedAt FROM defects WHERE id=? AND version=?").bind(id, expectedVersion).first<{ id: string; projectId: string; status: string; resolvedAt: string | null }>();
  if (!current) {
    const exists = await env.DB.prepare("SELECT id FROM defects WHERE id=?").bind(id).first<{ id: string }>();
    return { kind: exists ? ("conflict" as const) : ("not_found" as const) };
  }

  try {
    assertDefectTransition(current.status as never, input.status as never);
  } catch {
    return { kind: "invalid_transition" as const };
  }

  let duplicateOfId = input.duplicateOfId;
  if (input.status === "DUPLICATE") {
    if (!duplicateOfId || duplicateOfId === id) return { kind: "invalid_duplicate_target" as const };
    const target = await env.DB.prepare("SELECT id FROM defects WHERE id=? AND project_id=?").bind(duplicateOfId, current.projectId).first<{ id: string }>();
    if (!target) return { kind: "invalid_duplicate_target" as const };
  } else {
    duplicateOfId = null;
  }

  const now = new Date().toISOString();
  try {
    assertDefectClosureConsistent(input.status as never, current.resolvedAt, now, duplicateOfId);
  } catch {
    return { kind: "closure_invalid" as const };
  }

  const result = await env.DB.batch([
    env.DB.prepare(`
      UPDATE defects SET status=?,closed_at=?,duplicate_of_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=?
      WHERE id=? AND version=?
    `).bind(input.status, now, duplicateOfId, actor, id, expectedVersion),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,after_json,actor_user_id,source,correlation_id) SELECT ?,?,?,?,?,?,?,'APPLICATION',? WHERE EXISTS(SELECT 1 FROM defects WHERE id=? AND version=?)`)
      .bind(crypto.randomUUID(), "Defect", id, "CLOSE", JSON.stringify({ from: current.status }), JSON.stringify({ status: input.status, duplicateOfId }), actor, correlationId, id, expectedVersion + 1),
  ]);
  if (result[0].meta.changes === 0) return { kind: "conflict" as const };
  return { kind: "ok" as const, defect: await getDefect(id) };
}
