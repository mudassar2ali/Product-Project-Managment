"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { releaseStatuses, releaseTypes } from "./stage4-contract";
import { formatDate, titleCase, toneForReadiness, toneForReleaseStatus } from "./release-format";

type Project = { id: string; name: string };
type UserOption = { id: string; displayName: string };
type ReleaseSummary = {
  id: string; businessId: string; projectId: string; projectName: string; name: string;
  releaseType: string; targetVersion: string; plannedDate: string | null; status: string;
  ownerName: string | null; readiness: string | null; updatedAt: string;
};

const emptyForm = { projectId: "", name: "", releaseType: "MINOR", targetVersion: "", plannedDate: "", ownerUserId: "" };

export function ReleasePortfolio({ canCreate, onOpen }: { canCreate: boolean; onOpen: (releaseId: string) => void }) {
  const [items, setItems] = useState<ReleaseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [q, setQ] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ pageSize: "50" });
    if (q.trim()) params.set("q", q.trim());
    if (projectFilter) params.set("projectId", projectFilter);
    if (statusFilter) params.set("status", statusFilter);
    try {
      const response = await fetch(`/api/v4/releases?${params}`, { headers: { accept: "application/json" } });
      const body = await response.json() as { data?: ReleaseSummary[]; meta?: { total: number }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Releases could not be loaded.");
      setItems(body.data ?? []); setTotal(body.meta?.total ?? 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Releases could not be loaded."); }
    finally { setLoading(false); }
  }, [q, projectFilter, statusFilter]);

  useEffect(() => { const handle = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(handle); }, [load]);
  useEffect(() => {
    fetch("/api/v1/projects?pageSize=100&sort=name", { headers: { accept: "application/json" } })
      .then((response) => response.json()).then((body: { data?: Project[] }) => setProjects(body.data ?? [])).catch(() => setProjects([]));
    fetch("/api/v1/users", { headers: { accept: "application/json" } })
      .then((response) => response.json()).then((body: { data?: UserOption[] }) => setUsers(body.data ?? [])).catch(() => setUsers([]));
  }, []);
  useEffect(() => { if (open) window.setTimeout(() => first.current?.focus(), 0); }, [open]);

  const change = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const create = () => { setForm({ ...emptyForm, projectId: projects[0]?.id ?? "" }); setErrors({}); setOpen(true); };

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setErrors({}); setError("");
    try {
      const response = await fetch("/api/v4/releases", {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...form, plannedDate: form.plannedDate || null, ownerUserId: form.ownerUserId || null }),
      });
      const body = await response.json() as { error?: { message?: string; validationDetails?: Record<string, string> } };
      if (!response.ok) { setErrors(body.error?.validationDetails ?? {}); throw new Error(body.error?.message ?? "The Release could not be created."); }
      setOpen(false); setSuccess("Release created."); await load();
      window.setTimeout(() => setSuccess(""), 3000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The Release could not be created."); }
    finally { setSaving(false); }
  };

  return <section className="portfolio-module" aria-labelledby="release-list-title">
    <div className="portfolio-toolbar">
      <div><span className="section-kicker">RELEASE PORTFOLIO</span><h2 id="release-list-title">Releases <small>{total}</small></h2></div>
      {canCreate && <button className="primary-action" onClick={create} disabled={!projects.length}>+ New Release</button>}
    </div>
    {success && <div className="success-banner" role="status">{success}</div>}
    <div className="filter-bar">
      <label className="search-field"><span className="sr-only">Search Releases</span><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name or ID" /></label>
      <label><span className="sr-only">Project</span><select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="">All Projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label><span className="sr-only">Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{releaseStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
    </div>
    {loading ? <div className="module-state" role="status"><span className="loader" />Loading Releases…</div>
      : error && !items.length ? <div className="module-state error-state"><strong>Releases are unavailable</strong><p>{error}</p><button onClick={load}>Try again</button></div>
      : !items.length ? <div className="module-state empty-state"><span>◇</span><strong>No Releases found</strong><p>{projects.length ? "Create a Release beneath an active Project." : "Create a Project before adding its first Release."}</p>{canCreate && projects.length > 0 && <button onClick={create}>Create Release</button>}</div>
      : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Release</th><th>Project</th><th>Type</th><th>Target version</th><th>Status</th><th>Readiness</th><th>Owner</th><th>Planned date</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {items.map((release) => <tr key={release.id}>
          <td><button className="project-link" onClick={() => onOpen(release.id)}><strong>{release.name}</strong><span>{release.businessId}</span></button></td>
          <td>{release.projectName}</td>
          <td>{titleCase(release.releaseType)}</td>
          <td>{release.targetVersion || "—"}</td>
          <td><span className={`tone-badge tone-${toneForReleaseStatus(release.status)}`}>{titleCase(release.status)}</span></td>
          <td><ReadinessBadge readiness={release.readiness} /></td>
          <td>{release.ownerName ?? "Unassigned"}</td>
          <td>{formatDate(release.plannedDate)}</td>
          <td><button className="row-action" onClick={() => onOpen(release.id)}>Open</button></td>
        </tr>)}
      </tbody></table></div>}
    {open && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
      <div className="product-dialog project-dialog" role="dialog" aria-modal="true" aria-labelledby="release-form-title">
        <form onSubmit={save}>
          <div className="dialog-header"><div><span className="section-kicker">NEW RELEASE</span><h2 id="release-form-title">Create Release</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
          <div className="form-grid">
            <Field label="Release name" error={errors.name} required><input ref={first} value={form.name} onChange={(event) => change("name", event.target.value)} /></Field>
            <Field label="Project" error={errors.projectId} required><select value={form.projectId} onChange={(event) => change("projectId", event.target.value)}><option value="">Select Project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
            <Field label="Release type" error={errors.releaseType}><select value={form.releaseType} onChange={(event) => change("releaseType", event.target.value)}>{releaseTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
            <Field label="Target version"><input value={form.targetVersion} onChange={(event) => change("targetVersion", event.target.value)} /></Field>
            <Field label="Planned date" error={errors.plannedDate}><input type="date" value={form.plannedDate} onChange={(event) => change("plannedDate", event.target.value)} /></Field>
            <Field label="Owner" error={errors.ownerUserId}><select value={form.ownerUserId} onChange={(event) => change("ownerUserId", event.target.value)}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></Field>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setOpen(false)}>Cancel</button><button className="primary-action" disabled={saving}>{saving ? "Creating…" : "Create Release"}</button></div>
        </form>
      </div>
    </div>}
  </section>;
}

export function ReadinessBadge({ readiness }: { readiness: string | null | undefined }) {
  if (!readiness) return <span className="tone-badge tone-neutral">Not calculated</span>;
  return <span className={`tone-badge tone-${toneForReadiness(readiness)}`}>{titleCase(readiness)}</span>;
}

function Field({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="field"><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}{error && <small role="alert">{error}</small>}</label>;
}
