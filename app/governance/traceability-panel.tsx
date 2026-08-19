"use client";

import { useCallback, useEffect, useState } from "react";

type CoverageEvidence = { value: number | null; numerator: number; denominator: number; method: string; sourceRevision: string; calculatedAt: string };
type TraceabilityItem = {
  id: string; businessId: string; requirementType: string; productId: string; projectId: string | null;
  title: string | null; governanceStatus: string | null; deliveryStatus: string; evidenceCount: number;
  evidence: Array<{ evidenceType: string; evidenceStatus: string; freshness: string }>;
};
type Option = { id: string; name: string; productId?: string };

export function TraceabilityPanel({ productId, projectId, onProjectChange }: { productId: string; projectId: string; onProjectChange: (projectId: string) => void }) {
  const [items, setItems] = useState<TraceabilityItem[]>([]);
  const [coverage, setCoverage] = useState<CoverageEvidence | null>(null);
  const [gaps, setGaps] = useState<TraceabilityItem[]>([]);
  const [calculatedAt, setCalculatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [products, setProducts] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [localProductId, setLocalProductId] = useState(productId);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const params = new URLSearchParams();
    if (localProductId) params.set("productId", localProductId);
    if (projectId) params.set("projectId", projectId);
    try {
      const response = await fetch(`/api/v3/traceability?${params}`, { headers: { accept: "application/json" } });
      const body = await response.json() as { data?: { items: TraceabilityItem[]; gaps: TraceabilityItem[]; coverage: CoverageEvidence }; meta?: { calculatedAt: string }; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "The traceability matrix could not be loaded.");
      setItems(body.data.items); setGaps(body.data.gaps); setCoverage(body.data.coverage); setCalculatedAt(body.meta?.calculatedAt ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The traceability matrix could not be loaded."); }
    finally { setLoading(false); }
  }, [localProductId, projectId]);

  useEffect(() => { const handle = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(handle); }, [load]);
  useEffect(() => {
    Promise.all([fetch("/api/v1/products?pageSize=100&sort=name"), fetch("/api/v1/projects?pageSize=100&sort=name")])
      .then(async ([productResponse, projectResponse]) => [await productResponse.json() as { data?: Option[] }, await projectResponse.json() as { data?: Option[] }])
      .then(([productBody, projectBody]) => { setProducts(productBody.data ?? []); setProjects(projectBody.data ?? []); })
      .catch(() => { setProducts([]); setProjects([]); });
  }, []);

  const filteredProjects = projects.filter((project) => !localProductId || project.productId === localProductId);
  const coveragePercent = coverage?.value !== null && coverage?.value !== undefined ? Math.round(coverage.value * 100) : null;

  return <section className="traceability-panel" aria-labelledby="traceability-panel-title">
    <div className="signoff-panel-header"><span className="section-kicker">GOVERNANCE · TRACEABILITY</span><h4 id="traceability-panel-title">Requirement traceability matrix</h4></div>
    <div className="filter-bar" aria-label="Traceability filters">
      <label><span className="sr-only">Filter by Product</span><select value={localProductId} onChange={(event) => { setLocalProductId(event.target.value); onProjectChange(""); }}><option value="">All products</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
      <label><span className="sr-only">Filter by Project</span><select value={projectId} onChange={(event) => onProjectChange(event.target.value)}><option value="">All projects</option>{filteredProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      {(localProductId || projectId) && <button className="text-action" onClick={() => { setLocalProductId(""); onProjectChange(""); }}>Clear</button>}
    </div>
    {error && <div className="form-error" role="alert">{error}<button className="text-action" onClick={() => setError("")}>Dismiss</button></div>}
    {loading ? <div className="module-state" role="status"><span className="loader" />Loading traceability matrix…</div> : <div className="raci-workspace">
      <div className="delivery-summary">
        <div><span>Coverage</span><strong>{coveragePercent !== null ? `${coveragePercent}%` : "—"}</strong></div>
        <div><span>Implemented</span><strong>{coverage?.numerator ?? 0} / {coverage?.denominator ?? 0}</strong></div>
        <div><span>Gaps</span><strong>{gaps.length}</strong></div>
        <div><span>Calculated</span><strong>{calculatedAt ? new Date(calculatedAt).toLocaleString() : "—"}</strong></div>
      </div>

      {gaps.length > 0 && <div className="raci-section"><div className="raci-section-title"><h5>Coverage gaps</h5></div><div className="table-shell"><table className="portfolio-table"><thead><tr><th>Requirement</th><th>Type</th><th>Governance</th><th>Delivery status</th></tr></thead><tbody>{gaps.map((item) => <tr key={item.id}><td><strong>{item.title ?? "Untitled"}</strong><span>{item.businessId}</span></td><td>{item.requirementType.replaceAll("_", " ")}</td><td><span className="neutral-badge">{item.governanceStatus ?? "—"}</span></td><td><span className="neutral-badge">{item.deliveryStatus.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div></div>}

      <div className="raci-section"><div className="raci-section-title"><h5>All requirements ({items.length})</h5></div>
        {!items.length ? <p className="drawer-empty">No Requirements match the current filters.</p> : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Requirement</th><th>Type</th><th>Governance</th><th>Delivery status</th><th>Evidence</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.title ?? "Untitled"}</strong><span>{item.businessId}</span></td><td>{item.requirementType.replaceAll("_", " ")}</td><td><span className="neutral-badge">{item.governanceStatus ?? "—"}</span></td><td><span className="neutral-badge">{item.deliveryStatus.replaceAll("_", " ")}</span></td><td>{item.evidenceCount}</td></tr>)}</tbody></table></div>}
      </div>
    </div>}
  </section>;
}
