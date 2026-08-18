import { env } from "cloudflare:workers";
import { incompleteRequirementRevision, type RequirementRegistrationInput, type RequirementRevisionInput } from "../app/governance/requirement-contract";
import type { RequirementType } from "../app/governance/stage3-contract";

type RequirementRow = {
  id: string; businessId: string; requirementType: RequirementType; productId: string; productName: string;
  projectId: string | null; projectName: string | null; documentId: string | null; documentBusinessId: string | null;
  ownerUserId: string | null; ownerName: string | null; recordStatus: string; version: number; updatedAt: string;
  currentRevisionId: string | null; revisionNumber: number | null; title: string | null; priority: string | null;
  governanceStatus: string | null; currentRevisionVersion: number | null; submittedAt: string | null; approvedAt: string | null;
};

type RevisionRow = {
  id: string; requirementId: string; revisionNumber: number; documentVersionId: string | null;
  title: string; statement: string; rationale: string; priority: string; verificationMethod: string;
  governanceStatus: string; contentHash: string | null; submittedAt: string | null; approvedAt: string | null;
  version: number; createdAt: string; updatedAt: string;
};

const currentRevisionOrder = `CASE governance_status WHEN 'DRAFT' THEN 0 WHEN 'IN_REVIEW' THEN 1 WHEN 'APPROVED' THEN 2 ELSE 3 END, revision_number DESC, created_at DESC`;
const requirementColumns = `
  r.id,r.business_id businessId,r.requirement_type requirementType,r.product_id productId,p.name productName,
  r.project_id projectId,pr.name projectName,r.document_id documentId,gd.business_id documentBusinessId,
  r.owner_user_id ownerUserId,u.display_name ownerName,r.record_status recordStatus,r.version,r.updated_at updatedAt,
  rev.id currentRevisionId,rev.revision_number revisionNumber,rev.title,rev.priority,rev.governance_status governanceStatus,
  rev.version currentRevisionVersion,rev.submitted_at submittedAt,rev.approved_at approvedAt
`;

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

async function nextBusinessId() {
  const result = await env.DB.prepare(`
    INSERT INTO business_sequences(entity_type,next_value,updated_at) VALUES('REQUIREMENT',2,CURRENT_TIMESTAMP)
    ON CONFLICT(entity_type) DO UPDATE SET next_value=next_value+1,updated_at=CURRENT_TIMESTAMP
    RETURNING next_value-1 value
  `).bind().first<{ value: number }>();
  return `REQ-${String(result?.value ?? 1).padStart(4, "0")}`;
}

async function validateScope(input: RequirementRegistrationInput) {
  const product = await env.DB.prepare("SELECT id FROM products WHERE id=? AND record_status='ACTIVE'").bind(input.productId).first<{ id: string }>();
  if (!product) return "invalid_product" as const;
  if (input.projectId) {
    const project = await env.DB.prepare("SELECT id FROM projects WHERE id=? AND product_id=? AND record_status='ACTIVE'").bind(input.projectId, input.productId).first<{ id: string }>();
    if (!project) return "invalid_project" as const;
  }
  if (input.documentId) {
    const document = await env.DB.prepare("SELECT id FROM governance_documents WHERE id=? AND product_id=? AND record_status='ACTIVE'").bind(input.documentId, input.productId).first<{ id: string }>();
    if (!document) return "invalid_document" as const;
  }
  return "ok" as const;
}

export async function listRequirements(input: { requirementType: RequirementType | ""; q: string; productId: string; projectId: string; documentId: string; status: string; page: number; pageSize: number }) {
  const conditions = ["r.record_status='ACTIVE'"];
  const values: unknown[] = [];
  if (input.requirementType) { conditions.push("r.requirement_type=?"); values.push(input.requirementType); }
  if (input.q) { const q = `%${escapeLike(input.q)}%`; conditions.push("(rev.title LIKE ? ESCAPE '\\' OR r.business_id LIKE ? ESCAPE '\\')"); values.push(q, q); }
  if (input.productId) { conditions.push("r.product_id=?"); values.push(input.productId); }
  if (input.projectId) { conditions.push("r.project_id=?"); values.push(input.projectId); }
  if (input.documentId) { conditions.push("r.document_id=?"); values.push(input.documentId); }
  if (input.status) { conditions.push("rev.governance_status=?"); values.push(input.status); }
  const where = conditions.join(" AND ");
  const join = `
    FROM requirements r
    JOIN products p ON p.id=r.product_id
    LEFT JOIN projects pr ON pr.id=r.project_id
    LEFT JOIN governance_documents gd ON gd.id=r.document_id
    LEFT JOIN users u ON u.id=r.owner_user_id
    LEFT JOIN requirement_revisions rev ON rev.id=(SELECT cv.id FROM requirement_revisions cv WHERE cv.requirement_id=r.id ORDER BY ${currentRevisionOrder.replaceAll("governance_status", "cv.governance_status").replaceAll("revision_number", "cv.revision_number").replaceAll("created_at", "cv.created_at")} LIMIT 1)
  `;
  const [rows, count] = await Promise.all([
    env.DB.prepare(`SELECT ${requirementColumns} ${join} WHERE ${where} ORDER BY r.updated_at DESC,r.business_id DESC LIMIT ? OFFSET ?`).bind(...values, input.pageSize, (input.page - 1) * input.pageSize).all<RequirementRow>(),
    env.DB.prepare(`SELECT COUNT(*) total ${join} WHERE ${where}`).bind(...values).first<{ total: number }>(),
  ]);
  return { items: rows.results, total: Number(count?.total ?? 0) };
}

export async function getRequirementWorkspace(id: string) {
  const requirement = await env.DB.prepare(`
    SELECT ${requirementColumns}
    FROM requirements r
    JOIN products p ON p.id=r.product_id
    LEFT JOIN projects pr ON pr.id=r.project_id
    LEFT JOIN governance_documents gd ON gd.id=r.document_id
    LEFT JOIN users u ON u.id=r.owner_user_id
    LEFT JOIN requirement_revisions rev ON rev.id=(SELECT cv.id FROM requirement_revisions cv WHERE cv.requirement_id=r.id ORDER BY ${currentRevisionOrder.replaceAll("governance_status", "cv.governance_status").replaceAll("revision_number", "cv.revision_number").replaceAll("created_at", "cv.created_at")} LIMIT 1)
    WHERE r.id=? AND r.record_status='ACTIVE'
  `).bind(id).first<RequirementRow>();
  if (!requirement) return { kind: "not_found" as const };
  const revisions = await env.DB.prepare(`SELECT id,requirement_id requirementId,revision_number revisionNumber,document_version_id documentVersionId,title,statement,rationale,priority,verification_method verificationMethod,governance_status governanceStatus,content_hash contentHash,submitted_at submittedAt,approved_at approvedAt,version,created_at createdAt,updated_at updatedAt FROM requirement_revisions WHERE requirement_id=? ORDER BY revision_number DESC`).bind(id).all<RevisionRow>();
  return { kind: "ok" as const, requirement, revisions: revisions.results };
}

export async function createRequirement(input: RequirementRegistrationInput, revision: RequirementRevisionInput, actor: string, correlationId: string) {
  const scope = await validateScope(input);
  if (scope !== "ok") return { kind: scope };
  const id = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const businessId = await nextBusinessId();
  const statements = [
    env.DB.prepare(`INSERT INTO requirements(id,business_id,requirement_type,product_id,project_id,document_id,owner_user_id,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(id, businessId, input.requirementType, input.productId, input.projectId, input.documentId, actor, actor, actor),
    env.DB.prepare(`INSERT INTO requirement_revisions(id,requirement_id,revision_number,document_version_id,title,statement,rationale,priority,verification_method,governance_status,created_by,updated_by) VALUES(?,?,1,NULL,?,?,?,?,?,'DRAFT',?,?)`).bind(revisionId, id, revision.title, revision.statement, revision.rationale, revision.priority, revision.verificationMethod, actor, actor),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(), "Requirement", id, "CREATE", JSON.stringify({ businessId, requirementType: input.requirementType, productId: input.productId, projectId: input.projectId, documentId: input.documentId, title: revision.title }), actor, correlationId),
  ];
  await env.DB.batch(statements);
  return getRequirementWorkspace(id);
}

export async function updateRequirementDraft(id: string, revision: RequirementRevisionInput, expectedVersion: number, actor: string, correlationId: string) {
  const workspace = await getRequirementWorkspace(id);
  if (workspace.kind === "not_found") return workspace;
  const current = workspace.revisions.find((item) => item.revisionNumber === Math.max(...workspace.revisions.map((r) => r.revisionNumber)));
  if (!current || current.governanceStatus !== "DRAFT") return { kind: "locked" as const };
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,after_json,actor_user_id,source,correlation_id,occurred_at) SELECT ?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM requirement_revisions WHERE id=? AND version=? AND governance_status='DRAFT')`).bind(crypto.randomUUID(), "RequirementRevision", current.id, "UPDATE", JSON.stringify({ title: current.title, statement: current.statement, rationale: current.rationale, priority: current.priority, verificationMethod: current.verificationMethod }), JSON.stringify(revision), actor, correlationId, current.id, expectedVersion),
    env.DB.prepare(`UPDATE requirement_revisions SET title=?,statement=?,rationale=?,priority=?,verification_method=?,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND governance_status='DRAFT'`).bind(revision.title, revision.statement, revision.rationale, revision.priority, revision.verificationMethod, actor, current.id, expectedVersion),
  ]);
  if (!results[1]?.meta.changes) return { kind: "conflict" as const };
  return { kind: "ok" as const, workspace: await getRequirementWorkspace(id) };
}

async function hashRevision(revision: { title: string; statement: string; rationale: string; priority: string; verificationMethod: string }) {
  const canonical = JSON.stringify({ title: revision.title, statement: revision.statement, rationale: revision.rationale, priority: revision.priority, verificationMethod: revision.verificationMethod });
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function submitRequirementRevision(id: string, expectedVersion: number, actor: string, correlationId: string) {
  const workspace = await getRequirementWorkspace(id);
  if (workspace.kind === "not_found") return workspace;
  const current = workspace.revisions.find((item) => item.revisionNumber === Math.max(...workspace.revisions.map((r) => r.revisionNumber)));
  if (!current || current.governanceStatus !== "DRAFT") return { kind: "locked" as const };
  const missing = incompleteRequirementRevision(current);
  if (missing.length) return { kind: "incomplete" as const, fields: missing };
  const contentHash = await hashRevision(current);
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) SELECT ?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM requirement_revisions WHERE id=? AND version=? AND governance_status='DRAFT')`).bind(crypto.randomUUID(), "RequirementRevision", current.id, "SUBMIT_REVIEW", JSON.stringify({ requirementId: id, revisionNumber: current.revisionNumber, contentHash }), actor, correlationId, current.id, expectedVersion),
    env.DB.prepare(`UPDATE requirement_revisions SET governance_status='IN_REVIEW',content_hash=?,submitted_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND governance_status='DRAFT'`).bind(contentHash, actor, current.id, expectedVersion),
  ]);
  if (!results[1]?.meta.changes) return { kind: "conflict" as const };
  return { kind: "ok" as const, workspace: await getRequirementWorkspace(id) };
}

export async function archiveRequirement(id: string, expectedVersion: number, reason: string, actor: string, correlationId: string) {
  const workspace = await getRequirementWorkspace(id);
  if (workspace.kind === "not_found") return workspace;
  const current = workspace.revisions.find((item) => item.revisionNumber === Math.max(...workspace.revisions.map((r) => r.revisionNumber)));
  if (!current || current.governanceStatus !== "DRAFT" || current.revisionNumber !== 1) return { kind: "not_eligible" as const };
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) SELECT ?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM requirements WHERE id=? AND version=? AND record_status='ACTIVE')`).bind(crypto.randomUUID(), "Requirement", id, "ARCHIVE", JSON.stringify({ reason }), actor, correlationId, id, expectedVersion),
    env.DB.prepare(`UPDATE requirements SET record_status='ARCHIVED',archived_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND record_status='ACTIVE'`).bind(actor, id, expectedVersion),
  ]);
  if (!results[1]?.meta.changes) return { kind: "conflict" as const };
  return { kind: "ok" as const };
}
