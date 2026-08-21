"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { defectSeverities, defectStatuses } from "./stage4-contract";
import { formatDateTime, titleCase, toneForDefectSeverity, toneForDefectStatus } from "./release-format";

type Defect = {
  id: string; businessId: string; projectId: string; releaseId: string | null;
  source: string; severity: string; status: string; title: string; description: string; stepsToReproduce: string;
  reportedByName: string | null; assignedToUserId: string | null; assignedToName: string | null;
  backlogItemId: string | null; backlogItemBusinessId: string | null;
  duplicateOfId: string | null; duplicateOfBusinessId: string | null;
  reportedAt: string; resolvedAt: string | null; closedAt: string | null; version: number;
};
type UserOption = { id: string; displayName: string };
type BacklogItem = { id: string; businessId: string; title: string };

const nonClosingStatuses = defectStatuses.filter((status) => !["CLOSED", "DEFERRED", "DUPLICATE"].includes(status));
const closingStatuses = ["CLOSED", "DEFERRED", "DUPLICATE"] as const;
const emptyCreate = { source: "INTERNAL", severity: "MEDIUM", title: "", description: "", stepsToReproduce: "", backlogItemId: "", assignedToUserId: "" };

export function DefectWorkspace({ releaseId, projectId, canCreate, canEdit, canClose }: { releaseId: string; projectId: string; canCreate: boolean; canEdit: boolean; canClose: boolean }) {
  const [items, setItems] = useState<Defect[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyCreate);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<Defect | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [progressStatus, setProgressStatus] = useState("OPEN");
  const [progressAssignee, setProgressAssignee] = useState("");
  const [progressBacklogItem, setProgressBacklogItem] = useState("");
  const [closeStatus, setCloseStatus] = useState("CLOSED");
  const [closeDuplicateOf, setCloseDuplicateOf] = useState("");
  const first = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ releaseId, pageSize: "50" });
    if (statusFilter) params.set("status", statusFilter);
    if (severityFilter) params.set("severity", severityFilter);
    try {
      const response = await fetch(`/api/v4/defects?${params}`, { headers: { accept: "application/json" } });
      const body = await response.json() as { data?: Defect[]; meta?: { total: number }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Defects could not be loaded.");
      setItems(body.data ?? []); setTotal(body.meta?.total ?? 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Defects could not be loaded."); }
    finally { setLoading(false); }
  }, [releaseId, statusFilter, severityFilter]);

  useEffect(() => { const handle = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(handle); }, [load]);
  useEffect(() => {
    fetch("/api/v1/users", { headers: { accept: "application/json" } }).then((response) => response.json()).then((body: { data?: UserOption[] }) => setUsers(body.data ?? [])).catch(() => setUsers([]));
    fetch(`/api/v2/backlog?projectId=${encodeURIComponent(projectId)}&pageSize=100`, { headers: { accept: "application/json" } }).then((response) => response.json()).then((body: { data?: BacklogItem[] }) => setBacklogItems(body.data ?? [])).catch(() => setBacklogItems([]));
  }, [projectId]);
  useEffect(() => { if (open) window.setTimeout(() => first.current?.focus(), 0); }, [open]);

  const flash = (message: string) => { setSuccess(message); window.setTimeout(() => setSuccess(""), 3000); };

  const create = () => { setForm(emptyCreate); setErrors({}); setOpen(true); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setErrors({}); setError("");
    try {
      const response = await fetch("/api/v4/defects", {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...form, projectId, releaseId, backlogItemId: form.backlogItemId || null, assignedToUserId: form.assignedToUserId || null }),
      });
      const body = await response.json() as { error?: { message?: string; validationDetails?: Record<string, string> } };
      if (!response.ok) { setErrors(body.error?.validationDetails ?? {}); throw new Error(body.error?.message ?? "The defect could not be logged."); }
      setOpen(false); flash("Defect logged."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The defect could not be logged."); }
    finally { setSaving(false); }
  };

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id); setSelected(null); setDetailLoading(true); setError("");
    try {
      const response = await fetch(`/api/v4/defects/${id}`, { headers: { accept: "application/json" } });
      const body = await response.json() as { data?: Defect; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "The defect could not be loaded.");
      setSelected(body.data);
      setProgressStatus(body.data.status); setProgressAssignee(body.data.assignedToUserId ?? ""); setProgressBacklogItem(body.data.backlogItemId ?? "");
      setCloseStatus("CLOSED"); setCloseDuplicateOf("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The defect could not be loaded."); }
    finally { setDetailLoading(false); }
  }, []);

  const saveProgress = async () => {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v4/defects/${selected.id}`, {
        method: "PATCH", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ status: progressStatus, assignedToUserId: progressAssignee || null, backlogItemId: progressBacklogItem || null, version: selected.version }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The defect could not be updated.");
      flash("Defect updated."); await Promise.all([load(), openDetail(selected.id)]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The defect could not be updated."); }
    finally { setSaving(false); }
  };

  const closeDefect = async () => {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v4/defects/${selected.id}/close`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ status: closeStatus, duplicateOfId: closeStatus === "DUPLICATE" ? closeDuplicateOf : null, version: selected.version }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The defect could not be closed.");
      flash("Defect closed."); await Promise.all([load(), openDetail(selected.id)]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The defect could not be closed."); }
    finally { setSaving(false); }
  };

  return <div className="release-workspace">
    {success && <div className="success-banner" role="status">{success}</div>}
    <div className="workspace-actions"><span className="section-kicker">DEFECTS <small>{total}</small></span>{canCreate && <button className="primary-action" onClick={create}>+ Log defect</button>}</div>
    <div className="filter-bar">
      <label><span className="sr-only">Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{defectStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
      <label><span className="sr-only">Severity</span><select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}><option value="">All severities</option>{defectSeverities.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
    </div>
    {loading ? <div className="module-state" role="status"><span className="loader" />Loading defects…</div>
      : error && !items.length ? <div className="module-state error-state"><strong>Defects are unavailable</strong><p>{error}</p><button onClick={load}>Try again</button></div>
      : !items.length ? <div className="module-state empty-state"><span>◇</span><strong>No defects logged</strong><p>Defects raised from a failed or blocked execution appear here automatically.</p></div>
      : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Defect</th><th>Severity</th><th>Status</th><th>Assignee</th><th>Reported</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {items.map((defect) => <tr key={defect.id}>
          <td><button className="project-link" onClick={() => void openDetail(defect.id)}><strong>{defect.title}</strong><span>{defect.businessId}</span></button></td>
          <td><span className={`tone-badge tone-${toneForDefectSeverity(defect.severity)}`}>{titleCase(defect.severity)}</span></td>
          <td><span className={`tone-badge tone-${toneForDefectStatus(defect.status)}`}>{titleCase(defect.status)}</span></td>
          <td>{defect.assignedToName ?? "Unassigned"}</td>
          <td>{formatDateTime(defect.reportedAt)}</td>
          <td><button className="row-action" onClick={() => void openDetail(defect.id)}>Open</button></td>
        </tr>)}
      </tbody></table></div>}

    {selectedId && <div className="feasibility-detail" style={{ marginTop: 14 }}>
      {detailLoading || !selected ? <div className="module-state" role="status"><span className="loader" />Loading defect…</div> : <>
        <div className="signoff-panel-header"><span className="section-kicker">{selected.businessId} · {titleCase(selected.source)}</span><h4>{selected.title}</h4></div>
        <div className="release-summary-strip">
          <div><span>Severity</span><strong><span className={`tone-badge tone-${toneForDefectSeverity(selected.severity)}`}>{titleCase(selected.severity)}</span></strong></div>
          <div><span>Status</span><strong><span className={`tone-badge tone-${toneForDefectStatus(selected.status)}`}>{titleCase(selected.status)}</span></strong></div>
          <div><span>Reported by</span><strong>{selected.reportedByName ?? "—"}</strong></div>
          <div><span>Fix item</span><strong>{selected.backlogItemBusinessId ?? "—"}</strong></div>
        </div>
        {selected.description && <p style={{ marginTop: 12, fontSize: 10, color: "#5e6f65", lineHeight: 1.6 }}>{selected.description}</p>}
        {selected.stepsToReproduce && <blockquote style={{ margin: "10px 0 0", padding: "10px 12px", borderLeft: "3px solid var(--brand)", background: "#f5f9f6", fontSize: 9.5 }}>{selected.stepsToReproduce}</blockquote>}
        {selected.duplicateOfBusinessId && <p style={{ marginTop: 8, fontSize: 9, color: "#8b742d" }}>Duplicate of {selected.duplicateOfBusinessId}</p>}

        {canEdit && !closingStatuses.includes(selected.status as typeof closingStatuses[number]) && <div className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Status"><select value={progressStatus} onChange={(event) => setProgressStatus(event.target.value)}>{nonClosingStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
          <Field label="Assignee"><select value={progressAssignee} onChange={(event) => setProgressAssignee(event.target.value)}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></Field>
          <Field label="Fix Backlog item"><select value={progressBacklogItem} onChange={(event) => setProgressBacklogItem(event.target.value)}><option value="">None</option>{backlogItems.map((item) => <option key={item.id} value={item.id}>{item.businessId} · {item.title}</option>)}</select></Field>
          <div className="wide"><button type="button" className="primary-action" onClick={() => void saveProgress()} disabled={saving}>{saving ? "Saving…" : "Update defect"}</button></div>
        </div>}

        {canClose && !closingStatuses.includes(selected.status as typeof closingStatuses[number]) && <div className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Close as"><select value={closeStatus} onChange={(event) => setCloseStatus(event.target.value)}>{closingStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
          {closeStatus === "DUPLICATE" && <Field label="Duplicate of"><input value={closeDuplicateOf} onChange={(event) => setCloseDuplicateOf(event.target.value)} placeholder="Defect ID" /></Field>}
          <div className="wide"><button type="button" className="secondary-action" onClick={() => void closeDefect()} disabled={saving}>{saving ? "Closing…" : `Mark ${titleCase(closeStatus)}`}</button></div>
        </div>}
      </>}
    </div>}

    {open && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
      <div className="product-dialog project-dialog" role="dialog" aria-modal="true" aria-labelledby="defect-form-title">
        <form onSubmit={save}>
          <div className="dialog-header"><div><span className="section-kicker">NEW DEFECT</span><h2 id="defect-form-title">Log a defect</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
          <div className="form-grid">
            <Field label="Title" error={errors.title} required><input ref={first} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></Field>
            <Field label="Severity" error={errors.severity}><select value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))}>{defectSeverities.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
            <Field label="Assignee" error={errors.assignedToUserId}><select value={form.assignedToUserId} onChange={(event) => setForm((current) => ({ ...current, assignedToUserId: event.target.value }))}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></Field>
            <Field label="Fix Backlog item" error={errors.backlogItemId}><select value={form.backlogItemId} onChange={(event) => setForm((current) => ({ ...current, backlogItemId: event.target.value }))}><option value="">None</option>{backlogItems.map((item) => <option key={item.id} value={item.id}>{item.businessId} · {item.title}</option>)}</select></Field>
            <Field label="Description" wide><textarea rows={2} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
            <Field label="Steps to reproduce" wide><textarea rows={2} value={form.stepsToReproduce} onChange={(event) => setForm((current) => ({ ...current, stepsToReproduce: event.target.value }))} /></Field>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setOpen(false)}>Cancel</button><button className="primary-action" disabled={saving}>{saving ? "Logging…" : "Log defect"}</button></div>
        </form>
      </div>
    </div>}
  </div>;
}

function Field({ label, error, wide, required, children }: { label: string; error?: string; wide?: boolean; required?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "field wide" : "field"}><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}{error && <small role="alert">{error}</small>}</label>;
}
