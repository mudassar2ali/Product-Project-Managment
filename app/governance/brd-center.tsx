"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { documentSectionTemplates, governanceLifecycleFilters } from "./brd-contract";
import type { GovernanceDocumentType } from "./stage3-contract";

type DocumentSummary = {
  id: string; businessId: string; documentType: GovernanceDocumentType; productId: string; productName: string; projectId: string | null; projectName: string | null;
  title: string; ownerName: string | null; purpose: string; version: number; currentVersionId: string;
  versionLabel: string; lifecycleStatus: string; currentVersion: number; updatedAt: string;
};
type Version = { id: string; versionLabel: string; lifecycleStatus: string; changeSummary: string; contentHash: string | null; submittedAt: string | null; approvedAt: string | null; createdAt: string };
type Section = { id: string; documentVersionId: string; sectionKey: string; heading: string; sequence: number; contentText: string; required: boolean; completionStatus: "EMPTY" | "IN_PROGRESS" | "COMPLETE"; version: number };
type Workspace = { kind: "ok"; document: DocumentSummary; versions: Version[]; sections: Section[] };
type Option = { id: string; name: string; productId?: string };

const emptyMetadata = { productId: "", projectId: "", title: "", purpose: "" };
const documentCopy = {
  BRD: { plural: "BRDs", full: "Business Requirements Documents", singular: "Business Requirements Document" },
  PRD: { plural: "PRDs", full: "Product Requirements Documents", singular: "Product Requirements Document" },
} as const;

export function DocumentCenter({ canCreate, canEdit, canVersion, canSubmit }: { canCreate: boolean; canEdit: boolean; canVersion: boolean; canSubmit: boolean }) {
  const [activeType, setActiveType] = useState<GovernanceDocumentType>("BRD");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeSection, setActiveSection] = useState(documentSectionTemplates.BRD[0].key as string);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [metadata, setMetadata] = useState({ ...emptyMetadata });
  const [products, setProducts] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [revisionSummary, setRevisionSummary] = useState("");
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const copy = documentCopy[activeType];

  const loadDocuments = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ pageSize: "50", documentType: activeType });
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    try {
      const response = await fetch(`/api/v3/documents?${params}`, { headers: { accept: "application/json" }, signal });
      const body = await response.json() as { data?: DocumentSummary[]; meta?: { total: number }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? `${copy.plural} could not be loaded.`);
      setDocuments(body.data ?? []); setTotal(body.meta?.total ?? 0);
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : `${copy.plural} could not be loaded.`); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [activeType, copy.plural, q, status]);

  useEffect(() => {
    const controller = new AbortController();
    const handle = window.setTimeout(() => void loadDocuments(controller.signal), 180);
    return () => { window.clearTimeout(handle); controller.abort(); };
  }, [loadDocuments]);
  useEffect(() => {
    if (!metadataOpen) return;
    window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) setMetadataOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [metadataOpen, saving]);

  const loadWorkspace = useCallback(async (id: string) => {
    setWorkspaceLoading(true); setError("");
    try {
      const response = await fetch(`/api/v3/documents/${id}`, { headers: { accept: "application/json" } });
      const body = await response.json() as { data?: Workspace; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "The document could not be opened.");
      setActiveType(body.data.document.documentType); setWorkspace(body.data); setActiveSection(body.data.sections[0]?.sectionKey ?? documentSectionTemplates[body.data.document.documentType][0].key);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The document could not be opened."); }
    finally { setWorkspaceLoading(false); }
  }, []);

  const loadOptions = async () => {
    try {
      const [productResponse, projectResponse] = await Promise.all([fetch("/api/v1/products?pageSize=100&sort=name"), fetch("/api/v1/projects?pageSize=100&sort=name")]);
      const productBody = await productResponse.json() as { data?: Option[] };
      const projectBody = await projectResponse.json() as { data?: Option[] };
      setProducts(productBody.data ?? []); setProjects(projectBody.data ?? []);
    } catch { setProducts([]); setProjects([]); }
  };

  const selectType = (documentType: GovernanceDocumentType) => {
    setActiveType(documentType); setWorkspace(null); setActiveSection(documentSectionTemplates[documentType][0].key); setQ(""); setStatus(""); setLoading(true); setError(""); setSuccess("");
  };
  const openCreate = () => { setEditingMetadata(false); setMetadata({ ...emptyMetadata }); setFieldErrors({}); setMetadataOpen(true); void loadOptions(); };
  const openEditMetadata = () => {
    if (!workspace) return;
    setEditingMetadata(true);
    setMetadata({ productId: workspace.document.productId, projectId: workspace.document.projectId ?? "", title: workspace.document.title, purpose: workspace.document.purpose });
    setFieldErrors({}); setMetadataOpen(true); void loadOptions();
  };

  const saveMetadata = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setFieldErrors({});
    try {
      const response = await fetch(editingMetadata && workspace ? `/api/v3/documents/${workspace.document.id}` : "/api/v3/documents", {
        method: editingMetadata ? "PATCH" : "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...metadata, projectId: metadata.projectId || null, ...(editingMetadata && workspace ? { version: workspace.document.version } : { documentType: activeType }) }),
      });
      const body = await response.json() as { data?: Workspace; error?: { message?: string; validationDetails?: Record<string, string> } };
      if (!response.ok || !body.data) { setFieldErrors(body.error?.validationDetails ?? {}); throw new Error(body.error?.message ?? `The ${activeType} could not be saved.`); }
      setWorkspace(body.data); setMetadataOpen(false); setSuccess(editingMetadata ? `${activeType} details updated.` : `${activeType} created with all required sections.`); await loadDocuments();
    } catch (cause) { setError(cause instanceof Error ? cause.message : `The ${activeType} could not be saved.`); }
    finally { setSaving(false); }
  };

  const updateSection = (key: string, changes: Partial<Section>) => setWorkspace((current) => current ? { ...current, sections: current.sections.map((section) => section.sectionKey === key ? { ...section, ...changes } : section) } : current);
  const saveSections = async () => {
    if (!workspace) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v3/document-versions/${workspace.document.currentVersionId}/sections`, {
        method: "PUT", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ version: workspace.document.currentVersion, sections: workspace.sections }),
      });
      const body = await response.json() as { data?: Workspace; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? `The ${workspace.document.documentType} could not be saved.`);
      setWorkspace(body.data); setSuccess(`${workspace.document.documentType} draft saved.`); await loadDocuments();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The document could not be saved."); }
    finally { setSaving(false); }
  };

  const submitForReview = async () => {
    if (!workspace || !window.confirm(`Submit this ${workspace.document.documentType} for review? Its section content will be locked and further changes will require a revision.`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v3/document-versions/${workspace.document.currentVersionId}/submit`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ version: workspace.document.currentVersion }),
      });
      const body = await response.json() as { data?: Workspace; error?: { message?: string; validationDetails?: Record<string, string> } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? `The ${workspace.document.documentType} could not be submitted.`);
      setWorkspace(body.data); setSuccess(`${workspace.document.documentType} submitted as an immutable review version.`); await loadDocuments();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The document could not be submitted."); }
    finally { setSaving(false); }
  };

  const createRevision = async () => {
    if (!workspace) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v3/documents/${workspace.document.id}/versions`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ changeSummary: revisionSummary }) });
      const body = await response.json() as { data?: Workspace; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "The revision could not be created.");
      setWorkspace(body.data); setRevisionSummary(""); setSuccess(`${workspace.document.documentType} revision created.`); await loadDocuments();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The revision could not be created."); }
    finally { setSaving(false); }
  };

  const selectedSection = workspace?.sections.find((section) => section.sectionKey === activeSection) ?? workspace?.sections[0];
  const completed = workspace?.sections.filter((section) => section.completionStatus === "COMPLETE").length ?? 0;
  const isDraft = workspace?.document.lifecycleStatus === "DRAFT";
  const revisionEligible = workspace ? ["APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED"].includes(workspace.document.lifecycleStatus) : false;
  const filteredProjects = useMemo(() => projects.filter((project) => !metadata.productId || project.productId === metadata.productId), [projects, metadata.productId]);

  return <section className="brd-module" aria-labelledby="document-center-title">
    <div className="portfolio-toolbar"><div><span className="section-kicker">STAGE 3 · GOVERNED DOCUMENTS</span><h2 id="document-center-title">{copy.full} <small>{total}</small></h2></div>{canCreate && !workspace && !workspaceLoading && <button className="primary-action" onClick={openCreate}>+ New {activeType}</button>}</div>
    {!workspace && !workspaceLoading && <div className="document-type-tabs" role="tablist" aria-label="Document type"><button role="tab" aria-selected={activeType === "BRD"} className={activeType === "BRD" ? "active" : ""} onClick={() => selectType("BRD")}><strong>BRD</strong><span>Business requirements</span></button><button role="tab" aria-selected={activeType === "PRD"} className={activeType === "PRD" ? "active" : ""} onClick={() => selectType("PRD")}><strong>PRD</strong><span>Product requirements</span></button></div>}
    {success && <div className="success-banner" role="status">{success}</div>}
    {error && <div className="form-error brd-error" role="alert">{error}<button className="text-action" onClick={() => setError("")}>Dismiss</button></div>}

    {workspaceLoading ? <div className="module-state" role="status"><span className="loader" /> Opening {activeType}…</div> : !workspace ? <>
      <div className="filter-bar" aria-label={`${activeType} filters`}><label className="search-field"><span className="sr-only">Search {copy.plural}</span><input value={q} onChange={(event) => setQ(event.target.value)} placeholder={`Search ${activeType} title or ID`} /></label><label><span className="sr-only">Filter by lifecycle</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All lifecycle states</option>{governanceLifecycleFilters.map((value) => <option key={value}>{value}</option>)}</select></label>{(q || status) && <button className="text-action" onClick={() => { setQ(""); setStatus(""); }}>Clear</button>}</div>
      {loading ? <div className="module-state" role="status"><span className="loader" /> Loading {copy.plural}…</div>
        : documents.length === 0 ? <div className="module-state empty-state"><span>▤</span><strong>No {copy.plural} found</strong><p>{q || status ? "Change or clear the current filters." : `Create the first governed ${copy.singular}.`}</p>{canCreate && !q && !status && <button onClick={openCreate}>Create {activeType}</button>}</div>
        : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>{activeType}</th><th>Product / Project</th><th>Version</th><th>Lifecycle</th><th>Owner</th><th>Updated</th></tr></thead><tbody>{documents.map((document) => <tr key={document.id} className="clickable-row" onClick={() => void loadWorkspace(document.id)}><td><button className="table-link" onClick={(event) => { event.stopPropagation(); void loadWorkspace(document.id); }}>{document.title}</button><span>{document.businessId}</span></td><td><strong>{document.productName}</strong><span>{document.projectName ?? "Product-wide"}</span></td><td>{document.versionLabel ?? "—"}</td><td><span className="neutral-badge">{document.lifecycleStatus ?? "Unavailable"}</span></td><td>{document.ownerName ?? "Unassigned"}</td><td>{new Date(document.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
    </> : <div className="brd-workspace">
      <header className="brd-document-header"><div><button className="text-action" onClick={() => setWorkspace(null)}>← Back to {workspace.document.documentType} library</button><span className="section-kicker">{workspace.document.businessId} · {workspace.document.versionLabel}</span><h3>{workspace.document.title}</h3><p>{workspace.document.purpose || "No purpose statement has been recorded."}</p><div className="brd-meta"><span>{workspace.document.documentType}</span><span>{workspace.document.productName}</span><span>{workspace.document.projectName ?? "Product-wide"}</span><span>{workspace.document.ownerName ?? "Unassigned owner"}</span><span className="neutral-badge">{workspace.document.lifecycleStatus}</span></div></div><div className="brd-header-actions">{isDraft && canEdit && <button className="secondary-action" onClick={openEditMetadata}>Edit details</button>}{isDraft && canEdit && <button className="secondary-action" onClick={() => void saveSections()} disabled={saving}>{saving ? "Saving…" : "Save draft"}</button>}{isDraft && canSubmit && <button className="primary-action" onClick={() => void submitForReview()} disabled={saving || completed !== workspace.sections.length}>Submit for review</button>}</div></header>
      <div className="brd-progress" aria-label={`${completed} of ${workspace.sections.length} required sections complete`}><div><strong>{completed} / {workspace.sections.length}</strong><span>required sections complete</span></div><span><i style={{ width: `${workspace.sections.length ? completed / workspace.sections.length * 100 : 0}%` }} /></span></div>
      <div className="brd-authoring-grid"><nav className="brd-section-nav" aria-label={`${workspace.document.documentType} sections`}>{workspace.sections.map((section) => <button key={section.sectionKey} className={section.sectionKey === activeSection ? "active" : ""} onClick={() => setActiveSection(section.sectionKey)} aria-current={section.sectionKey === activeSection ? "page" : undefined}><span>{String(section.sequence).padStart(2, "0")}</span><strong>{section.heading}</strong><i className={`section-state state-${section.completionStatus.toLowerCase()}`} aria-label={section.completionStatus}>{section.completionStatus === "COMPLETE" ? "✓" : section.completionStatus === "IN_PROGRESS" ? "•" : "○"}</i></button>)}</nav>
        <main className="brd-section-editor">{selectedSection && <><div className="brd-section-heading"><div><span className="section-kicker">SECTION {selectedSection.sequence} OF {workspace.sections.length}</span><h3>{selectedSection.heading}</h3></div><span className={`neutral-badge section-${selectedSection.completionStatus.toLowerCase()}`}>{selectedSection.completionStatus.replace("_", " ")}</span></div>{isDraft && canEdit ? <><label className="field"><span>Section content <b aria-hidden="true">*</b></span><textarea rows={18} value={selectedSection.contentText} maxLength={20000} onChange={(event) => { const contentText = event.target.value; updateSection(selectedSection.sectionKey, { contentText, completionStatus: contentText.trim() ? selectedSection.completionStatus === "COMPLETE" ? "COMPLETE" : "IN_PROGRESS" : "EMPTY" }); }} /></label><div className="brd-section-controls"><label><input type="checkbox" checked={selectedSection.completionStatus === "COMPLETE"} disabled={!selectedSection.contentText.trim()} onChange={(event) => updateSection(selectedSection.sectionKey, { completionStatus: event.target.checked ? "COMPLETE" : selectedSection.contentText.trim() ? "IN_PROGRESS" : "EMPTY" })} /> Mark this required section complete</label><span>{selectedSection.contentText.length.toLocaleString()} / 20,000</span></div></> : <div className="brd-locked-content"><span>Immutable review evidence</span><p>{selectedSection.contentText || "No content was recorded for this section."}</p></div>}</>}
          <aside className="brd-history" aria-labelledby="brd-history-title"><h4 id="brd-history-title">Version history</h4>{workspace.versions.map((version) => <div key={version.id}><strong>{version.versionLabel}</strong><span>{version.lifecycleStatus.replaceAll("_", " ")}</span><p>{version.changeSummary || "No change summary."}</p>{version.contentHash && <code title={version.contentHash}>Evidence hash {version.contentHash.slice(0, 12)}…</code>}</div>)}{revisionEligible && canVersion && <div className="revision-create"><label className="field"><span>Revision reason</span><textarea rows={2} value={revisionSummary} onChange={(event) => setRevisionSummary(event.target.value)} /></label><button className="secondary-action" disabled={saving || revisionSummary.trim().length < 5} onClick={() => void createRevision()}>Create revision</button></div>}</aside>
        </main>
      </div>
    </div>}

    {metadataOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setMetadataOpen(false); }}><div className="product-dialog brd-dialog" role="dialog" aria-modal="true" aria-labelledby="document-dialog-title"><form onSubmit={saveMetadata}><div className="dialog-header"><div><span className="section-kicker">{editingMetadata ? workspace?.document.businessId : `NEW GOVERNED ${activeType}`}</span><h2 id="document-dialog-title">{editingMetadata ? `Edit ${activeType} details` : `Create ${copy.singular}`}</h2></div><button type="button" aria-label="Close" onClick={() => setMetadataOpen(false)} disabled={saving}>×</button></div><div className="form-grid">
      <label className="field"><span>Product <b aria-hidden="true">*</b></span><select ref={firstFieldRef} required aria-invalid={Boolean(fieldErrors.productId)} value={metadata.productId} onChange={(event) => setMetadata((current) => ({ ...current, productId: event.target.value, projectId: "" }))}><option value="">Select Product</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select>{fieldErrors.productId && <small role="alert">{fieldErrors.productId}</small>}</label>
      <label className="field"><span>Project</span><select value={metadata.projectId} onChange={(event) => setMetadata((current) => ({ ...current, projectId: event.target.value }))}><option value="">Product-wide</option>{filteredProjects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select>{fieldErrors.projectId && <small role="alert">{fieldErrors.projectId}</small>}</label>
      <label className="field wide"><span>{activeType} title <b aria-hidden="true">*</b></span><input required minLength={3} aria-invalid={Boolean(fieldErrors.title)} value={metadata.title} maxLength={240} onChange={(event) => setMetadata((current) => ({ ...current, title: event.target.value }))} />{fieldErrors.title && <small role="alert">{fieldErrors.title}</small>}</label>
      <label className="field wide"><span>Purpose</span><textarea rows={4} value={metadata.purpose} maxLength={2000} onChange={(event) => setMetadata((current) => ({ ...current, purpose: event.target.value }))} />{fieldErrors.purpose && <small role="alert">{fieldErrors.purpose}</small>}</label>
    </div>{error && <div className="form-error" role="alert">{error}</div>}<div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setMetadataOpen(false)} disabled={saving}>Cancel</button><button className="primary-action" disabled={saving}>{saving ? "Saving…" : editingMetadata ? "Save details" : `Create ${activeType}`}</button></div></form></div></div>}
  </section>;
}

export const BrdCenter = DocumentCenter;
