"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { productPriorities, productStages, productStatuses } from "./product-contract";

type Product = {
  id: string; businessId: string; name: string; code: string; description: string; category: string;
  market: string; region: string; customerSegment: string; stage: string; startDate: string | null;
  targetLaunchDate: string | null; actualLaunchDate: string | null; status: string; priority: string;
  strategicObjective: string; businessValue: string; progress: number; notes: string; version: number; updatedAt: string;
};
type ApiError = { error?: { message?: string; validationDetails?: Record<string, string> } };

const emptyForm = {
  name: "", code: "", description: "", category: "General", market: "", region: "", customerSegment: "",
  stage: "Idea", startDate: "", targetLaunchDate: "", actualLaunchDate: "", status: "Active", priority: "Medium",
  strategicObjective: "", businessValue: "", progress: 0, notes: "",
};

export function ProductPortfolio({ canCreate, canEdit }: { canCreate: boolean; canEdit: boolean }) {
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [status, setStatus] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ pageSize: "50", sort: "name" });
    if (q.trim()) params.set("q", q.trim());
    if (stage) params.set("stage", stage);
    if (status) params.set("status", status);
    try {
      const response = await fetch(`/api/v1/products?${params}`, { headers: { accept: "application/json" } });
      const body = await response.json() as { data?: Product[]; meta?: { total: number }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Products could not be loaded.");
      setItems(body.data ?? []); setTotal(body.meta?.total ?? 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Products could not be loaded."); }
    finally { setLoading(false); }
  }, [q, stage, status]);

  useEffect(() => { const handle = window.setTimeout(load, 180); return () => window.clearTimeout(handle); }, [load]);
  useEffect(() => { if (dialogOpen) window.setTimeout(() => firstFieldRef.current?.focus(), 0); }, [dialogOpen]);

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setFieldErrors({}); setDialogOpen(true); };
  const openEdit = (product: Product) => {
    setEditing(product);
    setForm({
      name: product.name, code: product.code, description: product.description, category: product.category,
      market: product.market, region: product.region, customerSegment: product.customerSegment, stage: product.stage,
      startDate: product.startDate ?? "", targetLaunchDate: product.targetLaunchDate ?? "", actualLaunchDate: product.actualLaunchDate ?? "",
      status: product.status, priority: product.priority, strategicObjective: product.strategicObjective,
      businessValue: product.businessValue, progress: product.progress, notes: product.notes,
    });
    setFieldErrors({}); setDialogOpen(true);
  };

  const update = (field: string, value: string | number) => setForm((current) => ({ ...current, [field]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setFieldErrors({}); setError("");
    try {
      const response = await fetch(editing ? `/api/v1/products/${editing.id}` : "/api/v1/products", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...form, progress: Number(form.progress), ...(editing ? { version: editing.version } : {}) }),
      });
      const body = await response.json() as ApiError;
      if (!response.ok) {
        setFieldErrors(body.error?.validationDetails ?? {});
        throw new Error(body.error?.message ?? "The Product could not be saved.");
      }
      setDialogOpen(false); setSuccess(editing ? "Product updated." : "Product created."); await load();
      window.setTimeout(() => setSuccess(""), 3000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The Product could not be saved."); }
    finally { setSaving(false); }
  };

  return (
    <section className="portfolio-module" aria-labelledby="product-portfolio-title">
      <div className="portfolio-toolbar">
        <div><span className="section-kicker">PRODUCT PORTFOLIO</span><h2 id="product-portfolio-title">Products <small>{total}</small></h2></div>
        {canCreate && <button className="primary-action" onClick={openCreate}>+ New Product</button>}
      </div>
      {success && <div className="success-banner" role="status">{success}</div>}
      <div className="filter-bar" aria-label="Product filters">
        <label className="search-field"><span className="sr-only">Search Products</span><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name, code or ID" /></label>
        <label><span className="sr-only">Filter by stage</span><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="">All stages</option>{productStages.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{productStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
        {(q || stage || status) && <button className="text-action" onClick={() => { setQ(""); setStage(""); setStatus(""); }}>Clear</button>}
      </div>

      {loading ? <div className="module-state" role="status"><span className="loader" /> Loading Products…</div>
        : error && items.length === 0 ? <div className="module-state error-state"><strong>Products are unavailable</strong><p>{error}</p><button onClick={load}>Try again</button></div>
        : items.length === 0 ? <div className="module-state empty-state"><span>◫</span><strong>No Products found</strong><p>{q || stage || status ? "Change or clear the current filters." : "Create the first governed Product to begin the portfolio."}</p>{canCreate && !q && !stage && !status && <button onClick={openCreate}>Create Product</button>}</div>
        : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Product</th><th>Stage</th><th>Status</th><th>Priority</th><th>Progress</th><th>Target launch</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{items.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><span>{product.businessId} · {product.code}</span></td><td><span className="neutral-badge">{product.stage}</span></td><td><span className={`record-status status-${product.status.toLowerCase().replaceAll(" ", "-")}`}>{product.status}</span></td><td>{product.priority}</td><td><div className="table-progress"><span><i style={{ width: `${product.progress}%` }} /></span><b>{product.progress}%</b></div></td><td>{product.targetLaunchDate ? new Date(`${product.targetLaunchDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"}</td><td>{canEdit && <button className="row-action" onClick={() => openEdit(product)} aria-label={`Edit ${product.name}`}>Edit</button>}</td></tr>)}</tbody></table></div>}

      {dialogOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialogOpen(false); }}><div className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title"><form onSubmit={save}><div className="dialog-header"><div><span className="section-kicker">{editing ? editing.businessId : "NEW RECORD"}</span><h2 id="product-dialog-title">{editing ? "Edit Product" : "Create Product"}</h2></div><button type="button" aria-label="Close" onClick={() => setDialogOpen(false)} disabled={saving}>×</button></div><div className="form-grid">
        <Field label="Product name" error={fieldErrors.name} required><input ref={firstFieldRef} value={form.name} onChange={(e) => update("name", e.target.value)} /></Field>
        <Field label="Product code" error={fieldErrors.code} required><input value={form.code} onChange={(e) => update("code", e.target.value.toUpperCase())} placeholder="e.g. PAYMENTS" /></Field>
        <Field label="Description" error={fieldErrors.description} wide><textarea value={form.description} onChange={(e) => update("description", e.target.value)} rows={3} /></Field>
        <Field label="Stage" error={fieldErrors.stage}><select value={form.stage} onChange={(e) => update("stage", e.target.value)}>{productStages.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label="Status" error={fieldErrors.status}><select value={form.status} onChange={(e) => update("status", e.target.value)}>{productStatuses.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label="Priority" error={fieldErrors.priority}><select value={form.priority} onChange={(e) => update("priority", e.target.value)}>{productPriorities.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label="Progress %" error={fieldErrors.progress}><input type="number" min="0" max="100" value={form.progress} onChange={(e) => update("progress", Number(e.target.value))} /></Field>
        <Field label="Category"><input value={form.category} onChange={(e) => update("category", e.target.value)} /></Field>
        <Field label="Market"><input value={form.market} onChange={(e) => update("market", e.target.value)} /></Field>
        <Field label="Region"><input value={form.region} onChange={(e) => update("region", e.target.value)} /></Field>
        <Field label="Customer segment"><input value={form.customerSegment} onChange={(e) => update("customerSegment", e.target.value)} /></Field>
        <Field label="Start date" error={fieldErrors.startDate}><input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} /></Field>
        <Field label="Target launch" error={fieldErrors.targetLaunchDate}><input type="date" value={form.targetLaunchDate} onChange={(e) => update("targetLaunchDate", e.target.value)} /></Field>
        <Field label="Actual launch" error={fieldErrors.actualLaunchDate}><input type="date" value={form.actualLaunchDate} onChange={(e) => update("actualLaunchDate", e.target.value)} /></Field>
        <Field label="Strategic objective" wide><textarea value={form.strategicObjective} onChange={(e) => update("strategicObjective", e.target.value)} rows={2} /></Field>
        <Field label="Business value" wide><textarea value={form.businessValue} onChange={(e) => update("businessValue", e.target.value)} rows={2} /></Field>
        <Field label="Notes" wide><textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={2} /></Field>
      </div>{error && <div className="form-error" role="alert">{error}</div>}<div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</button><button className="primary-action" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create Product"}</button></div></form></div></div>}
    </section>
  );
}

function Field({ label, error, wide, required, children }: { label: string; error?: string; wide?: boolean; required?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "field wide" : "field"}><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}{error && <small role="alert">{error}</small>}</label>;
}
