import { env } from "cloudflare:workers";

type ReportDefinition = {
  title: string;
  description: string;
  columns: readonly string[];
  sql: string;
  sourceFreshness: string;
};

export const reportDefinitions = {
  products: {
    title: "Product Portfolio",
    description: "Active Products, lifecycle, ownership and progress.",
    columns: ["ID", "Product", "Stage", "Status", "Priority", "Progress"],
    sql: `SELECT business_id ID,name Product,stage Stage,status Status,priority Priority,progress||'%' Progress FROM products WHERE record_status='ACTIVE'`,
    sourceFreshness: "Current persisted records",
  },
  projects: {
    title: "Project Portfolio",
    description: "Projects mapped to Products with delivery status.",
    columns: ["ID", "Project", "Product", "Status", "Health", "Progress"],
    sql: `SELECT j.business_id ID,j.name Project,p.name Product,j.status Status,j.health Health,j.overall_progress||'%' Progress FROM projects j JOIN products p ON p.id=j.product_id WHERE j.record_status='ACTIVE'`,
    sourceFreshness: "Current persisted records",
  },
  health: {
    title: "Project Health",
    description: "Delivery health and target dates for active Projects.",
    columns: ["ID", "Project", "Health", "Status", "Target", "Reason"],
    sql: `SELECT business_id ID,name Project,health Health,status Status,COALESCE(target_end_date,'—') Target,COALESCE(health_override_reason,'—') Reason FROM projects WHERE record_status='ACTIVE'`,
    sourceFreshness: "Current persisted records",
  },
  progress: {
    title: "Project Progress",
    description: "Weighted progress across the delivery lifecycle.",
    columns: ["ID", "Project", "Overall", "Requirements", "Development", "QA"],
    sql: `SELECT business_id ID,name Project,overall_progress||'%' Overall,requirements_progress||'%' Requirements,development_progress||'%' Development,qa_progress||'%' QA FROM projects WHERE record_status='ACTIVE'`,
    sourceFreshness: "Current persisted records",
  },
  raid: {
    title: "RAID Register",
    description: "Risks, assumptions, issues and dependencies requiring control.",
    columns: ["ID", "Type", "Title", "Impact", "Status", "Due"],
    sql: `SELECT business_id ID,type Type,title Title,impact Impact,status Status,COALESCE(due_date,'—') Due FROM raid_items WHERE record_status='ACTIVE'`,
    sourceFreshness: "Current persisted records",
  },
  milestones: {
    title: "Milestones",
    description: "Planned delivery events and overdue evidence.",
    columns: ["ID", "Milestone", "Project", "Status", "Planned", "Actual"],
    sql: `SELECT m.business_id ID,m.name Milestone,p.name Project,CASE WHEN m.status NOT IN('Completed','Cancelled') AND date(m.planned_date)<date('now') THEN 'Overdue' ELSE m.status END Status,m.planned_date Planned,COALESCE(m.actual_date,'—') Actual FROM milestones m JOIN projects p ON p.id=m.project_id WHERE m.record_status='ACTIVE'`,
    sourceFreshness: "Current persisted records",
  },
  approvals: {
    title: "Pending Approvals",
    description: "Ideas and Projects awaiting a governance decision.",
    columns: ["ID", "Item", "Type", "Status", "Owner", "Updated"],
    sql: `SELECT business_id ID,title Item,'Idea' Type,status Status,COALESCE(submitter,'—') Owner,updated_at Updated FROM ideas WHERE record_status='ACTIVE' AND status IN('Submitted','Under Review') UNION ALL SELECT business_id,name,'Project',sign_off_status,COALESCE(product_manager_id,'—'),updated_at FROM projects WHERE record_status='ACTIVE' AND sign_off_status='Pending'`,
    sourceFreshness: "Current persisted records",
  },
  azure: {
    title: "Azure Development Progress",
    description: "Latest synchronized engineering delivery evidence.",
    columns: ["Project", "Progress", "Completed", "Total", "Method", "As of"],
    sql: `SELECT p.name Project,s.progress||'%' Progress,s.completed_items Completed,s.total_items Total,'Completed items / total items' Method,s.calculated_at 'As of' FROM azure_delivery_snapshots s JOIN azure_project_links l ON l.id=s.link_id JOIN projects p ON p.id=l.project_id WHERE s.id IN(SELECT id FROM azure_delivery_snapshots x WHERE x.link_id=s.link_id ORDER BY calculated_at DESC LIMIT 1)`,
    sourceFreshness: "Latest synchronized snapshot",
  },
  "backlog-composition": {
    title: "Backlog Composition",
    description: "Work-item mix by Project, source, normalized type and delivery state.",
    columns: ["Project", "Source", "Type", "Status", "Items", "Blocked"],
    sql: `SELECT project.name Project,item.origin Source,item.item_type Type,item.delivery_state Status,COUNT(*) Items,SUM(CASE WHEN item.blocked=1 AND item.status NOT IN('DONE','REMOVED') THEN 1 ELSE 0 END) Blocked FROM backlog_items item JOIN projects project ON project.id=item.project_id WHERE item.record_status='ACTIVE' GROUP BY project.id,project.name,item.origin,item.item_type,item.delivery_state ORDER BY project.name,item.origin,item.item_type,item.delivery_state`,
    sourceFreshness: "Current local and latest synchronized Azure records",
  },
  "story-readiness": {
    title: "Story Readiness",
    description: "Story narrative and structured Acceptance Criteria completeness.",
    columns: ["Project", "ID", "Source", "Story", "Status", "Criteria", "Criteria evidence"],
    sql: `SELECT project.name Project,item.business_id ID,item.origin Source,item.title Story,item.status Status,(SELECT COUNT(*) FROM acceptance_criteria criteria WHERE criteria.backlog_item_id=item.id) Criteria,CASE WHEN item.origin='AZURE_DEVOPS' THEN 'External evidence not structured' WHEN length(trim(COALESCE(item.story_actor,'')))>0 AND length(trim(COALESCE(item.story_capability,'')))>0 AND length(trim(COALESCE(item.business_value,'')))>0 AND EXISTS(SELECT 1 FROM acceptance_criteria criteria WHERE criteria.backlog_item_id=item.id) THEN 'Complete' ELSE 'Incomplete' END 'Criteria evidence' FROM backlog_items item JOIN projects project ON project.id=item.project_id WHERE item.record_status='ACTIVE' AND item.item_type='STORY' ORDER BY project.name,item.origin,item.business_id`,
    sourceFreshness: "Current local and latest synchronized Azure records",
  },
  "sprint-performance": {
    title: "Sprint Commitment vs Completion",
    description: "Source-labelled Sprint commitment, completion method and health evidence.",
    columns: ["Project", "ID", "Sprint", "Source", "Status", "Committed Points", "Completed Points", "Completion", "Method", "Health", "As of"],
    sql: `SELECT project.name Project,sprint.business_id ID,sprint.name Sprint,sprint.origin Source,sprint.status Status,CASE WHEN sprint.origin='AZURE_DEVOPS' THEN COALESCE(metric.planned_points,0) ELSE COALESCE(baseline.committed_points,sprint.committed_points,0) END 'Committed Points',CASE WHEN sprint.origin='AZURE_DEVOPS' THEN COALESCE(metric.completed_points,0) ELSE COALESCE((SELECT SUM(membership.planned_points) FROM sprint_memberships membership JOIN backlog_items item ON item.id=membership.backlog_item_id WHERE membership.sprint_id=sprint.id AND membership.removed_at IS NULL AND item.status='DONE'),0) END 'Completed Points',CASE WHEN sprint.origin='AZURE_DEVOPS' AND metric.id IS NULL THEN 'Unavailable' WHEN sprint.origin='AZURE_DEVOPS' THEN metric.progress||'%' WHEN COALESCE(baseline.committed_points,sprint.committed_points,0)>0 THEN ROUND(100.0*COALESCE((SELECT SUM(membership.planned_points) FROM sprint_memberships membership JOIN backlog_items item ON item.id=membership.backlog_item_id WHERE membership.sprint_id=sprint.id AND membership.removed_at IS NULL AND item.status='DONE'),0)/COALESCE(baseline.committed_points,sprint.committed_points))||'%' ELSE 'Unavailable' END Completion,CASE WHEN sprint.origin='AZURE_DEVOPS' THEN COALESCE(metric.completion_method,'NOT_AVAILABLE') ELSE CASE WHEN COALESCE(baseline.committed_points,sprint.committed_points,0)>0 THEN 'POINTS' ELSE 'NOT_AVAILABLE' END END Method,CASE WHEN sprint.origin='AZURE_DEVOPS' THEN COALESCE(metric.health,'Unavailable') ELSE 'Local status only' END Health,COALESCE(metric.calculated_at,sprint.completed_at,sprint.updated_at) 'As of' FROM sprints sprint JOIN projects project ON project.id=sprint.project_id LEFT JOIN sprint_baselines baseline ON baseline.sprint_id=sprint.id LEFT JOIN sprint_metric_snapshots metric ON metric.id=(SELECT latest.id FROM sprint_metric_snapshots latest WHERE latest.sprint_id=sprint.id ORDER BY latest.calculated_at DESC,latest.id DESC LIMIT 1) WHERE sprint.record_status='ACTIVE' ORDER BY project.name,sprint.end_date DESC`,
    sourceFreshness: "Latest immutable metric snapshot or governed local Sprint state",
  },
  velocity: {
    title: "Velocity by Project and Team",
    description: "Completed Sprint point evidence; no-point Sprints remain explicit zero evidence.",
    columns: ["Project", "Team", "Source", "Sprint", "Completed Points", "End Date", "As of"],
    sql: `SELECT project.name Project,CASE WHEN sprint.origin='AZURE_DEVOPS' THEN COALESCE(link.azure_team_name,'Whole Project') ELSE 'Local planning' END Team,sprint.origin Source,sprint.name Sprint,CASE WHEN sprint.origin='AZURE_DEVOPS' THEN metric.completed_points ELSE COALESCE((SELECT SUM(membership.planned_points) FROM sprint_completion_dispositions disposition JOIN sprint_memberships membership ON membership.id=disposition.membership_id WHERE disposition.sprint_id=sprint.id AND disposition.disposition='COMPLETED'),0) END 'Completed Points',sprint.end_date 'End Date',COALESCE(metric.calculated_at,sprint.completed_at) 'As of' FROM sprints sprint JOIN projects project ON project.id=sprint.project_id LEFT JOIN azure_project_links link ON link.project_id=sprint.project_id AND link.record_status='ACTIVE' LEFT JOIN sprint_metric_snapshots metric ON metric.id=(SELECT latest.id FROM sprint_metric_snapshots latest WHERE latest.sprint_id=sprint.id ORDER BY latest.calculated_at DESC,latest.id DESC LIMIT 1) WHERE sprint.status='COMPLETED' AND sprint.record_status='ACTIVE' AND (sprint.origin='LOCAL' OR metric.id IS NOT NULL) ORDER BY project.name,sprint.origin,sprint.end_date DESC`,
    sourceFreshness: "Completed local Sprints and latest immutable Azure metric snapshots",
  },
  carryover: {
    title: "Sprint Carryover",
    description: "Unfinished work carried between Sprints with item and point evidence.",
    columns: ["Project", "Sprint", "Source", "Carryover Items", "Carryover Points", "Evidence", "As of"],
    sql: `SELECT project.name Project,sprint.name Sprint,sprint.origin Source,CASE WHEN sprint.origin='AZURE_DEVOPS' THEN metric.carryover_count ELSE (SELECT COUNT(*) FROM sprint_completion_dispositions disposition WHERE disposition.sprint_id=sprint.id AND disposition.disposition='CARRYOVER') END 'Carryover Items',CASE WHEN sprint.origin='AZURE_DEVOPS' THEN metric.carryover_points ELSE COALESCE((SELECT SUM(membership.planned_points) FROM sprint_completion_dispositions disposition JOIN sprint_memberships membership ON membership.id=disposition.membership_id WHERE disposition.sprint_id=sprint.id AND disposition.disposition='CARRYOVER'),0) END 'Carryover Points',CASE WHEN sprint.origin='AZURE_DEVOPS' THEN 'Latest source revision' ELSE 'Completion dispositions' END Evidence,COALESCE(metric.calculated_at,sprint.completed_at,sprint.updated_at) 'As of' FROM sprints sprint JOIN projects project ON project.id=sprint.project_id LEFT JOIN sprint_metric_snapshots metric ON metric.id=(SELECT latest.id FROM sprint_metric_snapshots latest WHERE latest.sprint_id=sprint.id ORDER BY latest.calculated_at DESC,latest.id DESC LIMIT 1) WHERE sprint.record_status='ACTIVE' AND (sprint.origin='LOCAL' OR metric.id IS NOT NULL) ORDER BY project.name,sprint.end_date DESC`,
    sourceFreshness: "Governed local dispositions and latest immutable Azure metrics",
  },
  "delivery-attention": {
    title: "Blockers and Open Bugs",
    description: "Active blocked work and open Bug evidence across local and Azure sources.",
    columns: ["Project", "ID", "Source", "Type", "Work item", "State", "Signal", "Sprint", "Freshness"],
    sql: `SELECT project.name Project,item.business_id ID,item.origin Source,item.item_type Type,item.title 'Work item',item.delivery_state State,CASE WHEN item.blocked=1 THEN 'Blocked' ELSE 'Open Bug' END Signal,COALESCE((SELECT sprint.name FROM sprint_memberships membership JOIN sprints sprint ON sprint.id=membership.sprint_id WHERE membership.backlog_item_id=item.id AND membership.removed_at IS NULL AND sprint.status IN('PLANNED','ACTIVE') ORDER BY CASE sprint.status WHEN 'ACTIVE' THEN 0 ELSE 1 END LIMIT 1),(SELECT sprint.name FROM sprints sprint WHERE sprint.project_id=item.project_id AND sprint.origin='AZURE_DEVOPS' AND sprint.external_id=item.external_iteration_id AND sprint.record_status='ACTIVE' LIMIT 1),item.external_iteration_path,'—') Sprint,CASE WHEN item.origin='LOCAL' THEN 'Current local record' WHEN item.source_missing_at IS NOT NULL THEN 'Source missing' WHEN item.synced_at<datetime('now','-24 hours') THEN 'Stale' ELSE 'Current' END Freshness FROM backlog_items item JOIN projects project ON project.id=item.project_id WHERE item.record_status='ACTIVE' AND ((item.blocked=1 AND item.status NOT IN('DONE','REMOVED')) OR (item.item_type='BUG' AND item.delivery_state NOT IN('DONE','REMOVED'))) ORDER BY CASE WHEN item.blocked=1 THEN 0 ELSE 1 END,project.name,item.business_id`,
    sourceFreshness: "Current local and latest synchronized Azure records",
  },
  burndown: {
    title: "Daily Burndown Evidence",
    description: "Accessible data table for planned, actual and ideal remaining Sprint scope.",
    columns: ["Project", "Sprint", "Source", "Date", "Planned", "Remaining", "Completed", "Ideal Remaining", "Scope Change", "As of"],
    sql: `SELECT project.name Project,sprint.name Sprint,point.source_origin Source,point.snapshot_date Date,point.planned_scope Planned,point.remaining_scope Remaining,point.completed_scope Completed,point.ideal_remaining_scope 'Ideal Remaining',point.scope_change 'Scope Change',point.calculated_at 'As of' FROM daily_burndown_snapshots point JOIN sprints sprint ON sprint.id=point.sprint_id JOIN projects project ON project.id=sprint.project_id WHERE sprint.record_status='ACTIVE' ORDER BY project.name,sprint.end_date DESC,point.snapshot_date`,
    sourceFreshness: "Immutable daily points recorded from observed source revisions",
  },
  "azure-coverage": {
    title: "Azure Mapping Coverage and Freshness",
    description: "Normalization coverage, missing-source evidence and latest synchronization state.",
    columns: ["Project", "Organization", "Azure Scope", "Active Mappings", "Mapped", "Unmapped", "Coverage", "Missing", "Stale", "Last Sync", "Status"],
    sql: `SELECT project.name Project,connection.organization Organization,link.azure_project_name||CASE WHEN link.azure_team_name IS NOT NULL THEN ' / '||link.azure_team_name ELSE ' / Whole Project' END 'Azure Scope',(SELECT COUNT(*) FROM azure_mapping_entries mapping WHERE mapping.connection_id=link.connection_id AND mapping.active=1) 'Active Mappings',(SELECT COUNT(*) FROM backlog_items item WHERE item.project_id=link.project_id AND item.origin='AZURE_DEVOPS' AND item.record_status='ACTIVE' AND item.delivery_state<>'UNMAPPED') Mapped,(SELECT COUNT(*) FROM backlog_items item WHERE item.project_id=link.project_id AND item.origin='AZURE_DEVOPS' AND item.record_status='ACTIVE' AND item.delivery_state='UNMAPPED') Unmapped,CASE WHEN (SELECT COUNT(*) FROM backlog_items item WHERE item.project_id=link.project_id AND item.origin='AZURE_DEVOPS' AND item.record_status='ACTIVE')=0 THEN 'Unavailable' ELSE ROUND(100.0*(SELECT COUNT(*) FROM backlog_items item WHERE item.project_id=link.project_id AND item.origin='AZURE_DEVOPS' AND item.record_status='ACTIVE' AND item.delivery_state<>'UNMAPPED')/(SELECT COUNT(*) FROM backlog_items item WHERE item.project_id=link.project_id AND item.origin='AZURE_DEVOPS' AND item.record_status='ACTIVE'))||'%' END Coverage,(SELECT COUNT(*) FROM backlog_items item WHERE item.project_id=link.project_id AND item.origin='AZURE_DEVOPS' AND item.record_status='ACTIVE' AND item.source_missing_at IS NOT NULL) Missing,(SELECT COUNT(*) FROM backlog_items item WHERE item.project_id=link.project_id AND item.origin='AZURE_DEVOPS' AND item.record_status='ACTIVE' AND item.source_missing_at IS NULL AND item.synced_at<datetime('now','-24 hours')) Stale,COALESCE((SELECT run.completed_at FROM azure_sync_runs run WHERE run.link_id=link.id ORDER BY run.started_at DESC,run.id DESC LIMIT 1),'Never') 'Last Sync',COALESCE((SELECT run.status FROM azure_sync_runs run WHERE run.link_id=link.id ORDER BY run.started_at DESC,run.id DESC LIMIT 1),link.last_validation_status) Status FROM azure_project_links link JOIN projects project ON project.id=link.project_id JOIN azure_connections connection ON connection.id=link.connection_id WHERE link.record_status='ACTIVE' AND connection.record_status='ACTIVE' ORDER BY project.name`,
    sourceFreshness: "Latest governed link, mapping and synchronization evidence",
  },
} as const satisfies Record<string, ReportDefinition>;

export type ReportKey = keyof typeof reportDefinitions;
type ReportRow = Record<string, string | number>;
type SummaryItem = { label: string; value: number; detail: string };

export function isReportKey(value: string): value is ReportKey {
  return value in reportDefinitions;
}

export async function getReport(key: ReportKey, input: { q?: string; page?: number; pageSize?: number; exportAll?: boolean }) {
  const definition = reportDefinitions[key];
  const q = (input.q || "").trim().toLowerCase();
  const page = Math.max(1, input.page || 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize || 25));
  const result = await env.DB.prepare(definition.sql).all<ReportRow>();
  const all = result.results || [];
  const filtered = q ? all.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(q))) : all;
  const rows = input.exportAll ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  return {
    key,
    title: definition.title,
    description: definition.description,
    columns: definition.columns,
    rows,
    total: filtered.length,
    summary: buildSummary(key, filtered),
    parameters: { q, page, pageSize },
    generatedAt: new Date().toISOString(),
    sourceFreshness: definition.sourceFreshness,
  };
}

function buildSummary(key: ReportKey, rows: ReportRow[]): SummaryItem[] {
  const sum = (column: string) => rows.reduce((total, row) => total + Number(row[column] || 0), 0);
  const average = (column: string) => rows.length ? Math.round(sum(column) / rows.length * 10) / 10 : 0;
  if (key === "backlog-composition") return rows.slice(0, 8).map((row) => ({ label: `${row.Source} · ${row.Type} · ${row.Status}`, value: Number(row.Items), detail: `${row.Blocked} blocked` }));
  if (key === "story-readiness") return [
    { label: "Stories", value: rows.length, detail: "Visible Story/PBI records" },
    { label: "Ready", value: rows.filter((row) => row.Status === "READY").length, detail: "Normalized Ready state" },
    { label: "Criteria complete", value: rows.filter((row) => row["Criteria evidence"] === "Complete").length, detail: "Local structured evidence" },
    { label: "External evidence", value: rows.filter((row) => row.Source === "AZURE_DEVOPS").length, detail: "Read-only Azure Stories" },
  ];
  if (key === "sprint-performance") return [
    { label: "Sprints", value: rows.length, detail: "All governed Sprint records" },
    { label: "Committed points", value: sum("Committed Points"), detail: "Points are never combined with hours" },
    { label: "Completed points", value: sum("Completed Points"), detail: "Source-labelled completion" },
    { label: "Needs attention", value: rows.filter((row) => ["AT_RISK", "BLOCKED"].includes(String(row.Health))).length, detail: "Azure metric health evidence" },
  ];
  if (key === "velocity") return [
    { label: "Completed Sprints", value: rows.length, detail: "Sprints with point evidence" },
    { label: "Average velocity", value: average("Completed Points"), detail: "Completed points per visible Sprint" },
    { label: "Completed points", value: sum("Completed Points"), detail: "Total across visible Sprints" },
  ];
  if (key === "carryover") return [
    { label: "Carryover items", value: sum("Carryover Items"), detail: "Unfinished items carried forward" },
    { label: "Carryover points", value: sum("Carryover Points"), detail: "Point evidence only" },
    { label: "Sprints with carryover", value: rows.filter((row) => Number(row["Carryover Items"]) > 0).length, detail: "Visible Sprint evidence" },
  ];
  if (key === "delivery-attention") return [
    { label: "Attention items", value: rows.length, detail: "Blocked work plus open Bugs" },
    { label: "Blocked", value: rows.filter((row) => row.Signal === "Blocked").length, detail: "Active blocker evidence" },
    { label: "Open Bugs", value: rows.filter((row) => row.Type === "BUG").length, detail: "Not Done or Removed" },
    { label: "Stale or missing", value: rows.filter((row) => ["Stale", "Source missing"].includes(String(row.Freshness))).length, detail: "Azure source attention" },
  ];
  if (key === "burndown") {
    const latest = rows.at(-1);
    return latest ? [
      { label: "Planned scope", value: Number(latest.Planned), detail: `${latest.Sprint} · ${latest.Date}` },
      { label: "Remaining", value: Number(latest.Remaining), detail: "Latest observed point" },
      { label: "Ideal remaining", value: Number(latest["Ideal Remaining"]), detail: "Accessible chart comparison" },
      { label: "Scope change", value: Number(latest["Scope Change"]), detail: "Change at latest point" },
    ] : [];
  }
  if (key === "azure-coverage") return [
    { label: "Linked Projects", value: rows.length, detail: "Governed Azure scopes" },
    { label: "Mapped items", value: sum("Mapped"), detail: "Normalized work items" },
    { label: "Unmapped items", value: sum("Unmapped"), detail: "Excluded from misleading calculations" },
    { label: "Stale or missing", value: sum("Stale") + sum("Missing"), detail: "Source freshness attention" },
  ];
  return [];
}

export function reportCsv(report: Awaited<ReturnType<typeof getReport>>) {
  const safe = (value: unknown) => {
    let output = String(value ?? "");
    if (/^[=+\-@]/.test(output)) output = `'${output}`;
    return `"${output.replaceAll('"', '""')}"`;
  };
  return [report.columns.map(safe).join(","), ...report.rows.map((row) => report.columns.map((column) => safe(row[column])).join(","))].join("\r\n");
}
