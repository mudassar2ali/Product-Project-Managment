"use client";

import { useCallback, useEffect, useState } from "react";
import { signoffLaneTypes, defaultRequiredSignoffLanes } from "./stage3-contract";
import type { SignoffSubjectType } from "./signoff-contract";

type Lane = { id: string; signoffRequestId: string; laneType: string; required: boolean; sequence: number; assignedApproverUserId: string | null; status: string; dueAt: string | null; version: number };
type Decision = { id: string; signoffLaneId: string; decision: string; approverUserId: string; comment: string; decidedAt: string };
type Condition = { id: string; decisionId: string; description: string; ownerUserId: string | null; dueAt: string | null; status: string; closureEvidence: string; closedBy: string | null; closedAt: string | null; version: number };
type SignoffRequest = { id: string; documentVersionId: string | null; requirementRevisionId: string | null; feasibilityRevisionId: string | null; status: string; requestedBy: string; requestedAt: string; completedAt: string | null; version: number };
type Workspace = { request: SignoffRequest; lanes: Lane[]; decisions: Decision[]; conditions: Condition[] };
type UserOption = { id: string; displayName: string; email: string };
type LaneDraft = { laneType: string; required: boolean; assignedApproverUserId: string };

export function SignoffPanel({
  subjectType, subjectId, subjectEligible, currentUserId,
  canRequest, canDecide, canManage, canWaive, onChanged,
}: {
  subjectType: SignoffSubjectType; subjectId: string; subjectEligible: boolean; currentUserId: string;
  canRequest: boolean; canDecide: boolean; canManage: boolean; canWaive: boolean; onChanged?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [laneDrafts, setLaneDrafts] = useState<LaneDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [decidingLane, setDecidingLane] = useState("");
  const [decisionValue, setDecisionValue] = useState("APPROVED");
  const [comment, setComment] = useState("");
  const [conditionDrafts, setConditionDrafts] = useState<Array<{ description: string; ownerUserId: string; dueAt: string }>>([]);
  const [conditionEdits, setConditionEdits] = useState<Record<string, { status: string; closureEvidence: string }>>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const listResponse = await fetch(`/api/v3/signoffs?subjectId=${encodeURIComponent(subjectId)}&pageSize=1`, { headers: { accept: "application/json" } });
      const listBody = await listResponse.json() as { data?: SignoffRequest[]; error?: { message?: string } };
      if (!listResponse.ok) throw new Error(listBody.error?.message ?? "Sign-off status could not be loaded.");
      const latest = listBody.data?.[0];
      if (!latest) { setWorkspace(null); return; }
      const workspaceResponse = await fetch(`/api/v3/signoffs?id=${encodeURIComponent(latest.id)}`, { headers: { accept: "application/json" } });
      const workspaceBody = await workspaceResponse.json() as { data?: Workspace; error?: { message?: string } };
      if (!workspaceResponse.ok || !workspaceBody.data) throw new Error(workspaceBody.error?.message ?? "Sign-off status could not be loaded.");
      setWorkspace(workspaceBody.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sign-off status could not be loaded."); }
    finally { setLoading(false); }
  }, [subjectId]);

  useEffect(() => { const handle = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(handle); }, [load]);
  useEffect(() => {
    fetch("/api/v1/users", { headers: { accept: "application/json" } })
      .then((response) => response.json())
      .then((body: { data?: UserOption[] }) => setUsers(body.data ?? []))
      .catch(() => setUsers([]));
  }, []);

  const openRequest = () => {
    setLaneDrafts(signoffLaneTypes.map((laneType) => ({ laneType, required: (defaultRequiredSignoffLanes as readonly string[]).includes(laneType), assignedApproverUserId: "" })));
    setError(""); setRequestOpen(true);
  };

  const toggleLane = (laneType: string) => setLaneDrafts((current) => current.map((lane) => lane.laneType === laneType ? { ...lane, required: !lane.required, assignedApproverUserId: lane.assignedApproverUserId } : lane));
  const setApprover = (laneType: string, assignedApproverUserId: string) => setLaneDrafts((current) => current.map((lane) => lane.laneType === laneType ? { ...lane, assignedApproverUserId } : lane));
  const includedLanes = laneDrafts.filter((lane) => lane.assignedApproverUserId);

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/v3/signoffs", {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ subjectType, subjectId, lanes: includedLanes.map((lane) => ({ laneType: lane.laneType, required: lane.required, assignedApproverUserId: lane.assignedApproverUserId })) }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The sign-off request could not be created.");
      setRequestOpen(false); await load(); onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The sign-off request could not be created."); }
    finally { setSaving(false); }
  };

  const openDecision = (laneId: string) => { setDecidingLane(laneId); setDecisionValue("APPROVED"); setComment(""); setConditionDrafts([]); setError(""); };
  const addConditionDraft = () => setConditionDrafts((current) => [...current, { description: "", ownerUserId: "", dueAt: "" }]);
  const updateConditionDraft = (index: number, changes: Partial<{ description: string; ownerUserId: string; dueAt: string }>) => setConditionDrafts((current) => current.map((draft, position) => position === index ? { ...draft, ...changes } : draft));
  const removeConditionDraft = (index: number) => setConditionDrafts((current) => current.filter((_, position) => position !== index));

  const submitDecision = async (laneId: string) => {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v3/signoff-lanes/${laneId}/decisions`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ decision: decisionValue, comment, conditions: decisionValue === "APPROVED_WITH_CONDITIONS" ? conditionDrafts.map((draft) => ({ description: draft.description, ownerUserId: draft.ownerUserId || null, dueAt: draft.dueAt || null })) : [] }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The decision could not be recorded.");
      setDecidingLane(""); await load(); onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The decision could not be recorded."); }
    finally { setSaving(false); }
  };

  const conditionEdit = (condition: Condition) => conditionEdits[condition.id] ?? { status: "IN_PROGRESS", closureEvidence: condition.closureEvidence };
  const updateConditionEdit = (id: string, changes: Partial<{ status: string; closureEvidence: string }>) => setConditionEdits((current) => ({ ...current, [id]: { ...(current[id] ?? { status: "IN_PROGRESS", closureEvidence: "" }), ...changes } }));

  const submitCondition = async (condition: Condition) => {
    const edit = conditionEdit(condition);
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v3/signoff-conditions/${condition.id}`, {
        method: "PATCH", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ status: edit.status, closureEvidence: edit.closureEvidence, version: condition.version }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The condition could not be updated.");
      await load(); onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The condition could not be updated."); }
    finally { setSaving(false); }
  };

  const approverName = (userId: string | null) => users.find((user) => user.id === userId)?.displayName ?? (userId ? "Unknown approver" : "Unassigned");

  return <section className="signoff-panel" aria-labelledby="signoff-panel-title">
    <div className="signoff-panel-header"><span className="section-kicker">GOVERNANCE · REVIEW &amp; SIGN-OFF</span><h4 id="signoff-panel-title">Sign-off</h4>{canRequest && subjectEligible && !workspace && !loading && <button className="secondary-action" onClick={openRequest}>Request sign-off</button>}</div>
    {error && <div className="form-error" role="alert">{error}<button className="text-action" onClick={() => setError("")}>Dismiss</button></div>}
    {loading ? <div className="module-state" role="status"><span className="loader" />Loading sign-off status…</div>
      : !workspace ? <div className="truth-panel compact"><span>○</span><div><strong>No sign-off requested</strong><p>{subjectEligible ? "Request sign-off once ready for review." : "Sign-off can be requested once this item is In Review."}</p></div></div>
      : <div className="signoff-workspace">
        <div className="signoff-status-row"><span className={`neutral-badge`}>{workspace.request.status.replaceAll("_", " ")}</span><span>Requested {new Date(workspace.request.requestedAt).toLocaleString()}</span></div>
        <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Lane</th><th>Approver</th><th>Status</th><th>Decision</th></tr></thead><tbody>
          {workspace.lanes.map((lane) => {
            const decision = workspace.decisions.filter((item) => item.signoffLaneId === lane.id).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
            const mine = lane.assignedApproverUserId === currentUserId && (lane.status === "PENDING" || lane.status === "UNDER_REVIEW");
            return <tr key={lane.id}><td><strong>{lane.laneType}</strong><span>{lane.required ? "Required" : "Optional"}</span></td><td>{approverName(lane.assignedApproverUserId)}</td><td><span className="neutral-badge">{lane.status.replaceAll("_", " ")}</span></td><td>{decision ? <span>{decision.decision.replaceAll("_", " ")} · {decision.comment || "No comment"}</span> : mine && canDecide ? decidingLane === lane.id ? <div className="signoff-decision-form"><select value={decisionValue} onChange={(event) => setDecisionValue(event.target.value)}><option value="APPROVED">Approved</option><option value="APPROVED_WITH_CONDITIONS">Approved with Conditions</option><option value="REJECTED">Rejected</option></select><textarea rows={2} placeholder="Comment" value={comment} onChange={(event) => setComment(event.target.value)} />{decisionValue === "APPROVED_WITH_CONDITIONS" && <div className="signoff-conditions-draft">{conditionDrafts.map((draft, index) => <div key={index}><input placeholder="Condition description" value={draft.description} onChange={(event) => updateConditionDraft(index, { description: event.target.value })} /><select value={draft.ownerUserId} onChange={(event) => updateConditionDraft(index, { ownerUserId: event.target.value })}><option value="">Unassigned owner</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select><input type="date" value={draft.dueAt} onChange={(event) => updateConditionDraft(index, { dueAt: event.target.value })} /><button type="button" className="text-action" onClick={() => removeConditionDraft(index)}>Remove</button></div>)}<button type="button" className="text-action" onClick={addConditionDraft}>+ Add condition</button></div>}<div className="signoff-decision-actions"><button className="text-action" onClick={() => setDecidingLane("")} disabled={saving}>Cancel</button><button className="primary-action" onClick={() => void submitDecision(lane.id)} disabled={saving || (decisionValue === "APPROVED_WITH_CONDITIONS" && !conditionDrafts.some((draft) => draft.description.trim()))}>{saving ? "Saving…" : "Record decision"}</button></div></div> : <button className="text-action" onClick={() => openDecision(lane.id)}>Decide</button> : "—"}</td></tr>;
          })}
        </tbody></table></div>
        {workspace.conditions.length > 0 && <div className="signoff-conditions-list"><h5>Conditions</h5>{workspace.conditions.map((condition) => {
          const closed = condition.status === "SATISFIED" || condition.status === "WAIVED";
          const canEdit = !closed && canManage && (condition.ownerUserId === currentUserId || canWaive);
          const edit = conditionEdit(condition);
          return <div key={condition.id} className={`signoff-condition ${closed ? "closed" : ""}`}><div><strong>{condition.description}</strong><span className="neutral-badge">{condition.status.replaceAll("_", " ")}</span></div><p>Owner: {approverName(condition.ownerUserId)}{condition.dueAt ? ` · Due ${new Date(condition.dueAt).toLocaleDateString()}` : ""}</p>{condition.closureEvidence && <p className="signoff-closure-evidence">{condition.closureEvidence}</p>}{canEdit && <div className="signoff-condition-edit"><select value={edit.status} onChange={(event) => updateConditionEdit(condition.id, { status: event.target.value })}><option value="IN_PROGRESS">In Progress</option><option value="SATISFIED">Satisfied</option>{canWaive && <option value="WAIVED">Waived</option>}</select><textarea rows={2} placeholder={edit.status === "WAIVED" ? "Waiver reason" : "Closure evidence"} value={edit.closureEvidence} onChange={(event) => updateConditionEdit(condition.id, { closureEvidence: event.target.value })} /><button className="secondary-action" disabled={saving || (edit.status !== "IN_PROGRESS" && !edit.closureEvidence.trim())} onClick={() => void submitCondition(condition)}>Update condition</button></div>}</div>;
        })}</div>}
      </div>}

    {requestOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setRequestOpen(false); }}><div className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="signoff-request-title"><form onSubmit={submitRequest}><div className="dialog-header"><div><span className="section-kicker">NEW SIGN-OFF REQUEST</span><h2 id="signoff-request-title">Request sign-off</h2></div><button type="button" aria-label="Close" onClick={() => setRequestOpen(false)} disabled={saving}>×</button></div>
      <div className="signoff-lane-picker">{laneDrafts.map((lane) => <div key={lane.laneType} className="signoff-lane-row"><label><input type="checkbox" checked={Boolean(lane.assignedApproverUserId) || lane.required} disabled={lane.required && !lane.assignedApproverUserId} onChange={() => toggleLane(lane.laneType)} />{lane.laneType}{lane.required && <b> (required)</b>}</label><select value={lane.assignedApproverUserId} onChange={(event) => setApprover(lane.laneType, event.target.value)}><option value="">No approver</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></div>)}</div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setRequestOpen(false)} disabled={saving}>Cancel</button><button className="primary-action" disabled={saving || !includedLanes.length || !includedLanes.some((lane) => lane.required)}>{saving ? "Requesting…" : "Request sign-off"}</button></div>
    </form></div></div>}
  </section>;
}
