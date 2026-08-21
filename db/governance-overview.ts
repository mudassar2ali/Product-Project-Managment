import { env } from "cloudflare:workers";

export type GovernanceOverviewAccess = { documents: boolean; requirements: boolean; signoffs: boolean; raci: boolean; feasibility: boolean; releases: boolean };

const documentOrder = `CASE cv.lifecycle_status WHEN 'DRAFT' THEN 0 WHEN 'IN_REVIEW' THEN 1 WHEN 'APPROVED_WITH_CONDITIONS' THEN 2 WHEN 'APPROVED' THEN 3 ELSE 4 END, cv.major_version DESC, cv.minor_version DESC, cv.created_at DESC`;

async function pendingSignoffCount(projectId: string) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) pending FROM signoff_lanes l JOIN signoff_requests sr ON sr.id=l.signoff_request_id
    WHERE l.status IN ('PENDING','UNDER_REVIEW') AND (
      sr.document_version_id IN (SELECT v.id FROM governance_document_versions v JOIN governance_documents d ON d.id=v.document_id WHERE d.project_id=?)
      OR sr.requirement_revision_id IN (SELECT rev.id FROM requirement_revisions rev JOIN requirements r ON r.id=rev.requirement_id WHERE r.project_id=?)
      OR sr.feasibility_revision_id IN (SELECT fr.id FROM technical_feasibility_revisions fr JOIN technical_feasibility_assessments a ON a.id=fr.assessment_id WHERE a.project_id=?)
    )
  `).bind(projectId, projectId, projectId).first<{ pending: number }>();
  return Number(row?.pending ?? 0);
}

async function openConditionCount(projectId: string) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) open FROM signoff_conditions c
    JOIN signoff_decisions dec ON dec.id=c.decision_id
    JOIN signoff_lanes l ON l.id=dec.signoff_lane_id
    JOIN signoff_requests sr ON sr.id=l.signoff_request_id
    WHERE c.status='OPEN' AND (
      sr.document_version_id IN (SELECT v.id FROM governance_document_versions v JOIN governance_documents d ON d.id=v.document_id WHERE d.project_id=?)
      OR sr.requirement_revision_id IN (SELECT rev.id FROM requirement_revisions rev JOIN requirements r ON r.id=rev.requirement_id WHERE r.project_id=?)
      OR sr.feasibility_revision_id IN (SELECT fr.id FROM technical_feasibility_revisions fr JOIN technical_feasibility_assessments a ON a.id=fr.assessment_id WHERE a.project_id=?)
    )
  `).bind(projectId, projectId, projectId).first<{ open: number }>();
  return Number(row?.open ?? 0);
}

async function documentSummary(projectId: string) {
  const result = await env.DB.prepare(`
    SELECT d.document_type documentType, d.title title, v.version_label versionLabel, v.lifecycle_status lifecycleStatus
    FROM governance_documents d
    LEFT JOIN governance_document_versions v ON v.id=(
      SELECT cv.id FROM governance_document_versions cv WHERE cv.document_id=d.id ORDER BY ${documentOrder} LIMIT 1
    )
    WHERE d.project_id=? AND d.record_status='ACTIVE'
    ORDER BY d.document_type
  `).bind(projectId).all<{ documentType: string; title: string; versionLabel: string | null; lifecycleStatus: string | null }>();
  return result.results;
}

async function requirementCoverageSummary(projectId: string) {
  const { getPortfolioTraceability } = await import("./requirement-coverage");
  const result = await getPortfolioTraceability({ productId: "", projectId });
  return { coverage: result.coverage, total: result.items.length, gaps: result.gaps.length };
}

async function raciSummary(projectId: string) {
  const matrix = await env.DB.prepare(`
    SELECT id, title, status FROM raci_matrices WHERE project_id=?
    ORDER BY CASE status WHEN 'PUBLISHED' THEN 0 ELSE 1 END, created_at DESC LIMIT 1
  `).bind(projectId).first<{ id: string; title: string; status: string }>();
  if (!matrix) return { available: false as const, matrix: null, totalActivities: 0, gapCount: 0 };
  const counts = await env.DB.prepare(`
    SELECT COUNT(*) total,
      SUM(CASE WHEN (SELECT COUNT(*) FROM raci_assignments a WHERE a.activity_id=act.id AND a.responsibility='ACCOUNTABLE')<>1 THEN 1
               WHEN (SELECT COUNT(*) FROM raci_assignments a WHERE a.activity_id=act.id AND a.responsibility='RESPONSIBLE')=0 THEN 1
               ELSE 0 END) gaps
    FROM raci_activities act WHERE act.matrix_id=?
  `).bind(matrix.id).first<{ total: number; gaps: number }>();
  return { available: true as const, matrix, totalActivities: Number(counts?.total ?? 0), gapCount: Number(counts?.gaps ?? 0) };
}

async function feasibilitySummary(projectId: string) {
  const result = await env.DB.prepare(`
    SELECT a.id assessmentId, a.business_id businessId, rev.status status
    FROM technical_feasibility_assessments a
    LEFT JOIN technical_feasibility_revisions rev ON rev.id=(
      SELECT cv.id FROM technical_feasibility_revisions cv WHERE cv.assessment_id=a.id
      ORDER BY CASE cv.status WHEN 'DRAFT' THEN 0 WHEN 'IN_REVIEW' THEN 1 WHEN 'FEASIBLE_WITH_CONDITIONS' THEN 2 ELSE 3 END, cv.revision_number DESC, cv.created_at DESC LIMIT 1
    )
    WHERE a.project_id=? AND a.record_status='ACTIVE'
  `).bind(projectId).all();
  const rows = result.results as Array<{ assessmentId: string; businessId: string; status: string | null }>;
  return {
    total: rows.length,
    feasible: rows.filter((row: { status: string | null }) => row.status === "FEASIBLE" || row.status === "FEASIBLE_WITH_CONDITIONS").length,
    notFeasible: rows.filter((row: { status: string | null }) => row.status === "NOT_FEASIBLE").length,
    inReview: rows.filter((row: { status: string | null }) => row.status === "IN_REVIEW").length,
  };
}

// Stage 4 Step 11 — Release readiness and open-defect attention on the existing Governance summary
// (Section 9: "Release readiness and open-defect attention on the existing Governance summary").
// Scoped to this Project's active Releases; mirrors getPortfolioStage4Insights' readiness roll-up
// but Project-scoped rather than portfolio-wide, and adds the Project's own open-critical-defect count.
async function releaseSummary(projectId: string) {
  const [readiness, defectCounts] = await Promise.all([
    env.DB.prepare(`
      SELECT COUNT(*) total,
        COALESCE(SUM(CASE WHEN latest.readiness='READY' THEN 1 ELSE 0 END),0) ready,
        COALESCE(SUM(CASE WHEN latest.readiness='AT_RISK' THEN 1 ELSE 0 END),0) atRisk,
        COALESCE(SUM(CASE WHEN latest.readiness='BLOCKED' THEN 1 ELSE 0 END),0) blocked
      FROM releases r
      LEFT JOIN release_readiness_snapshots latest ON latest.id=(
        SELECT rs.id FROM release_readiness_snapshots rs WHERE rs.release_id=r.id ORDER BY rs.calculated_at DESC,rs.id DESC LIMIT 1
      )
      WHERE r.project_id=? AND r.record_status='ACTIVE' AND r.status NOT IN ('RELEASED','ROLLED_BACK','CANCELLED','REJECTED')
    `).bind(projectId).first<{ total: number; ready: number; atRisk: number; blocked: number }>(),
    env.DB.prepare(`
      SELECT COUNT(*) openTotal, COALESCE(SUM(CASE WHEN severity='CRITICAL' THEN 1 ELSE 0 END),0) openCritical
      FROM defects WHERE project_id=? AND status NOT IN ('CLOSED','DUPLICATE','DEFERRED')
    `).bind(projectId).first<{ openTotal: number; openCritical: number }>(),
  ]);
  return {
    total: Number(readiness?.total ?? 0), ready: Number(readiness?.ready ?? 0), atRisk: Number(readiness?.atRisk ?? 0), blocked: Number(readiness?.blocked ?? 0),
    openDefects: Number(defectCounts?.openTotal ?? 0), openCriticalDefects: Number(defectCounts?.openCritical ?? 0),
  };
}

export async function getProjectGovernanceSummary(projectId: string, access: GovernanceOverviewAccess) {
  const [documents, requirements, pending, openConditions, raci, feasibility, releases] = await Promise.all([
    access.documents ? documentSummary(projectId) : Promise.resolve(null),
    access.requirements ? requirementCoverageSummary(projectId) : Promise.resolve(null),
    access.signoffs ? pendingSignoffCount(projectId) : Promise.resolve(null),
    access.signoffs ? openConditionCount(projectId) : Promise.resolve(null),
    access.raci ? raciSummary(projectId) : Promise.resolve(null),
    access.feasibility ? feasibilitySummary(projectId) : Promise.resolve(null),
    access.releases ? releaseSummary(projectId) : Promise.resolve(null),
  ]);
  return {
    documents: documents ? { available: true as const, items: documents } : { available: false as const, reason: "Requires BRD/PRD viewing permission." },
    requirements: requirements ? { available: true as const, ...requirements } : { available: false as const, reason: "Requires Requirement viewing permission." },
    signoffs: pending !== null && openConditions !== null ? { available: true as const, pending, openConditions } : { available: false as const, reason: "Requires sign-off viewing permission." },
    raci: raci ? { available: true as const, ...raci } : { available: false as const, reason: "Requires RACI viewing permission." },
    feasibility: feasibility ? { available: true as const, ...feasibility } : { available: false as const, reason: "Requires feasibility viewing permission." },
    releases: releases ? { available: true as const, ...releases } : { available: false as const, reason: "Requires Release viewing permission." },
  };
}
