"use client";

import { useCallback, useEffect, useState } from "react";

type OperationalData = {
  status: "HEALTHY" | "ATTENTION";
  controls: { databaseReachable:boolean;auditImmutable:boolean;rateLimits:string;telemetry:string };
  policies: Array<{key:string;category:string;integerValue:number|null;textValue:string|null;description:string;enforced:number}>;
  telemetry: { total:number;errors:number;rateLimited:number;averageDurationMs:number;maxDurationMs:number;operations:Array<{operation:string;requests:number;errors:number;rateLimited:number;averageDurationMs:number;maxDurationMs:number}> };
  sync: { succeeded:number;failed:number;averageDurationMs:number;pagesRead:number;itemsSeen:number;lastCompletedAt:string };
  leases: { active:number;expired:number };
  source: { linkedProjects:number;staleLinks:number;sourceMissing:number;unmapped:number };
  delivery: { blockedItems:number;openBugs:number;metricBlockers:number;carryoverItems:number;carryoverPoints:number };
  audit: { total:number;today:number;unattributedApplicationEvents:number;minimumRetentionDays:number;automaticDeletion:boolean };
  exceptions: Array<{operation:string;outcome:string;statusCode:number;entityType:string|null;entityId:string|null;correlationId:string;occurredAt:string;details:Record<string,unknown>}>;
  generatedAt: string;
};

export function OperationalControlCenter() {
  const [data, setData] = useState<OperationalData | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const load = useCallback(() => { setError(""); setData(null); setRefresh((value) => value + 1); }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v2/operations", { signal:controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error?.message); setData(body.data); })
      .catch((caught) => { if (caught.name !== "AbortError") setError(caught.message); });
    return () => controller.abort();
  }, [refresh]);

  if (error) return <section className="operational-control operational-error"><div><span className="section-kicker">STAGE 2 OPERATIONAL CONTROLS</span><strong>Control evidence unavailable</strong><p>{error}</p></div><button className="secondary-action" onClick={load}>Retry</button></section>;
  if (!data) return <section className="operational-control operational-loading" role="status"><span className="loader" /><div><strong>Loading operational evidence…</strong><p>Checking persisted audit, synchronization, freshness and capacity controls.</p></div></section>;

  return <section className="operational-control" aria-labelledby="operational-title">
    <header className="operational-heading"><div><span className="section-kicker">STAGE 2 · STEP 12</span><h2 id="operational-title">Operational control plane</h2><p>Persisted, sanitized evidence from the last 24 hours. No live Azure call is made by this view.</p></div><div><span className={`operational-status ${data.status === "HEALTHY" ? "healthy" : "attention"}`}>{data.status === "HEALTHY" ? "Controls healthy" : "Attention required"}</span><button className="secondary-action" onClick={load}>Refresh evidence</button></div></header>
    <div className="operational-kpis">
      <ControlMetric label="Control integrity" value={data.controls.auditImmutable && data.controls.databaseReachable ? "Enforced" : "Attention"} detail={`Audit ${data.controls.auditImmutable ? "immutable" : "not protected"} · ${data.controls.rateLimits}`} attention={!data.controls.auditImmutable || !data.controls.databaseReachable} />
      <ControlMetric label="Advanced sync" value={`${data.sync.succeeded} passed`} detail={`${data.sync.failed} failed · ${formatDuration(data.sync.averageDurationMs)} average`} attention={data.sync.failed > 0} />
      <ControlMetric label="Source integrity" value={`${data.source.staleLinks + data.source.sourceMissing + data.source.unmapped} signals`} detail={`${data.source.staleLinks} stale · ${data.source.sourceMissing} missing · ${data.source.unmapped} unmapped`} attention={data.source.staleLinks + data.source.sourceMissing + data.source.unmapped > 0} />
      <ControlMetric label="Delivery pressure" value={`${data.delivery.blockedItems} blocked`} detail={`${data.delivery.openBugs} open bugs · ${data.delivery.carryoverItems} carryover items · ${data.delivery.carryoverPoints} points`} attention={data.delivery.blockedItems > 0} />
      <ControlMetric label="API evidence" value={`${data.telemetry.total} requests`} detail={`${data.telemetry.errors} errors · ${data.telemetry.rateLimited} limited · ${formatDuration(data.telemetry.averageDurationMs)} average`} attention={data.telemetry.errors > 0 || data.telemetry.rateLimited > 0} />
    </div>
    <div className="operational-grid">
      <article className="operational-panel"><div className="operational-panel-title"><div><span className="section-kicker">CONTROLLED DEFAULTS</span><h3>Policies</h3></div><small>Enforced values are code-and-data aligned</small></div><div className="policy-list">{data.policies.map((policy) => <div key={policy.key}><div><strong>{policy.key.replaceAll("_", " ")}</strong><span>{policy.description}</span></div><b>{policy.integerValue ?? policy.textValue}</b><em>{policy.enforced ? "Enforced" : "Documented"}</em></div>)}</div></article>
      <article className="operational-panel"><div className="operational-panel-title"><div><span className="section-kicker">CRITICAL PATHS</span><h3>API latency and outcomes</h3></div><small>Sanitized scalar telemetry</small></div>{data.telemetry.operations.length ? <div className="operation-table"><div className="operation-table-head"><span>Operation</span><span>Requests</span><span>Errors</span><span>Average</span></div>{data.telemetry.operations.map((operation) => <div key={operation.operation}><strong>{operation.operation.replaceAll("_", " ")}</strong><span>{operation.requests}</span><span>{operation.errors + operation.rateLimited}</span><span>{formatDuration(operation.averageDurationMs)}</span></div>)}</div> : <HonestEmpty title="No critical-path telemetry yet" detail="Dashboard, Backlog, Sprint metric, export and advanced-sync requests will appear after use." />}</article>
    </div>
    <div className="operational-grid lower-grid">
      <article className="operational-panel"><div className="operational-panel-title"><div><span className="section-kicker">GOVERNANCE EVIDENCE</span><h3>Audit protection</h3></div><b>{data.audit.total} events</b></div><dl className="operational-facts"><div><dt>Immutable triggers</dt><dd>{data.controls.auditImmutable ? "Update and delete blocked" : "Attention required"}</dd></div><div><dt>Minimum retention</dt><dd>{data.audit.minimumRetentionDays} days · deletion {data.audit.automaticDeletion ? "enabled" : "disabled"}</dd></div><div><dt>New events today</dt><dd>{data.audit.today}</dd></div><div><dt>Legacy unattributed application events</dt><dd>{data.audit.unattributedApplicationEvents}</dd></div></dl></article>
      <article className="operational-panel"><div className="operational-panel-title"><div><span className="section-kicker">RECENT EXCEPTIONS</span><h3>Sanitized signals</h3></div><small>Last 24 hours</small></div>{data.exceptions.length ? <div className="exception-list">{data.exceptions.map((exception) => <article key={`${exception.correlationId}:${exception.occurredAt}`}><b>{exception.outcome}</b><div><strong>{exception.operation.replaceAll("_", " ")}</strong><span>{exception.entityType ?? "Operation"}{exception.entityId ? ` · ${exception.entityId}` : ""}</span></div><time>{new Date(exception.occurredAt).toLocaleString()}</time><code>{exception.correlationId}</code></article>)}</div> : <HonestEmpty title="No recent operational exceptions" detail="Rate-limit denials and controlled critical-path failures appear here without request bodies or credentials." />}</article>
    </div>
    <footer className="operational-footer"><span>{data.leases.active} active sync leases · {data.leases.expired} expired leases</span><span>Calculated {new Date(data.generatedAt).toLocaleString()}</span></footer>
  </section>;
}

function ControlMetric({ label, value, detail, attention = false }: { label:string;value:string;detail:string;attention?:boolean }) { return <article className={attention ? "attention" : ""}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function HonestEmpty({ title, detail }: { title:string;detail:string }) { return <div className="honest-empty"><strong>{title}</strong><p>{detail}</p></div>; }
function formatDuration(value: number) { return value >= 1000 ? `${Math.round(value / 100) / 10}s` : `${Math.round(value)}ms`; }
