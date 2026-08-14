"use client";

import { useEffect, useMemo, useState } from "react";

const foundationReports = [
  ["products", "Product Portfolio"],
  ["projects", "Project Portfolio"],
  ["health", "Project Health"],
  ["progress", "Project Progress"],
  ["raid", "RAID Register"],
  ["milestones", "Milestones"],
  ["approvals", "Pending Approvals"],
  ["azure", "Azure Development Progress"],
] as const;

const deliveryReports = [
  ["backlog-composition", "Backlog Composition"],
  ["story-readiness", "Story Readiness"],
  ["sprint-performance", "Sprint Performance"],
  ["velocity", "Velocity by Project / Team"],
  ["carryover", "Sprint Carryover"],
  ["delivery-attention", "Blockers & Open Bugs"],
  ["burndown", "Daily Burndown"],
  ["azure-coverage", "Azure Coverage & Freshness"],
] as const;

type ReportData = {
  title: string;
  description: string;
  columns: readonly string[];
  rows: Record<string, string | number>[];
  total: number;
  generatedAt: string;
  sourceFreshness: string;
  parameters: { page: number; pageSize: number };
  summary: Array<{ label: string; value: number; detail: string }>;
};

export function ReportCenter({ canExport }: { canExport: boolean }) {
  const [key, setKey] = useState("products");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setError("");
      fetch(`/api/v1/reports/${key}?q=${encodeURIComponent(q)}&page=${page}&pageSize=25`, { signal: controller.signal })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error?.message);
          setData(body.data);
        })
        .catch((caught) => { if (caught.name !== "AbortError") setError(caught.message); });
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, q, page]);

  const summaryMax = useMemo(() => Math.max(1, ...(data?.summary ?? []).map((item) => Math.abs(item.value))), [data]);
  const loading = () => { setData(null); setError(""); };
  const choose = (reportKey: string) => { loading(); setKey(reportKey); setPage(1); };

  return <div className="report-center"><aside className="report-catalog" aria-label="Available reports"><span className="section-kicker">REPORT LIBRARY</span><div className="report-group-label">CORE MANAGEMENT</div>{foundationReports.map(([id, label]) => <button className={key === id ? "active" : ""} key={id} onClick={() => choose(id)}>{label}<span>→</span></button>)}<div className="report-group-label">STAGE 2 DELIVERY</div>{deliveryReports.map(([id, label]) => <button className={key === id ? "active" : ""} key={id} onClick={() => choose(id)}>{label}<span>→</span></button>)}</aside><section className="report-workspace">{error ? <div className="module-state error-state">{error}</div> : !data ? <div className="module-state"><span className="loader" />Generating report…</div> : <><header className="report-header"><div><span className="section-kicker">CONTROLLED REPORT</span><h2>{data.title}</h2><p>{data.description}</p></div>{canExport && <a className="primary-action" href={`/api/v1/reports/${key}?q=${encodeURIComponent(q)}&format=csv`}>Export CSV</a>}</header><div className="report-controls"><label className="search-field"><span>Filter this report</span><input value={q} onChange={(event) => { loading(); setQ(event.target.value); setPage(1); }} placeholder="Search all report fields" /></label><div><strong>{data.total}</strong> records · {data.sourceFreshness}</div></div>{data.summary.length > 0 && <section className="report-summary" role="img" aria-label={`${data.title} visual and text summary`}>{data.summary.map((item) => <article key={item.label} aria-label={`${item.label}: ${item.value}. ${item.detail}`}><div><span>{item.label}</span><strong>{item.value}</strong></div><i aria-hidden="true"><b style={{ width: `${Math.max(2, Math.abs(item.value) / summaryMax * 100)}%` }} /></i><small>{item.detail}</small></article>)}</section>}<div className="report-table-wrap"><table className="report-table"><thead><tr>{data.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{data.rows.map((row, rowIndex) => <tr key={rowIndex}>{data.columns.map((column) => <td key={column}>{row[column]}</td>)}</tr>)}</tbody></table>{!data.rows.length && <div className="module-state compact-state"><strong>No matching evidence</strong><p>Change the filter or select another report.</p></div>}</div><footer className="report-footer"><span>Generated {new Date(data.generatedAt).toLocaleString()}</span><div><button disabled={page === 1} onClick={() => { loading(); setPage((current) => current - 1); }}>Previous</button><b>Page {page}</b><button disabled={page * 25 >= data.total} onClick={() => { loading(); setPage((current) => current + 1); }}>Next</button></div></footer></>}</section></div>;
}
