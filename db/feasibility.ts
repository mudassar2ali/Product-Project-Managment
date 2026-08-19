import { env } from "cloudflare:workers";
import { incompleteFeasibilityRevision, type FeasibilityAssessmentRegistrationInput, type FeasibilityRevisionInput } from "../app/governance/feasibility-contract";

type AssessmentRow = {
  id: string; businessId: string; projectId: string; backlogFeatureId: string | null; backlogFeatureTitle: string | null;
  ownerUserId: string | null; ownerName: string | null; recordStatus: string; version: number; updatedAt: string;
};

type RevisionRow = {
  id: string; assessmentId: string; revisionNumber: number; status: string;
  technicalSpike: string; architectureReview: string; feasibilitySummary: string; integrationRequirements: string;
  securityReview: string; technicalConstraints: string; technicalDebtRisk: string;
  engineeringEstimate: number | null; estimateUnit: string | null; recommendation: string;
  contentHash: string | null; submittedAt: string | null; approvedAt: string | null;
  version: number; createdAt: string; updatedAt: string;
};

type LinkRow = { id: string; assessmentId: string; requirementId: string; requirementBusinessId: string; coverageNote: string; createdAt: string };

const assessmentColumns = `
  a.id,a.business_id businessId,a.project_id projectId,a.backlog_feature_id backlogFeatureId,bi.title backlogFeatureTitle,
  a.owner_user_id ownerUserId,u.display_name ownerName,a.record_status recordStatus,a.version,a.updated_at updatedAt
`;

const revisionColumns = `
  id,assessment_id assessmentId,revision_number revisionNumber,status,
  technical_spike technicalSpike,architecture_review architectureReview,feasibility_summary feasibilitySummary,
  integration_requirements integrationRequirements,security_review securityReview,technical_constraints technicalConstraints,
  technical_debt_risk technicalDebtRisk,engineering_estimate engineeringEstimate,estimate_unit estimateUnit,recommendation,
  content_hash contentHash,submitted_at submittedAt,approved_at approvedAt,version,created_at createdAt,updated_at updatedAt
`;

async function nextBusinessId() {
  const result = await env.DB
    .prepare(
      "INSERT INTO business_sequences(entity_type,next_value,updated_at) VALUES('FEASIBILITY',2,CURRENT_TIMESTAMP) ON CONFLICT(entity_type) DO UPDATE SET next_value=next_value+1,updated_at=CURRENT_TIMESTAMP RETURNING next_value-1 value",
    )
    .bind()
    .first<{ value: number }>();
  return `FEAS-${String(result?.value ?? 1).padStart(4, "0")}`;
}

async function loadRevisions(assessmentId: string) {
  const revisions = await env.DB
    .prepare(`SELECT ${revisionColumns} FROM technical_feasibility_revisions WHERE assessment_id=? ORDER BY revision_number DESC`)
    .bind(assessmentId)
    .all<RevisionRow>();
  return revisions.results;
}

async function loadLinks(assessmentId: string) {
  const links = await env.DB
    .prepare(
      "SELECT l.id,l.assessment_id assessmentId,l.requirement_id requirementId,r.business_id requirementBusinessId,l.coverage_note coverageNote,l.created_at createdAt FROM feasibility_requirement_links l JOIN requirements r ON r.id=l.requirement_id WHERE l.assessment_id=? ORDER BY l.created_at",
    )
    .bind(assessmentId)
    .all<LinkRow>();
  return links.results;
}

export async function listFeasibilityAssessments(projectId: string) {
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id=? AND record_status='ACTIVE'").bind(projectId).first<{ id: string }>();
  if (!project) return { kind: "not_found" as const };
  const assessments = await env.DB
    .prepare(
      `SELECT ${assessmentColumns} FROM technical_feasibility_assessments a LEFT JOIN backlog_items bi ON bi.id=a.backlog_feature_id LEFT JOIN users u ON u.id=a.owner_user_id WHERE a.project_id=? AND a.record_status='ACTIVE' ORDER BY a.updated_at DESC,a.business_id DESC`,
    )
    .bind(projectId)
    .all<AssessmentRow>();
  const items = await Promise.all(
    assessments.results.map(async (assessment) => ({
      assessment,
      revisions: await loadRevisions(assessment.id),
      links: await loadLinks(assessment.id),
    })),
  );
  return { kind: "ok" as const, items };
}

export async function getFeasibilityWorkspace(id: string) {
  const assessment = await env.DB
    .prepare(`SELECT ${assessmentColumns} FROM technical_feasibility_assessments a LEFT JOIN backlog_items bi ON bi.id=a.backlog_feature_id LEFT JOIN users u ON u.id=a.owner_user_id WHERE a.id=? AND a.record_status='ACTIVE'`)
    .bind(id)
    .first<AssessmentRow>();
  if (!assessment) return { kind: "not_found" as const };
  return { kind: "ok" as const, assessment, revisions: await loadRevisions(id), links: await loadLinks(id) };
}

export async function createFeasibilityAssessment(projectId: string, input: FeasibilityAssessmentRegistrationInput, actor: string, correlationId: string) {
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id=? AND record_status='ACTIVE'").bind(projectId).first<{ id: string }>();
  if (!project) return { kind: "not_found" as const };
  if (input.backlogFeatureId) {
    const feature = await env.DB.prepare("SELECT id FROM backlog_items WHERE id=? AND project_id=? AND record_status='ACTIVE'").bind(input.backlogFeatureId, projectId).first<{ id: string }>();
    if (!feature) return { kind: "invalid_backlog_feature" as const };
  }
  if (input.ownerUserId) {
    const owner = await env.DB.prepare("SELECT id FROM users WHERE id=? AND active=1").bind(input.ownerUserId).first<{ id: string }>();
    if (!owner) return { kind: "invalid_owner" as const };
  }
  const id = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const businessId = await nextBusinessId();
  await env.DB.batch([
    env.DB
      .prepare("INSERT INTO technical_feasibility_assessments(id,business_id,project_id,backlog_feature_id,owner_user_id,created_by,updated_by) VALUES(?,?,?,?,?,?,?)")
      .bind(id, businessId, projectId, input.backlogFeatureId, input.ownerUserId, actor, actor),
    env.DB
      .prepare("INSERT INTO technical_feasibility_revisions(id,assessment_id,revision_number,created_by,updated_by) VALUES(?,?,1,?,?)")
      .bind(revisionId, id, actor, actor),
    env.DB
      .prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), "TechnicalFeasibilityAssessment", id, "CREATE", JSON.stringify({ businessId, projectId, backlogFeatureId: input.backlogFeatureId }), actor, correlationId),
  ]);
  return getFeasibilityWorkspace(id);
}

function currentDraft(revisions: RevisionRow[]) {
  return revisions.find((revision) => revision.status === "DRAFT") ?? null;
}

export async function updateFeasibilityDraft(id: string, revision: FeasibilityRevisionInput, expectedVersion: number, actor: string, correlationId: string) {
  const workspace = await getFeasibilityWorkspace(id);
  if (workspace.kind === "not_found") return workspace;
  const current = currentDraft(workspace.revisions);
  if (!current) return { kind: "locked" as const };
  const results = await env.DB.batch([
    env.DB
      .prepare(
        "INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,after_json,actor_user_id,source,correlation_id,occurred_at) SELECT ?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM technical_feasibility_revisions WHERE id=? AND version=? AND status='DRAFT')",
      )
      .bind(crypto.randomUUID(), "TechnicalFeasibilityRevision", current.id, "UPDATE", JSON.stringify({ feasibilitySummary: current.feasibilitySummary, recommendation: current.recommendation }), JSON.stringify(revision), actor, correlationId, current.id, expectedVersion),
    env.DB
      .prepare(
        `UPDATE technical_feasibility_revisions SET technical_spike=?,architecture_review=?,feasibility_summary=?,integration_requirements=?,security_review=?,technical_constraints=?,technical_debt_risk=?,engineering_estimate=?,estimate_unit=?,recommendation=?,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND status='DRAFT'`,
      )
      .bind(
        revision.technicalSpike, revision.architectureReview, revision.feasibilitySummary, revision.integrationRequirements,
        revision.securityReview, revision.technicalConstraints, revision.technicalDebtRisk, revision.engineeringEstimate,
        revision.estimateUnit, revision.recommendation, actor, current.id, expectedVersion,
      ),
  ]);
  if (!results[1]?.meta.changes) return { kind: "conflict" as const };
  return { kind: "ok" as const, workspace: await getFeasibilityWorkspace(id) };
}

async function hashRevision(revision: {
  technicalSpike: string; architectureReview: string; feasibilitySummary: string; integrationRequirements: string;
  securityReview: string; technicalConstraints: string; technicalDebtRisk: string;
  engineeringEstimate: number | null; estimateUnit: string | null; recommendation: string;
}) {
  const canonical = JSON.stringify({
    technicalSpike: revision.technicalSpike, architectureReview: revision.architectureReview, feasibilitySummary: revision.feasibilitySummary,
    integrationRequirements: revision.integrationRequirements, securityReview: revision.securityReview, technicalConstraints: revision.technicalConstraints,
    technicalDebtRisk: revision.technicalDebtRisk, engineeringEstimate: revision.engineeringEstimate, estimateUnit: revision.estimateUnit, recommendation: revision.recommendation,
  });
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function submitFeasibilityRevision(id: string, expectedVersion: number, actor: string, correlationId: string) {
  const workspace = await getFeasibilityWorkspace(id);
  if (workspace.kind === "not_found") return workspace;
  const current = currentDraft(workspace.revisions);
  if (!current) return { kind: "locked" as const };
  const missing = incompleteFeasibilityRevision(current);
  if (missing.length) return { kind: "incomplete" as const, fields: missing };
  const contentHash = await hashRevision(current);
  const results = await env.DB.batch([
    env.DB
      .prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) SELECT ?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM technical_feasibility_revisions WHERE id=? AND version=? AND status='DRAFT')")
      .bind(crypto.randomUUID(), "TechnicalFeasibilityRevision", current.id, "SUBMIT_REVIEW", JSON.stringify({ assessmentId: id, revisionNumber: current.revisionNumber, contentHash }), actor, correlationId, current.id, expectedVersion),
    env.DB
      .prepare("UPDATE technical_feasibility_revisions SET status='IN_REVIEW',content_hash=?,submitted_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND status='DRAFT'")
      .bind(contentHash, actor, current.id, expectedVersion),
  ]);
  if (!results[1]?.meta.changes) return { kind: "conflict" as const };
  return { kind: "ok" as const, workspace: await getFeasibilityWorkspace(id) };
}
