import { env } from "cloudflare:workers";
import { documentSectionTemplates, type GovernanceDocumentInput, type GovernanceSectionInput } from "../app/governance/brd-contract";
import type { GovernanceDocumentType } from "../app/governance/stage3-contract";

type DocumentRow = {
  id: string; businessId: string; documentType: GovernanceDocumentType; productId: string; productName: string;
  projectId: string | null; projectName: string | null; title: string; ownerUserId: string | null;
  ownerName: string | null; purpose: string; recordStatus: string; version: number; updatedAt: string;
  currentVersionId: string | null; versionLabel: string | null; lifecycleStatus: string | null;
  versionMajor: number | null; versionMinor: number | null; currentVersion: number | null;
  submittedAt: string | null; approvedAt: string | null;
};

type VersionRow = {
  id: string; documentId: string; versionLabel: string; majorVersion: number; minorVersion: number;
  lifecycleStatus: string; supersedesVersionId: string | null; contentHash: string | null;
  changeSummary: string; submittedAt: string | null; approvedAt: string | null; lockedAt: string | null;
  version: number; createdAt: string; updatedAt: string;
};

type SectionRow = GovernanceSectionInput & { id: string; documentVersionId: string; version: number; updatedAt: string };

const currentVersionOrder = `CASE lifecycle_status WHEN 'DRAFT' THEN 0 WHEN 'IN_REVIEW' THEN 1 WHEN 'APPROVED_WITH_CONDITIONS' THEN 2 WHEN 'APPROVED' THEN 3 ELSE 4 END, major_version DESC, minor_version DESC, created_at DESC`;
const documentColumns = `
  d.id,d.business_id businessId,d.document_type documentType,d.product_id productId,p.name productName,
  d.project_id projectId,pr.name projectName,d.title,d.owner_user_id ownerUserId,u.display_name ownerName,
  d.purpose,d.record_status recordStatus,d.version,d.updated_at updatedAt,
  v.id currentVersionId,v.version_label versionLabel,v.lifecycle_status lifecycleStatus,
  v.major_version versionMajor,v.minor_version versionMinor,v.version currentVersion,
  v.submitted_at submittedAt,v.approved_at approvedAt
`;

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

async function nextBusinessId(documentType: GovernanceDocumentType) {
  const result = await env.DB.prepare(`
    INSERT INTO business_sequences(entity_type,next_value,updated_at) VALUES(?,2,CURRENT_TIMESTAMP)
    ON CONFLICT(entity_type) DO UPDATE SET next_value=next_value+1,updated_at=CURRENT_TIMESTAMP
    RETURNING next_value-1 value
  `).bind(documentType).first<{ value: number }>();
  return `${documentType}-${String(result?.value ?? 1).padStart(4, "0")}`;
}

async function validateScope(input: GovernanceDocumentInput) {
  const product = await env.DB.prepare("SELECT id FROM products WHERE id=? AND record_status='ACTIVE'").bind(input.productId).first<{ id: string }>();
  if (!product) return "invalid_product" as const;
  if (input.projectId) {
    const project = await env.DB.prepare("SELECT id FROM projects WHERE id=? AND product_id=? AND record_status='ACTIVE'").bind(input.projectId, input.productId).first<{ id: string }>();
    if (!project) return "invalid_project" as const;
  }
  return "ok" as const;
}

export async function listGovernanceDocuments(input: { documentType: GovernanceDocumentType | ""; q: string; productId: string; projectId: string; status: string; page: number; pageSize: number }) {
  const conditions = ["d.record_status='ACTIVE'"];
  const values: unknown[] = [];
  if (input.documentType) { conditions.push("d.document_type=?"); values.push(input.documentType); }
  if (input.q) { const q = `%${escapeLike(input.q)}%`; conditions.push("(d.title LIKE ? ESCAPE '\\' OR d.business_id LIKE ? ESCAPE '\\')"); values.push(q, q); }
  if (input.productId) { conditions.push("d.product_id=?"); values.push(input.productId); }
  if (input.projectId) { conditions.push("d.project_id=?"); values.push(input.projectId); }
  if (input.status) { conditions.push("v.lifecycle_status=?"); values.push(input.status); }
  const where = conditions.join(" AND ");
  const join = `
    FROM governance_documents d
    JOIN products p ON p.id=d.product_id
    LEFT JOIN projects pr ON pr.id=d.project_id
    LEFT JOIN users u ON u.id=d.owner_user_id
    LEFT JOIN governance_document_versions v ON v.id=(SELECT cv.id FROM governance_document_versions cv WHERE cv.document_id=d.id ORDER BY ${currentVersionOrder.replaceAll("lifecycle_status", "cv.lifecycle_status").replaceAll("major_version", "cv.major_version").replaceAll("minor_version", "cv.minor_version").replaceAll("created_at", "cv.created_at")} LIMIT 1)
  `;
  const [rows, count] = await Promise.all([
    env.DB.prepare(`SELECT ${documentColumns} ${join} WHERE ${where} ORDER BY d.updated_at DESC,d.business_id DESC LIMIT ? OFFSET ?`).bind(...values, input.pageSize, (input.page - 1) * input.pageSize).all<DocumentRow>(),
    env.DB.prepare(`SELECT COUNT(*) total ${join} WHERE ${where}`).bind(...values).first<{ total: number }>(),
  ]);
  return { items: rows.results, total: Number(count?.total ?? 0) };
}

export async function getGovernanceWorkspace(id: string, expectedType?: GovernanceDocumentType) {
  const document = await env.DB.prepare(`
    SELECT ${documentColumns}
    FROM governance_documents d
    JOIN products p ON p.id=d.product_id
    LEFT JOIN projects pr ON pr.id=d.project_id
    LEFT JOIN users u ON u.id=d.owner_user_id
    LEFT JOIN governance_document_versions v ON v.id=(SELECT cv.id FROM governance_document_versions cv WHERE cv.document_id=d.id ORDER BY ${currentVersionOrder.replaceAll("lifecycle_status", "cv.lifecycle_status").replaceAll("major_version", "cv.major_version").replaceAll("minor_version", "cv.minor_version").replaceAll("created_at", "cv.created_at")} LIMIT 1)
    WHERE d.id=? AND d.record_status='ACTIVE'
  `).bind(id).first<DocumentRow>();
  if (!document || (expectedType && document.documentType !== expectedType)) return { kind: "not_found" as const };
  const versions = await env.DB.prepare(`SELECT id,document_id documentId,version_label versionLabel,major_version majorVersion,minor_version minorVersion,lifecycle_status lifecycleStatus,supersedes_version_id supersedesVersionId,content_hash contentHash,change_summary changeSummary,submitted_at submittedAt,approved_at approvedAt,locked_at lockedAt,version,created_at createdAt,updated_at updatedAt FROM governance_document_versions WHERE document_id=? ORDER BY major_version DESC,minor_version DESC,created_at DESC`).bind(id).all<VersionRow>();
  const sections = document.currentVersionId
    ? await env.DB.prepare(`SELECT id,document_version_id documentVersionId,section_key sectionKey,heading,sequence,content_text contentText,required,completion_status completionStatus,version,updated_at updatedAt FROM governance_document_sections WHERE document_version_id=? ORDER BY sequence`).bind(document.currentVersionId).all<SectionRow>()
    : { results: [] as SectionRow[] };
  return { kind: "ok" as const, document, versions: versions.results, sections: sections.results };
}

export async function getGovernanceVersionSections(versionId: string) {
  const version = await env.DB.prepare(`SELECT v.id,v.document_id documentId,v.version_label versionLabel,v.lifecycle_status lifecycleStatus,v.version,d.document_type documentType FROM governance_document_versions v JOIN governance_documents d ON d.id=v.document_id WHERE v.id=? AND d.record_status='ACTIVE'`).bind(versionId).first<{ id: string; documentId: string; versionLabel: string; lifecycleStatus: string; version: number; documentType: GovernanceDocumentType }>();
  if (!version) return { kind: "not_found" as const };
  const sections = await env.DB.prepare(`SELECT id,document_version_id documentVersionId,section_key sectionKey,heading,sequence,content_text contentText,required,completion_status completionStatus,version,updated_at updatedAt FROM governance_document_sections WHERE document_version_id=? ORDER BY sequence`).bind(versionId).all<SectionRow>();
  return { kind: "ok" as const, version, sections: sections.results };
}

export async function createGovernanceDocument(documentType: GovernanceDocumentType, input: GovernanceDocumentInput, actor: string, correlationId: string) {
  const scope = await validateScope(input);
  if (scope !== "ok") return { kind: scope };
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const businessId = await nextBusinessId(documentType);
  const templates = documentSectionTemplates[documentType];
  const statements = [
    env.DB.prepare(`INSERT INTO governance_documents(id,business_id,document_type,product_id,project_id,title,owner_user_id,purpose,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id, businessId, documentType, input.productId, input.projectId, input.title, actor, input.purpose, actor, actor),
    env.DB.prepare(`INSERT INTO governance_document_versions(id,document_id,version_label,major_version,minor_version,lifecycle_status,change_summary,created_by,updated_by) VALUES(?,?,'Draft 0.1',0,1,'DRAFT',?,?,?)`).bind(versionId, id, `Initial ${documentType} draft`, actor, actor),
    ...templates.map((section, index) => env.DB.prepare(`INSERT INTO governance_document_sections(id,document_version_id,section_key,heading,sequence,content_text,required,completion_status,created_by,updated_by) VALUES(?,?,?,?,?,'',1,'EMPTY',?,?)`).bind(crypto.randomUUID(), versionId, section.key, section.heading, index + 1, actor, actor)),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(), "GovernanceDocument", id, "CREATE", JSON.stringify({ businessId, documentType, productId: input.productId, projectId: input.projectId, title: input.title, versionLabel: "Draft 0.1" }), actor, correlationId),
  ];
  await env.DB.batch(statements);
  return getGovernanceWorkspace(id, documentType);
}

export async function updateGovernanceMetadata(id: string, input: GovernanceDocumentInput, expectedVersion: number, actor: string, correlationId: string) {
  const scope = await validateScope(input);
  if (scope !== "ok") return { kind: scope };
  const before = await getGovernanceWorkspace(id);
  if (before.kind === "not_found") return before;
  if (before.document.lifecycleStatus !== "DRAFT") return { kind: "locked" as const };
  const documentType = before.document.documentType;
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,after_json,actor_user_id,source,correlation_id,occurred_at) SELECT ?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM governance_documents WHERE id=? AND version=? AND document_type=? AND record_status='ACTIVE' AND EXISTS(SELECT 1 FROM governance_document_versions WHERE document_id=? AND lifecycle_status='DRAFT'))`).bind(crypto.randomUUID(), "GovernanceDocument", id, "UPDATE", JSON.stringify({ documentType, productId: before.document.productId, projectId: before.document.projectId, title: before.document.title, purpose: before.document.purpose }), JSON.stringify({ documentType, ...input }), actor, correlationId, id, expectedVersion, documentType, id),
    env.DB.prepare(`UPDATE governance_documents SET product_id=?,project_id=?,title=?,purpose=?,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND document_type=? AND record_status='ACTIVE' AND EXISTS(SELECT 1 FROM governance_document_versions WHERE document_id=? AND lifecycle_status='DRAFT')`).bind(input.productId, input.projectId, input.title, input.purpose, actor, id, expectedVersion, documentType, id),
  ]);
  if (!results[1]?.meta.changes) return { kind: "conflict" as const };
  return { kind: "ok" as const, workspace: await getGovernanceWorkspace(id, documentType) };
}

export async function replaceGovernanceSections(versionId: string, sections: GovernanceSectionInput[], expectedVersion: number, actor: string, correlationId: string) {
  const current = await env.DB.prepare(`SELECT v.id,v.document_id documentId,v.lifecycle_status lifecycleStatus,v.version,d.document_type documentType FROM governance_document_versions v JOIN governance_documents d ON d.id=v.document_id WHERE v.id=? AND d.record_status='ACTIVE'`).bind(versionId).first<{ id: string; documentId: string; lifecycleStatus: string; version: number; documentType: GovernanceDocumentType }>();
  if (!current) return { kind: "not_found" as const };
  if (current.lifecycleStatus !== "DRAFT") return { kind: "locked" as const };
  const templates = documentSectionTemplates[current.documentType];
  const expectedKeys = new Set(templates.map((template) => template.key));
  const keys = sections.map((section) => section.sectionKey);
  if (sections.length !== templates.length || new Set(keys).size !== templates.length || keys.some((key) => !expectedKeys.has(key))) return { kind: "invalid_sections" as const };
  const statements = [
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) SELECT ?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM governance_document_versions WHERE id=? AND version=? AND lifecycle_status='DRAFT')`).bind(crypto.randomUUID(), "GovernanceDocumentVersion", versionId, "SECTIONS_REPLACE", JSON.stringify({ documentType: current.documentType, sectionCount: sections.length, completedSections: sections.filter((section) => section.completionStatus === "COMPLETE").length, contentCharacters: sections.reduce((sum, section) => sum + section.contentText.length, 0) }), actor, correlationId, versionId, expectedVersion),
    env.DB.prepare(`DELETE FROM governance_document_sections WHERE document_version_id=? AND section_key NOT IN (${keys.map(() => "?").join(",")}) AND EXISTS(SELECT 1 FROM governance_document_versions WHERE id=? AND version=? AND lifecycle_status='DRAFT')`).bind(versionId, ...keys, versionId, expectedVersion),
    ...sections.map((section) => env.DB.prepare(`
      INSERT INTO governance_document_sections(id,document_version_id,section_key,heading,sequence,content_text,required,completion_status,created_by,updated_by)
      SELECT ?,?,?,?,?,?,1,?,?,? WHERE EXISTS(SELECT 1 FROM governance_document_versions WHERE id=? AND version=? AND lifecycle_status='DRAFT')
      ON CONFLICT(document_version_id,section_key) DO UPDATE SET
        heading=excluded.heading,sequence=excluded.sequence,content_text=excluded.content_text,required=1,
        completion_status=excluded.completion_status,version=governance_document_sections.version+1,
        updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by
    `).bind(crypto.randomUUID(), versionId, section.sectionKey, section.heading, section.sequence, section.contentText, section.completionStatus, actor, actor, versionId, expectedVersion)),
    env.DB.prepare("UPDATE governance_document_versions SET version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND lifecycle_status='DRAFT'").bind(actor, versionId, expectedVersion),
  ];
  const results = await env.DB.batch(statements);
  if (!results.at(-1)?.meta.changes) return { kind: "conflict" as const };
  return { kind: "ok" as const, workspace: await getGovernanceWorkspace(current.documentId, current.documentType) };
}

async function hashSections(sections: readonly SectionRow[]) {
  const canonical = JSON.stringify(sections.map((section) => ({ key: section.sectionKey, sequence: section.sequence, content: section.contentText })));
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function submitGovernanceVersion(versionId: string, expectedVersion: number, actor: string, correlationId: string) {
  const version = await env.DB.prepare(`SELECT v.id,v.document_id documentId,v.version_label versionLabel,v.major_version majorVersion,v.minor_version minorVersion,v.lifecycle_status lifecycleStatus,v.version,d.document_type documentType FROM governance_document_versions v JOIN governance_documents d ON d.id=v.document_id WHERE v.id=? AND d.record_status='ACTIVE'`).bind(versionId).first<{ id: string; documentId: string; versionLabel: string; majorVersion: number; minorVersion: number; lifecycleStatus: string; version: number; documentType: GovernanceDocumentType }>();
  if (!version) return { kind: "not_found" as const };
  if (version.lifecycleStatus !== "DRAFT") return { kind: "locked" as const };
  const templates = documentSectionTemplates[version.documentType];
  const rows = await env.DB.prepare(`SELECT id,document_version_id documentVersionId,section_key sectionKey,heading,sequence,content_text contentText,required,completion_status completionStatus,version,updated_at updatedAt FROM governance_document_sections WHERE document_version_id=? ORDER BY sequence`).bind(versionId).all<SectionRow>();
  const incomplete = rows.results.filter((section) => section.required && (section.completionStatus !== "COMPLETE" || !section.contentText.trim()));
  const persistedKeys = new Set(rows.results.map((section) => section.sectionKey));
  const templateMismatch = rows.results.length !== templates.length || persistedKeys.size !== templates.length || templates.some((template) => !persistedKeys.has(template.key));
  if (templateMismatch || incomplete.length) return { kind: "incomplete" as const, sections: incomplete.map((section) => section.sectionKey) };
  const contentHash = await hashSections(rows.results);
  const isInitial = version.majorVersion === 0 && version.minorVersion < 9;
  const versionLabel = isInitial ? "Review 0.9" : version.versionLabel;
  const majorVersion = isInitial ? 0 : version.majorVersion;
  const minorVersion = isInitial ? 9 : version.minorVersion;
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) SELECT ?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM governance_document_versions WHERE id=? AND version=? AND lifecycle_status='DRAFT')`).bind(crypto.randomUUID(), "GovernanceDocumentVersion", versionId, "SUBMIT_REVIEW", JSON.stringify({ documentType: version.documentType, versionLabel, contentHash, sectionCount: rows.results.length }), actor, correlationId, versionId, expectedVersion),
    env.DB.prepare(`UPDATE governance_document_versions SET version_label=?,major_version=?,minor_version=?,lifecycle_status='IN_REVIEW',content_hash=?,submitted_at=CURRENT_TIMESTAMP,locked_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND lifecycle_status='DRAFT'`).bind(versionLabel, majorVersion, minorVersion, contentHash, actor, versionId, expectedVersion),
  ]);
  if (!results[1]?.meta.changes) return { kind: "conflict" as const };
  return { kind: "ok" as const, workspace: await getGovernanceWorkspace(version.documentId, version.documentType) };
}

export async function createGovernanceRevision(documentId: string, changeSummary: string, actor: string, correlationId: string) {
  const workspace = await getGovernanceWorkspace(documentId);
  if (workspace.kind === "not_found") return workspace;
  if (workspace.versions.some((version) => version.lifecycleStatus === "DRAFT")) return { kind: "draft_exists" as const };
  const base = workspace.versions.find((version) => ["APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED"].includes(version.lifecycleStatus));
  if (!base) return { kind: "not_eligible" as const };
  const versionId = crypto.randomUUID();
  const majorVersion = Math.max(1, base.majorVersion);
  const minorVersion = base.minorVersion + 1;
  const label = `Revision ${majorVersion}.${minorVersion}`;
  const baseSections = await env.DB.prepare(`SELECT section_key sectionKey,heading,sequence,content_text contentText,required,completion_status completionStatus FROM governance_document_sections WHERE document_version_id=? ORDER BY sequence`).bind(base.id).all<GovernanceSectionInput>();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO governance_document_versions(id,document_id,version_label,major_version,minor_version,lifecycle_status,supersedes_version_id,change_summary,created_by,updated_by) VALUES(?,?,?,?,?,'DRAFT',?,?,?,?)`).bind(versionId, documentId, label, majorVersion, minorVersion, base.id, changeSummary, actor, actor),
    ...baseSections.results.map((section) => env.DB.prepare(`INSERT INTO governance_document_sections(id,document_version_id,section_key,heading,sequence,content_text,required,completion_status,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), versionId, section.sectionKey, section.heading, section.sequence, section.contentText, section.required ? 1 : 0, section.completionStatus, actor, actor)),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(), "GovernanceDocumentVersion", versionId, "CREATE_REVISION", JSON.stringify({ documentId, documentType: workspace.document.documentType, versionLabel: label, supersedesVersionId: base.id, changeSummary }), actor, correlationId),
  ]);
  return { kind: "ok" as const, workspace: await getGovernanceWorkspace(documentId, workspace.document.documentType) };
}

type DocumentListInput = { q: string; productId: string; projectId: string; status: string; page: number; pageSize: number };

export const listBrdDocuments = (input: DocumentListInput) => listGovernanceDocuments({ ...input, documentType: "BRD" });
export const listPrdDocuments = (input: DocumentListInput) => listGovernanceDocuments({ ...input, documentType: "PRD" });
export const getBrdWorkspace = (id: string) => getGovernanceWorkspace(id, "BRD");
export const getPrdWorkspace = (id: string) => getGovernanceWorkspace(id, "PRD");
export async function getBrdVersionSections(id: string) {
  const result = await getGovernanceVersionSections(id);
  return result.kind === "ok" && result.version.documentType !== "BRD" ? { kind: "not_found" as const } : result;
}
export async function getPrdVersionSections(id: string) {
  const result = await getGovernanceVersionSections(id);
  return result.kind === "ok" && result.version.documentType !== "PRD" ? { kind: "not_found" as const } : result;
}
export const createBrd = (input: GovernanceDocumentInput, actor: string, correlationId: string) => createGovernanceDocument("BRD", input, actor, correlationId);
export const createPrd = (input: GovernanceDocumentInput, actor: string, correlationId: string) => createGovernanceDocument("PRD", input, actor, correlationId);
export const updateBrdMetadata = updateGovernanceMetadata;
export const replaceBrdSections = replaceGovernanceSections;
export const submitBrdVersion = submitGovernanceVersion;
export const createBrdRevision = createGovernanceRevision;
