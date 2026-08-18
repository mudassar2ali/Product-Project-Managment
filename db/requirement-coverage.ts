import { env } from "cloudflare:workers";
import { deriveEvidenceFreshness, deriveRequirementDeliveryStatus, requirementCoverageEvidence } from "../app/governance/stage3-contract";

export type PortfolioTraceabilityFilter = { productId: string; projectId: string };

export async function getPortfolioTraceability(filter: PortfolioTraceabilityFilter) {
  const conditions = ["r.record_status='ACTIVE'"];
  const values: unknown[] = [];
  if (filter.productId) { conditions.push("r.product_id=?"); values.push(filter.productId); }
  if (filter.projectId) { conditions.push("r.project_id=?"); values.push(filter.projectId); }
  const where = conditions.join(" AND ");

  const requirementsResult = await env.DB.prepare(`
    SELECT r.id,r.business_id businessId,r.requirement_type requirementType,r.product_id productId,r.project_id projectId,
      rev.title title,rev.governance_status governanceStatus
    FROM requirements r
    LEFT JOIN requirement_revisions rev ON rev.id=(
      SELECT cv.id FROM requirement_revisions cv WHERE cv.requirement_id=r.id
      ORDER BY CASE cv.governance_status WHEN 'DRAFT' THEN 0 WHEN 'IN_REVIEW' THEN 1 WHEN 'APPROVED' THEN 2 ELSE 3 END, cv.revision_number DESC, cv.created_at DESC LIMIT 1
    )
    WHERE ${where}
    ORDER BY r.business_id
  `).bind(...values).all();

  const requirements = requirementsResult.results as Array<{
    id: string; businessId: string; requirementType: string; productId: string; projectId: string | null;
    title: string | null; governanceStatus: string | null;
  }>;

  const nowIso = new Date().toISOString();
  if (!requirements.length) {
    return { items: [], coverage: requirementCoverageEvidence(0, 0, "AGGREGATE", nowIso), gaps: [], calculatedAt: nowIso };
  }

  const ids = requirements.map((requirement) => requirement.id);
  const placeholders = ids.map(() => "?").join(",");
  const [linksResult, evidenceResult] = await Promise.all([
    env.DB.prepare(`
      SELECT l.requirement_id requirementId,l.link_type linkType,b.origin,b.status,b.delivery_state deliveryState,b.source_missing_at sourceMissingAt
      FROM requirement_backlog_links l JOIN backlog_items b ON b.id=l.backlog_item_id
      WHERE l.requirement_id IN (${placeholders})
    `).bind(...ids).all(),
    env.DB.prepare(`
      SELECT requirement_id requirementId,evidence_type evidenceType,evidence_status evidenceStatus,observed_at observedAt
      FROM requirement_evidence_references WHERE requirement_id IN (${placeholders})
    `).bind(...ids).all(),
  ]);

  const linksByRequirement = new Map<string, typeof linksResult.results>();
  for (const link of linksResult.results as Array<{ requirementId: string } & Record<string, unknown>>) {
    const list = linksByRequirement.get(link.requirementId) ?? [];
    list.push(link);
    linksByRequirement.set(link.requirementId, list);
  }
  const evidenceByRequirement = new Map<string, typeof evidenceResult.results>();
  for (const record of evidenceResult.results as Array<{ requirementId: string } & Record<string, unknown>>) {
    const list = evidenceByRequirement.get(record.requirementId) ?? [];
    list.push(record);
    evidenceByRequirement.set(record.requirementId, list);
  }

  const items = requirements.map((requirement) => {
    const links = (linksByRequirement.get(requirement.id) ?? []) as Array<{
      linkType: string; origin: string; status: string; deliveryState: string; sourceMissingAt: string | null;
    }>;
    const deliveryStatus = deriveRequirementDeliveryStatus(links.map((link) => ({
      linkType: link.linkType as "IMPLEMENTS" | "PARTIALLY_IMPLEMENTS" | "VALIDATES",
      origin: link.origin as "LOCAL" | "AZURE_DEVOPS",
      status: link.status,
      deliveryState: link.deliveryState,
      sourceMissingAt: link.sourceMissingAt,
    })));
    const evidence = (evidenceByRequirement.get(requirement.id) ?? []) as Array<{
      evidenceType: string; evidenceStatus: string; observedAt: string | null;
    }>;
    const evidenceSummary = evidence.map((record) => ({
      evidenceType: record.evidenceType,
      evidenceStatus: record.evidenceStatus,
      freshness: deriveEvidenceFreshness(record.evidenceStatus as "NOT_AVAILABLE" | "PENDING" | "PASSED" | "FAILED" | "CONDITIONAL" | "STALE", record.observedAt, nowIso),
    }));
    return { ...requirement, deliveryStatus, evidenceCount: evidence.length, evidence: evidenceSummary };
  });

  const numerator = items.filter((item) => item.deliveryStatus === "IMPLEMENTED").length;
  const denominator = items.length;
  const gaps = items.filter((item) => item.deliveryStatus === "NOT_LINKED" || item.deliveryStatus === "SOURCE_UNAVAILABLE");

  return {
    items,
    coverage: requirementCoverageEvidence(numerator, denominator, "AGGREGATE", nowIso),
    gaps,
    calculatedAt: nowIso,
  };
}
