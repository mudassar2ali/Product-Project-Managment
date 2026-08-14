"use client";

import { useCallback, useEffect, useState } from "react";
import { criterionStatuses } from "./stage2-contract";

type Story = { id: string; businessId: string; title: string; projectName: string; origin: string; storyActor: string | null; storyCapability: string | null; businessValue: string; status: string; version: number };
type Criterion = { id?: string; given: string; when: string; then: string; status: string };
const blank = (): Criterion => ({ given: "", when: "", then: "", status: "DRAFT" });

export function StoryCriteriaCenter({ canEdit }: { canEdit: boolean }) {
  const [stories, setStories] = useState<Story[]>([]);
  const [selected, setSelected] = useState<Story | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadStories = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/v2/backlog?itemType=STORY&pageSize=100");
    const body = await response.json();
    setStories(response.ok ? body.data ?? [] : []);
    setLoading(false);
  }, []);
  useEffect(() => { const timer = setTimeout(loadStories, 0); return () => clearTimeout(timer); }, [loadStories]);

  const open = async (story: Story) => {
    setMessage(""); setErrors({});
    const response = await fetch(`/api/v2/backlog/${story.id}/criteria`);
    const body = await response.json();
    if (!response.ok) { setMessage(body.error?.message ?? "Story could not be opened."); return; }
    setSelected({ ...story, version: body.data.story.version });
    setCriteria((body.data.criteria ?? []).map((row: { id: string; givenText: string; whenText: string; thenText: string; status: string }) => ({ id: row.id, given: row.givenText, when: row.whenText, then: row.thenText, status: row.status })));
  };
  const update = (index: number, key: keyof Criterion, value: string) => setCriteria(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const move = (index: number, direction: -1 | 1) => setCriteria(rows => { const target = index + direction; if (target < 0 || target >= rows.length) return rows; const copy = [...rows]; [copy[index], copy[target]] = [copy[target], copy[index]]; return copy; });
  const save = async () => {
    if (!selected) return;
    setSaving(true); setErrors({}); setMessage("");
    const response = await fetch(`/api/v2/backlog/${selected.id}/criteria`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: selected.version, criteria }) });
    const body = await response.json();
    if (!response.ok) { setErrors(body.error?.validationDetails ?? {}); setMessage(body.error?.message ?? "Criteria could not be saved."); }
    else { setSelected({ ...selected, version: body.data.version }); setMessage("Acceptance Criteria saved in the displayed order."); }
    setSaving(false);
  };

  return <section className="story-workspace">
    <div className="portfolio-toolbar"><div><span className="section-kicker">STORY QUALITY</span><h2>User Stories &amp; Acceptance Criteria</h2></div></div>
    {loading ? <div className="module-state"><span className="loader" />Loading Stories…</div> : !stories.length ? <div className="module-state empty-state"><strong>No Stories yet</strong><p>Create a Story in the local Backlog to define its narrative and testable outcomes.</p></div> : <div className="story-layout">
      <div className="story-selector" aria-label="Stories">{stories.map(story => <button key={story.id} className={selected?.id === story.id ? "active" : ""} onClick={() => open(story)}><span>{story.businessId} · {story.projectName}</span><strong>{story.title}</strong><small>{story.origin === "LOCAL" ? "Local planning" : "Azure DevOps · read-only"} · {story.status}</small></button>)}</div>
      {!selected ? <div className="story-empty"><strong>Select a Story</strong><p>Review its standard narrative and maintain ordered Given/When/Then outcomes.</p></div> : <div className="criteria-editor">
        <header><div><span>{selected.businessId}</span><h3>{selected.title}</h3></div><b>{criteria.length} criteria</b></header>
        <blockquote>As a <strong>{selected.storyActor || "[actor]"}</strong>, I want <strong>{selected.storyCapability || "[capability]"}</strong>, so that <strong>{selected.businessValue || "[business value]"}</strong>.</blockquote>
        {selected.status === "READY" && criteria.length > 0 && <div className="readiness-ready">✓ Ready evidence present</div>}
        {!criteria.length && <div className="criteria-empty">No Acceptance Criteria have been recorded.</div>}
        <div className="criteria-list">{criteria.map((row, index) => <article key={row.id ?? index}><div className="criterion-sequence">{index + 1}</div><div className="criterion-fields"><label><span>Given</span><textarea value={row.given} onChange={event => update(index, "given", event.target.value)} disabled={!canEdit || selected.origin !== "LOCAL"} /></label><label><span>When</span><textarea value={row.when} onChange={event => update(index, "when", event.target.value)} disabled={!canEdit || selected.origin !== "LOCAL"} /></label><label><span>Then</span><textarea value={row.then} onChange={event => update(index, "then", event.target.value)} disabled={!canEdit || selected.origin !== "LOCAL"} /></label>{errors[`criteria.${index}.given`] && <small role="alert">{errors[`criteria.${index}.given`]}</small>}</div><div className="criterion-controls"><select value={row.status} onChange={event => update(index, "status", event.target.value)} disabled={!canEdit || selected.origin !== "LOCAL"}>{criterionStatuses.map(status => <option key={status}>{status}</option>)}</select><button onClick={() => move(index, -1)} disabled={index === 0 || !canEdit}>↑</button><button onClick={() => move(index, 1)} disabled={index === criteria.length - 1 || !canEdit}>↓</button><button onClick={() => setCriteria(rows => rows.filter((_, rowIndex) => rowIndex !== index))} disabled={!canEdit}>Remove</button></div></article>)}</div>
        {message && <div className={Object.keys(errors).length ? "form-error" : "success-banner"} role="status">{message}</div>}
        {canEdit && selected.origin === "LOCAL" && <footer><button className="secondary-action" onClick={() => setCriteria(rows => [...rows, blank()])}>+ Add criterion</button><button className="primary-action" onClick={save} disabled={saving || !criteria.length}>{saving ? "Saving…" : "Save Acceptance Criteria"}</button></footer>}
      </div>}
    </div>}
  </section>;
}
