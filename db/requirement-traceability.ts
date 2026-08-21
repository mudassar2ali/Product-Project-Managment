import { env } from "cloudflare:workers";
import { deriveEvidenceFreshness, deriveRequirementDeliveryStatus } from "../app/governance/stage3-contract";
import type { RequirementBacklogLinkInput, RequirementEvidenceInput, RequirementRelationshipInput } from "../app/governance/requirement-contract";

const cycleCheckedTypes = new Set(["DERIVES_FROM", "DEPENDS_ON"]);

type RequirementScopeRow = { id: string; productId: string; projectId: string | null; recordStatus: string };
type BacklogItemScopeRow = { id: string; projectId: string; origin: string; status: string; deliveryState: string; sourceMissingAt: string | null; recordStatus: string };
type EvidenceRow = {
  id: string; evidenceType: string; sourceSystem: string; externalReference: string; sourceUrl: string | null;
  evidenceStatus: string; result: string; observedAt: string | null; version: number; updatedAt: string;
};

async function loadRequirementScope(id: string) {
  return env.DB.prepare("SELECT id,product_id productId,project_id projectId,record_status recordStatus FROM requirements WHERE id=?").bind(id).first<RequirementScopeRow>();
}

export async function getRequirementTraceability(requirementId: string) {
  const requirement = await loadRequirementScope(requirementId);
  if (!requirement || requirement.recordStatus !== "ACTIVE") return { kind: "not_found" as const };
  const [outgoing, incoming, backlogLinks, evidence, uatLinks] = await Promise.all([
    env.DB.prepare(`
      SELECT r.id,r.relationship_type relationshipType,r.rationale,r.version,
        t.id targetRequirementId,t.business_id targetBusinessId,rev.title targetTitle
      FROM requirement_relationships r
      JOIN requirements t ON t.id=r.target_requirement_id
      LEFT JOIN requirement_revisions rev ON rev.id=(SELECT cv.id FROM requirement_revisions cv WHERE cv.requirement_id=t.id ORDER BY cv.revision_number DESC LIMIT 1)
      WHERE r.source_requirement_id=? ORDER BY r.created_at
    `).bind(requirementId).all(),
    env.DB.prepare(`
      SELECT r.id,r.relationship_type relationshipType,r.rationale,r.version,
        s.id sourceRequirementId,s.business_id sourceBusinessId,rev.title sourceTitle
      FROM requirement_relationships r
      JOIN requirements s ON s.id=r.source_requirement_id
      LEFT JOIN requirement_revisions rev ON rev.id=(SELECT cv.id FROM requirement_revisions cv WHERE cv.requirement_id=s.id ORDER BY cv.revision_number DESC LIMIT 1)
      WHERE r.target_requirement_id=? ORDER BY r.created_at
    `).bind(requirementId).all(),
    env.DB.prepare(`
      SELECT l.id,l.link_type linkType,l.coverage_percentage coveragePercentage,l.rationale,
        b.id backlogItemId,b.business_id backlogBusinessId,b.title backlogTitle,b.origin,b.status,b.delivery_state deliveryState,b.source_missing_at sourceMissingAt
      FROM requirement_backlog_links l
      JOIN backlog_items b ON b.id=l.backlog_item_id
      WHERE l.requirement_id=? ORDER BY l.created_at
    `).bind(requirementId).all(),
    env.DB.prepare(`
      SELECT id,evidence_type evidenceType,source_system sourceSystem,external_reference externalReference,source_url sourceUrl,
        evidence_status evidenceStatus,result,observed_at observedAt,version,updated_at updatedAt
      FROM requirement_evidence_references WHERE requirement_id=? ORDER BY created_at DESC
    `).bind(requirementId).all<EvidenceRow>(),
    // Stage 4 Step 9 — the Requirement-to-UAT edge, continuing the traceability chain (Section 8:
    // Requirement -> UAT test case -> execution) past where requirement_backlog_links stops. This is
    // the many-to-many governed link, distinct from uat_test_cases.requirement_id (the single primary
    // link a test case is created with); a Requirement can be validated by several test cases here.
    env.DB.prepare(`
      SELECT l.id,l.link_type linkType,
        t.id uatTestCaseId,t.business_id testCaseBusinessId,t.title testCaseTitle,t.status testCaseStatus,
        c.id campaignId,c.business_id campaignBusinessId,c.name campaignName,
        rl.id releaseId,rl.business_id releaseBusinessId,rl.name releaseName,
        latest.result latestExecutionResult
      FROM requirement_uat_links l
      JOIN uat_test_cases t ON t.id=l.uat_test_case_id
      JOIN uat_campaigns c ON c.id=t.campaign_id
      JOIN releases rl ON rl.id=c.release_id
      LEFT JOIN uat_test_executions latest
        ON latest.test_case_id=t.id
        AND latest.execution_number=(SELECT MAX(execution_number) FROM uat_test_executions WHERE test_case_id=t.id)
      WHERE l.requirement_id=? ORDER BY l.created_at
    `).bind(requirementId).all(),
  ]);
  const deliveryStatus = deriveRequirementDeliveryStatus(backlogLinks.results.map((link) => ({
    linkType: link.linkType,
    origin: link.origin,
    status: link.status,
    deliveryState: link.deliveryState,
    sourceMissingAt: link.sourceMissingAt,
  })));
  const nowIso = new Date().toISOString();
  const evidenceWithFreshness = evidence.results.map((record) => ({
    ...record,
    freshness: deriveEvidenceFreshness(record.evidenceStatus as Parameters<typeof deriveEvidenceFreshness>[0], record.observedAt, nowIso),
  }));
  return { kind: "ok" as const, requirement, outgoing: outgoing.results, incoming: incoming.results, backlogLinks: backlogLinks.results, evidence: evidenceWithFreshness, deliveryStatus, uatLinks: uatLinks.results };
}

export async function addRequirementRelationship(sourceId: string, input: RequirementRelationshipInput, actor: string, correlationId: string) {
  const [source, target] = await Promise.all([loadRequirementScope(sourceId), loadRequirementScope(input.targetRequirementId)]);
  if (!source || source.recordStatus !== "ACTIVE" || !target || target.recordStatus !== "ACTIVE") return { kind: "not_found" as const };
  if (source.id === target.id) return { kind: "self" as const };
  if (source.productId !== target.productId) return { kind: "scope" as const };
  const crossProject = source.projectId !== target.projectId;
  if (crossProject && !input.rationale.trim()) return { kind: "rationale_required" as const };
  const duplicate = await env.DB.prepare("SELECT id FROM requirement_relationships WHERE source_requirement_id=? AND target_requirement_id=? AND relationship_type=?").bind(source.id, target.id, input.relationshipType).first();
  if (duplicate) return { kind: "duplicate" as const };
  if (cycleCheckedTypes.has(input.relationshipType)) {
    const cycle = await env.DB.prepare(`
      WITH RECURSIVE reachable(id) AS (
        SELECT target_requirement_id FROM requirement_relationships WHERE source_requirement_id=? AND relationship_type=?
        UNION
        SELECT rr.target_requirement_id FROM requirement_relationships rr JOIN reachable x ON rr.source_requirement_id=x.id WHERE rr.relationship_type=?
      )
      SELECT id FROM reachable WHERE id=? LIMIT 1
    `).bind(target.id, input.relationshipType, input.relationshipType, source.id).first();
    if (cycle) return { kind: "cycle" as const };
  }
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO requirement_relationships(id,source_requirement_id,target_requirement_id,relationship_type,rationale,created_by,updated_by) VALUES(?,?,?,?,?,?,?)").bind(id, source.id, target.id, input.relationshipType, input.rationale, actor, actor),
    env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), "Requirement", source.id, "RELATIONSHIP_ADD", JSON.stringify({ id, targetRequirementId: target.id, relationshipType: input.relationshipType }), actor, correlationId),
  ]);
  return { kind: "ok" as const, id };
}

export async function removeRequirementRelationship(sourceId: string, relationshipId: string, actor: string, correlationId: string) {
  const relationship = await env.DB.prepare("SELECT id,source_requirement_id sourceRequirementId,target_requirement_id targetRequirementId,relationship_type relationshipType FROM requirement_relationships WHERE id=? AND source_requirement_id=?").bind(relationshipId, sourceId).first<{ id: string; sourceRequirementId: string; targetRequirementId: string; relationshipType: string }>();
  if (!relationship) return { kind: "not_found" as const };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM requirement_relationships WHERE id=?").bind(relationshipId),
    env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), "Requirement", sourceId, "RELATIONSHIP_REMOVE", JSON.stringify(relationship), actor, correlationId),
  ]);
  return { kind: "ok" as const };
}

export async function addRequirementBacklogLink(requirementId: string, input: RequirementBacklogLinkInput, actor: string, correlationId: string) {
  const [requirement, backlogItem] = await Promise.all([
    loadRequirementScope(requirementId),
    env.DB.prepare("SELECT id,project_id projectId,origin,status,delivery_state deliveryState,source_missing_at sourceMissingAt,record_status recordStatus FROM backlog_items WHERE id=?").bind(input.backlogItemId).first<BacklogItemScopeRow>(),
  ]);
  if (!requirement || requirement.recordStatus !== "ACTIVE" || !backlogItem || backlogItem.recordStatus !== "ACTIVE") return { kind: "not_found" as const };
  const scoped = requirement.projectId !== null && requirement.projectId === backlogItem.projectId;
  if (!scoped && !input.rationale.trim()) return { kind: "rationale_required" as const };
  const duplicate = await env.DB.prepare("SELECT id FROM requirement_backlog_links WHERE requirement_id=? AND backlog_item_id=? AND link_type=?").bind(requirementId, backlogItem.id, input.linkType).first();
  if (duplicate) return { kind: "duplicate" as const };
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO requirement_backlog_links(id,requirement_id,backlog_item_id,link_type,coverage_percentage,rationale,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?)").bind(id, requirementId, backlogItem.id, input.linkType, input.coveragePercentage, input.rationale, actor, actor),
    env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), "Requirement", requirementId, "BACKLOG_LINK_ADD", JSON.stringify({ id, backlogItemId: backlogItem.id, linkType: input.linkType, coveragePercentage: input.coveragePercentage }), actor, correlationId),
  ]);
  return { kind: "ok" as const, id };
}

export async function removeRequirementBacklogLink(requirementId: string, linkId: string, actor: string, correlationId: string) {
  const link = await env.DB.prepare("SELECT id,requirement_id requirementId,backlog_item_id backlogItemId,link_type linkType FROM requirement_backlog_links WHERE id=? AND requirement_id=?").bind(linkId, requirementId).first<{ id: string; requirementId: string; backlogItemId: string; linkType: string }>();
  if (!link) return { kind: "not_found" as const };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM requirement_backlog_links WHERE id=?").bind(linkId),
    env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), "Requirement", requirementId, "BACKLOG_LINK_REMOVE", JSON.stringify(link), actor, correlationId),
  ]);
  return { kind: "ok" as const };
}

export async function addRequirementEvidence(requirementId: string, input: RequirementEvidenceInput, actor: string, correlationId: string) {
  const requirement = await loadRequirementScope(requirementId);
  if (!requirement || requirement.recordStatus !== "ACTIVE") return { kind: "not_found" as const };
  const duplicate = await env.DB
    .prepare("SELECT id FROM requirement_evidence_references WHERE requirement_id=? AND evidence_type=? AND external_reference=?")
    .bind(requirementId, input.evidenceType, input.externalReference)
    .first();
  if (duplicate) return { kind: "duplicate" as const };
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB
      .prepare(
        "INSERT INTO requirement_evidence_references(id,requirement_id,evidence_type,source_system,external_reference,source_url,evidence_status,result,observed_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(id, requirementId, input.evidenceType, input.sourceSystem, input.externalReference, input.sourceUrl, input.evidenceStatus, input.result, input.observedAt, actor, actor),
    env.DB
      .prepare(
        "INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)",
      )
      .bind(
        crypto.randomUUID(),
        "Requirement",
        requirementId,
        "EVIDENCE_ADD",
        JSON.stringify({ id, evidenceType: input.evidenceType, sourceSystem: input.sourceSystem, externalReference: input.externalReference, evidenceStatus: input.evidenceStatus }),
        actor,
        correlationId,
      ),
  ]);
  return { kind: "ok" as const, id };
}
