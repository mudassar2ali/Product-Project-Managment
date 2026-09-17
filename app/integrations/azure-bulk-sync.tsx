"use client";
import { useState } from "react";
type Result = { name: string; ok: boolean; message: string };
async function api(path: string, body?: object) {
  const response = await fetch(path, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? `Request failed (${response.status}).`);
  return data.data;
}
export function AzureBulkSync({ connectionId, disabled }: { connectionId: string; disabled: boolean }) {
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(""), [results, setResults] = useState<Result[]>([]);
  async function run() {
    setBusy(true); setResults([]); setProgress("Discovering Azure Projects…");
    let succeeded = 0, failed = 0;
    try {
      const projects: { id: string; name: string }[] = await api(`/api/v1/azure/connections/${connectionId}/projects`);
      for (const [index, project] of projects.entries()) {
        setProgress(`Syncing ${index + 1} of ${projects.length}: ${project.name}`);
        try {
          const linked = await api(`/api/v2/azure/connections/${connectionId}/import-project`, { azureProjectId: project.id });
          const synced = await api(`/api/v2/azure/project-links/${linked.linkId}/advanced-sync`, {});
          succeeded += 1;
          setResults(previous => [...previous, { name: project.name, ok: true, message: `${synced.itemsSeen} work items · ${synced.iterationsSeen} sprints · ${synced.unmappedTypes + synced.unmappedStates} mapping warnings` }]);
        } catch (error) {
          failed += 1;
          setResults(previous => [...previous, { name: project.name, ok: false, message: error instanceof Error ? error.message : "Sync failed. Retry this Project." }]);
        }
      }
      setProgress(`${succeeded} Projects synced · ${failed} failed. Open Backlog and Sprints to view imported evidence.`);
      window.dispatchEvent(new Event("azure-sync-complete"));
    } catch (error) { setProgress(error instanceof Error ? error.message : "Azure discovery failed."); }
    finally { setBusy(false); }
  }
  return <div className="azure-bulk-sync"><button className="primary-action" disabled={disabled || busy} onClick={() => void run()}>{busy ? "Syncing Projects…" : "Import & sync all Projects"}</button>
    {progress && <p role="status">{progress}</p>}
    {busy && <p>Keep this page open while Projects sync. Azure Boards remain unchanged.</p>}
    {results.length > 0 && <ul>{results.map(result => <li key={result.name}><strong>{result.name}: {result.ok ? "Synced" : "Failed"}</strong> — {result.message}</li>)}</ul>}
    <small>Reuses existing links. New Projects are grouped under an Azure organization Product. Sprint totals cover all discovered teams for whole-Project links.</small>
  </div>;
}
