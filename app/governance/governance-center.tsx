"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirementCenter } from "./requirement-center";
import { TraceabilityPanel } from "./traceability-panel";
import { RaciPanel } from "./raci-panel";
import { FeasibilityPanel } from "./feasibility-panel";

type Option = { id: string; name: string; productId?: string };
type RequirementSummary = { governanceStatus: string | null };
type CoverageEvidence = { value: number | null; numerator: number; denominator: number };

const governanceTabs = ["Summary", "Requirements", "Traceability", "RACI", "Feasibility"] as const;
type GovernanceTab = (typeof governanceTabs)[number];

function GovernanceSummary({ projectId, projects, onProjectChange, canViewRaci, canViewFeasibility }: { projectId: string; projects: Option[]; onProjectChange: (projectId: string) => void; canViewRaci: boolean; canViewFeasibility: boolean }) {
  const [requirementTotal, setRequirementTotal] = useState<number | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [coverage, setCoverage] = useState<CoverageEvidence | null>(null);
  const [raciStatus, setRaciStatus] = useState<string | null>(null);
  const [feasibilityCounts, setFeasibilityCounts] = useState<{ total: number; decided: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requirementsResponse, traceabilityResponse] = await Promise.all([
        fetch("/api/v3/requirements?pageSize=100", { headers: { accept: "application/json" } }),
        fetch("/api/v3/traceability", { headers: { accept: "application/json" } }),
      ]);
      const requirementsBody = await requirementsResponse.json() as { data?: RequirementSummary[]; meta?: { total: number } };
      const traceabilityBody = await traceabilityResponse.json() as { data?: { coverage: CoverageEvidence } };
      setRequirementTotal(requirementsBody.meta?.total ?? null);
      const counts: Record<string, number> = {};
      for (const item of requirementsBody.data ?? []) { const key = item.governanceStatus ?? "DRAFT"; counts[key] = (counts[key] ?? 0) + 1; }
      setStatusCounts(counts);
      setCoverage(traceabilityResponse.ok ? traceabilityBody.data?.coverage ?? null : null);
    } catch { setRequirementTotal(null); setStatusCounts({}); setCoverage(null); }
    if (projectId) {
      if (canViewRaci) {
        try {
          const response = await fetch(`/api/v3/projects/${projectId}/raci`, { headers: { accept: "application/json" } });
          const body = await response.json() as { data?: { matrix: { status: string } | null } };
          setRaciStatus(response.ok ? body.data?.matrix?.status ?? "NOT_STARTED" : null);
        } catch { setRaciStatus(null); }
      } else setRaciStatus(null);
      if (canViewFeasibility) {
        try {
          const response = await fetch(`/api/v3/projects/${projectId}/feasibility`, { headers: { accept: "application/json" } });
          const body = await response.json() as { data?: Array<{ revisions: Array<{ status: string }> }> };
          const items = response.ok ? body.data ?? [] : [];
          const decided = items.filter((item) => ["FEASIBLE", "FEASIBLE_WITH_CONDITIONS", "NOT_FEASIBLE"].includes(item.revisions[0]?.status ?? "")).length;
          setFeasibilityCounts({ total: items.length, decided });
        } catch { setFeasibilityCounts(null); }
      } else setFeasibilityCounts(null);
    } else { setRaciStatus(null); setFeasibilityCounts(null); }
    setLoading(false);
  }, [projectId, canViewRaci, canViewFeasibility]);

  useEffect(() => { const handle = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(handle); }, [load]);

  return <section className="governance-summary" aria-labelledby="governance-summary-title">
    <div className="signoff-panel-header"><span className="section-kicker">GOVERNANCE · SUMMARY</span><h4 id="governance-summary-title">Governance overview</h4></div>
    {loading ? <div className="module-state" role="status"><span className="loader" />Loading governance summary…</div> : <div className="raci-workspace">
      <div className="delivery-summary">
        <div><span>Requirements</span><strong>{requirementTotal ?? "—"}</strong></div>
        <div><span>Draft</span><strong>{statusCounts.DRAFT ?? 0}</strong></div>
        <div><span>In review</span><strong>{statusCounts.IN_REVIEW ?? 0}</strong></div>
        <div><span>Approved</span><strong>{statusCounts.APPROVED ?? 0}</strong></div>
        <div><span>Rejected</span><strong>{statusCounts.REJECTED ?? 0}</strong></div>
        <div><span>Delivery coverage</span><strong>{coverage?.value !== null && coverage?.value !== undefined ? `${Math.round(coverage.value * 100)}%` : "—"}</strong></div>
      </div>
      <div className="raci-section"><div className="raci-section-title"><h5>Project-scoped governance</h5></div>
        <label className="field"><span>Project</span><select value={projectId} onChange={(event) => onProjectChange(event.target.value)}><option value="">Select a Project to view RACI and Feasibility status</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        {projectId && <div className="delivery-summary">
          {canViewRaci && <div><span>RACI matrix</span><strong>{raciStatus ? raciStatus.replaceAll("_", " ") : "Not started"}</strong></div>}
          {canViewFeasibility && <div><span>Feasibility assessments</span><strong>{feasibilityCounts?.total ?? 0}</strong></div>}
          {canViewFeasibility && <div><span>Decided</span><strong>{feasibilityCounts?.decided ?? 0}</strong></div>}
        </div>}
      </div>
    </div>}
  </section>;
}

export function GovernanceCenter({ initialProjectId, onProjectChange: onSharedProjectChange, canCreateRequirement, canEditRequirement, canSubmitRequirement, canArchiveRequirement, canLinkRequirement, canManageTraceability, canRecordEvidence, canViewRaci, canManageRaci, canPublishRaci, canViewFeasibility, canEditFeasibility, canSubmitFeasibility, currentUserId, canRequestSignoff, canDecideSignoff, canManageSignoff, canWaiveCondition }: {
  initialProjectId: string; onProjectChange: (projectId: string) => void;
  canCreateRequirement: boolean; canEditRequirement: boolean; canSubmitRequirement: boolean; canArchiveRequirement: boolean; canLinkRequirement: boolean; canManageTraceability: boolean; canRecordEvidence: boolean;
  canViewRaci: boolean; canManageRaci: boolean; canPublishRaci: boolean; canViewFeasibility: boolean; canEditFeasibility: boolean; canSubmitFeasibility: boolean;
  currentUserId: string; canRequestSignoff: boolean; canDecideSignoff: boolean; canManageSignoff: boolean; canWaiveCondition: boolean;
}) {
  const [tab, setTab] = useState<GovernanceTab>("Summary");
  const [projectId, setProjectId] = useState(initialProjectId);
  const [projects, setProjects] = useState<Option[]>([]);

  useEffect(() => {
    fetch("/api/v1/projects?pageSize=100&sort=name", { headers: { accept: "application/json" } })
      .then((response) => response.json())
      .then((body: { data?: Option[] }) => setProjects(body.data ?? []))
      .catch(() => setProjects([]));
  }, []);

  const selectProject = (value: string) => { setProjectId(value); onSharedProjectChange(value); };

  return <div className="governance-center">
    <div className="document-type-tabs" role="tablist" aria-label="Governance module">
      {governanceTabs.map((label) => <button key={label} role="tab" aria-selected={tab === label} className={tab === label ? "active" : ""} onClick={() => setTab(label)}><strong>{label}</strong></button>)}
    </div>
    {tab === "Summary" && <GovernanceSummary projectId={projectId} projects={projects} onProjectChange={selectProject} canViewRaci={canViewRaci} canViewFeasibility={canViewFeasibility} />}
    {tab === "Requirements" && <RequirementCenter canCreate={canCreateRequirement} canEdit={canEditRequirement} canSubmit={canSubmitRequirement} canArchive={canArchiveRequirement} canLink={canLinkRequirement} canManageTraceability={canManageTraceability} canRecordEvidence={canRecordEvidence} currentUserId={currentUserId} canDecideSignoff={canDecideSignoff} canManageSignoff={canManageSignoff} canWaiveCondition={canWaiveCondition} canRequestSignoff={canRequestSignoff} />}
    {tab === "Traceability" && <TraceabilityPanel productId="" projectId={projectId} onProjectChange={selectProject} />}
    {tab === "RACI" && (canViewRaci ? (projectId ? <RaciPanel projectId={projectId} canManage={canManageRaci} canPublish={canPublishRaci} /> : <div className="module-state empty-state"><span>◇</span><strong>Select a Project</strong><p>Choose a Project from the Summary tab to open its RACI matrix.</p></div>) : <div className="module-state empty-state"><span>◇</span><strong>Not authorized</strong><p>Your role does not include RACI visibility.</p></div>)}
    {tab === "Feasibility" && (canViewFeasibility ? (projectId ? <FeasibilityPanel projectId={projectId} currentUserId={currentUserId} canView={canViewFeasibility} canEdit={canEditFeasibility} canSubmit={canSubmitFeasibility} canDecideSignoff={canDecideSignoff} canManageSignoff={canManageSignoff} canWaiveCondition={canWaiveCondition} canRequestSignoff={canRequestSignoff} /> : <div className="module-state empty-state"><span>◇</span><strong>Select a Project</strong><p>Choose a Project from the Summary tab to open its feasibility assessments.</p></div>) : <div className="module-state empty-state"><span>◇</span><strong>Not authorized</strong><p>Your role does not include feasibility visibility.</p></div>)}
  </div>;
}
