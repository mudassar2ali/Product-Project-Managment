"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dependencyTypes } from "./stage2-contract";

type Item = { id: string; businessId: string; title: string; projectId: string; projectName: string; origin: string; itemType: string; status: string; version: number };
type Dependency = { id: string; dependencyType: string; origin: string; predecessorId: string; predecessorBusinessId: string; predecessorTitle: string; predecessorStatus: string; successorId: string; successorBusinessId: string; successorTitle: string; successorStatus: string };

export function DependencyCenter({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [predecessorId, setPredecessorId] = useState("");
  const [dependencyType, setDependencyType] = useState("BLOCKS");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/v2/backlog?pageSize=100");
    const body = await response.json();
    setItems(response.ok ? body.data ?? [] : []);
    setLoading(false);
  }, []);
  useEffect(() => { const timer = setTimeout(loadItems, 0); return () => clearTimeout(timer); }, [loadItems]);

  const open = async (item: Item) => {
    setMessage(""); setIsError(false); setPredecessorId("");
    const response = await fetch(`/api/v2/backlog/${item.id}/dependencies`);
    const body = await response.json();
    if (!response.ok) { setMessage(body.error?.message ?? "Dependencies could not be loaded."); setIsError(true); return; }
    setSelected({ ...item, version: body.data.item.version });
    setDependencies(body.data.dependencies ?? []);
  };
  const candidates = useMemo(() => items.filter(item => selected && item.id !== selected.id && item.projectId === selected.projectId && item.origin === selected.origin), [items, selected]);
  const unresolved = dependencies.filter(dependency => dependency.successorId === selected?.id && dependency.dependencyType !== "RELATES_TO" && dependency.predecessorStatus !== "DONE");

  const add = async () => {
    if (!selected || !predecessorId) return;
    setSaving(true); setMessage(""); setIsError(false);
    const response = await fetch(`/api/v2/backlog/${selected.id}/dependencies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ predecessorId, dependencyType, version: selected.version }) });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error?.message ?? "Dependency could not be added."); setIsError(true); }
    else { setSelected({ ...selected, version: body.data.version }); setMessage("Dependency added with cycle validation."); setPredecessorId(""); await refresh(selected.id, body.data.version); }
    setSaving(false);
  };
  const refresh = async (id: string, version: number) => {
    const response = await fetch(`/api/v2/backlog/${id}/dependencies`); const body = await response.json();
    if (response.ok) { setDependencies(body.data.dependencies ?? []); setSelected(current => current ? { ...current, version } : current); }
  };
  const remove = async (dependency: Dependency) => {
    if (!selected || !confirm("Remove this dependency?")) return;
    const response = await fetch(`/api/v2/backlog/${selected.id}/dependencies/${dependency.id}?version=${selected.version}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error?.message ?? "Dependency could not be removed."); setIsError(true); return; }
    setMessage("Dependency removed."); setIsError(false); await refresh(selected.id, body.data.version);
  };

  return <section className="dependency-workspace">
    <div className="portfolio-toolbar"><div><span className="section-kicker">DELIVERY RELATIONSHIPS</span><h2>Dependencies &amp; Readiness</h2></div></div>
    {loading ? <div className="module-state"><span className="loader" />Loading relationships…</div> : !items.length ? <div className="module-state empty-state"><strong>No work items available</strong><p>Create local Backlog work before defining dependencies.</p></div> : <div className="dependency-layout">
      <div className="dependency-selector" aria-label="Backlog work items">{items.map(item => <button key={item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => open(item)}><span>{item.businessId} · {item.itemType}</span><strong>{item.title}</strong><small>{item.projectName} · {item.status}</small></button>)}</div>
      {!selected ? <div className="story-empty"><strong>Select a work item</strong><p>Review incoming and outgoing relationships or add a governed predecessor.</p></div> : <div className="dependency-editor">
        <header><div><span>{selected.businessId} · {selected.origin === "LOCAL" ? "Local planning" : "Azure DevOps · read-only"}</span><h3>{selected.title}</h3></div><b>{dependencies.length} relationships</b></header>
        {unresolved.length > 0 && <div className="dependency-warning" role="status"><strong>{unresolved.length} unresolved prerequisite{unresolved.length === 1 ? "" : "s"}</strong><span>This item cannot be treated as Ready until blocking predecessors are Done.</span></div>}
        {canEdit && selected.origin === "LOCAL" && <div className="dependency-form"><label><span>Predecessor</span><select value={predecessorId} onChange={event => setPredecessorId(event.target.value)}><option value="">Select work item</option>{candidates.map(item => <option key={item.id} value={item.id}>{item.businessId} · {item.title} · {item.status}</option>)}</select></label><label><span>Relationship</span><select value={dependencyType} onChange={event => setDependencyType(event.target.value)}>{dependencyTypes.map(type => <option key={type}>{type}</option>)}</select></label><button className="primary-action" onClick={add} disabled={saving || !predecessorId}>{saving ? "Validating…" : "Add dependency"}</button></div>}
        {!dependencies.length ? <div className="criteria-empty">No dependencies have been recorded.</div> : <div className="dependency-list">{dependencies.map(dependency => { const incoming = dependency.successorId === selected.id; return <article key={dependency.id}><span className={`dependency-direction ${incoming ? "incoming" : "outgoing"}`}>{incoming ? "Incoming" : "Outgoing"}</span><div><strong>{incoming ? dependency.predecessorTitle : dependency.successorTitle}</strong><span>{incoming ? dependency.predecessorBusinessId : dependency.successorBusinessId} · {dependency.dependencyType.replaceAll("_", " ")}</span></div><b className={incoming && dependency.predecessorStatus !== "DONE" && dependency.dependencyType !== "RELATES_TO" ? "unresolved" : ""}>{incoming ? dependency.predecessorStatus : dependency.successorStatus}</b>{canEdit && selected.origin === "LOCAL" && dependency.origin === "LOCAL" && <button onClick={() => remove(dependency)}>Remove</button>}</article>; })}</div>}
        {message && <div className={isError ? "form-error" : "success-banner"} role="status">{message}</div>}
        <p className="dependency-note">Cycle checks follow the full relationship chain. Dependencies must remain inside the same Project and source.</p>
      </div>}
    </div>}
  </section>;
}
