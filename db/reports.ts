import { env } from "cloudflare:workers";

type ReportRow = Record<string, string | number>;

type ReportDefinition = {
  title: string;
  description: string;
  columns: readonly string[];
  sql?: string;
  computeRows?: () => Promise<ReportRow[]>;
  sourceFreshness: string;
};

const documentVersionOrder = `CASE cv.lifecycle_status WHEN 'DRAFT' THEN 0 WHEN 'IN_REVIEW' THEN 1 WHEN 'APPROVED_WITH_CONDITIONS' THEN 2 WHEN 'APPROVED' THEN 3 ELSE 4 END, cv.major_version DESC, cv.minor_version DESC, cv.created_at DESC`;
const requirementRevisionOrder = `CASE cv.governance_status WHEN 'DRAFT' THEN 0 WHEN 'IN_REVIEW' THEN 1 WHEN 'APPROVED' THEN 2 ELSE 3 END, cv.revision_number DESC, cv.created_at DESC`;
const feasibilityRevisionOrder = `CASE cv.status WHEN 'DRAFT' THEN 0 WHEN 'IN_REVIEW' THEN 1 WHEN 'FEASIBLE_WITH_CONDITIONS' THEN 2 ELSE 3 END, cv.revision_number DESC, cv.created_at DESC`;
const subjectTitle = `COALESCE(
      (SELECT d.title||' — '||v.version_label FROM governance_document_versions v JOIN governance_documents d ON d.id=v.document_id WHERE v.id=sr.document_version_id),
      (SELECT r.business_id||' — '||rev.title FROM requirement_revisions rev JOIN requirements r ON r.id=rev.requirement_id WHERE rev.id=sr.requirement_revision_id),
      (SELECT a.business_id||' — Feasibility Rev '||fr.revision_number FROM technical_feasibility_revisions fr JOIN technical_feasibility_assessments a ON a.id=fr.assessment_id WHERE fr.id=sr.feasibility_revision_id)
    )`;
const subjectType = `CASE WHEN sr.document_version_id IS NOT NULL THEN 'BRD/PRD' WHEN sr.requirement_revision_id IS NOT NULL THEN 'Requirement' ELSE 'Feasibility' END`;

type DeliveryRequirementRow = { id: string; businessId: string; requirementType: string; productName: string; projectName: string | null; title: string | null; governanceStatus: string | null };
type DeliveryLinkRow = { requirementId: string; linkType: string; origin: string; status: string; deliveryState: string; sourceMissingAt: string | null };
type DeliveryEvidenceRow = { requirementId: string; evidenceStatus: string; observedAt: string | null };

async function loadRequirementDeliveryRows() {
  const { deriveEvidenceFreshness, deriveRequirementDeliveryStatus } = await import("../app/governance/stage3-contract");
  const requirementsResult = await env.DB.prepare(`
    SELECT r.id,r.business_id businessId,r.requirement_type requirementType,p.name productName,pr.name projectName,
      rev.title title,rev.governance_status governanceStatus
    FROM requirements r
    JOIN products p ON p.id=r.product_id
    LEFT JOIN projects pr ON pr.id=r.project_id
    LEFT JOIN requirement_revisions rev ON rev.id=(
      SELECT cv.id FROM requirement_revisions cv WHERE cv.requirement_id=r.id ORDER BY ${requirementRevisionOrder} LIMIT 1
    )
    WHERE r.record_status='ACTIVE'
    ORDER BY r.business_id
  `).all();
  const requirements = requirementsResult.results as DeliveryRequirementRow[];
  if (!requirements.length) return [];
  const ids = requirements.map((requirement: DeliveryRequirementRow) => requirement.id);
  const placeholders = ids.map(() => "?").join(",");
  const [linksResult, evidenceResult] = await Promise.all([
    env.DB.prepare(`
      SELECT l.requirement_id requirementId,l.link_type linkType,b.origin,b.status,b.delivery_state deliveryState,b.source_missing_at sourceMissingAt
      FROM requirement_backlog_links l JOIN backlog_items b ON b.id=l.backlog_item_id
      WHERE l.requirement_id IN (${placeholders})
    `).bind(...ids).all(),
    env.DB.prepare(`
      SELECT requirement_id requirementId,evidence_status evidenceStatus,observed_at observedAt
      FROM requirement_evidence_references WHERE requirement_id IN (${placeholders})
    `).bind(...ids).all(),
  ]);
  const links = linksResult.results as DeliveryLinkRow[];
  const evidenceRecords = evidenceResult.results as DeliveryEvidenceRow[];
  const linksByRequirement = new Map<string, DeliveryLinkRow[]>();
  for (const link of links) linksByRequirement.set(link.requirementId, [...(linksByRequirement.get(link.requirementId) ?? []), link]);
  const evidenceByRequirement = new Map<string, DeliveryEvidenceRow[]>();
  for (const record of evidenceRecords) evidenceByRequirement.set(record.requirementId, [...(evidenceByRequirement.get(record.requirementId) ?? []), record]);
  const nowIso = new Date().toISOString();
  return requirements.map((requirement: DeliveryRequirementRow) => {
    const requirementLinks = linksByRequirement.get(requirement.id) ?? [];
    const deliveryStatus = deriveRequirementDeliveryStatus(requirementLinks.map((link: DeliveryLinkRow) => ({
      linkType: link.linkType as "IMPLEMENTS" | "PARTIALLY_IMPLEMENTS" | "VALIDATES",
      origin: link.origin as "LOCAL" | "AZURE_DEVOPS",
      status: link.status,
      deliveryState: link.deliveryState,
      sourceMissingAt: link.sourceMissingAt,
    })));
    const evidence = evidenceByRequirement.get(requirement.id) ?? [];
    const freshness = evidence.map((record: DeliveryEvidenceRow) => deriveEvidenceFreshness(record.evidenceStatus as "NOT_AVAILABLE" | "PENDING" | "PASSED" | "FAILED" | "CONDITIONAL" | "STALE", record.observedAt, nowIso));
    return { ...requirement, deliveryStatus, linkCount: requirementLinks.length, evidenceCount: evidence.length, hasStaleEvidence: freshness.includes("STALE") };
  });
}

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
  "governance-portfolio": {
    title: "BRD/PRD Portfolio Status and Version Report",
    description: "Governed BRD and PRD documents with their current version and lifecycle status.",
    columns: ["ID", "Type", "Title", "Product", "Project", "Owner", "Status", "Version", "Updated"],
    sql: `SELECT d.business_id ID,d.document_type Type,d.title Title,p.name Product,COALESCE(pr.name,'—') Project,COALESCE(u.display_name,'Unassigned') Owner,COALESCE(v.lifecycle_status,'—') Status,COALESCE(v.version_label,'—') Version,d.updated_at Updated FROM governance_documents d JOIN products p ON p.id=d.product_id LEFT JOIN projects pr ON pr.id=d.project_id LEFT JOIN users u ON u.id=d.owner_user_id LEFT JOIN governance_document_versions v ON v.id=(SELECT cv.id FROM governance_document_versions cv WHERE cv.document_id=d.id ORDER BY ${documentVersionOrder} LIMIT 1) WHERE d.record_status='ACTIVE' ORDER BY d.document_type,d.business_id`,
    sourceFreshness: "Current persisted records",
  },
  "requirement-register": {
    title: "Requirement Register by Type, Priority, Owner and Governance Status",
    description: "Every governed Requirement with its current revision status and ownership.",
    columns: ["ID", "Type", "Title", "Priority", "Product", "Project", "Owner", "Status", "Updated"],
    sql: `SELECT r.business_id ID,r.requirement_type Type,COALESCE(rev.title,'—') Title,COALESCE(rev.priority,'—') Priority,p.name Product,COALESCE(pr.name,'—') Project,COALESCE(u.display_name,'Unassigned') Owner,COALESCE(rev.governance_status,'—') Status,r.updated_at Updated FROM requirements r JOIN products p ON p.id=r.product_id LEFT JOIN projects pr ON pr.id=r.project_id LEFT JOIN users u ON u.id=r.owner_user_id LEFT JOIN requirement_revisions rev ON rev.id=(SELECT cv.id FROM requirement_revisions cv WHERE cv.requirement_id=r.id ORDER BY ${requirementRevisionOrder} LIMIT 1) WHERE r.record_status='ACTIVE' ORDER BY r.requirement_type,r.business_id`,
    sourceFreshness: "Current persisted records",
  },
  "requirement-traceability-coverage": {
    title: "Requirement-to-Delivery Traceability Coverage and Gap Report",
    description: "Requirement delivery status derived from backlog links, with verification evidence counts.",
    columns: ["ID", "Type", "Title", "Product", "Project", "Governance", "Delivery", "Backlog Links", "Evidence"],
    computeRows: async () => (await loadRequirementDeliveryRows()).map((row) => ({
      ID: row.businessId, Type: row.requirementType, Title: row.title ?? "—", Product: row.productName, Project: row.projectName ?? "—",
      Governance: row.governanceStatus ?? "—", Delivery: row.deliveryStatus, "Backlog Links": row.linkCount, Evidence: row.evidenceCount,
    })),
    sourceFreshness: "Current local and latest synchronized Azure records",
  },
  "requirement-integrity": {
    title: "Unlinked, Stale, Source-missing and Conflicting Requirement Report",
    description: "Requirements needing attention: no delivery link, missing Azure source, stale evidence or conflicting delivery signals.",
    columns: ["ID", "Type", "Title", "Product", "Project", "Governance", "Delivery", "Attention"],
    computeRows: async () => (await loadRequirementDeliveryRows())
      .map((row) => {
        const attention: string[] = [];
        if (row.deliveryStatus === "NOT_LINKED") attention.push("Unlinked");
        if (row.deliveryStatus === "SOURCE_UNAVAILABLE") attention.push("Source missing");
        if (row.deliveryStatus === "PARTIAL") attention.push("Conflicting delivery signals");
        if (row.hasStaleEvidence) attention.push("Stale evidence");
        return { row, attention };
      })
      .filter((entry) => entry.attention.length > 0)
      .map(({ row, attention }) => ({
        ID: row.businessId, Type: row.requirementType, Title: row.title ?? "—", Product: row.productName, Project: row.projectName ?? "—",
        Governance: row.governanceStatus ?? "—", Delivery: row.deliveryStatus, Attention: attention.join(", "),
      })),
    sourceFreshness: "Current local and latest synchronized Azure records",
  },
  "signoff-approval-aging": {
    title: "Approval Aging and Overdue Lane Report",
    description: "Open sign-off lanes with elapsed age against their request date and any recorded due date.",
    columns: ["Subject", "Subject Type", "Lane", "Approver", "Status", "Requested", "Age (days)", "Due", "Overdue"],
    sql: `SELECT ${subjectTitle} Subject,${subjectType} 'Subject Type',l.lane_type Lane,COALESCE(u.display_name,'Unassigned') Approver,l.status Status,sr.requested_at Requested,CAST(ROUND(julianday('now')-julianday(sr.requested_at)) AS INTEGER) 'Age (days)',COALESCE(l.due_at,'—') Due,CASE WHEN l.due_at IS NOT NULL AND date(l.due_at)<date('now') THEN 'Overdue' ELSE 'On track' END Overdue FROM signoff_lanes l JOIN signoff_requests sr ON sr.id=l.signoff_request_id LEFT JOIN users u ON u.id=l.assigned_approver_user_id WHERE l.status IN ('PENDING','UNDER_REVIEW') ORDER BY 7 DESC`,
    sourceFreshness: "Current persisted records",
  },
  "signoff-condition-tracking": {
    title: "Approved-with-Conditions and Overdue-Condition Report",
    description: "Conditions attached to Approved with Conditions decisions, with closure and overdue evidence.",
    columns: ["Subject", "Subject Type", "Description", "Owner", "Status", "Due", "Overdue", "Created"],
    sql: `SELECT ${subjectTitle} Subject,${subjectType} 'Subject Type',c.description Description,COALESCE(u.display_name,'Unassigned') Owner,c.status Status,COALESCE(c.due_at,'—') Due,CASE WHEN c.status='OPEN' AND c.due_at IS NOT NULL AND date(c.due_at)<date('now') THEN 'Overdue' ELSE 'On track' END Overdue,c.created_at Created FROM signoff_conditions c JOIN signoff_decisions dec ON dec.id=c.decision_id JOIN signoff_lanes l ON l.id=dec.signoff_lane_id JOIN signoff_requests sr ON sr.id=l.signoff_request_id LEFT JOIN users u ON u.id=c.owner_user_id ORDER BY CASE c.status WHEN 'OPEN' THEN 0 ELSE 1 END,c.created_at DESC`,
    sourceFreshness: "Current persisted records",
  },
  "raci-completeness": {
    title: "RACI Completeness and Accountability-Gap Report",
    description: "Every RACI activity with its assignment counts and accountability-gap evidence.",
    columns: ["Project", "Matrix", "Activity", "Status", "Accountable", "Responsible", "Consulted", "Informed", "Gap"],
    sql: `SELECT pr.name Project,m.title Matrix,act.name Activity,m.status Status,COALESCE((SELECT GROUP_CONCAT(s.display_name,', ') FROM raci_assignments asg JOIN governance_stakeholders s ON s.id=asg.stakeholder_id WHERE asg.activity_id=act.id AND asg.responsibility='ACCOUNTABLE'),'—') Accountable,COALESCE((SELECT GROUP_CONCAT(s.display_name,', ') FROM raci_assignments asg JOIN governance_stakeholders s ON s.id=asg.stakeholder_id WHERE asg.activity_id=act.id AND asg.responsibility='RESPONSIBLE'),'—') Responsible,(SELECT COUNT(*) FROM raci_assignments asg WHERE asg.activity_id=act.id AND asg.responsibility='CONSULTED') Consulted,(SELECT COUNT(*) FROM raci_assignments asg WHERE asg.activity_id=act.id AND asg.responsibility='INFORMED') Informed,CASE WHEN (SELECT COUNT(*) FROM raci_assignments asg WHERE asg.activity_id=act.id AND asg.responsibility='ACCOUNTABLE')<>1 THEN 'Missing or duplicate Accountable' WHEN (SELECT COUNT(*) FROM raci_assignments asg WHERE asg.activity_id=act.id AND asg.responsibility='RESPONSIBLE')=0 THEN 'Missing Responsible' ELSE 'Complete' END Gap FROM raci_activities act JOIN raci_matrices m ON m.id=act.matrix_id JOIN projects pr ON pr.id=m.project_id ORDER BY pr.name,m.title,act.name`,
    sourceFreshness: "Current persisted records",
  },
  "feasibility-status": {
    title: "Technical-Feasibility Status, Risk and Outstanding-Condition Report",
    description: "Feasibility assessments with current recommendation, estimate and open sign-off conditions.",
    columns: ["ID", "Project", "Feature", "Owner", "Status", "Recommendation", "Estimate", "Open Conditions", "Updated"],
    sql: `SELECT a.business_id ID,pr.name Project,COALESCE(bi.title,'—') Feature,COALESCE(u.display_name,'Unassigned') Owner,COALESCE(rev.status,'—') Status,COALESCE(NULLIF(rev.recommendation,''),'—') Recommendation,CASE WHEN rev.engineering_estimate IS NOT NULL THEN rev.engineering_estimate||' '||LOWER(rev.estimate_unit) ELSE '—' END Estimate,COALESCE((SELECT COUNT(*) FROM signoff_conditions c JOIN signoff_decisions dec ON dec.id=c.decision_id JOIN signoff_lanes l ON l.id=dec.signoff_lane_id JOIN signoff_requests sr ON sr.id=l.signoff_request_id WHERE sr.feasibility_revision_id=rev.id AND c.status='OPEN'),0) 'Open Conditions',a.updated_at Updated FROM technical_feasibility_assessments a JOIN projects pr ON pr.id=a.project_id LEFT JOIN backlog_items bi ON bi.id=a.backlog_feature_id LEFT JOIN users u ON u.id=a.owner_user_id LEFT JOIN technical_feasibility_revisions rev ON rev.id=(SELECT cv.id FROM technical_feasibility_revisions cv WHERE cv.assessment_id=a.id ORDER BY ${feasibilityRevisionOrder} LIMIT 1) WHERE a.record_status='ACTIVE' ORDER BY pr.name,a.business_id`,
    sourceFreshness: "Current persisted records",
  },
  "release-portfolio-status": {
    title: "Release Portfolio Status and Readiness",
    description: "Every governed Release with its current status, target version and latest readiness snapshot.",
    columns: ["ID", "Release", "Project", "Type", "Status", "Readiness", "Target Version", "Planned Date", "Owner"],
    sql: `SELECT r.business_id ID,r.name Release,pr.name Project,r.release_type Type,r.status Status,COALESCE((SELECT rs.readiness FROM release_readiness_snapshots rs WHERE rs.release_id=r.id ORDER BY rs.calculated_at DESC,rs.id DESC LIMIT 1),'NOT_CALCULATED') Readiness,COALESCE(NULLIF(r.target_version,''),'—') 'Target Version',COALESCE(r.planned_date,'—') 'Planned Date',COALESCE(u.display_name,'Unassigned') Owner FROM releases r JOIN projects pr ON pr.id=r.project_id LEFT JOIN users u ON u.id=r.owner_user_id WHERE r.record_status='ACTIVE' ORDER BY pr.name,r.business_id`,
    sourceFreshness: "Current persisted records and latest readiness snapshot",
  },
  "release-scope-delivery": {
    title: "Release Scope vs Delivery Status",
    description: "Backlog items scoped into a Release, with whether their delivery status is actually Done.",
    columns: ["Release", "Project", "Backlog Item", "Type", "Delivery Status", "Done"],
    sql: `SELECT r.business_id Release,pr.name Project,b.business_id 'Backlog Item',b.item_type Type,b.delivery_state 'Delivery Status',CASE WHEN b.status='DONE' THEN 'Yes' ELSE 'No' END Done FROM release_scope_items s JOIN releases r ON r.id=s.release_id JOIN projects pr ON pr.id=r.project_id JOIN backlog_items b ON b.id=s.backlog_item_id WHERE s.removed_at IS NULL AND r.record_status='ACTIVE' ORDER BY pr.name,r.business_id,b.business_id`,
    sourceFreshness: "Current active Release scope",
  },
  "uat-execution-pass-rate": {
    title: "UAT Execution and Pass-Rate Report",
    description: "Test case counts and the latest-execution pass rate for every UAT campaign, by Release.",
    columns: ["Campaign", "Release", "Project", "Status", "Test Cases", "Passed", "Failed", "Blocked", "Not Executed", "Pass Rate"],
    sql: `SELECT c.business_id Campaign,r.business_id Release,pr.name Project,c.status Status,COUNT(t.id) 'Test Cases',COALESCE(SUM(CASE WHEN latest.result='PASS' THEN 1 ELSE 0 END),0) Passed,COALESCE(SUM(CASE WHEN latest.result='FAIL' THEN 1 ELSE 0 END),0) Failed,COALESCE(SUM(CASE WHEN latest.result='BLOCKED' THEN 1 ELSE 0 END),0) Blocked,COALESCE(SUM(CASE WHEN latest.result IS NULL OR latest.result='NOT_EXECUTED' THEN 1 ELSE 0 END),0) 'Not Executed',CASE WHEN COUNT(t.id)=0 THEN '—' ELSE ROUND(100.0*COALESCE(SUM(CASE WHEN latest.result='PASS' THEN 1 ELSE 0 END),0)/COUNT(t.id))||'%' END 'Pass Rate' FROM uat_campaigns c JOIN releases r ON r.id=c.release_id JOIN projects pr ON pr.id=r.project_id LEFT JOIN uat_test_cases t ON t.campaign_id=c.id LEFT JOIN uat_test_executions latest ON latest.test_case_id=t.id AND latest.execution_number=(SELECT MAX(execution_number) FROM uat_test_executions WHERE test_case_id=t.id) WHERE c.record_status='ACTIVE' GROUP BY c.id,c.business_id,r.business_id,pr.name,c.status ORDER BY pr.name,r.business_id,c.business_id`,
    sourceFreshness: "Current campaigns and latest execution per test case",
  },
  "defect-aging-severity": {
    title: "Defect Aging, Severity and Status Report",
    description: "Every recorded defect with its severity, current status and age since it was reported.",
    columns: ["ID", "Title", "Project", "Release", "Source", "Severity", "Status", "Age (days)", "Reported", "Resolved"],
    sql: `SELECT d.business_id ID,d.title Title,pr.name Project,COALESCE(r.business_id,'—') Release,d.source Source,d.severity Severity,d.status Status,CAST(ROUND(julianday(COALESCE(d.closed_at,'now'))-julianday(d.reported_at)) AS INTEGER) 'Age (days)',d.reported_at Reported,COALESCE(d.resolved_at,'—') Resolved FROM defects d JOIN projects pr ON pr.id=d.project_id LEFT JOIN releases r ON r.id=d.release_id ORDER BY CASE d.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,d.reported_at DESC`,
    sourceFreshness: "Current persisted records",
  },
  "deployment-history-rollback": {
    title: "Deployment History and Rollback Report",
    description: "Every recorded deployment attempt by Release and environment, including rollback linkage.",
    columns: ["Release", "Project", "Environment", "Tier", "Status", "Deployed By", "Started", "Completed", "Reference", "Rollback Of"],
    sql: `SELECT r.business_id Release,pr.name Project,e.name Environment,e.tier Tier,d.status Status,COALESCE(u.display_name,'Unattributed') 'Deployed By',d.started_at Started,COALESCE(d.completed_at,'—') Completed,COALESCE(NULLIF(d.deployment_reference,''),'—') Reference,CASE WHEN d.rollback_of_id IS NOT NULL THEN COALESCE(NULLIF(ro.deployment_reference,''),'Deployment '||substr(ro.id,1,8)) ELSE '—' END 'Rollback Of' FROM deployment_records d JOIN releases r ON r.id=d.release_id JOIN projects pr ON pr.id=r.project_id JOIN release_environments e ON e.id=d.environment_id LEFT JOIN users u ON u.id=d.deployed_by_user_id LEFT JOIN deployment_records ro ON ro.id=d.rollback_of_id ORDER BY pr.name,r.business_id,d.started_at DESC`,
    sourceFreshness: "Current persisted records",
  },
} as const satisfies Record<string, ReportDefinition>;

export type ReportKey = keyof typeof reportDefinitions;
type SummaryItem = { label: string; value: number; detail: string };

export function isReportKey(value: string): value is ReportKey {
  return value in reportDefinitions;
}

export async function getReport(key: ReportKey, input: { q?: string; page?: number; pageSize?: number; exportAll?: boolean }) {
  const definition: ReportDefinition = reportDefinitions[key];
  const q = (input.q || "").trim().toLowerCase();
  const page = Math.max(1, input.page || 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize || 25));
  const all: ReportRow[] = definition.computeRows ? await definition.computeRows() : ((await env.DB.prepare(definition.sql!).all()).results as ReportRow[]) || [];
  const filtered = q ? all.filter((row: ReportRow) => Object.values(row).some((value) => String(value).toLowerCase().includes(q))) : all;
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
  if (key === "governance-portfolio") return [
    { label: "Documents", value: rows.length, detail: "Active BRD and PRD records" },
    { label: "BRD", value: rows.filter((row) => row.Type === "BRD").length, detail: "Business Requirements Documents" },
    { label: "PRD", value: rows.filter((row) => row.Type === "PRD").length, detail: "Product Requirements Documents" },
    { label: "Approved", value: rows.filter((row) => ["APPROVED", "APPROVED_WITH_CONDITIONS"].includes(String(row.Status))).length, detail: "Current version is approved" },
  ];
  if (key === "requirement-register") return [
    { label: "Requirements", value: rows.length, detail: "Active governed Requirements" },
    { label: "Critical / High", value: rows.filter((row) => ["CRITICAL", "HIGH"].includes(String(row.Priority))).length, detail: "Elevated priority evidence" },
    { label: "Approved", value: rows.filter((row) => row.Status === "APPROVED").length, detail: "Current revision is approved" },
    { label: "In review", value: rows.filter((row) => row.Status === "IN_REVIEW").length, detail: "Awaiting sign-off decision" },
  ];
  if (key === "requirement-traceability-coverage") return [
    { label: "Requirements", value: rows.length, detail: "Active governed Requirements" },
    { label: "Implemented", value: rows.filter((row) => row.Delivery === "IMPLEMENTED").length, detail: "Fully delivered against linked work" },
    { label: "In progress", value: rows.filter((row) => ["IN_PROGRESS", "PARTIAL", "PLANNED"].includes(String(row.Delivery))).length, detail: "Delivery underway or planned" },
    { label: "Gaps", value: rows.filter((row) => ["NOT_LINKED", "SOURCE_UNAVAILABLE"].includes(String(row.Delivery))).length, detail: "No delivery evidence available" },
  ];
  if (key === "requirement-integrity") return [
    { label: "Requirements needing attention", value: rows.length, detail: "Unlinked, stale, source-missing or conflicting" },
    { label: "Unlinked", value: rows.filter((row) => String(row.Attention).includes("Unlinked")).length, detail: "No delivery link recorded" },
    { label: "Source missing", value: rows.filter((row) => String(row.Attention).includes("Source missing")).length, detail: "Linked Azure work item no longer found" },
    { label: "Stale evidence", value: rows.filter((row) => String(row.Attention).includes("Stale evidence")).length, detail: "Verification evidence beyond the freshness window" },
  ];
  if (key === "signoff-approval-aging") return [
    { label: "Open lanes", value: rows.length, detail: "Pending or under-review approval lanes" },
    { label: "Overdue", value: rows.filter((row) => row.Overdue === "Overdue").length, detail: "Past the recorded due date" },
    { label: "Oldest (days)", value: rows.length ? Math.max(...rows.map((row) => Number(row["Age (days)"]))) : 0, detail: "Longest-open lane" },
    { label: "Average age (days)", value: average("Age (days)"), detail: "Across all open lanes" },
  ];
  if (key === "signoff-condition-tracking") return [
    { label: "Conditions", value: rows.length, detail: "Attached to Approved with Conditions decisions" },
    { label: "Open", value: rows.filter((row) => row.Status === "OPEN" || row.Status === "IN_PROGRESS").length, detail: "Not yet satisfied or waived" },
    { label: "Overdue", value: rows.filter((row) => row.Overdue === "Overdue").length, detail: "Past the recorded due date" },
    { label: "Satisfied / waived", value: rows.filter((row) => ["SATISFIED", "WAIVED"].includes(String(row.Status))).length, detail: "Closed conditions" },
  ];
  if (key === "raci-completeness") return [
    { label: "Activities", value: rows.length, detail: "Across all governed RACI matrices" },
    { label: "Complete", value: rows.filter((row) => row.Gap === "Complete").length, detail: "Exactly one Accountable and at least one Responsible" },
    { label: "Accountability gaps", value: rows.filter((row) => row.Gap !== "Complete").length, detail: "Missing or duplicate Accountable, or no Responsible" },
    { label: "Published matrices", value: new Set(rows.filter((row) => row.Status === "PUBLISHED").map((row) => row.Matrix)).size, detail: "Locked, governed matrices" },
  ];
  if (key === "feasibility-status") return [
    { label: "Assessments", value: rows.length, detail: "Active feasibility assessments" },
    { label: "Feasible", value: rows.filter((row) => ["FEASIBLE", "FEASIBLE_WITH_CONDITIONS"].includes(String(row.Status))).length, detail: "Current revision recommends feasible" },
    { label: "Not feasible", value: rows.filter((row) => row.Status === "NOT_FEASIBLE").length, detail: "Current revision recommends not feasible" },
    { label: "Open conditions", value: sum("Open Conditions"), detail: "Outstanding sign-off conditions" },
  ];
  if (key === "release-portfolio-status") return [
    { label: "Releases", value: rows.length, detail: "Active Release records" },
    { label: "Ready", value: rows.filter((row) => row.Readiness === "READY").length, detail: "Latest readiness snapshot" },
    { label: "At risk", value: rows.filter((row) => row.Readiness === "AT_RISK").length, detail: "Latest readiness snapshot" },
    { label: "Blocked", value: rows.filter((row) => row.Readiness === "BLOCKED").length, detail: "Latest readiness snapshot" },
  ];
  if (key === "release-scope-delivery") return [
    { label: "Scope items", value: rows.length, detail: "Active Release scope rows" },
    { label: "Done", value: rows.filter((row) => row.Done === "Yes").length, detail: "Backlog item delivery status is Done" },
    { label: "Not done", value: rows.filter((row) => row.Done === "No").length, detail: "Still in delivery" },
  ];
  if (key === "uat-execution-pass-rate") return [
    { label: "Campaigns", value: rows.length, detail: "Active UAT campaigns" },
    { label: "Test cases", value: sum("Test Cases"), detail: "Across all visible campaigns" },
    { label: "Passed", value: sum("Passed"), detail: "Latest execution per test case" },
    { label: "Failed / Blocked", value: sum("Failed") + sum("Blocked"), detail: "Requires attention" },
  ];
  if (key === "defect-aging-severity") return [
    { label: "Defects", value: rows.length, detail: "All recorded defects" },
    { label: "Open", value: rows.filter((row) => !["CLOSED", "DUPLICATE", "DEFERRED"].includes(String(row.Status))).length, detail: "Not Closed, Duplicate or Deferred" },
    { label: "Critical", value: rows.filter((row) => row.Severity === "CRITICAL").length, detail: "Highest severity" },
    { label: "Average age (days)", value: average("Age (days)"), detail: "Across all visible defects" },
  ];
  if (key === "deployment-history-rollback") return [
    { label: "Deployments", value: rows.length, detail: "All recorded deployment attempts" },
    { label: "Succeeded", value: rows.filter((row) => row.Status === "SUCCEEDED").length, detail: "Completed successfully" },
    { label: "Rolled back", value: rows.filter((row) => row.Status === "ROLLED_BACK").length, detail: "Reverted deployments" },
    { label: "Failed", value: rows.filter((row) => row.Status === "FAILED").length, detail: "Unsuccessful attempts" },
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
