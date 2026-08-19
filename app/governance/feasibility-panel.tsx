"use client";

import { useCallback, useEffect, useState } from "react";
import { feasibilityEstimateUnits } from "./feasibility-contract";
import { SignoffPanel } from "./signoff-panel";

type Assessment = { id: string; businessId: string; projectId: string; backlogFeatureId: string | null; backlogFeatureTitle: string | null; ownerUserId: string | null; ownerName: string | null; recordStatus: string; version: number; updatedAt: string };
type Revision = {
  id: string; assessmentId: string; revisionNumber: number; status: string;
  technicalSpike: string; architectureReview: string; feasibilitySummary: string; integrationRequirements: string;
  securityReview: string; technicalConstraints: string; technicalDebtRisk: string;
  engineeringEstimate: number | null; estimateUnit: string | null; recommendation: string;
  contentHash: string | null; submittedAt: string | null; approvedAt: string | null; version: number; createdAt: string;
};
type Link = { id: string; assessmentId: string; requirementId: string; requirementBusinessId: string; coverageNote: string };
type Item = { assessment: Assessment; revisions: Revision[]; links: Link[] };
type UserOption = { id: string; displayName: string; email: string };
type BacklogOption = { id: string; title: string };

const emptyDraft = { technicalSpike: "", architectureReview: "", feasibilitySummary: "", integrationRequirements: "", securityReview: "", technicalConstraints: "", technicalDebtRisk: "", engineeringEstimate: "", estimateUnit: "", recommendation: "" };

export function FeasibilityPanel({ projectId, currentUserId, canView, canEdit, canSubmit, canDecideSignoff, canManageSignoff, canWaiveCondition, canRequestSignoff }: {
  projectId: string; currentUserId: string; canView: boolean; canEdit: boolean; canSubmit: boolean;
  canDecideSignoff: boolean; canManageSignoff: boolean; canWaiveCondition: boolean; canRequestSignoff: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [createOpen, setCreateOpen] = useState(false);
  const [backlogFeatureId, setBacklogFeatureId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [backlogFeatures, setBacklogFeatures] = useState<BacklogOption[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/v3/projects/${projectId}/feasibility`, { headers: { accept: "application/json" } });
      const body = await response.json() as { data?: Item[]; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Feasibility assessments could not be loaded.");
      setItems(body.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Feasibility assessments could not be loaded."); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { const handle = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(handle); }, [load]);
  useEffect(() => {
    fetch("/api/v1/users", { headers: { accept: "application/json" } }).then((response) => response.json()).then((body: { data?: UserOption[] }) => setUsers(body.data ?? [])).catch(() => setUsers([]));
    fetch(`/api/v2/backlog?projectId=${projectId}&itemType=FEATURE&pageSize=100`, { headers: { accept: "application/json" } }).then((response) => response.ok ? response.json() : { data: [] }).then((body: { data?: Array<{ id: string; title: string }> }) => setBacklogFeatures((body.data ?? []).map((item) => ({ id: item.id, title: item.title })))).catch(() => setBacklogFeatures([]));
  }, [projectId]);

  const selected = items.find((item) => item.assessment.id === selectedId) ?? null;
  const currentRevision = selected?.revisions.find((revision) => revision.status === "DRAFT") ?? selected?.revisions[0] ?? null;
  const isDraft = currentRevision?.status === "DRAFT";

  const select = (item: Item) => {
    setSelectedId(item.assessment.id); setError(""); setSuccess("");
    const revision = item.revisions.find((entry) => entry.status === "DRAFT") ?? item.revisions[0];
    setDraft(revision ? {
      technicalSpike: revision.technicalSpike, architectureReview: revision.architectureReview, feasibilitySummary: revision.feasibilitySummary,
      integrationRequirements: revision.integrationRequirements, securityReview: revision.securityReview, technicalConstraints: revision.technicalConstraints,
      technicalDebtRisk: revision.technicalDebtRisk, engineeringEstimate: revision.engineeringEstimate === null ? "" : String(revision.engineeringEstimate),
      estimateUnit: revision.estimateUnit ?? "", recommendation: revision.recommendation,
    } : { ...emptyDraft });
  };

  const openCreate = () => { setBacklogFeatureId(""); setOwnerUserId(""); setError(""); setCreateOpen(true); };
  const createAssessment = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v3/projects/${projectId}/feasibility`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ backlogFeatureId: backlogFeatureId || null, ownerUserId: ownerUserId || null }),
      });
      const body = await response.json() as { data?: { assessment: Assessment; revisions: Revision[]; links: Link[] }; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "The feasibility assessment could not be created.");
      setCreateOpen(false); await load(); setSelectedId(body.data.assessment.id); select({ assessment: body.data.assessment, revisions: body.data.revisions, links: body.data.links });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The feasibility assessment could not be created."); }
    finally { setSaving(false); }
  };

  const saveDraft = async () => {
    if (!selected || !currentRevision) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/v3/feasibility/${selected.assessment.id}`, {
        method: "PATCH", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...draft, engineeringEstimate: draft.engineeringEstimate === "" ? null : Number(draft.engineeringEstimate), estimateUnit: draft.estimateUnit || null, version: currentRevision.version }),
      });
      const body = await response.json() as { data?: { assessment: Assessment; revisions: Revision[]; links: Link[] }; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "The draft could not be saved.");
      await load(); select({ assessment: body.data.assessment, revisions: body.data.revisions, links: body.data.links }); setSuccess("Feasibility draft saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The draft could not be saved."); }
    finally { setSaving(false); }
  };

  const submit = async () => {
    if (!selected || !currentRevision || !window.confirm("Submit this feasibility assessment for review? Its content will be locked and further changes will require a new revision.")) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/v3/feasibility/${selected.assessment.id}/submit`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ version: currentRevision.version }) });
      const body = await response.json() as { data?: { assessment: Assessment; revisions: Revision[]; links: Link[] }; error?: { message?: string; validationDetails?: Record<string, string> } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "The assessment could not be submitted.");
      await load(); select({ assessment: body.data.assessment, revisions: body.data.revisions, links: body.data.links }); setSuccess("Feasibility assessment submitted as an immutable review revision.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The assessment could not be submitted."); }
    finally { setSaving(false); }
  };

  if (!canView) return null;

  return <section className="feasibility-panel" aria-labelledby="feasibility-panel-title">
    <div className="signoff-panel-header"><span className="section-kicker">GOVERNANCE · TECHNICAL FEASIBILITY</span><h4 id="feasibility-panel-title">Feasibility assessments</h4>{canEdit && <button className="secondary-action" onClick={openCreate}>+ New assessment</button>}</div>
    {success && <div className="success-banner" role="status">{success}</div>}
    {error && <div className="form-error" role="alert">{error}<button className="text-action" onClick={() => setError("")}>Dismiss</button></div>}
    {loading ? <div className="module-state" role="status"><span className="loader" />Loading feasibility assessments…</div> : !items.length ? <div className="truth-panel compact"><span>○</span><div><strong>No feasibility assessments yet</strong><p>{canEdit ? "Create the first assessment for this Project." : "No assessment has been recorded for this Project."}</p></div></div> : <div className="feasibility-layout">
      <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Assessment</th><th>Feature</th><th>Owner</th><th>Status</th></tr></thead><tbody>{items.map((item) => { const revision = item.revisions.find((entry) => entry.status === "DRAFT") ?? item.revisions[0]; return <tr key={item.assessment.id} className="clickable-row" onClick={() => select(item)}><td><strong>{item.assessment.businessId}</strong></td><td>{item.assessment.backlogFeatureTitle ?? "Project-wide"}</td><td>{item.assessment.ownerName ?? "Unassigned"}</td><td><span className="neutral-badge">{revision?.status.replaceAll("_", " ") ?? "—"}</span></td></tr>; })}</tbody></table></div>
      {selected && currentRevision && <div className="feasibility-detail"><header><strong>{selected.assessment.businessId}</strong><span className="neutral-badge">{currentRevision.status.replaceAll("_", " ")}</span></header>
        {isDraft && canEdit ? <div className="form-grid">
          {([["technicalSpike", "Technical spike"], ["architectureReview", "Architecture review"], ["integrationRequirements", "Integration requirements"], ["securityReview", "Security review"], ["technicalConstraints", "Technical constraints"], ["technicalDebtRisk", "Technical debt risk"]] as const).map(([key, label]) => <label className="field wide" key={key}><span>{label}</span><textarea rows={3} maxLength={20000} value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
          <label className="field wide"><span>Feasibility summary <b aria-hidden="true">*</b></span><textarea rows={4} maxLength={20000} value={draft.feasibilitySummary} onChange={(event) => setDraft((current) => ({ ...current, feasibilitySummary: event.target.value }))} /></label>
          <label className="field"><span>Engineering estimate</span><input type="number" min={0} value={draft.engineeringEstimate} onChange={(event) => setDraft((current) => ({ ...current, engineeringEstimate: event.target.value }))} /></label>
          <label className="field"><span>Estimate unit</span><select value={draft.estimateUnit} onChange={(event) => setDraft((current) => ({ ...current, estimateUnit: event.target.value }))}><option value="">—</option>{feasibilityEstimateUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
          <label className="field wide"><span>Recommendation <b aria-hidden="true">*</b></span><textarea rows={3} maxLength={20000} value={draft.recommendation} onChange={(event) => setDraft((current) => ({ ...current, recommendation: event.target.value }))} /></label>
          <div className="feasibility-actions"><button className="secondary-action" disabled={saving} onClick={() => void saveDraft()}>{saving ? "Saving…" : "Save draft"}</button>{canSubmit && <button className="primary-action" disabled={saving || !draft.feasibilitySummary.trim() || !draft.recommendation.trim()} onClick={() => void submit()}>Submit for review</button>}</div>
        </div> : <div className="brd-locked-content"><span>Immutable review evidence</span><p><strong>Summary:</strong> {currentRevision.feasibilitySummary || "Not recorded."}</p><p><strong>Recommendation:</strong> {currentRevision.recommendation || "Not recorded."}</p>{currentRevision.engineeringEstimate !== null && <p><strong>Estimate:</strong> {currentRevision.engineeringEstimate} {currentRevision.estimateUnit}</p>}</div>}
        {(currentRevision.status === "IN_REVIEW" || currentRevision.status === "FEASIBLE" || currentRevision.status === "FEASIBLE_WITH_CONDITIONS" || currentRevision.status === "NOT_FEASIBLE") && <SignoffPanel subjectType="FEASIBILITY_REVISION" subjectId={currentRevision.id} subjectEligible={currentRevision.status === "IN_REVIEW"} currentUserId={currentUserId} canRequest={canRequestSignoff} canDecide={canDecideSignoff} canManage={canManageSignoff} canWaive={canWaiveCondition} onChanged={() => void load()} />}
      </div>}
    </div>}

    {createOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCreateOpen(false); }}><div className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="feasibility-create-title"><form onSubmit={createAssessment}><div className="dialog-header"><div><span className="section-kicker">NEW ASSESSMENT</span><h2 id="feasibility-create-title">Create feasibility assessment</h2></div><button type="button" aria-label="Close" onClick={() => setCreateOpen(false)} disabled={saving}>×</button></div>
      <div className="form-grid"><label className="field wide"><span>Backlog feature</span><select value={backlogFeatureId} onChange={(event) => setBacklogFeatureId(event.target.value)}><option value="">Project-wide</option>{backlogFeatures.map((feature) => <option key={feature.id} value={feature.id}>{feature.title}</option>)}</select></label><label className="field wide"><span>Owner</span><select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></label></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</button><button className="primary-action" disabled={saving}>{saving ? "Creating…" : "Create assessment"}</button></div>
    </form></div></div>}
  </section>;
}
