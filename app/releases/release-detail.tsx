"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deploymentStatuses, environmentTiers } from "./stage4-contract";
import { manualReleaseStatusTargets } from "./release-contract";
import { SignoffPanel } from "../governance/signoff-panel";
import { UatWorkspace } from "./uat-workspace";
import { DefectWorkspace } from "./defect-workspace";
import { ReadinessBadge } from "./release-portfolio";
import { formatDate, formatDateTime, titleCase, toneForDeploymentStatus, toneForReleaseStatus } from "./release-format";

type ReleaseRecord = {
  id: string; businessId: string; projectId: string; projectName: string; name: string;
  releaseType: string; targetVersion: string; plannedDate: string | null; status: string;
  scopeLockedAt: string | null; releasedAt: string | null; ownerUserId: string | null; ownerName: string | null; version: number;
};
type ScopeItem = { id: string; backlogItemId: string; businessId: string; title: string; itemType: string; status: string; deliveryState: string };
type Readiness = {
  scopeItemCount: number; scopeDoneCount: number; uatTestCaseCount: number; uatPassedCount: number; uatFailedCount: number; uatBlockedCount: number; uatNotExecutedCount: number;
  openDefectCount: number; criticalOpenDefectCount: number; signoffStatus: string | null; readiness: string; calculatedAt: string;
};
type Environment = { id: string; code: string; name: string; tier: string; active: number };
type Deployment = { id: string; environmentCode: string; environmentName: string; environmentTier: string; status: string; deployedByName: string | null; startedAt: string; completedAt: string | null; deploymentReference: string; rollbackOfId: string | null };
type BacklogItem = { id: string; businessId: string; title: string };

const tabs = ["Overview", "Environments & Deployments", "Sign-off", "UAT", "Defects"] as const;
type Tab = (typeof tabs)[number];

export function ReleaseDetail({ releaseId, onClose, currentUserId, permissions }: {
  releaseId: string; onClose: () => void; currentUserId: string;
  permissions: {
    canEdit: boolean; canScope: boolean; canReadiness: boolean; canRecordDeployment: boolean;
    canRequestSignoff: boolean; canDecideSignoff: boolean; canManageSignoff: boolean; canWaiveCondition: boolean;
    canCreateCampaign: boolean; canCreateTestCase: boolean; canEditTestCase: boolean; canExecute: boolean; canManageTraceability: boolean;
    canCreateDefect: boolean; canEditDefect: boolean; canCloseDefect: boolean;
  };
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [release, setRelease] = useState<ReleaseRecord | null>(null);
  const [scope, setScope] = useState<ScopeItem[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([]);
  const [addBacklogItemId, setAddBacklogItemId] = useState("");
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [envForm, setEnvForm] = useState({ code: "", name: "", tier: "NON_PROD" });
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployForm, setDeployForm] = useState({ environmentId: "", status: "PLANNED", startedAt: "", completedAt: "", deploymentReference: "", rollbackOfId: "", notes: "" });
  const [deployErrors, setDeployErrors] = useState<Record<string, string>>({});
  const first = useRef<HTMLSelectElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/v4/releases/${releaseId}`, { headers: { accept: "application/json" } });
      const body = await response.json() as { data?: { release: ReleaseRecord; scope: ScopeItem[]; readiness: Readiness | null }; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Release could not be loaded.");
      setRelease(body.data.release); setScope(body.data.scope); setReadiness(body.data.readiness);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Release could not be loaded."); }
    finally { setLoading(false); }
  }, [releaseId]);

  const loadDeploymentEvidence = useCallback(async (projectId: string) => {
    try {
      const [envResponse, deployResponse] = await Promise.all([
        fetch(`/api/v4/projects/${projectId}/environments`, { headers: { accept: "application/json" } }),
        fetch(`/api/v4/releases/${releaseId}/deployments`, { headers: { accept: "application/json" } }),
      ]);
      const envBody = await envResponse.json() as { data?: Environment[] };
      const deployBody = await deployResponse.json() as { data?: Deployment[] };
      setEnvironments(envBody.data ?? []); setDeployments(deployBody.data ?? []);
    } catch { setEnvironments([]); setDeployments([]); }
  }, [releaseId]);

  const loadProjectScoped = useCallback(async (projectId: string) => {
    await loadDeploymentEvidence(projectId);
    try {
      const response = await fetch(`/api/v2/backlog?projectId=${encodeURIComponent(projectId)}&pageSize=100`, { headers: { accept: "application/json" } });
      const body = await response.json() as { data?: BacklogItem[] };
      setBacklogItems(body.data ?? []);
    } catch { setBacklogItems([]); }
  }, [loadDeploymentEvidence]);

  useEffect(() => { const handle = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(handle); }, [load]);
  const releaseProjectId = release?.projectId;
  useEffect(() => {
    if (!releaseProjectId) return;
    const handle = window.setTimeout(() => void loadProjectScoped(releaseProjectId), 0);
    return () => window.clearTimeout(handle);
  }, [releaseProjectId, loadProjectScoped]);
  useEffect(() => { if (deployOpen) window.setTimeout(() => first.current?.focus(), 0); }, [deployOpen]);

  const flash = (message: string) => { setSuccess(message); window.setTimeout(() => setSuccess(""), 3000); };

  const addScope = async () => {
    if (!addBacklogItemId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v4/releases/${releaseId}/scope`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ backlogItemId: addBacklogItemId }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The item could not be added to scope.");
      setAddBacklogItemId(""); flash("Scope item added."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The item could not be added to scope."); }
    finally { setBusy(false); }
  };

  const removeScope = async (backlogItemId: string) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v4/releases/${releaseId}/scope/${backlogItemId}`, { method: "DELETE", headers: { accept: "application/json" } });
      if (!response.ok) { const body = await response.json() as { error?: { message?: string } }; throw new Error(body.error?.message ?? "The item could not be removed from scope."); }
      flash("Scope item removed."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The item could not be removed from scope."); }
    finally { setBusy(false); }
  };

  const lockScope = async () => {
    if (!release) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v4/releases/${releaseId}/lock-scope`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ version: release.version }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Scope could not be locked.");
      flash("Scope locked."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Scope could not be locked."); }
    finally { setBusy(false); }
  };

  const transitionTo = async (status: string) => {
    if (!release) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v4/releases/${releaseId}`, { method: "PATCH", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ status, version: release.version }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The status could not be changed.");
      flash(`Release moved to ${titleCase(status)}.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The status could not be changed."); }
    finally { setBusy(false); }
  };

  const recalculateReadiness = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v4/releases/${releaseId}/readiness`, { method: "POST", headers: { accept: "application/json" } });
      const body = await response.json() as { data?: Readiness; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Readiness could not be recalculated.");
      setReadiness(body.data ?? null); flash("Readiness recalculated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Readiness could not be recalculated."); }
    finally { setBusy(false); }
  };

  const createEnvironment = async () => {
    if (!release || !envForm.code || !envForm.name) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v4/projects/${release.projectId}/environments`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(envForm) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The environment could not be created.");
      setEnvForm({ code: "", name: "", tier: "NON_PROD" }); flash("Environment created."); await loadDeploymentEvidence(release.projectId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The environment could not be created."); }
    finally { setBusy(false); }
  };

  const openDeploy = () => { setDeployForm({ environmentId: environments[0]?.id ?? "", status: "PLANNED", startedAt: "", completedAt: "", deploymentReference: "", rollbackOfId: "", notes: "" }); setDeployErrors({}); setDeployOpen(true); };
  const saveDeployment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!release) return;
    setBusy(true); setDeployErrors({}); setError("");
    try {
      const response = await fetch(`/api/v4/releases/${releaseId}/deployments`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...deployForm, startedAt: deployForm.startedAt || null, completedAt: deployForm.completedAt || null, rollbackOfId: deployForm.rollbackOfId || null }),
      });
      const body = await response.json() as { error?: { message?: string; validationDetails?: Record<string, string> } };
      if (!response.ok) { setDeployErrors(body.error?.validationDetails ?? {}); throw new Error(body.error?.message ?? "The deployment could not be recorded."); }
      setDeployOpen(false); flash("Deployment recorded."); await Promise.all([loadDeploymentEvidence(release.projectId), load()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The deployment could not be recorded."); }
    finally { setBusy(false); }
  };

  const transitionTargets = release ? (manualReleaseStatusTargets as readonly string[]).filter((target) => target !== release.status) : [];

  return <div className="overview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="overview-drawer work-item-drawer" role="dialog" aria-modal="true" aria-labelledby="release-detail-title">
      <header className="overview-topbar">
        <div>
          <span className="section-kicker">{release?.businessId ?? "RELEASE"}</span>
          <h2 id="release-detail-title">{release?.name ?? "Loading…"}</h2>
          {release && <p>{release.projectName} · {titleCase(release.releaseType)} {release.targetVersion && `· ${release.targetVersion}`}</p>}
        </div>
        <button onClick={onClose} aria-label="Close">×</button>
      </header>

      {loading ? <div className="module-state" role="status"><span className="loader" />Loading Release…</div>
        : !release ? <div className="module-state error-state"><strong>Release unavailable</strong><p>{error || "This Release could not be loaded."}</p></div>
        : <>
          {success && <div className="success-banner" role="status">{success}</div>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="document-type-tabs" role="tablist" aria-label="Release detail" style={{ margin: "0 25px" }}>
            {tabs.map((label) => <button key={label} role="tab" aria-selected={tab === label} className={tab === label ? "active" : ""} onClick={() => setTab(label)}><strong>{label}</strong></button>)}
          </div>

          <div className="overview-content">
            {tab === "Overview" && <>
              <div className="release-summary-strip">
                <div><span>Status</span><strong><span className={`tone-badge tone-${toneForReleaseStatus(release.status)}`}>{titleCase(release.status)}</span></strong></div>
                <div><span>Owner</span><strong>{release.ownerName ?? "Unassigned"}</strong></div>
                <div><span>Planned date</span><strong>{formatDate(release.plannedDate)}</strong></div>
                <div><span>Readiness</span><strong><ReadinessBadge readiness={readiness?.readiness} /></strong></div>
              </div>

              {permissions.canEdit && transitionTargets.length > 0 && <div className="release-status-actions">
                {transitionTargets.map((target) => <button key={target} className="secondary-action" disabled={busy} onClick={() => void transitionTo(target)}>Move to {titleCase(target)}</button>)}
              </div>}

              <div className="workspace-actions" style={{ marginTop: 18 }}><span className="section-kicker">SCOPE</span>{release.status === "PLANNING" && permissions.canScope && scope.length > 0 && <button className="secondary-action" onClick={() => void lockScope()} disabled={busy}>Lock scope</button>}</div>
              {!scope.length ? <p className="drawer-empty">No Backlog items in scope yet.</p> : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Item</th><th>Type</th><th>Delivery status</th>{release.status === "PLANNING" && permissions.canScope && <th><span className="sr-only">Actions</span></th>}</tr></thead><tbody>
                {scope.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><span>{item.businessId}</span></td><td>{titleCase(item.itemType)}</td><td>{titleCase(item.status)}</td>{release.status === "PLANNING" && permissions.canScope && <td><button className="row-action" onClick={() => void removeScope(item.backlogItemId)} disabled={busy}>Remove</button></td>}</tr>)}
              </tbody></table></div>}
              {release.status === "PLANNING" && permissions.canScope && <div className="filter-bar" style={{ marginTop: 8 }}>
                <label><span className="sr-only">Backlog item</span><select value={addBacklogItemId} onChange={(event) => setAddBacklogItemId(event.target.value)}><option value="">Select a Backlog item to add…</option>{backlogItems.map((item) => <option key={item.id} value={item.id}>{item.businessId} · {item.title}</option>)}</select></label>
                <button className="secondary-action" onClick={() => void addScope()} disabled={!addBacklogItemId || busy}>Add to scope</button>
              </div>}

              <div className="workspace-actions" style={{ marginTop: 18 }}><span className="section-kicker">READINESS</span>{permissions.canReadiness && <button className="secondary-action" onClick={() => void recalculateReadiness()} disabled={busy}>Recalculate</button>}</div>
              {!readiness ? <p className="drawer-empty">No readiness snapshot yet — recalculate to compute one from current evidence.</p> : <div className="evidence-grid">
                <div><span>Scope</span><strong>{readiness.scopeDoneCount}/{readiness.scopeItemCount}</strong></div>
                <div><span>UAT passed</span><strong>{readiness.uatPassedCount}/{readiness.uatTestCaseCount}</strong></div>
                <div><span>UAT failed/blocked</span><strong>{readiness.uatFailedCount + readiness.uatBlockedCount}</strong></div>
                <div><span>Not executed</span><strong>{readiness.uatNotExecutedCount}</strong></div>
                <div><span>Open defects</span><strong>{readiness.openDefectCount}</strong></div>
                <div><span>Critical defects</span><strong>{readiness.criticalOpenDefectCount}</strong></div>
                <div><span>Sign-off</span><strong>{readiness.signoffStatus ? titleCase(readiness.signoffStatus) : "Not requested"}</strong></div>
                <div><span>Calculated</span><strong>{formatDateTime(readiness.calculatedAt)}</strong></div>
              </div>}
            </>}

            {tab === "Environments & Deployments" && <>
              <div className="workspace-actions"><span className="section-kicker">ENVIRONMENTS</span></div>
              {!environments.length ? <p className="drawer-empty">No environments registered for this Project yet.</p> : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Code</th><th>Name</th><th>Tier</th></tr></thead><tbody>{environments.map((env) => <tr key={env.id}><td>{env.code}</td><td>{env.name}</td><td>{titleCase(env.tier)}</td></tr>)}</tbody></table></div>}
              {permissions.canRecordDeployment && <div className="filter-bar" style={{ marginTop: 8 }}>
                <label><span className="sr-only">Code</span><input placeholder="Code (e.g. UAT)" value={envForm.code} onChange={(event) => setEnvForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} /></label>
                <label><span className="sr-only">Name</span><input placeholder="Environment name" value={envForm.name} onChange={(event) => setEnvForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label><span className="sr-only">Tier</span><select value={envForm.tier} onChange={(event) => setEnvForm((current) => ({ ...current, tier: event.target.value }))}>{environmentTiers.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
                <button className="secondary-action" onClick={() => void createEnvironment()} disabled={busy}>Add environment</button>
              </div>}

              <div className="workspace-actions" style={{ marginTop: 18 }}><span className="section-kicker">DEPLOYMENT HISTORY</span>{permissions.canRecordDeployment && environments.length > 0 && <button className="primary-action" onClick={openDeploy}>+ Record deployment</button>}</div>
              {!deployments.length ? <p className="drawer-empty">No deployments recorded yet.</p> : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Environment</th><th>Status</th><th>Reference</th><th>Started</th><th>Completed</th><th>By</th></tr></thead><tbody>
                {deployments.map((deployment) => <tr key={deployment.id}><td>{deployment.environmentName} <span>{titleCase(deployment.environmentTier)}</span></td><td><span className={`tone-badge tone-${toneForDeploymentStatus(deployment.status)}`}>{titleCase(deployment.status)}</span></td><td>{deployment.deploymentReference || "—"}</td><td>{formatDateTime(deployment.startedAt)}</td><td>{formatDateTime(deployment.completedAt)}</td><td>{deployment.deployedByName ?? "—"}</td></tr>)}
              </tbody></table></div>}
            </>}

            {tab === "Sign-off" && <SignoffPanel subjectType="RELEASE" subjectId={release.id} subjectEligible={release.status === "READY_FOR_SIGNOFF"} currentUserId={currentUserId} canRequest={permissions.canRequestSignoff} canDecide={permissions.canDecideSignoff} canManage={permissions.canManageSignoff} canWaive={permissions.canWaiveCondition} onChanged={() => void load()} />}

            {tab === "UAT" && <UatWorkspace releaseId={release.id} projectId={release.projectId} canCreateCampaign={permissions.canCreateCampaign} canCreateTestCase={permissions.canCreateTestCase} canEditTestCase={permissions.canEditTestCase} canExecute={permissions.canExecute} canManageTraceability={permissions.canManageTraceability} />}

            {tab === "Defects" && <DefectWorkspace releaseId={release.id} projectId={release.projectId} canCreate={permissions.canCreateDefect} canEdit={permissions.canEditDefect} canClose={permissions.canCloseDefect} />}
          </div>
        </>}

      {deployOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDeployOpen(false); }}>
        <div className="product-dialog project-dialog" role="dialog" aria-modal="true" aria-labelledby="deployment-form-title">
          <form onSubmit={saveDeployment}>
            <div className="dialog-header"><div><span className="section-kicker">DEPLOYMENT</span><h2 id="deployment-form-title">Record deployment</h2></div><button type="button" onClick={() => setDeployOpen(false)} aria-label="Close">×</button></div>
            <div className="form-grid">
              <Field label="Environment" error={deployErrors.environmentId} required><select ref={first} value={deployForm.environmentId} onChange={(event) => setDeployForm((current) => ({ ...current, environmentId: event.target.value }))}>{environments.map((env) => <option key={env.id} value={env.id}>{env.name} ({titleCase(env.tier)})</option>)}</select></Field>
              <Field label="Status" error={deployErrors.status}><select value={deployForm.status} onChange={(event) => setDeployForm((current) => ({ ...current, status: event.target.value }))}>{deploymentStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
              <Field label="Started at" error={deployErrors.startedAt}><input type="datetime-local" value={deployForm.startedAt} onChange={(event) => setDeployForm((current) => ({ ...current, startedAt: event.target.value }))} /></Field>
              <Field label="Completed at" error={deployErrors.completedAt}><input type="datetime-local" value={deployForm.completedAt} onChange={(event) => setDeployForm((current) => ({ ...current, completedAt: event.target.value }))} /></Field>
              <Field label="Reference"><input value={deployForm.deploymentReference} onChange={(event) => setDeployForm((current) => ({ ...current, deploymentReference: event.target.value }))} /></Field>
              {deployForm.status === "ROLLED_BACK" && <Field label="Rollback of" error={deployErrors.rollbackOfId} required><select value={deployForm.rollbackOfId} onChange={(event) => setDeployForm((current) => ({ ...current, rollbackOfId: event.target.value }))}><option value="">Select the deployment being rolled back…</option>{deployments.filter((deployment) => deployment.status === "SUCCEEDED").map((deployment) => <option key={deployment.id} value={deployment.id}>{deployment.environmentName} · {formatDateTime(deployment.startedAt)}</option>)}</select></Field>}
              <Field label="Notes" wide><textarea rows={2} value={deployForm.notes} onChange={(event) => setDeployForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
            </div>
            <div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setDeployOpen(false)}>Cancel</button><button className="primary-action" disabled={busy}>{busy ? "Recording…" : "Record deployment"}</button></div>
          </form>
        </div>
      </div>}
    </div>
  </div>;
}

function Field({ label, error, wide, required, children }: { label: string; error?: string; wide?: boolean; required?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "field wide" : "field"}><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}{error && <small role="alert">{error}</small>}</label>;
}
