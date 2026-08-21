import { env } from "cloudflare:workers";

// Mirrors db/stage2-insights.ts's getPortfolioDeliveryInsights shape exactly: one access-gated
// summary per evidence area, plus a shared, capped attention list the Dashboard renders alongside
// every other stage's exceptions (Section 22 — "the same persisted-queue approach Stage 3 used
// instead of notification delivery"). Nothing here duplicates db/release-readiness.ts's evidence
// derivation for a single Release; these are deliberately cheap, portfolio-wide roll-ups of the same
// already-persisted state (latest readiness snapshot, latest execution per test case, open defects,
// open sign-off lanes).

export type Stage4InsightAccess = {
  releases: boolean;
  uat: boolean;
  defects: boolean;
  signoffs: boolean;
};

type CountRow = Record<string, number>;

const unavailable = (reason: string) => ({ available: false as const, reason });

export async function getPortfolioStage4Insights(access: Stage4InsightAccess) {
  const releaseReadinessPromise = access.releases
    ? env.DB.prepare(`
        SELECT COUNT(*) total,
          COALESCE(SUM(CASE WHEN latest.readiness='READY' THEN 1 ELSE 0 END),0) ready,
          COALESCE(SUM(CASE WHEN latest.readiness='AT_RISK' THEN 1 ELSE 0 END),0) atRisk,
          COALESCE(SUM(CASE WHEN latest.readiness='BLOCKED' THEN 1 ELSE 0 END),0) blocked,
          COALESCE(SUM(CASE WHEN latest.readiness IS NULL OR latest.readiness='NOT_READY' THEN 1 ELSE 0 END),0) notReady
        FROM releases r
        LEFT JOIN release_readiness_snapshots latest ON latest.id=(
          SELECT rs.id FROM release_readiness_snapshots rs WHERE rs.release_id=r.id ORDER BY rs.calculated_at DESC,rs.id DESC LIMIT 1
        )
        WHERE r.record_status='ACTIVE' AND r.status NOT IN ('RELEASED','ROLLED_BACK','CANCELLED','REJECTED')
      `).first<CountRow>()
    : Promise.resolve(null);

  const uatPromise = access.uat
    ? env.DB.prepare(`
        SELECT COUNT(*) totalTestCases,
          COALESCE(SUM(CASE WHEN latest.result='PASS' THEN 1 ELSE 0 END),0) passed,
          COALESCE(SUM(CASE WHEN latest.result='FAIL' THEN 1 ELSE 0 END),0) failed,
          COALESCE(SUM(CASE WHEN latest.result='BLOCKED' THEN 1 ELSE 0 END),0) blocked,
          (SELECT COUNT(*) FROM uat_campaigns WHERE status IN ('PLANNED','IN_PROGRESS') AND record_status='ACTIVE') activeCampaigns
        FROM uat_test_cases t
        JOIN uat_campaigns c ON c.id=t.campaign_id
        LEFT JOIN uat_test_executions latest ON latest.test_case_id=t.id
          AND latest.execution_number=(SELECT MAX(execution_number) FROM uat_test_executions WHERE test_case_id=t.id)
        WHERE t.status='READY' AND c.record_status='ACTIVE'
      `).first<CountRow>()
    : Promise.resolve(null);

  const defectPromise = access.defects
    ? env.DB.prepare(`
        SELECT COUNT(*) openTotal, COALESCE(SUM(CASE WHEN severity='CRITICAL' THEN 1 ELSE 0 END),0) openCritical
        FROM defects WHERE status NOT IN ('CLOSED','DUPLICATE','DEFERRED')
      `).first<CountRow>()
    : Promise.resolve(null);

  const pendingSignoffPromise = access.signoffs
    ? env.DB.prepare(`SELECT COUNT(*) pending FROM signoff_requests WHERE release_id IS NOT NULL AND status IN ('PENDING','UNDER_REVIEW')`).first<{ pending: number }>()
    : Promise.resolve(null);

  // Overdue Release sign-off lanes: signoff_lanes.due_at is never populated by the current
  // sign-off-request-creation flow (the same known, carried-forward limitation Stage 3's own
  // Approval Aging report already discloses) — this query is correct and will populate the moment
  // a future step adds due-date capture to the sign-off request UI.
  const overdueLanesPromise = access.releases && access.signoffs
    ? env.DB.prepare(`
        SELECT 'Release Sign-off' kind,r.business_id businessId,r.name title,'Overdue' signal,l.due_at dueDate,'Releases' destination
        FROM signoff_lanes l JOIN signoff_requests sr ON sr.id=l.signoff_request_id JOIN releases r ON r.id=sr.release_id
        WHERE l.status IN ('PENDING','UNDER_REVIEW') AND l.due_at IS NOT NULL AND date(l.due_at)<date('now')
        ORDER BY l.due_at LIMIT 6
      `).all<Record<string, unknown>>()
    : Promise.resolve({ results: [] as Record<string, unknown>[] });

  const criticalDefectAttentionPromise = access.defects
    ? env.DB.prepare(`
        SELECT 'Defect' kind,business_id businessId,title,'Critical' signal,NULL dueDate,'Releases' destination
        FROM defects WHERE status NOT IN ('CLOSED','DUPLICATE','DEFERRED') AND severity='CRITICAL'
        ORDER BY reported_at DESC LIMIT 6
      `).all<Record<string, unknown>>()
    : Promise.resolve({ results: [] as Record<string, unknown>[] });

  const overdueCampaignPromise = access.uat
    ? env.DB.prepare(`
        SELECT 'UAT Campaign' kind,business_id businessId,name title,'Overdue' signal,planned_end_date dueDate,'Releases' destination
        FROM uat_campaigns
        WHERE record_status='ACTIVE' AND status NOT IN ('COMPLETED','CANCELLED') AND planned_end_date IS NOT NULL AND date(planned_end_date)<date('now')
        ORDER BY planned_end_date LIMIT 6
      `).all<Record<string, unknown>>()
    : Promise.resolve({ results: [] as Record<string, unknown>[] });

  const [releaseReadiness, uat, defects, pendingSignoff, overdueLanes, criticalDefectAttention, overdueCampaigns] = await Promise.all([
    releaseReadinessPromise, uatPromise, defectPromise, pendingSignoffPromise, overdueLanesPromise, criticalDefectAttentionPromise, overdueCampaignPromise,
  ]);

  const testedCount = uat ? Number(uat.passed ?? 0) + Number(uat.failed ?? 0) + Number(uat.blocked ?? 0) : 0;

  return {
    releases: access.releases
      ? { available: true as const, total: Number(releaseReadiness?.total ?? 0), ready: Number(releaseReadiness?.ready ?? 0), atRisk: Number(releaseReadiness?.atRisk ?? 0), blocked: Number(releaseReadiness?.blocked ?? 0), notReady: Number(releaseReadiness?.notReady ?? 0) }
      : unavailable("Release readiness requires Release view permission."),
    uat: access.uat
      ? { available: true as const, totalTestCases: Number(uat?.totalTestCases ?? 0), passed: Number(uat?.passed ?? 0), passRate: testedCount > 0 ? Math.round((Number(uat?.passed ?? 0) / testedCount) * 100) : null, activeCampaigns: Number(uat?.activeCampaigns ?? 0) }
      : unavailable("UAT pass rate requires UAT view permission."),
    defects: access.defects
      ? { available: true as const, openTotal: Number(defects?.openTotal ?? 0), openCritical: Number(defects?.openCritical ?? 0) }
      : unavailable("Open-defect evidence requires Defect view permission."),
    signoffs: access.signoffs
      ? { available: true as const, pending: Number(pendingSignoff?.pending ?? 0) }
      : unavailable("Pending Release sign-offs require sign-off view permission."),
    attention: [...overdueLanes.results, ...criticalDefectAttention.results, ...overdueCampaigns.results].slice(0, 10),
  };
}
