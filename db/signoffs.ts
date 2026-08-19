import { env } from "cloudflare:workers";
import { aggregateSignoffStatus, type SignoffStatus } from "../app/governance/stage3-contract";
import type { SignoffDecisionInput, SignoffRequestInput } from "../app/governance/signoff-contract";

type SubjectRow = { id: string; statusColumn: string; authorUserId: string | null };

async function loadDocumentVersionSubject(id: string): Promise<SubjectRow | null> {
  const row = await env.DB.prepare("SELECT id,lifecycle_status statusColumn,updated_by authorUserId FROM governance_document_versions WHERE id=?").bind(id).first<SubjectRow>();
  return row ?? null;
}

async function loadRequirementRevisionSubject(id: string): Promise<SubjectRow | null> {
  const row = await env.DB.prepare("SELECT id,governance_status statusColumn,updated_by authorUserId FROM requirement_revisions WHERE id=?").bind(id).first<SubjectRow>();
  return row ?? null;
}

async function loadFeasibilityRevisionSubject(id: string): Promise<SubjectRow | null> {
  const row = await env.DB.prepare("SELECT id,status statusColumn,updated_by authorUserId FROM technical_feasibility_revisions WHERE id=?").bind(id).first<SubjectRow>();
  return row ?? null;
}

async function loadSubject(subjectType: "DOCUMENT_VERSION" | "REQUIREMENT_REVISION" | "FEASIBILITY_REVISION", subjectId: string) {
  if (subjectType === "DOCUMENT_VERSION") return loadDocumentVersionSubject(subjectId);
  if (subjectType === "REQUIREMENT_REVISION") return loadRequirementRevisionSubject(subjectId);
  return loadFeasibilityRevisionSubject(subjectId);
}

async function loadEligibleApprovers(userIds: string[]) {
  if (!userIds.length) return new Set<string>();
  const placeholders = userIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(`SELECT id FROM users WHERE id IN (${placeholders}) AND active=1`).bind(...userIds).all<{ id: string }>();
  return new Set(rows.results.map((row) => row.id));
}

const requestColumns = `
  r.id,r.document_version_id documentVersionId,r.requirement_revision_id requirementRevisionId,r.feasibility_revision_id feasibilityRevisionId,r.status,
  r.requested_by requestedBy,r.requested_at requestedAt,r.completed_at completedAt,r.version,r.created_at createdAt,r.updated_at updatedAt
`;

export async function listSignoffRequests(input: { status: string; approverUserId: string; page: number; pageSize: number }) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (input.status) { conditions.push("r.status=?"); values.push(input.status); }
  if (input.approverUserId) {
    conditions.push("EXISTS(SELECT 1 FROM signoff_lanes l WHERE l.signoff_request_id=r.id AND l.assigned_approver_user_id=?)");
    values.push(input.approverUserId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows, count] = await Promise.all([
    env.DB.prepare(`SELECT ${requestColumns} FROM signoff_requests r ${where} ORDER BY r.requested_at DESC LIMIT ? OFFSET ?`).bind(...values, input.pageSize, (input.page - 1) * input.pageSize).all(),
    env.DB.prepare(`SELECT COUNT(*) total FROM signoff_requests r ${where}`).bind(...values).first<{ total: number }>(),
  ]);
  return { items: rows.results, total: Number(count?.total ?? 0) };
}

export async function getSignoffRequestWorkspace(id: string) {
  const request = await env.DB.prepare(`SELECT ${requestColumns} FROM signoff_requests r WHERE r.id=?`).bind(id).first();
  if (!request) return { kind: "not_found" as const };
  const lanes = await env.DB
    .prepare(
      "SELECT id,signoff_request_id signoffRequestId,lane_type laneType,required,sequence,assigned_approver_user_id assignedApproverUserId,status,due_at dueAt,version FROM signoff_lanes WHERE signoff_request_id=? ORDER BY sequence",
    )
    .bind(id)
    .all();
  const laneIds = (lanes.results as Array<{ id: string }>).map((lane) => lane.id);
  const decisions = laneIds.length
    ? await env.DB
        .prepare(
          `SELECT id,signoff_lane_id signoffLaneId,decision,approver_user_id approverUserId,comment,decided_at decidedAt FROM signoff_decisions WHERE signoff_lane_id IN (${laneIds.map(() => "?").join(",")}) ORDER BY decided_at`,
        )
        .bind(...laneIds)
        .all()
    : { results: [] };
  const decisionIds = (decisions.results as Array<{ id: string }>).map((decision) => decision.id);
  const conditions = decisionIds.length
    ? await env.DB
        .prepare(
          `SELECT id,decision_id decisionId,description,owner_user_id ownerUserId,due_at dueAt,status,closure_evidence closureEvidence,closed_by closedBy,closed_at closedAt,version FROM signoff_conditions WHERE decision_id IN (${decisionIds.map(() => "?").join(",")}) ORDER BY created_at`,
        )
        .bind(...decisionIds)
        .all()
    : { results: [] };
  return { kind: "ok" as const, request, lanes: lanes.results, decisions: decisions.results, conditions: conditions.results };
}

export async function createSignoffRequest(input: SignoffRequestInput, actor: string, correlationId: string) {
  const subject = await loadSubject(input.subjectType, input.subjectId);
  if (!subject) return { kind: "not_found" as const };
  if (subject.statusColumn !== "IN_REVIEW") return { kind: "not_eligible" as const };
  const approverIds = [...new Set(input.lanes.map((lane) => lane.assignedApproverUserId))];
  const eligible = await loadEligibleApprovers(approverIds);
  const invalidApprover = input.lanes.find((lane) => !eligible.has(lane.assignedApproverUserId));
  if (invalidApprover) return { kind: "invalid_approver" as const, laneType: invalidApprover.laneType };
  const id = crypto.randomUUID();
  const documentVersionId = input.subjectType === "DOCUMENT_VERSION" ? input.subjectId : null;
  const requirementRevisionId = input.subjectType === "REQUIREMENT_REVISION" ? input.subjectId : null;
  const feasibilityRevisionId = input.subjectType === "FEASIBILITY_REVISION" ? input.subjectId : null;
  const statements = [
    env.DB
      .prepare(
        "INSERT INTO signoff_requests(id,document_version_id,requirement_revision_id,feasibility_revision_id,status,requested_by,created_by,updated_by) SELECT ?,?,?,?,'PENDING',?,?,? WHERE NOT EXISTS(SELECT 1 FROM signoff_requests WHERE (document_version_id=? OR requirement_revision_id=? OR feasibility_revision_id=?) AND status IN ('PENDING','UNDER_REVIEW'))",
      )
      .bind(id, documentVersionId, requirementRevisionId, feasibilityRevisionId, actor, actor, actor, documentVersionId, requirementRevisionId, feasibilityRevisionId),
    ...input.lanes.map((lane, index) =>
      env.DB
        .prepare("INSERT INTO signoff_lanes(id,signoff_request_id,lane_type,required,sequence,assigned_approver_user_id,status,created_by,updated_by) SELECT ?,?,?,?,?,?,'PENDING',?,? WHERE EXISTS(SELECT 1 FROM signoff_requests WHERE id=?)")
        .bind(crypto.randomUUID(), id, lane.laneType, lane.required ? 1 : 0, index + 1, lane.assignedApproverUserId, actor, actor, id),
    ),
    env.DB
      .prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) SELECT ?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM signoff_requests WHERE id=?)")
      .bind(crypto.randomUUID(), "SignoffRequest", id, "REQUEST", JSON.stringify({ id, subjectType: input.subjectType, subjectId: input.subjectId, lanes: input.lanes.map((lane) => lane.laneType) }), actor, correlationId, id),
  ];
  const results = await env.DB.batch(statements);
  if (!results[0]?.meta.changes) return { kind: "active_exists" as const };
  return { kind: "ok" as const, id };
}

async function applySubjectDecision(subjectType: "DOCUMENT_VERSION" | "REQUIREMENT_REVISION" | "FEASIBILITY_REVISION" | null, subjectId: string | null, aggregate: SignoffStatus, actor: string) {
  if (!subjectType || !subjectId) return null;
  if (subjectType === "DOCUMENT_VERSION") {
    return env.DB
      .prepare(
        "UPDATE governance_document_versions SET lifecycle_status=?,approved_at=CASE WHEN ? IN ('APPROVED','APPROVED_WITH_CONDITIONS') THEN CURRENT_TIMESTAMP ELSE NULL END,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND lifecycle_status='IN_REVIEW'",
      )
      .bind(aggregate, aggregate, actor, subjectId);
  }
  if (subjectType === "FEASIBILITY_REVISION") {
    const feasibilityStatus = aggregate === "APPROVED" ? "FEASIBLE" : aggregate === "APPROVED_WITH_CONDITIONS" ? "FEASIBLE_WITH_CONDITIONS" : "NOT_FEASIBLE";
    return env.DB
      .prepare(
        "UPDATE technical_feasibility_revisions SET status=?,approved_at=CASE WHEN ?='NOT_FEASIBLE' THEN NULL ELSE CURRENT_TIMESTAMP END,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND status='IN_REVIEW'",
      )
      .bind(feasibilityStatus, feasibilityStatus, actor, subjectId);
  }
  const requirementStatus = aggregate === "REJECTED" ? "REJECTED" : "APPROVED";
  return env.DB
    .prepare(
      "UPDATE requirement_revisions SET governance_status=?,approved_at=CASE WHEN ?='REJECTED' THEN NULL ELSE CURRENT_TIMESTAMP END,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND governance_status='IN_REVIEW'",
    )
    .bind(requirementStatus, requirementStatus, actor, subjectId);
}

export async function recordSignoffDecision(laneId: string, input: SignoffDecisionInput, actor: string, correlationId: string) {
  const lane = await env.DB
    .prepare(
      `SELECT l.id,l.signoff_request_id signoffRequestId,l.status,l.version,l.assigned_approver_user_id assignedApproverUserId,
        r.status requestStatus,r.version requestVersion,r.document_version_id documentVersionId,r.requirement_revision_id requirementRevisionId,r.feasibility_revision_id feasibilityRevisionId
      FROM signoff_lanes l JOIN signoff_requests r ON r.id=l.signoff_request_id WHERE l.id=?`,
    )
    .bind(laneId)
    .first<{
      id: string; signoffRequestId: string; status: string; version: number; assignedApproverUserId: string | null;
      requestStatus: string; requestVersion: number; documentVersionId: string | null; requirementRevisionId: string | null; feasibilityRevisionId: string | null;
    }>();
  if (!lane) return { kind: "not_found" as const };
  if (lane.assignedApproverUserId !== actor) return { kind: "not_assigned" as const };
  if (lane.status !== "PENDING" && lane.status !== "UNDER_REVIEW") return { kind: "already_decided" as const };
  if (lane.requestStatus !== "PENDING" && lane.requestStatus !== "UNDER_REVIEW") return { kind: "request_closed" as const };
  const subject = lane.documentVersionId
    ? await loadDocumentVersionSubject(lane.documentVersionId)
    : lane.requirementRevisionId
      ? await loadRequirementRevisionSubject(lane.requirementRevisionId)
      : lane.feasibilityRevisionId
        ? await loadFeasibilityRevisionSubject(lane.feasibilityRevisionId)
        : null;
  if (subject?.authorUserId === actor) return { kind: "self_approval_forbidden" as const };

  const decisionId = crypto.randomUUID();
  const decisionStatements = [
    env.DB
      .prepare("INSERT INTO signoff_decisions(id,signoff_lane_id,decision,approver_user_id,comment,created_by,updated_by) VALUES(?,?,?,?,?,?,?)")
      .bind(decisionId, laneId, input.decision, actor, input.comment, actor, actor),
    env.DB
      .prepare("UPDATE signoff_lanes SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND status IN ('PENDING','UNDER_REVIEW')")
      .bind(input.decision, actor, laneId, lane.version),
    ...input.conditions.map((condition) =>
      env.DB
        .prepare("INSERT INTO signoff_conditions(id,decision_id,description,owner_user_id,due_at,status,created_by,updated_by) VALUES(?,?,?,?,?,'OPEN',?,?)")
        .bind(crypto.randomUUID(), decisionId, condition.description, condition.ownerUserId, condition.dueAt, actor, actor),
    ),
    env.DB
      .prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), "SignoffLane", laneId, "DECISION", JSON.stringify({ decisionId, decision: input.decision, conditions: input.conditions.length }), actor, correlationId),
  ];
  const decisionResults = await env.DB.batch(decisionStatements);
  if (!decisionResults[1]?.meta.changes) return { kind: "conflict" as const };

  const lanes = await env.DB
    .prepare("SELECT required,status FROM signoff_lanes WHERE signoff_request_id=?")
    .bind(lane.signoffRequestId)
    .all<{ required: number; status: SignoffStatus }>();
  const aggregate = aggregateSignoffStatus(
    lanes.results.map((row) => ({ required: Boolean(row.required), status: row.status, openMandatoryConditions: 0 })),
  );

  const terminal = aggregate === "APPROVED" || aggregate === "APPROVED_WITH_CONDITIONS" || aggregate === "REJECTED";
  const transitioning = terminal || (aggregate === "UNDER_REVIEW" && lane.requestStatus === "PENDING");
  if (transitioning) {
    const subjectType = lane.documentVersionId
      ? ("DOCUMENT_VERSION" as const)
      : lane.requirementRevisionId
        ? ("REQUIREMENT_REVISION" as const)
        : lane.feasibilityRevisionId
          ? ("FEASIBILITY_REVISION" as const)
          : null;
    const subjectId = lane.documentVersionId ?? lane.requirementRevisionId ?? lane.feasibilityRevisionId;
    const followUp = [
      env.DB
        .prepare(
          "UPDATE signoff_requests SET status=?,completed_at=CASE WHEN ? IN ('APPROVED','APPROVED_WITH_CONDITIONS','REJECTED') THEN CURRENT_TIMESTAMP ELSE NULL END,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND status IN ('PENDING','UNDER_REVIEW')",
        )
        .bind(aggregate, aggregate, actor, lane.signoffRequestId, lane.requestVersion),
      env.DB
        .prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)")
        .bind(crypto.randomUUID(), "SignoffRequest", lane.signoffRequestId, "STATUS_TRANSITION", JSON.stringify({ status: aggregate }), actor, correlationId),
    ];
    if (terminal) {
      const subjectStatement = await applySubjectDecision(subjectType, subjectId, aggregate, actor);
      if (subjectStatement) followUp.push(subjectStatement);
    }
    await env.DB.batch(followUp);
  }
  return { kind: "ok" as const, decisionId, aggregate };
}

export async function updateSignoffCondition(id: string, input: { status: "IN_PROGRESS" | "SATISFIED" | "WAIVED"; closureEvidence: string }, expectedVersion: number, actor: string, canWaive: boolean, correlationId: string) {
  const condition = await env.DB
    .prepare("SELECT id,decision_id decisionId,owner_user_id ownerUserId,status,version FROM signoff_conditions WHERE id=?")
    .bind(id)
    .first<{ id: string; decisionId: string; ownerUserId: string | null; status: string; version: number }>();
  if (!condition) return { kind: "not_found" as const };
  if (condition.status === "SATISFIED" || condition.status === "WAIVED") return { kind: "locked" as const };
  if (input.status === "WAIVED" && !canWaive) return { kind: "waiver_forbidden" as const };
  if (input.status !== "WAIVED" && condition.ownerUserId && condition.ownerUserId !== actor) return { kind: "not_owner" as const };
  const closes = input.status === "SATISFIED" || input.status === "WAIVED" ? 1 : 0;
  const results = await env.DB.batch([
    env.DB
      .prepare(
        "UPDATE signoff_conditions SET status=?,closure_evidence=?,closed_by=CASE WHEN ? THEN ? ELSE NULL END,closed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=?",
      )
      .bind(input.status, input.closureEvidence, closes, actor, closes, actor, id, expectedVersion),
    env.DB
      .prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), "SignoffCondition", id, input.status === "WAIVED" ? "CONDITION_WAIVE" : "CONDITION_PROGRESS", JSON.stringify({ status: input.status }), actor, correlationId),
  ]);
  if (!results[0]?.meta.changes) return { kind: "conflict" as const };
  return { kind: "ok" as const };
}
