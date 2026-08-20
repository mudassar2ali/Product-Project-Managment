import { env } from "cloudflare:workers";
import { assertCampaignTransition, assertExecutionEvidenceConsistent, assertTestCaseExecutable } from "../app/releases/stage4-contract";
import type { ExecutionInput } from "../app/releases/uat-execution-contract";

export type ExecutionRow = {
  id: string; testCaseId: string; executionNumber: number; result: string;
  executedByUserId: string | null; executedByName: string | null; executedAt: string | null;
  actualResult: string; evidenceReference: string;
  defectId: string | null; defectBusinessId: string | null;
  version: number; createdAt: string; updatedAt: string;
};

type TestCaseScope = {
  id: string; status: string; campaignId: string; releaseId: string;
  campaignStatus: string; campaignVersion: number; projectId: string;
};

const executionColumns = `
  e.id,e.test_case_id testCaseId,e.execution_number executionNumber,e.result,
  e.executed_by_user_id executedByUserId,u.display_name executedByName,e.executed_at executedAt,
  e.actual_result actualResult,e.evidence_reference evidenceReference,
  e.defect_id defectId,d.business_id defectBusinessId,
  e.version,e.created_at createdAt,e.updated_at updatedAt
`;

async function nextBusinessId(entityType: "DEFECT", prefix: string, pad: number) {
  const result = await env.DB.prepare(`
    INSERT INTO business_sequences(entity_type,next_value,updated_at) VALUES(?,2,CURRENT_TIMESTAMP)
    ON CONFLICT(entity_type) DO UPDATE SET next_value=next_value+1,updated_at=CURRENT_TIMESTAMP
    RETURNING next_value-1 value
  `).bind(entityType).first<{ value: number }>();
  return `${prefix}-${String(result?.value ?? 1).padStart(pad, "0")}`;
}

export async function listExecutions(testCaseId: string) {
  const rows = await env.DB.prepare(`
    SELECT ${executionColumns} FROM uat_test_executions e
    LEFT JOIN users u ON u.id=e.executed_by_user_id
    LEFT JOIN defects d ON d.id=e.defect_id
    WHERE e.test_case_id=? ORDER BY e.execution_number ASC
  `).bind(testCaseId).all<ExecutionRow>();
  return rows.results;
}

async function testCaseScope(testCaseId: string) {
  return env.DB.prepare(`
    SELECT t.id,t.status,t.campaign_id campaignId,c.release_id releaseId,
      c.status campaignStatus,c.version campaignVersion,r.project_id projectId
    FROM uat_test_cases t
    JOIN uat_campaigns c ON c.id=t.campaign_id
    JOIN releases r ON r.id=c.release_id
    WHERE t.id=?
  `).bind(testCaseId).first<TestCaseScope>();
}

export async function recordExecution(testCaseId: string, input: ExecutionInput, actor: string, correlationId: string) {
  const testCase = await testCaseScope(testCaseId);
  if (!testCase) return { kind: "not_found" as const };

  try {
    assertTestCaseExecutable(testCase.status as never);
  } catch {
    return { kind: "test_case_not_ready" as const };
  }

  const isExecuted = input.result !== "NOT_EXECUTED";
  const executedAt = isExecuted ? (input.executedAt ?? new Date().toISOString()) : null;
  const executedByUserId = isExecuted ? actor : null;
  try {
    assertExecutionEvidenceConsistent(input.result, executedAt, executedByUserId);
  } catch {
    return { kind: "evidence_invalid" as const };
  }

  const countRow = await env.DB.prepare("SELECT COUNT(*) total FROM uat_test_executions WHERE test_case_id=?").bind(testCaseId).first<{ total: number }>();
  const executionNumber = (countRow?.total ?? 0) + 1;

  let defectId: string | null = null;
  let defectBusinessId: string | null = null;
  const statements = [];

  if (input.defect && (input.result === "FAIL" || input.result === "BLOCKED")) {
    defectId = crypto.randomUUID();
    defectBusinessId = await nextBusinessId("DEFECT", "DEF", 4);
    statements.push(
      env.DB.prepare(`
        INSERT INTO defects(id,business_id,project_id,release_id,source,severity,title,description,steps_to_reproduce,reported_by_user_id,created_by,updated_by)
        VALUES(?,?,?,?,'UAT',?,?,?,?,?,?,?)
      `).bind(defectId, defectBusinessId, testCase.projectId, testCase.releaseId, input.defect.severity, input.defect.title, input.defect.description, input.defect.stepsToReproduce, actor, actor, actor),
      env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)`)
        .bind(crypto.randomUUID(), "Defect", defectId, "CREATE", JSON.stringify({ businessId: defectBusinessId, projectId: testCase.projectId, releaseId: testCase.releaseId, severity: input.defect.severity, title: input.defect.title, source: "UAT" }), actor, correlationId),
    );
  }

  const executionId = crypto.randomUUID();
  statements.push(
    env.DB.prepare(`
      INSERT INTO uat_test_executions(id,test_case_id,execution_number,result,executed_by_user_id,executed_at,actual_result,evidence_reference,defect_id,created_by,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `).bind(executionId, testCaseId, executionNumber, input.result, executedByUserId, executedAt, input.actualResult, input.evidenceReference, defectId, actor, actor),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)`)
      .bind(crypto.randomUUID(), "UatTestCase", testCaseId, "EXECUTION_RECORD", JSON.stringify({ executionId, executionNumber, result: input.result, defectId }), actor, correlationId),
  );

  if (testCase.campaignStatus === "DRAFT" || testCase.campaignStatus === "PLANNED") {
    try {
      assertCampaignTransition(testCase.campaignStatus as never, "IN_PROGRESS");
      statements.push(
        env.DB.prepare("UPDATE uat_campaigns SET status='IN_PROGRESS',started_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND status=?")
          .bind(actor, testCase.campaignId, testCase.campaignVersion, testCase.campaignStatus),
      );
    } catch { /* not a valid transition from the current status — the execution is still recorded */ }
  }

  await env.DB.batch(statements);

  const campaign = await env.DB.prepare("SELECT status FROM uat_campaigns WHERE id=?").bind(testCase.campaignId).first<{ status: string }>();
  return {
    kind: "ok" as const,
    executions: await listExecutions(testCaseId),
    defectId,
    defectBusinessId,
    campaignStatus: campaign?.status ?? testCase.campaignStatus,
  };
}
