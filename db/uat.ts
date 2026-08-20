import { env } from "cloudflare:workers";
import type { CampaignRegistrationInput, TestCaseRegistrationInput } from "../app/releases/uat-contract";

export type CampaignRow = {
  id: string; businessId: string; releaseId: string; name: string; status: string;
  entryCriteria: string; exitCriteria: string;
  plannedStartDate: string | null; plannedEndDate: string | null; startedAt: string | null; completedAt: string | null;
  ownerUserId: string | null; ownerName: string | null;
  recordStatus: string; version: number; createdAt: string; updatedAt: string;
};

export type TestCaseRow = {
  id: string; businessId: string; campaignId: string;
  requirementId: string | null; requirementBusinessId: string | null;
  backlogItemId: string | null; backlogItemBusinessId: string | null;
  title: string; preconditions: string; steps: string; expectedResult: string;
  priority: string; status: string; version: number; createdAt: string; updatedAt: string;
};

const campaignColumns = `
  c.id,c.business_id businessId,c.release_id releaseId,c.name,c.status,
  c.entry_criteria entryCriteria,c.exit_criteria exitCriteria,
  c.planned_start_date plannedStartDate,c.planned_end_date plannedEndDate,
  c.started_at startedAt,c.completed_at completedAt,
  c.owner_user_id ownerUserId,u.display_name ownerName,
  c.record_status recordStatus,c.version,c.created_at createdAt,c.updated_at updatedAt
`;

const testCaseColumns = `
  t.id,t.business_id businessId,t.campaign_id campaignId,
  t.requirement_id requirementId,req.business_id requirementBusinessId,
  t.backlog_item_id backlogItemId,bi.business_id backlogItemBusinessId,
  t.title,t.preconditions,t.steps,t.expected_result expectedResult,
  t.priority,t.status,t.version,t.created_at createdAt,t.updated_at updatedAt
`;

async function nextBusinessId(entityType: "UAT_CAMPAIGN" | "TEST_CASE", prefix: string, pad: number) {
  const result = await env.DB.prepare(`
    INSERT INTO business_sequences(entity_type,next_value,updated_at) VALUES(?,2,CURRENT_TIMESTAMP)
    ON CONFLICT(entity_type) DO UPDATE SET next_value=next_value+1,updated_at=CURRENT_TIMESTAMP
    RETURNING next_value-1 value
  `).bind(entityType).first<{ value: number }>();
  return `${prefix}-${String(result?.value ?? 1).padStart(pad, "0")}`;
}

export async function listCampaigns(releaseId: string) {
  const rows = await env.DB.prepare(`
    SELECT ${campaignColumns} FROM uat_campaigns c LEFT JOIN users u ON u.id=c.owner_user_id
    WHERE c.release_id=? AND c.record_status='ACTIVE' ORDER BY c.created_at DESC
  `).bind(releaseId).all<CampaignRow>();
  return rows.results;
}

export async function createCampaign(releaseId: string, input: CampaignRegistrationInput, actor: string, correlationId: string) {
  const release = await env.DB.prepare("SELECT id FROM releases WHERE id=? AND record_status='ACTIVE'").bind(releaseId).first<{ id: string }>();
  if (!release) return { kind: "not_found" as const };
  const id = crypto.randomUUID();
  const businessId = await nextBusinessId("UAT_CAMPAIGN", "CAM", 4);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO uat_campaigns(id,business_id,release_id,name,entry_criteria,exit_criteria,planned_start_date,planned_end_date,owner_user_id,created_by,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `).bind(id, businessId, releaseId, input.name, input.entryCriteria, input.exitCriteria, input.plannedStartDate, input.plannedEndDate, input.ownerUserId, actor, actor),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)`)
      .bind(crypto.randomUUID(), "UatCampaign", id, "CREATE", JSON.stringify({ businessId, releaseId, name: input.name }), actor, correlationId),
  ]);
  return { kind: "ok" as const, items: await listCampaigns(releaseId) };
}

async function campaignScope(campaignId: string) {
  return env.DB.prepare(`
    SELECT c.id,c.release_id releaseId,r.project_id projectId FROM uat_campaigns c
    JOIN releases r ON r.id=c.release_id
    WHERE c.id=? AND c.record_status='ACTIVE'
  `).bind(campaignId).first<{ id: string; releaseId: string; projectId: string }>();
}

async function validateTestCaseLinks(input: TestCaseRegistrationInput, projectId: string) {
  if (input.requirementId) {
    const requirement = await env.DB.prepare("SELECT id FROM requirements WHERE id=? AND project_id=? AND record_status='ACTIVE'").bind(input.requirementId, projectId).first<{ id: string }>();
    if (!requirement) return "invalid_requirement" as const;
  }
  if (input.backlogItemId) {
    const backlogItem = await env.DB.prepare("SELECT id FROM backlog_items WHERE id=? AND project_id=? AND record_status='ACTIVE'").bind(input.backlogItemId, projectId).first<{ id: string }>();
    if (!backlogItem) return "invalid_backlog_item" as const;
  }
  return "ok" as const;
}

export async function listTestCases(campaignId: string) {
  const rows = await env.DB.prepare(`
    SELECT ${testCaseColumns} FROM uat_test_cases t
    LEFT JOIN requirements req ON req.id=t.requirement_id
    LEFT JOIN backlog_items bi ON bi.id=t.backlog_item_id
    WHERE t.campaign_id=? ORDER BY t.created_at ASC
  `).bind(campaignId).all<TestCaseRow>();
  return rows.results;
}

export async function createTestCase(campaignId: string, input: TestCaseRegistrationInput, actor: string, correlationId: string) {
  const campaign = await campaignScope(campaignId);
  if (!campaign) return { kind: "not_found" as const };
  const linkCheck = await validateTestCaseLinks(input, campaign.projectId);
  if (linkCheck !== "ok") return { kind: linkCheck };
  const id = crypto.randomUUID();
  const businessId = await nextBusinessId("TEST_CASE", "TC", 5);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO uat_test_cases(id,business_id,campaign_id,requirement_id,backlog_item_id,title,preconditions,steps,expected_result,priority,status,created_by,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(id, businessId, campaignId, input.requirementId, input.backlogItemId, input.title, input.preconditions, input.steps, input.expectedResult, input.priority, input.status, actor, actor),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)`)
      .bind(crypto.randomUUID(), "UatTestCase", id, "CREATE", JSON.stringify({ businessId, campaignId, title: input.title }), actor, correlationId),
  ]);
  return { kind: "ok" as const, items: await listTestCases(campaignId) };
}

export async function updateTestCase(id: string, input: TestCaseRegistrationInput, expectedVersion: number, actor: string, correlationId: string) {
  const existing = await env.DB.prepare("SELECT id,campaign_id campaignId,status FROM uat_test_cases WHERE id=?").bind(id).first<{ id: string; campaignId: string; status: string }>();
  if (!existing) return { kind: "not_found" as const };
  if (existing.status !== "DRAFT") return { kind: "locked" as const };
  const campaign = await campaignScope(existing.campaignId);
  if (!campaign) return { kind: "not_found" as const };
  const linkCheck = await validateTestCaseLinks(input, campaign.projectId);
  if (linkCheck !== "ok") return { kind: linkCheck };
  const result = await env.DB.batch([
    env.DB.prepare(`
      UPDATE uat_test_cases SET requirement_id=?,backlog_item_id=?,title=?,preconditions=?,steps=?,expected_result=?,priority=?,status=?,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=?
      WHERE id=? AND version=? AND status='DRAFT'
    `).bind(input.requirementId, input.backlogItemId, input.title, input.preconditions, input.steps, input.expectedResult, input.priority, input.status, actor, id, expectedVersion),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) SELECT ?,?,?,?,?,?,'APPLICATION',? WHERE EXISTS(SELECT 1 FROM uat_test_cases WHERE id=? AND version=?)`)
      .bind(crypto.randomUUID(), "UatTestCase", id, "UPDATE", JSON.stringify(input), actor, correlationId, id, expectedVersion + 1),
  ]);
  if (result[0].meta.changes === 0) return { kind: "conflict" as const };
  return { kind: "ok" as const, items: await listTestCases(existing.campaignId) };
}
