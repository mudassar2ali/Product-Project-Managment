import { env } from "cloudflare:workers";
import type { RequirementUatLinkInput } from "../app/releases/uat-contract";

export type RequirementUatLinkRow = {
  id: string; requirementId: string; requirementBusinessId: string; requirementTitle: string | null;
  uatTestCaseId: string; linkType: string; createdAt: string;
};

const linkColumns = `
  l.id,l.requirement_id requirementId,rq.business_id requirementBusinessId,rev.title requirementTitle,
  l.uat_test_case_id uatTestCaseId,l.link_type linkType,l.created_at createdAt
`;

export async function listRequirementUatLinksForTestCase(testCaseId: string) {
  const rows = await env.DB.prepare(`
    SELECT ${linkColumns}
    FROM requirement_uat_links l
    JOIN requirements rq ON rq.id=l.requirement_id
    LEFT JOIN requirement_revisions rev ON rev.id=(SELECT cv.id FROM requirement_revisions cv WHERE cv.requirement_id=rq.id ORDER BY cv.revision_number DESC LIMIT 1)
    WHERE l.uat_test_case_id=? ORDER BY l.created_at
  `).bind(testCaseId).all<RequirementUatLinkRow>();
  return rows.results;
}

export async function addRequirementUatLink(testCaseId: string, input: RequirementUatLinkInput, actor: string, correlationId: string) {
  const [testCase, requirement] = await Promise.all([
    env.DB.prepare("SELECT id FROM uat_test_cases WHERE id=?").bind(testCaseId).first<{ id: string }>(),
    env.DB.prepare("SELECT id,record_status recordStatus FROM requirements WHERE id=?").bind(input.requirementId).first<{ id: string; recordStatus: string }>(),
  ]);
  if (!testCase || !requirement || requirement.recordStatus !== "ACTIVE") return { kind: "not_found" as const };
  const duplicate = await env.DB.prepare("SELECT id FROM requirement_uat_links WHERE requirement_id=? AND uat_test_case_id=? AND link_type=?").bind(input.requirementId, testCaseId, input.linkType).first();
  if (duplicate) return { kind: "duplicate" as const };
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO requirement_uat_links(id,requirement_id,uat_test_case_id,link_type,created_by,updated_by) VALUES(?,?,?,?,?,?)")
      .bind(id, input.requirementId, testCaseId, input.linkType, actor, actor),
    env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)")
      .bind(crypto.randomUUID(), "UatTestCase", testCaseId, "REQUIREMENT_LINK_ADD", JSON.stringify({ id, requirementId: input.requirementId, linkType: input.linkType }), actor, correlationId),
  ]);
  return { kind: "ok" as const, id };
}

export async function removeRequirementUatLink(testCaseId: string, linkId: string, actor: string, correlationId: string) {
  const link = await env.DB.prepare("SELECT id,requirement_id requirementId,uat_test_case_id uatTestCaseId,link_type linkType FROM requirement_uat_links WHERE id=? AND uat_test_case_id=?").bind(linkId, testCaseId).first<{ id: string; requirementId: string; uatTestCaseId: string; linkType: string }>();
  if (!link) return { kind: "not_found" as const };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM requirement_uat_links WHERE id=?").bind(linkId),
    env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)")
      .bind(crypto.randomUUID(), "UatTestCase", testCaseId, "REQUIREMENT_LINK_REMOVE", JSON.stringify(link), actor, correlationId),
  ]);
  return { kind: "ok" as const };
}
