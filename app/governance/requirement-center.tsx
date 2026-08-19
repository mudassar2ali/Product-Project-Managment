"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { requirementGovernanceStatuses, requirementPriorities } from "./requirement-contract";
import { requirementBacklogLinkTypes, requirementRelationshipTypes, requirementTypes, verificationEvidenceStatuses, verificationEvidenceTypes } from "./stage3-contract";
import { SignoffPanel } from "./signoff-panel";

type RequirementSummary = {
  id: string; businessId: string; requirementType: string; productId: string; productName: string;
  projectId: string | null; projectName: string | null; documentId: string | null; documentBusinessId: string | null;
  ownerUserId: string | null; ownerName: string | null; recordStatus: string; version: number; updatedAt: string;
  currentRevisionId: string | null; revisionNumber: number | null; title: string | null; priority: string | null;
  governanceStatus: string | null; currentRevisionVersion: number | null; submittedAt: string | null; approvedAt: string | null;
};
type Revision = {
  id: string; requirementId: string; revisionNumber: number; documentVersionId: string | null;
  title: string; statement: string; rationale: string; priority: string; verificationMethod: string;
  governanceStatus: string; contentHash: string | null; submittedAt: string | null; approvedAt: string | null;
  version: number; createdAt: string; updatedAt: string;
};
type Workspace = { kind: "ok"; requirement: RequirementSummary; revisions: Revision[] };
type Option = { id: string; name: string; productId?: string };
type Relationship = { id: string; relationshipType: string; rationale: string; version: number; targetRequirementId?: string; targetBusinessId?: string; targetTitle?: string; sourceRequirementId?: string; sourceBusinessId?: string; sourceTitle?: string };
type BacklogLink = { id: string; linkType: string; coveragePercentage: number | null; rationale: string; backlogItemId: string; backlogBusinessId: string; backlogTitle: string; origin: string; status: string; deliveryState: string; sourceMissingAt: string | null };
type Evidence = { id: string; evidenceType: string; sourceSystem: string; externalReference: string; sourceUrl: string | null; evidenceStatus: string; result: string; observedAt: string | null; version: number; updatedAt: string; freshness: string };
type Traceability = { kind: "ok"; outgoing: Relationship[]; incoming: Relationship[]; backlogLinks: BacklogLink[]; evidence: Evidence[]; deliveryStatus: string };
type BacklogOption = { id: string; businessId: string; title: string };

const draftDefaults = { title: "", statement: "", rationale: "", priority: "MEDIUM" as const, verificationMethod: "" };
const registrationDefaults = { requirementType: "BUSINESS", productId: "", projectId: "", documentId: "" };

export function RequirementCenter({ canCreate, canEdit, canSubmit, canArchive, canLink, canManageTraceability, canRecordEvidence, currentUserId, canDecideSignoff, canManageSignoff, canWaiveCondition, canRequestSignoff }: {
  canCreate: boolean; canEdit: boolean; canSubmit: boolean; canArchive: boolean; canLink: boolean; canManageTraceability: boolean; canRecordEvidence: boolean;
  currentUserId: string; canDecideSignoff: boolean; canManageSignoff: boolean; canWaiveCondition: boolean; canRequestSignoff: boolean;
}) {
  const [items, setItems] = useState<RequirementSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [requirementType, setRequirementType] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [traceability, setTraceability] = useState<Traceability | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [draft, setDraft] = useState({ ...draftDefaults });
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [registration, setRegistration] = useState({ ...registrationDefaults });
  const [products, setProducts] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [relationshipDraft, setRelationshipDraft] = useState({ targetRequirementId: "", relationshipType: "DERIVES_FROM", rationale: "" });
  const [linkDraft, setLinkDraft] = useState({ backlogItemId: "", linkType: "IMPLEMENTS", coveragePercentage: "", rationale: "" });
  const [evidenceDraft, setEvidenceDraft] = useState({ evidenceType: "QA", sourceSystem: "", externalReference: "", sourceUrl: "", evidenceStatus: "PENDING", result: "", observedAt: "" });
  const [linkSearch, setLinkSearch] = useState("");
  const [linkOptions, setLinkOptions] = useState<BacklogOption[]>([]);

  const loadList = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ pageSize: "50" });
    if (q.trim()) params.set("q", q.trim());
    if (requirementType) params.set("requirementType", requirementType);
    if (status) params.set("status", status);
    try {
      const response = await fetch(`/api/v3/requirements?${params}`, { headers: { accept: "application/json" }, signal });
      const body = await response.json() as { data?: RequirementSummary[]; meta?: { total: number }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Requirements could not be loaded.");
      setItems(body.data ?? []); setTotal(body.meta?.total ?? 0);
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Requirements could not be loaded."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [q, requirementType, status]);

  useEffect(() => {
    const controller = new AbortController();
    const handle = window.setTimeout(() => void loadList(controller.signal), 180);
    return () => { window.clearTimeout(handle); controller.abort(); };
  }, [loadList]);

  const loadWorkspace = useCallback(async (id: string) => {
    setWorkspaceLoading(true); setError("");
    try {
      const [workspaceResponse, traceabilityResponse] = await Promise.all([
        fetch(`/api/v3/requirements/${id}`, { headers: { accept: "application/json" } }),
        fetch(`/api/v3/requirements/${id}/traceability`, { headers: { accept: "application/json" } }),
      ]);
      const workspaceBody = await workspaceResponse.json() as { data?: Workspace; error?: { message?: string } };
      if (!workspaceResponse.ok || !workspaceBody.data) throw new Error(workspaceBody.error?.message ?? "The requirement could not be opened.");
      const traceabilityBody = await traceabilityResponse.json() as { data?: Traceability };
      setWorkspace(workspaceBody.data);
      setTraceability(traceabilityResponse.ok ? traceabilityBody.data ?? null : null);
      const current = workspaceBody.data.revisions[0];
      setDraft(current ? { title: current.title, statement: current.statement, rationale: current.rationale, priority: current.priority as typeof draftDefaults.priority, verificationMethod: current.verificationMethod } : { ...draftDefaults });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The requirement could not be opened."); }
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

  useEffect(() => {
    const trimmed = linkSearch.trim();
    const handle = window.setTimeout(() => {
      if (!trimmed) { setLinkOptions([]); return; }
      fetch(`/api/v2/backlog?q=${encodeURIComponent(trimmed)}&pageSize=20`, { headers: { accept: "application/json" } })
        .then((response) => response.ok ? response.json() : { data: [] })
        .then((body: { data?: Array<{ id: string; businessId: string; title: string }> }) => setLinkOptions((body.data ?? []).map((item) => ({ id: item.id, businessId: item.businessId, title: item.title }))))
        .catch(() => setLinkOptions([]));
    }, 220);
    return () => window.clearTimeout(handle);
  }, [linkSearch]);

  const currentRevision = workspace?.revisions[0];
  const isDraft = currentRevision?.governanceStatus === "DRAFT";
  const filteredProjects = useMemo(() => projects.filter((project) => !registration.productId || project.productId === registration.productId), [projects, registration.productId]);

  const openCreate = () => { setRegistration({ ...registrationDefaults }); setDraft({ ...draftDefaults }); setFieldErrors({}); setCreateOpen(true); void loadOptions(); };

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setFieldErrors({});
    try {
      const response = await fetch("/api/v3/requirements", {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...registration, projectId: registration.projectId || null, documentId: registration.documentId || null, ...draft }),
      });
      const body = await response.json() as { data?: Workspace; error?: { message?: string; validationDetails?: Record<string, string> } };
      if (!response.ok || !body.data) { setFieldErrors(body.error?.validationDetails ?? {}); throw new Error(body.error?.message ?? "The Requirement could not be created."); }
      setCreateOpen(false); setSuccess("Requirement created as a first draft."); await loadList(); await loadWorkspace(body.data.requirement.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The Requirement could not be created."); }
    finally { setSaving(false); }
  };

  const saveDraft = async () => {
    if (!workspace) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v3/requirements/${workspace.requirement.id}`, {
        method: "PATCH", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...draft, version: workspace.requirement.version }),
      });
      const body = await response.json() as { data?: Workspace; error?: { message?: string; validationDetails?: Record<string, string> } };
      if (!response.ok || !body.data) { setFieldErrors(body.error?.validationDetails ?? {}); throw new Error(body.error?.message ?? "The Requirement could not be saved."); }
      setWorkspace(body.data); setSuccess("Requirement draft saved."); await loadList();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The Requirement could not be saved."); }
    finally { setSaving(false); }
  };

  const submit = async () => {
    if (!workspace || !window.confirm("Submit this Requirement for review? Its current revision will be locked and further changes will require a new revision.")) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v3/requirements/${workspace.requirement.id}/submit`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ version: workspace.requirement.version }),
      });
      const body = await response.json() as { data?: Workspace; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "The Requirement could not be submitted.");
      setWorkspace(body.data); setSuccess("Requirement submitted as an immutable review revision."); await loadList();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The Requirement could not be submitted."); }
    finally { setSaving(false); }
  };

  const archive = async () => {
    if (!workspace) return;
    const reason = window.prompt("Provide a reason for archiving this Requirement (at least 5 characters):");
    if (!reason || reason.trim().length < 5) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v3/requirements/${workspace.requirement.id}`, {
        method: "DELETE", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ reason: reason.trim(), version: workspace.requirement.version }),
      });
      if (!response.ok) { const body = await response.json() as { error?: { message?: string } }; throw new Error(body.error?.message ?? "The Requirement could not be archived."); }
      setWorkspace(null); setTraceability(null); setSuccess("Requirement archived."); await loadList();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The Requirement could not be archived."); }
    finally { setSaving(false); }
  };

  const refreshTraceability = async () => {
    if (!workspace) return;
    const response = await fetch(`/api/v3/requirements/${workspace.requirement.id}/traceability`, { headers: { accept: "application/json" } });
    const body = await response.json() as { data?: Traceability };
    if (response.ok) setTraceability(body.data ?? null);
  };

  const addRelationship = async () => {
    if (!workspace || !relationshipDraft.targetRequirementId.trim()) return;
    setError("");
    try {
      const response = await fetch(`/api/v3/requirements/${workspace.requirement.id}/relationships`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(relationshipDraft),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The relationship could not be added.");
      setRelationshipDraft({ targetRequirementId: "", relationshipType: "DERIVES_FROM", rationale: "" });
      await refreshTraceability();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The relationship could not be added."); }
  };

  const removeRelationship = async (relationshipId: string) => {
    if (!workspace) return;
    await fetch(`/api/v3/requirements/${workspace.requirement.id}/relationships/${relationshipId}`, { method: "DELETE" });
    await refreshTraceability();
  };

  const addBacklogLink = async () => {
    if (!workspace || !linkDraft.backlogItemId.trim()) return;
    setError("");
    try {
      const response = await fetch(`/api/v3/requirements/${workspace.requirement.id}/backlog-links`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...linkDraft, coveragePercentage: linkDraft.coveragePercentage === "" ? null : Number(linkDraft.coveragePercentage) }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The backlog link could not be added.");
      setLinkDraft({ backlogItemId: "", linkType: "IMPLEMENTS", coveragePercentage: "", rationale: "" }); setLinkSearch(""); setLinkOptions([]);
      await refreshTraceability();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The backlog link could not be added."); }
  };

  const removeBacklogLink = async (linkId: string) => {
    if (!workspace) return;
    await fetch(`/api/v3/requirements/${workspace.requirement.id}/backlog-links/${linkId}`, { method: "DELETE" });
    await refreshTraceability();
  };

  const addEvidence = async () => {
    if (!workspace || !evidenceDraft.sourceSystem.trim() || !evidenceDraft.externalReference.trim()) return;
    setError("");
    try {
      const response = await fetch(`/api/v3/requirements/${workspace.requirement.id}/evidence`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...evidenceDraft, sourceUrl: evidenceDraft.sourceUrl || null, observedAt: evidenceDraft.observedAt || null }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The evidence record could not be added.");
      setEvidenceDraft({ evidenceType: "QA", sourceSystem: "", externalReference: "", sourceUrl: "", evidenceStatus: "PENDING", result: "", observedAt: "" });
      await refreshTraceability();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The evidence record could not be added."); }
  };

  return <section className="requirement-module" aria-labelledby="requirement-center-title">
    <div className="portfolio-toolbar"><div><span className="section-kicker">STAGE 3 · REQUIREMENTS REGISTRY</span><h2 id="requirement-center-title">Requirements <small>{total}</small></h2></div>{canCreate && !workspace && !workspaceLoading && <button className="primary-action" onClick={openCreate}>+ New Requirement</button>}</div>
    {success && <div className="success-banner" role="status">{success}</div>}
    {error && <div className="form-error brd-error" role="alert">{error}<button className="text-action" onClick={() => setError("")}>Dismiss</button></div>}

    {workspaceLoading ? <div className="module-state" role="status"><span className="loader" /> Opening Requirement…</div> : !workspace ? <>
      <div className="filter-bar" aria-label="Requirement filters">
        <label className="search-field"><span className="sr-only">Search Requirements</span><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search title or ID" /></label>
        <label><span className="sr-only">Filter by type</span><select value={requirementType} onChange={(event) => setRequirementType(event.target.value)}><option value="">All types</option>{requirementTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
        <label><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All governance states</option>{requirementGovernanceStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
        {(q || requirementType || status) && <button className="text-action" onClick={() => { setQ(""); setRequirementType(""); setStatus(""); }}>Clear</button>}
      </div>
      {loading ? <div className="module-state" role="status"><span className="loader" /> Loading Requirements…</div>
        : items.length === 0 ? <div className="module-state empty-state"><span>▤</span><strong>No Requirements found</strong><p>{q || requirementType || status ? "Change or clear the current filters." : "Register the first governed Requirement."}</p>{canCreate && !q && !requirementType && !status && <button onClick={openCreate}>Create Requirement</button>}</div>
        : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Requirement</th><th>Type</th><th>Product / Project</th><th>Priority</th><th>Governance</th><th>Owner</th><th>Updated</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="clickable-row" onClick={() => void loadWorkspace(item.id)}><td><button className="table-link" onClick={(event) => { event.stopPropagation(); void loadWorkspace(item.id); }}>{item.title ?? "Untitled"}</button><span>{item.businessId}</span></td><td><span className="neutral-badge">{item.requirementType.replaceAll("_", " ")}</span></td><td><strong>{item.productName}</strong><span>{item.projectName ?? "Product-wide"}</span></td><td>{item.priority ?? "—"}</td><td><span className="neutral-badge">{item.governanceStatus ?? "Unavailable"}</span></td><td>{item.ownerName ?? "Unassigned"}</td><td>{new Date(item.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
    </> : <div className="requirement-workspace">
      <header className="brd-document-header"><div><button className="text-action" onClick={() => { setWorkspace(null); setTraceability(null); }}>← Back to Requirements registry</button><span className="section-kicker">{workspace.requirement.businessId} · rev {currentRevision?.revisionNumber ?? 1}</span><h3>{currentRevision?.title || "Untitled Requirement"}</h3><div className="brd-meta"><span>{workspace.requirement.requirementType.replaceAll("_", " ")}</span><span>{workspace.requirement.productName}</span><span>{workspace.requirement.projectName ?? "Product-wide"}</span><span>{workspace.requirement.ownerName ?? "Unassigned owner"}</span><span className="neutral-badge">{currentRevision?.governanceStatus ?? "DRAFT"}</span>{traceability && <span className="neutral-badge">{traceability.deliveryStatus.replaceAll("_", " ")}</span>}</div></div><div className="brd-header-actions">{isDraft && canEdit && <button className="secondary-action" disabled={saving} onClick={() => void saveDraft()}>{saving ? "Saving…" : "Save draft"}</button>}{isDraft && canSubmit && <button className="primary-action" disabled={saving || !draft.title.trim() || !draft.statement.trim() || !draft.verificationMethod.trim()} onClick={() => void submit()}>Submit for review</button>}{isDraft && currentRevision?.revisionNumber === 1 && canArchive && <button className="secondary-action destructive-action" disabled={saving} onClick={() => void archive()}>Archive</button>}</div></header>

      <div className="brd-section-editor">{isDraft && canEdit ? <div className="form-grid">
        <label className="field wide"><span>Title <b aria-hidden="true">*</b></span><input required minLength={3} value={draft.title} maxLength={240} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />{fieldErrors.title && <small role="alert">{fieldErrors.title}</small>}</label>
        <label className="field"><span>Priority</span><select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as typeof draftDefaults.priority }))}>{requirementPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
        <label className="field wide"><span>Statement <b aria-hidden="true">*</b></span><textarea rows={6} value={draft.statement} maxLength={20000} onChange={(event) => setDraft((current) => ({ ...current, statement: event.target.value }))} />{fieldErrors.statement && <small role="alert">{fieldErrors.statement}</small>}</label>
        <label className="field wide"><span>Rationale</span><textarea rows={4} value={draft.rationale} maxLength={20000} onChange={(event) => setDraft((current) => ({ ...current, rationale: event.target.value }))} />{fieldErrors.rationale && <small role="alert">{fieldErrors.rationale}</small>}</label>
        <label className="field wide"><span>Verification method <b aria-hidden="true">*</b></span><textarea rows={3} value={draft.verificationMethod} maxLength={4000} onChange={(event) => setDraft((current) => ({ ...current, verificationMethod: event.target.value }))} />{fieldErrors.verificationMethod && <small role="alert">{fieldErrors.verificationMethod}</small>}</label>
      </div> : <div className="brd-locked-content"><span>Immutable review evidence</span><p><strong>Statement</strong><br />{currentRevision?.statement || "No statement recorded."}</p><p><strong>Rationale</strong><br />{currentRevision?.rationale || "No rationale recorded."}</p><p><strong>Verification method</strong><br />{currentRevision?.verificationMethod || "No verification method recorded."}</p></div>}</div>

      {!isDraft && currentRevision && ["IN_REVIEW", "APPROVED", "REJECTED", "SUPERSEDED", "RETIRED"].includes(currentRevision.governanceStatus) && <SignoffPanel subjectType="REQUIREMENT_REVISION" subjectId={currentRevision.id} subjectEligible={currentRevision.governanceStatus === "IN_REVIEW"} currentUserId={currentUserId} canRequest={canRequestSignoff} canDecide={canDecideSignoff} canManage={canManageSignoff} canWaive={canWaiveCondition} onChanged={() => void loadWorkspace(workspace.requirement.id)} />}

      <div className="raci-section"><div className="raci-section-title"><h5>Relationships</h5></div>
        {!traceability ? <p className="drawer-empty">Traceability evidence could not be loaded.</p> : <>
          {!traceability.outgoing.length && !traceability.incoming.length ? <p className="drawer-empty">No relationships recorded.</p> : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Direction</th><th>Type</th><th>Related Requirement</th><th>Rationale</th>{canLink && <th />}</tr></thead><tbody>
            {traceability.outgoing.map((relationship) => <tr key={relationship.id}><td><span className="neutral-badge">Outgoing</span></td><td>{relationship.relationshipType.replaceAll("_", " ")}</td><td><strong>{relationship.targetTitle ?? "Untitled"}</strong><span>{relationship.targetBusinessId}</span></td><td>{relationship.rationale || "—"}</td>{canLink && <td><button className="text-action" onClick={() => void removeRelationship(relationship.id)}>Remove</button></td>}</tr>)}
            {traceability.incoming.map((relationship) => <tr key={relationship.id}><td><span className="neutral-badge">Incoming</span></td><td>{relationship.relationshipType.replaceAll("_", " ")}</td><td><strong>{relationship.sourceTitle ?? "Untitled"}</strong><span>{relationship.sourceBusinessId}</span></td><td>{relationship.rationale || "—"}</td><td /></tr>)}
          </tbody></table></div>}
          {canLink && <div className="raci-actions" style={{ flexWrap: "wrap" }}><input placeholder="Target Requirement ID" value={relationshipDraft.targetRequirementId} onChange={(event) => setRelationshipDraft((current) => ({ ...current, targetRequirementId: event.target.value }))} /><select value={relationshipDraft.relationshipType} onChange={(event) => setRelationshipDraft((current) => ({ ...current, relationshipType: event.target.value }))}>{requirementRelationshipTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select><input placeholder="Rationale (required across Projects)" value={relationshipDraft.rationale} onChange={(event) => setRelationshipDraft((current) => ({ ...current, rationale: event.target.value }))} /><button className="secondary-action" disabled={!relationshipDraft.targetRequirementId.trim()} onClick={() => void addRelationship()}>Add relationship</button></div>}
        </>}
      </div>

      <div className="raci-section"><div className="raci-section-title"><h5>Backlog links</h5></div>
        {!traceability ? <p className="drawer-empty">Traceability evidence could not be loaded.</p> : <>
          {!traceability.backlogLinks.length ? <p className="drawer-empty">No Backlog items linked yet.</p> : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Backlog item</th><th>Link type</th><th>Coverage</th><th>Delivery state</th>{canManageTraceability && <th />}</tr></thead><tbody>{traceability.backlogLinks.map((link) => <tr key={link.id}><td><strong>{link.backlogTitle}</strong><span>{link.backlogBusinessId}</span></td><td>{link.linkType.replaceAll("_", " ")}</td><td>{link.coveragePercentage !== null ? `${link.coveragePercentage}%` : "—"}</td><td><span className="neutral-badge">{link.deliveryState}{link.origin === "AZURE_DEVOPS" && link.sourceMissingAt ? " · source unavailable" : ""}</span></td>{canManageTraceability && <td><button className="text-action" onClick={() => void removeBacklogLink(link.id)}>Remove</button></td>}</tr>)}</tbody></table></div>}
          {canManageTraceability && <div className="raci-actions" style={{ flexWrap: "wrap" }}><div style={{ position: "relative" }}><input placeholder="Search Backlog items" value={linkSearch} onChange={(event) => { setLinkSearch(event.target.value); setLinkDraft((current) => ({ ...current, backlogItemId: "" })); }} />{linkOptions.length > 0 && !linkDraft.backlogItemId && <div className="table-shell" style={{ position: "absolute", zIndex: 5, background: "white", border: "1px solid var(--line)" }}><table className="portfolio-table">{linkOptions.map((option) => <tbody key={option.id}><tr className="clickable-row" onClick={() => { setLinkDraft((current) => ({ ...current, backlogItemId: option.id })); setLinkSearch(`${option.businessId} · ${option.title}`); setLinkOptions([]); }}><td><strong>{option.title}</strong><span>{option.businessId}</span></td></tr></tbody>)}</table></div>}</div><select value={linkDraft.linkType} onChange={(event) => setLinkDraft((current) => ({ ...current, linkType: event.target.value }))}>{requirementBacklogLinkTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select>{linkDraft.linkType === "PARTIALLY_IMPLEMENTS" && <input type="number" min={1} max={99} placeholder="Coverage %" value={linkDraft.coveragePercentage} onChange={(event) => setLinkDraft((current) => ({ ...current, coveragePercentage: event.target.value }))} />}<input placeholder="Rationale" value={linkDraft.rationale} onChange={(event) => setLinkDraft((current) => ({ ...current, rationale: event.target.value }))} /><button className="secondary-action" disabled={!linkDraft.backlogItemId} onClick={() => void addBacklogLink()}>Add link</button></div>}
        </>}
      </div>

      <div className="raci-section"><div className="raci-section-title"><h5>Verification evidence</h5></div>
        {!traceability ? <p className="drawer-empty">Traceability evidence could not be loaded.</p> : <>
          {!traceability.evidence.length ? <p className="drawer-empty">No verification evidence recorded.</p> : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Type</th><th>Source</th><th>Reference</th><th>Status</th><th>Freshness</th><th>Observed</th></tr></thead><tbody>{traceability.evidence.map((record) => <tr key={record.id}><td>{record.evidenceType}</td><td>{record.sourceSystem}</td><td>{record.sourceUrl ? <a href={record.sourceUrl} target="_blank" rel="noreferrer">{record.externalReference}</a> : record.externalReference}</td><td><span className="neutral-badge">{record.evidenceStatus.replaceAll("_", " ")}</span></td><td><span className="neutral-badge">{record.freshness}</span></td><td>{record.observedAt ? new Date(record.observedAt).toLocaleDateString() : "—"}</td></tr>)}</tbody></table></div>}
          {canRecordEvidence && <div className="raci-actions" style={{ flexWrap: "wrap" }}><select value={evidenceDraft.evidenceType} onChange={(event) => setEvidenceDraft((current) => ({ ...current, evidenceType: event.target.value }))}>{verificationEvidenceTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select><input placeholder="Source system" value={evidenceDraft.sourceSystem} onChange={(event) => setEvidenceDraft((current) => ({ ...current, sourceSystem: event.target.value }))} /><input placeholder="External reference" value={evidenceDraft.externalReference} onChange={(event) => setEvidenceDraft((current) => ({ ...current, externalReference: event.target.value }))} /><select value={evidenceDraft.evidenceStatus} onChange={(event) => setEvidenceDraft((current) => ({ ...current, evidenceStatus: event.target.value }))}>{verificationEvidenceStatuses.map((status_) => <option key={status_} value={status_}>{status_.replaceAll("_", " ")}</option>)}</select><input type="date" value={evidenceDraft.observedAt} onChange={(event) => setEvidenceDraft((current) => ({ ...current, observedAt: event.target.value }))} /><button className="secondary-action" disabled={!evidenceDraft.sourceSystem.trim() || !evidenceDraft.externalReference.trim()} onClick={() => void addEvidence()}>Add evidence</button></div>}
        </>}
      </div>
    </div>}

    {createOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCreateOpen(false); }}><div className="product-dialog brd-dialog" role="dialog" aria-modal="true" aria-labelledby="requirement-dialog-title"><form onSubmit={create}><div className="dialog-header"><div><span className="section-kicker">NEW GOVERNED REQUIREMENT</span><h2 id="requirement-dialog-title">Register Requirement</h2></div><button type="button" aria-label="Close" onClick={() => setCreateOpen(false)} disabled={saving}>×</button></div><div className="form-grid">
      <label className="field"><span>Requirement type <b aria-hidden="true">*</b></span><select value={registration.requirementType} onChange={(event) => setRegistration((current) => ({ ...current, requirementType: event.target.value }))}>{requirementTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select>{fieldErrors.requirementType && <small role="alert">{fieldErrors.requirementType}</small>}</label>
      <label className="field"><span>Priority</span><select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as typeof draftDefaults.priority }))}>{requirementPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
      <label className="field"><span>Product <b aria-hidden="true">*</b></span><select required value={registration.productId} onChange={(event) => setRegistration((current) => ({ ...current, productId: event.target.value, projectId: "" }))}><option value="">Select Product</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select>{fieldErrors.productId && <small role="alert">{fieldErrors.productId}</small>}</label>
      <label className="field"><span>Project</span><select value={registration.projectId} onChange={(event) => setRegistration((current) => ({ ...current, projectId: event.target.value }))}><option value="">Product-wide</option>{filteredProjects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
      <label className="field wide"><span>Title <b aria-hidden="true">*</b></span><input required minLength={3} value={draft.title} maxLength={240} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />{fieldErrors.title && <small role="alert">{fieldErrors.title}</small>}</label>
      <label className="field wide"><span>Statement <b aria-hidden="true">*</b></span><textarea rows={4} value={draft.statement} maxLength={20000} onChange={(event) => setDraft((current) => ({ ...current, statement: event.target.value }))} />{fieldErrors.statement && <small role="alert">{fieldErrors.statement}</small>}</label>
      <label className="field wide"><span>Verification method <b aria-hidden="true">*</b></span><textarea rows={2} value={draft.verificationMethod} maxLength={4000} onChange={(event) => setDraft((current) => ({ ...current, verificationMethod: event.target.value }))} />{fieldErrors.verificationMethod && <small role="alert">{fieldErrors.verificationMethod}</small>}</label>
    </div>{error && <div className="form-error" role="alert">{error}</div>}<div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</button><button className="primary-action" disabled={saving}>{saving ? "Creating…" : "Create Requirement"}</button></div></form></div></div>}
  </section>;
}
