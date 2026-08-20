import { env } from "cloudflare:workers";
import { calculateReleaseReadiness, stage4ContractVersion, type ReleaseReadinessEvidence } from "../app/releases/stage4-contract";

export type ReadinessSnapshotRow = {
  id: string; releaseId: string; sourceRevision: string;
  scopeItemCount: number; scopeDoneCount: number;
  uatTestCaseCount: number; uatPassedCount: number; uatFailedCount: number; uatBlockedCount: number; uatNotExecutedCount: number;
  openDefectCount: number; criticalOpenDefectCount: number;
  signoffStatus: string | null; readiness: string; formula: string;
  calculatedAt: string; createdAt: string; updatedAt: string;
};

const snapshotColumns = `
  id,release_id releaseId,source_revision sourceRevision,
  scope_item_count scopeItemCount,scope_done_count scopeDoneCount,
  uat_test_case_count uatTestCaseCount,uat_passed_count uatPassedCount,uat_failed_count uatFailedCount,
  uat_blocked_count uatBlockedCount,uat_not_executed_count uatNotExecutedCount,
  open_defect_count openDefectCount,critical_open_defect_count criticalOpenDefectCount,
  signoff_status signoffStatus,readiness,formula,calculated_at calculatedAt,created_at createdAt,updated_at updatedAt
`;

export async function getLatestReadinessSnapshot(releaseId: string) {
  return env.DB.prepare(`
    SELECT ${snapshotColumns} FROM release_readiness_snapshots
    WHERE release_id=? ORDER BY calculated_at DESC,id DESC LIMIT 1
  `).bind(releaseId).first<ReadinessSnapshotRow>();
}

// Evidence is scoped to UAT test cases that are (or were) actually executable — DRAFT cases have
// never been executable and RETIRED cases are superseded, so neither should silently count toward
// or against readiness. A READY test case with zero execution rows still counts, as NOT_EXECUTED,
// via the COALESCE below, so a never-tested case cannot be dropped from the evidence set.
async function gatherEvidence(releaseId: string): Promise<ReleaseReadinessEvidence> {
  const [scope, executions, defectCounts] = await Promise.all([
    env.DB.prepare(`
      SELECT s.backlog_item_id backlogItemId, b.status deliveryStatus
      FROM release_scope_items s JOIN backlog_items b ON b.id=s.backlog_item_id
      WHERE s.release_id=? AND s.removed_at IS NULL
    `).bind(releaseId).all<{ backlogItemId: string; deliveryStatus: string }>(),
    env.DB.prepare(`
      SELECT t.id testCaseId, COALESCE(latest.result,'NOT_EXECUTED') result
      FROM uat_test_cases t
      JOIN uat_campaigns c ON c.id=t.campaign_id
      LEFT JOIN uat_test_executions latest
        ON latest.test_case_id=t.id
        AND latest.execution_number=(SELECT MAX(execution_number) FROM uat_test_executions WHERE test_case_id=t.id)
      WHERE c.release_id=? AND t.status='READY'
    `).bind(releaseId).all<{ testCaseId: string; result: "PASS" | "FAIL" | "BLOCKED" | "NOT_EXECUTED" }>(),
    env.DB.prepare(`
      SELECT COUNT(*) total, SUM(CASE WHEN severity='CRITICAL' THEN 1 ELSE 0 END) critical
      FROM defects WHERE release_id=? AND status NOT IN ('CLOSED','DUPLICATE','DEFERRED')
    `).bind(releaseId).first<{ total: number; critical: number | null }>(),
  ]);
  return {
    scope: scope.results,
    latestExecutionByTestCase: executions.results,
    openDefectCount: defectCounts?.total ?? 0,
    openCriticalDefectCount: defectCounts?.critical ?? 0,
    // Sign-off is wired in Stage 4 Step 8 (signoff_requests.release_id does not exist yet); until
    // then readiness is computed as if no sign-off has been requested, which the contract's own
    // formula already treats as AT_RISK rather than READY — an honest, non-blocking placeholder.
    signoffStatus: null,
    openMandatorySignoffConditions: 0,
  };
}

async function hashEvidence(evidence: ReleaseReadinessEvidence) {
  const canonical = JSON.stringify({
    scope: [...evidence.scope].sort((a, b) => a.backlogItemId.localeCompare(b.backlogItemId)),
    executions: [...evidence.latestExecutionByTestCase].sort((a, b) => a.testCaseId.localeCompare(b.testCaseId)),
    openDefectCount: evidence.openDefectCount,
    openCriticalDefectCount: evidence.openCriticalDefectCount,
    signoffStatus: evidence.signoffStatus,
    openMandatorySignoffConditions: evidence.openMandatorySignoffConditions,
  });
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function calculateAndPersistReadiness(releaseId: string, actor: string, correlationId: string) {
  const release = await env.DB.prepare("SELECT id FROM releases WHERE id=? AND record_status='ACTIVE'").bind(releaseId).first<{ id: string }>();
  if (!release) return { kind: "not_found" as const };

  const evidence = await gatherEvidence(releaseId);
  const sourceRevision = await hashEvidence(evidence);

  const existing = await env.DB.prepare(`
    SELECT ${snapshotColumns} FROM release_readiness_snapshots WHERE release_id=? AND source_revision=?
  `).bind(releaseId, sourceRevision).first<ReadinessSnapshotRow>();
  if (existing) return { kind: "ok" as const, snapshot: existing };

  const result = calculateReleaseReadiness(evidence);
  const id = crypto.randomUUID();
  const calculatedAt = new Date().toISOString();
  const formula = `stage4-contract@${stage4ContractVersion}`;
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO release_readiness_snapshots(
        id,release_id,source_revision,scope_item_count,scope_done_count,
        uat_test_case_count,uat_passed_count,uat_failed_count,uat_blocked_count,uat_not_executed_count,
        open_defect_count,critical_open_defect_count,signoff_status,readiness,formula,calculated_at,
        created_by,updated_by
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, releaseId, sourceRevision, result.scopeItemCount, result.scopeDoneCount,
      result.uatTestCaseCount, result.uatPassedCount, result.uatFailedCount, result.uatBlockedCount, result.uatNotExecutedCount,
      result.openDefectCount, result.criticalOpenDefectCount, evidence.signoffStatus, result.readiness, formula, calculatedAt,
      actor, actor,
    ),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)`)
      .bind(crypto.randomUUID(), "Release", releaseId, "READINESS_CALCULATE", JSON.stringify({ snapshotId: id, sourceRevision, readiness: result.readiness }), actor, correlationId),
  ]);

  return { kind: "ok" as const, snapshot: await getLatestReadinessSnapshot(releaseId) };
}
