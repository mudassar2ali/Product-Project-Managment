"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { executionResults, testCasePriorities, testCaseStatuses } from "./stage4-contract";
import { formatDateTime, titleCase, toneForCampaignStatus, toneForExecutionResult, toneForTestCaseStatus } from "./release-format";

type Campaign = {
  id: string; businessId: string; name: string; status: string;
  entryCriteria: string; exitCriteria: string; plannedStartDate: string | null; plannedEndDate: string | null;
  startedAt: string | null; completedAt: string | null; ownerName: string | null; version: number;
};
type TestCase = {
  id: string; businessId: string; requirementId: string | null; requirementBusinessId: string | null;
  backlogItemId: string | null; backlogItemBusinessId: string | null;
  title: string; preconditions: string; steps: string; expectedResult: string; priority: string; status: string; version: number;
};
type Execution = {
  id: string; executionNumber: number; result: string; executedByName: string | null; executedAt: string | null;
  actualResult: string; evidenceReference: string; defectId: string | null; defectBusinessId: string | null;
};
type RequirementLink = { id: string; requirementId: string; requirementBusinessId: string; requirementTitle: string | null; linkType: string };
type Requirement = { id: string; businessId: string };
type BacklogItem = { id: string; businessId: string; title: string };
type UserOption = { id: string; displayName: string };

const emptyCampaign = { name: "", entryCriteria: "", exitCriteria: "", plannedStartDate: "", plannedEndDate: "", ownerUserId: "" };
const emptyTestCase = { requirementId: "", backlogItemId: "", title: "", preconditions: "", steps: "", expectedResult: "", priority: "MEDIUM", status: "DRAFT" };
const emptyExecution = { result: "PASS", executedAt: "", actualResult: "", evidenceReference: "", logDefect: false, defectTitle: "", defectDescription: "", defectSteps: "", defectSeverity: "MEDIUM" };

export function UatWorkspace({ releaseId, projectId, canCreateCampaign, canCreateTestCase, canEditTestCase, canExecute, canManageTraceability }: {
  releaseId: string; projectId: string; canCreateCampaign: boolean; canCreateTestCase: boolean; canEditTestCase: boolean; canExecute: boolean; canManageTraceability: boolean;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [testCaseId, setTestCaseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([]);

  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState(emptyCampaign);
  const [campaignErrors, setCampaignErrors] = useState<Record<string, string>>({});
  const [testCaseOpen, setTestCaseOpen] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState<TestCase | null>(null);
  const [testCaseForm, setTestCaseForm] = useState(emptyTestCase);
  const [testCaseErrors, setTestCaseErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [executions, setExecutions] = useState<Execution[]>([]);
  const [links, setLinks] = useState<RequirementLink[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [executionOpen, setExecutionOpen] = useState(false);
  const [executionForm, setExecutionForm] = useState(emptyExecution);
  const [executionErrors, setExecutionErrors] = useState<Record<string, string>>({});
  const [linkRequirementId, setLinkRequirementId] = useState("");
  const first = useRef<HTMLInputElement>(null);

  const loadCampaigns = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/v4/releases/${releaseId}/campaigns`, { headers: { accept: "application/json" } });
      const body = await response.json() as { data?: Campaign[]; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "UAT campaigns could not be loaded.");
      setCampaigns(body.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "UAT campaigns could not be loaded."); }
    finally { setLoading(false); }
  }, [releaseId]);

  useEffect(() => { const handle = window.setTimeout(() => void loadCampaigns(), 0); return () => window.clearTimeout(handle); }, [loadCampaigns]);
  useEffect(() => {
    fetch("/api/v1/users", { headers: { accept: "application/json" } }).then((response) => response.json()).then((body: { data?: UserOption[] }) => setUsers(body.data ?? [])).catch(() => setUsers([]));
    fetch(`/api/v3/requirements?projectId=${encodeURIComponent(projectId)}&pageSize=100`, { headers: { accept: "application/json" } }).then((response) => response.json()).then((body: { data?: Requirement[] }) => setRequirements(body.data ?? [])).catch(() => setRequirements([]));
    fetch(`/api/v2/backlog?projectId=${encodeURIComponent(projectId)}&pageSize=100`, { headers: { accept: "application/json" } }).then((response) => response.json()).then((body: { data?: BacklogItem[] }) => setBacklogItems(body.data ?? [])).catch(() => setBacklogItems([]));
  }, [projectId]);

  const loadTestCases = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/v4/campaigns/${id}/test-cases`, { headers: { accept: "application/json" } });
      const body = await response.json() as { data?: TestCase[] };
      setTestCases(body.data ?? []);
    } catch { setTestCases([]); }
    finally { setDetailLoading(false); }
  }, []);

  const openCampaign = (id: string) => { setCampaignId(id); setTestCaseId(""); setExecutions([]); setLinks([]); void loadTestCases(id); };

  const loadTestCaseDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const [executionsResponse, linksResponse] = await Promise.all([
        fetch(`/api/v4/test-cases/${id}/executions`, { headers: { accept: "application/json" } }),
        fetch(`/api/v4/test-cases/${id}/requirement-links`, { headers: { accept: "application/json" } }),
      ]);
      const executionsBody = await executionsResponse.json() as { data?: Execution[] };
      const linksBody = await linksResponse.json() as { data?: RequirementLink[] };
      setExecutions(executionsBody.data ?? []); setLinks(linksBody.data ?? []);
    } catch { setExecutions([]); setLinks([]); }
    finally { setDetailLoading(false); }
  }, []);

  const openTestCase = (id: string) => { setTestCaseId(id); void loadTestCaseDetail(id); };

  useEffect(() => { if (campaignOpen || testCaseOpen || executionOpen) window.setTimeout(() => first.current?.focus(), 0); }, [campaignOpen, testCaseOpen, executionOpen]);

  const flash = (message: string) => { setSuccess(message); window.setTimeout(() => setSuccess(""), 3000); };

  const createCampaign = () => { setCampaignForm(emptyCampaign); setCampaignErrors({}); setCampaignOpen(true); };
  const saveCampaign = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setCampaignErrors({}); setError("");
    try {
      const response = await fetch(`/api/v4/releases/${releaseId}/campaigns`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...campaignForm, plannedStartDate: campaignForm.plannedStartDate || null, plannedEndDate: campaignForm.plannedEndDate || null, ownerUserId: campaignForm.ownerUserId || null }),
      });
      const body = await response.json() as { error?: { message?: string; validationDetails?: Record<string, string> } };
      if (!response.ok) { setCampaignErrors(body.error?.validationDetails ?? {}); throw new Error(body.error?.message ?? "The campaign could not be created."); }
      setCampaignOpen(false); flash("UAT campaign created."); await loadCampaigns();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The campaign could not be created."); }
    finally { setSaving(false); }
  };

  const createTestCase = () => { setEditingTestCase(null); setTestCaseForm(emptyTestCase); setTestCaseErrors({}); setTestCaseOpen(true); };
  const editTestCase = (testCase: TestCase) => {
    setEditingTestCase(testCase);
    setTestCaseForm({ requirementId: testCase.requirementId ?? "", backlogItemId: testCase.backlogItemId ?? "", title: testCase.title, preconditions: testCase.preconditions, steps: testCase.steps, expectedResult: testCase.expectedResult, priority: testCase.priority, status: testCase.status });
    setTestCaseErrors({}); setTestCaseOpen(true);
  };
  const saveTestCase = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setTestCaseErrors({}); setError("");
    try {
      const url = editingTestCase ? `/api/v4/test-cases/${editingTestCase.id}` : `/api/v4/campaigns/${campaignId}/test-cases`;
      const response = await fetch(url, {
        method: editingTestCase ? "PATCH" : "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...testCaseForm, requirementId: testCaseForm.requirementId || null, backlogItemId: testCaseForm.backlogItemId || null, ...(editingTestCase ? { version: editingTestCase.version } : {}) }),
      });
      const body = await response.json() as { error?: { message?: string; validationDetails?: Record<string, string> } };
      if (!response.ok) { setTestCaseErrors(body.error?.validationDetails ?? {}); throw new Error(body.error?.message ?? "The test case could not be saved."); }
      setTestCaseOpen(false); flash(editingTestCase ? "Test case updated." : "Test case created."); await loadTestCases(campaignId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The test case could not be saved."); }
    finally { setSaving(false); }
  };

  const openExecution = () => { setExecutionForm(emptyExecution); setExecutionErrors({}); setExecutionOpen(true); };
  const saveExecution = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setExecutionErrors({}); setError("");
    try {
      const payload: Record<string, unknown> = {
        result: executionForm.result,
        executedAt: executionForm.result === "NOT_EXECUTED" ? null : (executionForm.executedAt || new Date().toISOString()),
        actualResult: executionForm.actualResult,
        evidenceReference: executionForm.evidenceReference,
      };
      if (executionForm.logDefect && (executionForm.result === "FAIL" || executionForm.result === "BLOCKED")) {
        payload.defect = { title: executionForm.defectTitle, description: executionForm.defectDescription, stepsToReproduce: executionForm.defectSteps, severity: executionForm.defectSeverity };
      }
      const response = await fetch(`/api/v4/test-cases/${testCaseId}/executions`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { data?: { defectBusinessId?: string | null }; error?: { message?: string; validationDetails?: Record<string, string> } };
      if (!response.ok) { setExecutionErrors(body.error?.validationDetails ?? {}); throw new Error(body.error?.message ?? "The execution could not be recorded."); }
      setExecutionOpen(false);
      flash(body.data?.defectBusinessId ? `Execution recorded — defect ${body.data.defectBusinessId} logged.` : "Execution recorded.");
      await loadTestCaseDetail(testCaseId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The execution could not be recorded."); }
    finally { setSaving(false); }
  };

  const addLink = async () => {
    if (!linkRequirementId) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v4/test-cases/${testCaseId}/requirement-links`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ requirementId: linkRequirementId, linkType: "VALIDATES" }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The link could not be created.");
      setLinkRequirementId(""); flash("Requirement linked."); await loadTestCaseDetail(testCaseId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The link could not be created."); }
    finally { setSaving(false); }
  };
  const removeLink = async (linkId: string) => {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v4/test-cases/${testCaseId}/requirement-links/${linkId}`, { method: "DELETE", headers: { accept: "application/json" } });
      if (!response.ok) { const body = await response.json() as { error?: { message?: string } }; throw new Error(body.error?.message ?? "The link could not be removed."); }
      flash("Link removed."); await loadTestCaseDetail(testCaseId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The link could not be removed."); }
    finally { setSaving(false); }
  };

  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId) ?? null;
  const selectedTestCase = testCases.find((testCase) => testCase.id === testCaseId) ?? null;

  return <div className="release-workspace">
    {success && <div className="success-banner" role="status">{success}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="workspace-actions"><span className="section-kicker">UAT CAMPAIGNS</span>{canCreateCampaign && <button className="primary-action" onClick={createCampaign}>+ New campaign</button>}</div>
    {loading ? <div className="module-state" role="status"><span className="loader" />Loading UAT campaigns…</div>
      : !campaigns.length ? <div className="module-state empty-state"><span>◇</span><strong>No UAT campaigns yet</strong><p>Create a campaign to begin planning test cases for this Release.</p></div>
      : <div className="uat-tree">
        <div className="uat-tree-list">{campaigns.map((campaign) => <button key={campaign.id} className={campaign.id === campaignId ? "active" : ""} onClick={() => openCampaign(campaign.id)}>
          <span className={`tone-badge tone-${toneForCampaignStatus(campaign.status)}`}>{titleCase(campaign.status)}</span>
          <strong>{campaign.name}</strong><small>{campaign.businessId}</small>
        </button>)}</div>
        <div>
          {!selectedCampaign ? <div className="module-state empty-state"><span>◇</span><strong>Select a campaign</strong><p>Choose a UAT campaign to see its test cases.</p></div> : <>
            <div className="workspace-actions"><span className="section-kicker">TEST CASES · {selectedCampaign.businessId}</span>{canCreateTestCase && <button className="secondary-action" onClick={createTestCase}>+ New test case</button>}</div>
            {detailLoading ? <div className="module-state" role="status"><span className="loader" />Loading…</div>
              : !testCases.length ? <div className="module-state empty-state"><span>◇</span><strong>No test cases yet</strong><p>Add the first test case to this campaign.</p></div>
              : <div className="table-shell"><table className="portfolio-table"><thead><tr><th>Test case</th><th>Requirement</th><th>Priority</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
                {testCases.map((testCase) => <tr key={testCase.id}>
                  <td><button className="project-link" onClick={() => openTestCase(testCase.id)}><strong>{testCase.title}</strong><span>{testCase.businessId}</span></button></td>
                  <td>{testCase.requirementBusinessId ?? "—"}</td>
                  <td>{titleCase(testCase.priority)}</td>
                  <td><span className={`tone-badge tone-${toneForTestCaseStatus(testCase.status)}`}>{titleCase(testCase.status)}</span></td>
                  <td><button className="row-action" onClick={() => openTestCase(testCase.id)}>Open</button>{canEditTestCase && testCase.status === "DRAFT" && <button className="row-action" onClick={() => editTestCase(testCase)}>Edit</button>}</td>
                </tr>)}
              </tbody></table></div>}

            {selectedTestCase && <div className="feasibility-detail" style={{ marginTop: 14 }}>
              <div className="signoff-panel-header"><span className="section-kicker">{selectedTestCase.businessId}</span><h4>{selectedTestCase.title}</h4></div>
              <p style={{ fontSize: 10, color: "#5e6f65" }}>{selectedTestCase.steps}</p>
              <div className="release-summary-strip">
                <div><span>Priority</span><strong>{titleCase(selectedTestCase.priority)}</strong></div>
                <div><span>Status</span><strong>{titleCase(selectedTestCase.status)}</strong></div>
                <div><span>Backlog item</span><strong>{selectedTestCase.backlogItemBusinessId ?? "—"}</strong></div>
                <div><span>Executions</span><strong>{executions.length}</strong></div>
              </div>

              <div className="workspace-actions" style={{ marginTop: 14 }}><span className="section-kicker">EXECUTION HISTORY</span>{canExecute && selectedTestCase.status === "READY" && <button className="secondary-action" onClick={openExecution}>+ Record execution</button>}</div>
              {!executions.length ? <p className="drawer-empty">No executions recorded yet.</p> : executions.map((execution) => <div key={execution.id} className="uat-execution-row">
                <b>#{execution.executionNumber}</b>
                <div><span className={`tone-badge tone-${toneForExecutionResult(execution.result)}`}>{titleCase(execution.result)}</span>
                  <p style={{ margin: "6px 0 0", fontSize: 9.5, color: "#5e6f65" }}>{execution.actualResult || "No notes recorded."}</p>
                  {execution.defectBusinessId && <p style={{ margin: "4px 0 0", fontSize: 8.5, color: "#9b473f" }}>Linked defect: {execution.defectBusinessId}</p>}
                </div>
                <span style={{ fontSize: 8, color: "#8b9890", whiteSpace: "nowrap" }}>{execution.executedByName ?? "—"}<br />{formatDateTime(execution.executedAt)}</span>
              </div>)}

              <div className="workspace-actions" style={{ marginTop: 14 }}><span className="section-kicker">REQUIREMENT LINKS</span></div>
              {!links.length ? <p className="drawer-empty">No Requirements linked to this test case yet.</p> : links.map((link) => <div key={link.id} className="uat-link-row">
                <strong>{link.requirementBusinessId}</strong><span>{link.requirementTitle ?? ""}</span><span className="tone-badge tone-neutral">{titleCase(link.linkType)}</span>
                {canManageTraceability && <button className="row-action" onClick={() => void removeLink(link.id)} disabled={saving}>Remove</button>}
              </div>)}
              {canManageTraceability && <div className="filter-bar" style={{ marginTop: 8 }}>
                <label><span className="sr-only">Requirement</span><select value={linkRequirementId} onChange={(event) => setLinkRequirementId(event.target.value)}><option value="">Select a Requirement to link…</option>{requirements.map((requirement) => <option key={requirement.id} value={requirement.id}>{requirement.businessId}</option>)}</select></label>
                <button className="secondary-action" onClick={() => void addLink()} disabled={!linkRequirementId || saving}>Link</button>
              </div>}
            </div>}
          </>}
        </div>
      </div>}

    {campaignOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCampaignOpen(false); }}>
      <div className="product-dialog project-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-form-title">
        <form onSubmit={saveCampaign}>
          <div className="dialog-header"><div><span className="section-kicker">NEW CAMPAIGN</span><h2 id="campaign-form-title">Create UAT campaign</h2></div><button type="button" onClick={() => setCampaignOpen(false)} aria-label="Close">×</button></div>
          <div className="form-grid">
            <Field label="Campaign name" error={campaignErrors.name} required><input ref={first} value={campaignForm.name} onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))} /></Field>
            <Field label="Owner" error={campaignErrors.ownerUserId}><select value={campaignForm.ownerUserId} onChange={(event) => setCampaignForm((current) => ({ ...current, ownerUserId: event.target.value }))}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></Field>
            <Field label="Planned start" error={campaignErrors.plannedStartDate}><input type="date" value={campaignForm.plannedStartDate} onChange={(event) => setCampaignForm((current) => ({ ...current, plannedStartDate: event.target.value }))} /></Field>
            <Field label="Planned end" error={campaignErrors.plannedEndDate}><input type="date" value={campaignForm.plannedEndDate} onChange={(event) => setCampaignForm((current) => ({ ...current, plannedEndDate: event.target.value }))} /></Field>
            <Field label="Entry criteria" wide><textarea rows={2} value={campaignForm.entryCriteria} onChange={(event) => setCampaignForm((current) => ({ ...current, entryCriteria: event.target.value }))} /></Field>
            <Field label="Exit criteria" wide><textarea rows={2} value={campaignForm.exitCriteria} onChange={(event) => setCampaignForm((current) => ({ ...current, exitCriteria: event.target.value }))} /></Field>
          </div>
          <div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setCampaignOpen(false)}>Cancel</button><button className="primary-action" disabled={saving}>{saving ? "Creating…" : "Create campaign"}</button></div>
        </form>
      </div>
    </div>}

    {testCaseOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setTestCaseOpen(false); }}>
      <div className="product-dialog project-dialog" role="dialog" aria-modal="true" aria-labelledby="test-case-form-title">
        <form onSubmit={saveTestCase}>
          <div className="dialog-header"><div><span className="section-kicker">{editingTestCase ? editingTestCase.businessId : "NEW TEST CASE"}</span><h2 id="test-case-form-title">{editingTestCase ? "Edit test case" : "Create test case"}</h2></div><button type="button" onClick={() => setTestCaseOpen(false)} aria-label="Close">×</button></div>
          <div className="form-grid">
            <Field label="Title" error={testCaseErrors.title} required><input ref={first} value={testCaseForm.title} onChange={(event) => setTestCaseForm((current) => ({ ...current, title: event.target.value }))} /></Field>
            <Field label="Priority"><select value={testCaseForm.priority} onChange={(event) => setTestCaseForm((current) => ({ ...current, priority: event.target.value }))}>{testCasePriorities.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
            <Field label="Status"><select value={testCaseForm.status} onChange={(event) => setTestCaseForm((current) => ({ ...current, status: event.target.value }))}>{testCaseStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
            <Field label="Requirement" error={testCaseErrors.requirementId}><select value={testCaseForm.requirementId} onChange={(event) => setTestCaseForm((current) => ({ ...current, requirementId: event.target.value }))}><option value="">None</option>{requirements.map((requirement) => <option key={requirement.id} value={requirement.id}>{requirement.businessId}</option>)}</select></Field>
            <Field label="Backlog item" error={testCaseErrors.backlogItemId}><select value={testCaseForm.backlogItemId} onChange={(event) => setTestCaseForm((current) => ({ ...current, backlogItemId: event.target.value }))}><option value="">None</option>{backlogItems.map((item) => <option key={item.id} value={item.id}>{item.businessId} · {item.title}</option>)}</select></Field>
            <Field label="Preconditions" wide><textarea rows={2} value={testCaseForm.preconditions} onChange={(event) => setTestCaseForm((current) => ({ ...current, preconditions: event.target.value }))} /></Field>
            <Field label="Steps" wide error={testCaseErrors.steps} required><textarea rows={3} value={testCaseForm.steps} onChange={(event) => setTestCaseForm((current) => ({ ...current, steps: event.target.value }))} /></Field>
            <Field label="Expected result" wide error={testCaseErrors.expectedResult} required><textarea rows={2} value={testCaseForm.expectedResult} onChange={(event) => setTestCaseForm((current) => ({ ...current, expectedResult: event.target.value }))} /></Field>
          </div>
          <div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setTestCaseOpen(false)}>Cancel</button><button className="primary-action" disabled={saving}>{saving ? "Saving…" : editingTestCase ? "Save changes" : "Create test case"}</button></div>
        </form>
      </div>
    </div>}

    {executionOpen && selectedTestCase && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setExecutionOpen(false); }}>
      <div className="product-dialog project-dialog" role="dialog" aria-modal="true" aria-labelledby="execution-form-title">
        <form onSubmit={saveExecution}>
          <div className="dialog-header"><div><span className="section-kicker">{selectedTestCase.businessId}</span><h2 id="execution-form-title">Record execution</h2></div><button type="button" onClick={() => setExecutionOpen(false)} aria-label="Close">×</button></div>
          <div className="form-grid">
            <Field label="Result" error={executionErrors.result} required><select value={executionForm.result} onChange={(event) => setExecutionForm((current) => ({ ...current, result: event.target.value }))}>{executionResults.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
            <Field label="Evidence reference"><input value={executionForm.evidenceReference} onChange={(event) => setExecutionForm((current) => ({ ...current, evidenceReference: event.target.value }))} /></Field>
            <Field label="Actual result" wide><textarea rows={2} value={executionForm.actualResult} onChange={(event) => setExecutionForm((current) => ({ ...current, actualResult: event.target.value }))} /></Field>
            {(executionForm.result === "FAIL" || executionForm.result === "BLOCKED") && <div className="wide"><label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10 }}><input type="checkbox" checked={executionForm.logDefect} onChange={(event) => setExecutionForm((current) => ({ ...current, logDefect: event.target.checked }))} /> Log a defect from this execution</label></div>}
            {executionForm.logDefect && (executionForm.result === "FAIL" || executionForm.result === "BLOCKED") && <>
              <Field label="Defect title" error={executionErrors["defect.title"]} required><input value={executionForm.defectTitle} onChange={(event) => setExecutionForm((current) => ({ ...current, defectTitle: event.target.value }))} /></Field>
              <Field label="Severity" error={executionErrors["defect.severity"]}><select value={executionForm.defectSeverity} onChange={(event) => setExecutionForm((current) => ({ ...current, defectSeverity: event.target.value }))}><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></Field>
              <Field label="Description" wide><textarea rows={2} value={executionForm.defectDescription} onChange={(event) => setExecutionForm((current) => ({ ...current, defectDescription: event.target.value }))} /></Field>
              <Field label="Steps to reproduce" wide><textarea rows={2} value={executionForm.defectSteps} onChange={(event) => setExecutionForm((current) => ({ ...current, defectSteps: event.target.value }))} /></Field>
            </>}
          </div>
          {executionErrors.defect && <div className="form-error" role="alert">{executionErrors.defect}</div>}
          <div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setExecutionOpen(false)}>Cancel</button><button className="primary-action" disabled={saving}>{saving ? "Recording…" : "Record execution"}</button></div>
        </form>
      </div>
    </div>}
  </div>;
}

function Field({ label, error, wide, required, children }: { label: string; error?: string; wide?: boolean; required?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "field wide" : "field"}><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}{error && <small role="alert">{error}</small>}</label>;
}
