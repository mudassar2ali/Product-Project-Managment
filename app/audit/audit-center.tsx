"use client";

import { useEffect, useRef, useState } from "react";

type Entry = { id:string;entityType:string;entityId:string;action:string;actor:string;source:string;correlationId:string;occurredAt:string;before:unknown;after:unknown };
type Data = { rows:Entry[];total:number;summary:{total:number;entities:number;integrations:number;today:number;unattributedApplicationEvents:number};generatedAt:string;retention:string };
const entityTypes = ["Product","Project","Milestone","RAID","Idea","AzureConnection","AzureProjectLink","BacklogItem","Sprint","GovernanceDocument","GovernanceDocumentVersion","Requirement","RequirementRevision","SignoffRequest","SignoffLane","SignoffCondition","RaciMatrix","TechnicalFeasibilityAssessment","TechnicalFeasibilityRevision"];
const actions = ["CREATE","UPDATE","ARCHIVE","REVIEW","CONVERT","ESCALATE","CRITERIA_REPLACE","DEPENDENCY_ADD","DEPENDENCY_REMOVE","ITEM_ASSIGN","ITEM_REMOVE","ITEM_REORDER","ACTIVATE","ACTIVE_SCOPE_ADD","ACTIVE_SCOPE_REMOVE","COMPLETE","ADVANCED_SYNC","ADVANCED_SYNC_FAILED","AZURE_SOURCE_MISSING","CREATE_REVISION","SECTIONS_REPLACE","SUBMIT_REVIEW","RELATIONSHIP_ADD","RELATIONSHIP_REMOVE","BACKLOG_LINK_ADD","BACKLOG_LINK_REMOVE","EVIDENCE_ADD","REQUEST","DECISION","STATUS_TRANSITION","CONDITION_WAIVE","CONDITION_PROGRESS","PUBLISH"];

export function AuditCenter() {
  const [q,setQ] = useState("");
  const [entity,setEntity] = useState("");
  const [action,setAction] = useState("");
  const [source,setSource] = useState("");
  const [from,setFrom] = useState("");
  const [to,setTo] = useState("");
  const [page,setPage] = useState(1);
  const [data,setData] = useState<Data|null>(null);
  const [selected,setSelected] = useState<Entry|null>(null);
  const [error,setError] = useState("");
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const parameters = new URLSearchParams({ q,entity,action,source,from,to,page:String(page) });
      fetch(`/api/v1/audit?${parameters}`, { signal:controller.signal })
        .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error?.message); setData(body.data); })
        .catch((caught) => { if (caught.name !== "AbortError") setError(caught.message); });
    }, 140);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q,entity,action,source,from,to,page]);

  useEffect(() => {
    if (!selected) return;
    close.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  const change = (callback: () => void) => { setData(null); setError(""); callback(); };
  if (error) return <div className="module-state error-state"><strong>Audit evidence unavailable</strong><p>{error}</p><button onClick={() => change(() => setPage(1))}>Try again</button></div>;
  if (!data) return <div className="module-state" role="status"><span className="loader" />Loading governed history…</div>;

  return <div className="audit-center">
    <section className="audit-summary">{[["Events",data.summary.total],["Entity types",data.summary.entities],["Today",data.summary.today],["Integration events",data.summary.integrations],["Legacy unattributed",data.summary.unattributedApplicationEvents]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
    <section className="audit-panel">
      <header className="audit-heading"><div><span className="section-kicker">IMMUTABLE HISTORY</span><h2>Governed change trail</h2></div><span>As of {new Date(data.generatedAt).toLocaleString()}</span></header>
      <div className="audit-filters operational-audit-filters">
        <label className="search-field"><span>Actor, record or correlation ID</span><input value={q} onChange={(event) => change(() => { setQ(event.target.value);setPage(1); })} placeholder="Search audit events" /></label>
        <label><span>Entity</span><select value={entity} onChange={(event) => change(() => { setEntity(event.target.value);setPage(1); })}><option value="">All entities</option>{entityTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Action</span><select value={action} onChange={(event) => change(() => { setAction(event.target.value);setPage(1); })}><option value="">All actions</option>{actions.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Source</span><select value={source} onChange={(event) => change(() => { setSource(event.target.value);setPage(1); })}><option value="">All sources</option><option>APPLICATION</option><option>AZURE_DEVOPS</option></select></label>
        <label><span>From</span><input type="date" value={from} max={to || undefined} onChange={(event) => change(() => { setFrom(event.target.value);setPage(1); })} /></label>
        <label><span>To</span><input type="date" value={to} min={from || undefined} onChange={(event) => change(() => { setTo(event.target.value);setPage(1); })} /></label>
      </div>
      <div className="audit-list">{data.rows.map((entry) => <button key={entry.id} onClick={() => setSelected(entry)}><time>{new Date(entry.occurredAt).toLocaleString()}</time><b>{entry.action}</b><div><strong>{entry.entityType}</strong><span>{entry.entityId}</span></div><div><strong>{entry.actor}</strong><span>{entry.source}</span></div><span>Inspect →</span></button>)}{!data.rows.length && <div className="module-state compact-state"><strong>No matching events</strong><p>Adjust the audit filters to widen the evidence set.</p></div>}</div>
      <footer className="report-footer"><span>{data.total} matching events · {data.retention}</span><div><button disabled={page===1} onClick={() => change(() => setPage((current) => current-1))}>Previous</button><b>Page {page}</b><button disabled={page*25>=data.total} onClick={() => change(() => setPage((current) => current+1))}>Next</button></div></footer>
    </section>
    {selected && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target===event.currentTarget) setSelected(null); }}><section className="audit-detail" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title"><header><div><span className="section-kicker">{selected.action} · {selected.source}</span><h2 id="audit-detail-title">{selected.entityType} change evidence</h2></div><button ref={close} onClick={() => setSelected(null)} aria-label="Close audit detail">×</button></header><dl><div><dt>Record</dt><dd>{selected.entityId}</dd></div><div><dt>Actor</dt><dd>{selected.actor}</dd></div><div><dt>Occurred</dt><dd>{new Date(selected.occurredAt).toLocaleString()}</dd></div><div><dt>Correlation ID</dt><dd>{selected.correlationId}</dd></div></dl><div className="audit-diff"><article><h3>Before</h3><pre>{selected.before ? JSON.stringify(selected.before,null,2) : "No prior value recorded"}</pre></article><article><h3>After</h3><pre>{selected.after ? JSON.stringify(selected.after,null,2) : "No resulting value recorded"}</pre></article></div></section></div>}
  </div>;
}
