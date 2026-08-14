"use client";

import { useEffect, useState } from "react";

type Delivery = {
  backlog: { available: boolean; reason?: string; total?: number; ready?: number; blockers?: number; openBugs?: number; unmapped?: number; sourceMissing?: number; stale?: number };
  sprints: { available: boolean; reason?: string; current?: { active: number; atRisk: number; blocked: number; unavailable: number; averageProgress: number | null }; history?: { velocityAverage: number | null; evidenceSprints: number; carryoverCount: number; carryoverPoints: number } };
  attention: Array<{ kind: string; businessId: string; title: string; signal: string; dueDate: string | null; destination: string }>;
};

type DashboardData = {
  portfolio: { products: number; projects: number };
  health: { onTrack: number; atRisk: number; critical: number };
  milestones: { total: number; overdue: number; upcoming: number };
  raid: { total: number; attention: number };
  ideas: { total: number; approved: number; review: number };
  progress: { avgProgress: number; avgDevelopment: number };
  delivery: Delivery;
  attention: Array<{ kind: string; businessId: string; title: string; signal: string; dueDate: string | null; destination: string }>;
  calculatedAt: string;
};

export function ExecutiveDashboard({ navigate, availableModules }: { navigate: (module: string) => void; availableModules: string[] }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/v1/dashboard")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message);
        setData(body.data);
      })
      .catch((caught) => setError(caught.message));
  }, []);

  if (error) return <div className="module-state error-state">{error}</div>;
  if (!data) return <div className="module-state"><span className="loader" />Loading portfolio evidence…</div>;

  const canNavigate = (module: string) => availableModules.includes(module);
  const open = (module: string) => { if (canNavigate(module)) navigate(module); };
  const deliveryAttention = data.delivery.attention.length;
  const cards = [
    ["Products", data.portfolio.products, "Products"],
    ["Projects", data.portfolio.projects, "Projects"],
    ["Average progress", `${data.progress.avgProgress}%`, "Projects"],
    ["Needs attention", data.health.atRisk + data.health.critical + data.milestones.overdue + data.raid.attention + deliveryAttention, "RAID"],
    ...(data.delivery.backlog.available ? [["Backlog items", data.delivery.backlog.total ?? 0, "Backlog"]] : []),
    ...(data.delivery.sprints.available ? [["Active Sprints", data.delivery.sprints.current?.active ?? 0, "Sprints"]] : []),
  ] as Array<[string, string | number, string]>;

  return <div className="executive-dashboard">
    <section className="kpi-grid delivery-kpi-grid">
      {cards.map(([label, value, module]) => <button key={label} onClick={() => open(module)} disabled={!canNavigate(module)}>
        <span>{label}</span><strong>{value}</strong><small>{canNavigate(module) ? "View evidence →" : "Summary only"}</small>
      </button>)}
    </section>
    <section className="dashboard-grid">
      <article className="dashboard-panel">
        <div className="panel-title"><div><span className="section-kicker">DELIVERY HEALTH</span><h2>Project portfolio</h2></div><b>{data.progress.avgDevelopment}% development</b></div>
        <div className="health-bars">{[["On track", data.health.onTrack, "good"], ["At risk", data.health.atRisk, "warn"], ["Delayed / blocked", data.health.critical, "bad"]].map(([label, value, tone]) => <div key={label}><span>{label}</span><i><b className={String(tone)} style={{ width: `${data.portfolio.projects ? Number(value) / data.portfolio.projects * 100 : 0}%` }} /></i><strong>{value}</strong></div>)}</div>
      </article>
      <article className="dashboard-panel">
        <div className="panel-title"><div><span className="section-kicker">FORWARD VIEW</span><h2>Governance pipeline</h2></div></div>
        <div className="pipeline-metrics">
          <button onClick={() => open("Milestones")} disabled={!canNavigate("Milestones")}><strong>{data.milestones.overdue}</strong><span>Overdue milestones</span></button>
          <button onClick={() => open("Milestones")} disabled={!canNavigate("Milestones")}><strong>{data.milestones.upcoming}</strong><span>Next 30 days</span></button>
          <button onClick={() => open("Ideas")} disabled={!canNavigate("Ideas")}><strong>{data.ideas.review}</strong><span>Ideas in review</span></button>
          <button onClick={() => open("Ideas")} disabled={!canNavigate("Ideas")}><strong>{data.ideas.approved}</strong><span>Approved ideas</span></button>
        </div>
      </article>
    </section>
    <PortfolioDeliveryPulse delivery={data.delivery} open={open} canNavigate={canNavigate} />
    <section className="dashboard-panel attention-panel">
      <div className="panel-title"><div><span className="section-kicker">MANAGEMENT ATTENTION</span><h2>Exceptions requiring action</h2></div><span>Calculated {new Date(data.calculatedAt).toLocaleString()}</span></div>
      {!data.attention.length ? <div className="module-state compact-state"><strong>No current exceptions</strong><p>At-risk Projects, delivery blockers, open Bugs, unhealthy Sprints, overdue milestones and critical RAID items appear here.</p></div> : <div className="attention-table">{data.attention.map((item, index) => <button key={item.businessId + index} onClick={() => open(item.destination)} disabled={!canNavigate(item.destination)}><b>{item.kind}</b><div><strong>{item.title}</strong><span>{item.businessId}{item.dueDate ? ` · ${item.dueDate}` : ""}</span></div><em>{item.signal}</em><span>{canNavigate(item.destination) ? "Open →" : "Summary"}</span></button>)}</div>}
    </section>
  </div>;
}

function PortfolioDeliveryPulse({ delivery, open, canNavigate }: { delivery: Delivery; open: (module: string) => void; canNavigate: (module: string) => boolean }) {
  return <section className="portfolio-delivery-grid" aria-label="Stage 2 portfolio delivery evidence">
    <article className="dashboard-panel">
      <div className="panel-title"><div><span className="section-kicker">STAGE 2 BACKLOG</span><h2>Portfolio readiness</h2></div>{delivery.backlog.available && <button onClick={() => open("Backlog")} disabled={!canNavigate("Backlog")}>Open Backlog →</button>}</div>
      {!delivery.backlog.available ? <Unavailable reason={delivery.backlog.reason} /> : <div className="delivery-pulse-metrics">
        <Metric label="Ready" value={delivery.backlog.ready ?? 0} detail={`of ${delivery.backlog.total ?? 0} items`} />
        <Metric label="Blockers" value={delivery.backlog.blockers ?? 0} detail="Active" attention={Number(delivery.backlog.blockers ?? 0) > 0} />
        <Metric label="Open Bugs" value={delivery.backlog.openBugs ?? 0} detail="Not completed" attention={Number(delivery.backlog.openBugs ?? 0) > 0} />
        <Metric label="Source attention" value={(delivery.backlog.unmapped ?? 0) + (delivery.backlog.sourceMissing ?? 0) + (delivery.backlog.stale ?? 0)} detail={`${delivery.backlog.unmapped ?? 0} unmapped · ${delivery.backlog.sourceMissing ?? 0} missing · ${delivery.backlog.stale ?? 0} stale`} attention={(delivery.backlog.unmapped ?? 0) + (delivery.backlog.sourceMissing ?? 0) + (delivery.backlog.stale ?? 0) > 0} />
      </div>}
    </article>
    <article className="dashboard-panel">
      <div className="panel-title"><div><span className="section-kicker">STAGE 2 SPRINTS</span><h2>Delivery pulse</h2></div>{delivery.sprints.available && <button onClick={() => open("Sprints")} disabled={!canNavigate("Sprints")}>Open Sprints →</button>}</div>
      {!delivery.sprints.available ? <Unavailable reason={delivery.sprints.reason} /> : <div className="delivery-pulse-metrics">
        <Metric label="Active" value={delivery.sprints.current?.active ?? 0} detail={`${delivery.sprints.current?.unavailable ?? 0} without metric evidence`} />
        <Metric label="Average completion" value={delivery.sprints.current?.averageProgress === null || delivery.sprints.current?.averageProgress === undefined ? "—" : `${delivery.sprints.current.averageProgress}%`} detail="Active metric snapshots" />
        <Metric label="Velocity" value={delivery.sprints.history?.velocityAverage ?? "—"} detail={`${delivery.sprints.history?.evidenceSprints ?? 0} completed Sprints`} />
        <Metric label="Carryover" value={delivery.sprints.history?.carryoverCount ?? 0} detail={`${delivery.sprints.history?.carryoverPoints ?? 0} points`} attention={Number(delivery.sprints.history?.carryoverCount ?? 0) > 0} />
      </div>}
    </article>
  </section>;
}

function Metric({ label, value, detail, attention = false }: { label: string; value: string | number; detail: string; attention?: boolean }) {
  return <div className={attention ? "attention" : ""}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Unavailable({ reason }: { reason?: string }) {
  return <div className="evidence-unavailable"><strong>Evidence unavailable</strong><span>{reason ?? "The current permissions do not expose this source."}</span></div>;
}
