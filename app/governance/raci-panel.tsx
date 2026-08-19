"use client";

import { useCallback, useEffect, useState } from "react";
import { raciResponsibilities } from "./stage3-contract";

type Stakeholder = { id: string; userId: string | null; projectId: string; displayName: string; function: string; organization: string; active: boolean };
type Assignment = { id: string; activityId: string; stakeholderId: string; responsibility: string; stakeholderDisplayName: string };
type Activity = { id: string; matrixId: string; activityKey: string; name: string; sequence: number; governedSubjectType: string | null; governedSubjectId: string | null; assignments: Assignment[] };
type Matrix = { id: string; businessId: string; projectId: string; title: string; status: string; revision: number; publishedAt: string | null; version: number };
type Workspace = { matrix: Matrix | null; stakeholders: Stakeholder[]; activities: Activity[] };
type UserOption = { id: string; displayName: string; email: string };

type StakeholderDraft = { key: string; id: string | null; displayName: string; function: string; organization: string; userId: string | null };
type ActivityDraft = { key: string; activityKey: string; name: string; sequence: number; governedSubjectType: string; governedSubjectId: string; assignments: Array<{ stakeholderKey: string; responsibility: string }> };

export function RaciPanel({ projectId, canManage, canPublish }: { projectId: string; canManage: boolean; canPublish: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [title, setTitle] = useState("");
  const [stakeholderDrafts, setStakeholderDrafts] = useState<StakeholderDraft[]>([]);
  const [activityDrafts, setActivityDrafts] = useState<ActivityDraft[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/v3/projects/${projectId}/raci`, { headers: { accept: "application/json" } });
      const body = await response.json() as { data?: Workspace; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "The RACI matrix could not be loaded.");
      setWorkspace(body.data);
      setTitle(body.data.matrix?.title ?? "");
      setStakeholderDrafts(body.data.stakeholders.map((stakeholder) => ({ key: stakeholder.id, id: stakeholder.id, displayName: stakeholder.displayName, function: stakeholder.function, organization: stakeholder.organization, userId: stakeholder.userId })));
      setActivityDrafts(body.data.activities.map((activity) => ({
        key: activity.id, activityKey: activity.activityKey, name: activity.name, sequence: activity.sequence,
        governedSubjectType: activity.governedSubjectType ?? "", governedSubjectId: activity.governedSubjectId ?? "",
        assignments: activity.assignments.map((assignment) => ({ stakeholderKey: assignment.stakeholderId, responsibility: assignment.responsibility })),
      })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The RACI matrix could not be loaded."); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { const handle = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(handle); }, [load]);
  useEffect(() => {
    fetch("/api/v1/users", { headers: { accept: "application/json" } })
      .then((response) => response.json())
      .then((body: { data?: UserOption[] }) => setUsers(body.data ?? []))
      .catch(() => setUsers([]));
  }, []);

  const isDraft = !workspace?.matrix || workspace.matrix.status === "DRAFT";

  const addStakeholder = () => setStakeholderDrafts((current) => [...current, { key: `new-${current.length}-${Date.now()}`, id: null, displayName: "", function: "", organization: "", userId: null }]);
  const updateStakeholder = (key: string, changes: Partial<StakeholderDraft>) => setStakeholderDrafts((current) => current.map((draft) => draft.key === key ? { ...draft, ...changes } : draft));
  const removeStakeholder = (key: string) => { setStakeholderDrafts((current) => current.filter((draft) => draft.key !== key)); setActivityDrafts((current) => current.map((activity) => ({ ...activity, assignments: activity.assignments.filter((assignment) => assignment.stakeholderKey !== key) }))); };

  const addActivity = () => setActivityDrafts((current) => [...current, { key: `new-${current.length}-${Date.now()}`, activityKey: "", name: "", sequence: current.length + 1, governedSubjectType: "", governedSubjectId: "", assignments: [] }]);
  const updateActivity = (key: string, changes: Partial<ActivityDraft>) => setActivityDrafts((current) => current.map((draft) => draft.key === key ? { ...draft, ...changes } : draft));
  const removeActivity = (key: string) => setActivityDrafts((current) => current.filter((draft) => draft.key !== key));

  const setAssignment = (activityKey: string, stakeholderKey: string, responsibility: string) => setActivityDrafts((current) => current.map((activity) => {
    if (activity.key !== activityKey) return activity;
    const without = activity.assignments.filter((assignment) => assignment.stakeholderKey !== stakeholderKey);
    return { ...activity, assignments: responsibility ? [...without, { stakeholderKey, responsibility }] : without };
  }));
  const assignmentFor = (activity: ActivityDraft, stakeholderKey: string) => activity.assignments.find((assignment) => assignment.stakeholderKey === stakeholderKey)?.responsibility ?? "";

  const save = async (publish: boolean) => {
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/v3/projects/${projectId}/raci`, {
        method: "PUT", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          title, version: workspace?.matrix?.version ?? 0, publish,
          stakeholders: stakeholderDrafts.map((draft) => ({ key: draft.key, id: draft.id, displayName: draft.displayName, function: draft.function, organization: draft.organization, userId: draft.userId })),
          activities: activityDrafts.map((draft) => ({
            activityKey: draft.activityKey, name: draft.name, sequence: draft.sequence,
            governedSubjectType: draft.governedSubjectType || null, governedSubjectId: draft.governedSubjectId || null,
            assignments: draft.assignments,
          })),
        }),
      });
      const body = await response.json() as { data?: Workspace; error?: { message?: string; validationDetails?: Record<string, string> } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "The RACI matrix could not be saved.");
      setWorkspace(body.data);
      setStakeholderDrafts(body.data.stakeholders.map((stakeholder) => ({ key: stakeholder.id, id: stakeholder.id, displayName: stakeholder.displayName, function: stakeholder.function, organization: stakeholder.organization, userId: stakeholder.userId })));
      setActivityDrafts(body.data.activities.map((activity) => ({
        key: activity.id, activityKey: activity.activityKey, name: activity.name, sequence: activity.sequence,
        governedSubjectType: activity.governedSubjectType ?? "", governedSubjectId: activity.governedSubjectId ?? "",
        assignments: activity.assignments.map((assignment) => ({ stakeholderKey: assignment.stakeholderId, responsibility: assignment.responsibility })),
      })));
      setSuccess(publish ? "RACI matrix published." : "RACI draft saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The RACI matrix could not be saved."); }
    finally { setSaving(false); }
  };

  return <section className="raci-panel" aria-labelledby="raci-panel-title">
    <div className="signoff-panel-header"><span className="section-kicker">GOVERNANCE · RACI</span><h4 id="raci-panel-title">RACI matrix</h4>{workspace?.matrix && <span className="neutral-badge">{workspace.matrix.status} · rev {workspace.matrix.revision}</span>}</div>
    {success && <div className="success-banner" role="status">{success}</div>}
    {error && <div className="form-error" role="alert">{error}<button className="text-action" onClick={() => setError("")}>Dismiss</button></div>}
    {loading ? <div className="module-state" role="status"><span className="loader" />Loading RACI matrix…</div> : <div className="raci-workspace">
      <label className="field"><span>Matrix title</span><input value={title} maxLength={240} disabled={!canManage || !isDraft} onChange={(event) => setTitle(event.target.value)} /></label>

      <div className="raci-section"><div className="raci-section-title"><h5>Stakeholders</h5>{canManage && isDraft && <button className="text-action" onClick={addStakeholder}>+ Add stakeholder</button>}</div>
        {!stakeholderDrafts.length ? <p className="drawer-empty">No stakeholders yet.</p> : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Name</th><th>Function</th><th>Organization</th><th>Linked user</th>{canManage && isDraft && <th />}</tr></thead><tbody>{stakeholderDrafts.map((draft) => <tr key={draft.key}>
          <td>{canManage && isDraft ? <input value={draft.displayName} maxLength={160} onChange={(event) => updateStakeholder(draft.key, { displayName: event.target.value })} /> : draft.displayName}</td>
          <td>{canManage && isDraft ? <input value={draft.function} maxLength={160} onChange={(event) => updateStakeholder(draft.key, { function: event.target.value })} /> : draft.function}</td>
          <td>{canManage && isDraft ? <input value={draft.organization} maxLength={160} onChange={(event) => updateStakeholder(draft.key, { organization: event.target.value })} /> : draft.organization}</td>
          <td>{canManage && isDraft ? <select value={draft.userId ?? ""} onChange={(event) => updateStakeholder(draft.key, { userId: event.target.value || null })}><option value="">Not linked</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select> : (users.find((user) => user.id === draft.userId)?.displayName ?? "Not linked")}</td>
          {canManage && isDraft && <td><button className="text-action" onClick={() => removeStakeholder(draft.key)}>Remove</button></td>}
        </tr>)}</tbody></table></div>}
      </div>

      <div className="raci-section"><div className="raci-section-title"><h5>Activities &amp; assignments</h5>{canManage && isDraft && <button className="text-action" onClick={addActivity}>+ Add activity</button>}</div>
        {!activityDrafts.length ? <p className="drawer-empty">No activities yet.</p> : <div className="table-shell"><table className="portfolio-table raci-grid"><thead><tr><th>Activity</th>{stakeholderDrafts.map((stakeholder) => <th key={stakeholder.key}>{stakeholder.displayName || "Unnamed"}</th>)}{canManage && isDraft && <th />}</tr></thead><tbody>{activityDrafts.map((activity) => <tr key={activity.key}>
          <td>{canManage && isDraft ? <><input placeholder="Key" value={activity.activityKey} maxLength={64} onChange={(event) => updateActivity(activity.key, { activityKey: event.target.value })} /><input placeholder="Name" value={activity.name} maxLength={200} onChange={(event) => updateActivity(activity.key, { name: event.target.value })} /></> : <><strong>{activity.name}</strong><span>{activity.activityKey}</span></>}</td>
          {stakeholderDrafts.map((stakeholder) => <td key={stakeholder.key}>{canManage && isDraft ? <select value={assignmentFor(activity, stakeholder.key)} onChange={(event) => setAssignment(activity.key, stakeholder.key, event.target.value)}><option value="">—</option>{raciResponsibilities.map((responsibility) => <option key={responsibility} value={responsibility}>{responsibility[0]}</option>)}</select> : assignmentFor(activity, stakeholder.key)[0] ?? "—"}</td>)}
          {canManage && isDraft && <td><button className="text-action" onClick={() => removeActivity(activity.key)}>Remove</button></td>}
        </tr>)}</tbody></table></div>}
        {canManage && isDraft && <p className="raci-hint">Every activity needs exactly one Accountable and at least one Responsible assignment before publishing. R = Responsible, A = Accountable, C = Consulted, I = Informed.</p>}
      </div>

      {canManage && isDraft && <div className="raci-actions"><button className="secondary-action" disabled={saving || !title.trim()} onClick={() => void save(false)}>{saving ? "Saving…" : "Save draft"}</button>{canPublish && <button className="primary-action" disabled={saving || !title.trim() || !activityDrafts.length} onClick={() => void save(true)}>Publish revision</button>}</div>}
    </div>}
  </section>;
}
