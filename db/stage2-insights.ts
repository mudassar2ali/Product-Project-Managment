import { env } from "cloudflare:workers";

export type DeliveryInsightAccess = {
  backlog: boolean;
  sprints: boolean;
  metrics: boolean;
};

type CountRow = Record<string, number>;

const unavailable = (reason: string) => ({ available: false as const, reason });

export async function getProjectDeliveryInsights(projectId: string, access: DeliveryInsightAccess) {
  const linkPromise = env.DB.prepare(`
    SELECT l.id,l.connection_id connectionId,c.organization,l.azure_project_name azureProjectName,
      l.azure_team_name azureTeamName,l.last_validation_status validationStatus,
      (SELECT COUNT(*) FROM azure_mapping_entries mapping WHERE mapping.connection_id=l.connection_id AND mapping.active=1) activeMappings,
      (SELECT status FROM azure_sync_runs run WHERE run.link_id=l.id ORDER BY run.started_at DESC,run.id DESC LIMIT 1) lastSyncStatus,
      (SELECT completed_at FROM azure_sync_runs run WHERE run.link_id=l.id ORDER BY run.started_at DESC,run.id DESC LIMIT 1) lastSyncedAt,
      (SELECT error_code FROM azure_sync_runs run WHERE run.link_id=l.id ORDER BY run.started_at DESC,run.id DESC LIMIT 1) lastSyncError
    FROM azure_project_links l JOIN azure_connections c ON c.id=l.connection_id
    WHERE l.project_id=? AND l.record_status='ACTIVE' AND c.record_status='ACTIVE'
  `).bind(projectId).first<Record<string, unknown>>();

  const backlogPromise = access.backlog
    ? env.DB.prepare(`
        SELECT COUNT(*) total,
          COALESCE(SUM(CASE WHEN origin='LOCAL' THEN 1 ELSE 0 END),0) localItems,
          COALESCE(SUM(CASE WHEN origin='AZURE_DEVOPS' THEN 1 ELSE 0 END),0) azureItems,
          COALESCE(SUM(CASE WHEN item_type='STORY' THEN 1 ELSE 0 END),0) stories,
          COALESCE(SUM(CASE WHEN item_type='STORY' AND status='READY' THEN 1 ELSE 0 END),0) readyStories,
          COALESCE(SUM(CASE WHEN item_type='STORY' AND origin='LOCAL' AND length(trim(COALESCE(story_actor,'')))>0 AND length(trim(COALESCE(story_capability,'')))>0 AND length(trim(COALESCE(business_value,'')))>0 AND EXISTS(SELECT 1 FROM acceptance_criteria criteria WHERE criteria.backlog_item_id=backlog_items.id) THEN 1 ELSE 0 END),0) criteriaComplete,
          COALESCE(SUM(CASE WHEN blocked=1 AND status NOT IN('DONE','REMOVED') THEN 1 ELSE 0 END),0) blockers,
          COALESCE(SUM(CASE WHEN item_type='BUG' AND delivery_state NOT IN('DONE','REMOVED') THEN 1 ELSE 0 END),0) openBugs,
          COALESCE(SUM(CASE WHEN delivery_state='UNMAPPED' THEN 1 ELSE 0 END),0) unmapped,
          COALESCE(SUM(CASE WHEN source_missing_at IS NOT NULL THEN 1 ELSE 0 END),0) sourceMissing,
          COALESCE(SUM(CASE WHEN origin='AZURE_DEVOPS' AND source_missing_at IS NULL AND synced_at<datetime('now','-24 hours') THEN 1 ELSE 0 END),0) stale
        FROM backlog_items WHERE project_id=? AND record_status='ACTIVE'
      `).bind(projectId).first<CountRow>()
    : Promise.resolve(null);

  const compositionPromise = access.backlog
    ? env.DB.prepare(`
        SELECT origin,item_type itemType,delivery_state deliveryState,COUNT(*) items
        FROM backlog_items WHERE project_id=? AND record_status='ACTIVE'
        GROUP BY origin,item_type,delivery_state
        ORDER BY origin,item_type,delivery_state LIMIT 60
      `).bind(projectId).all<{ origin: string; itemType: string; deliveryState: string; items: number }>()
    : Promise.resolve({ results: [] as Array<{ origin: string; itemType: string; deliveryState: string; items: number }> });

  const sprintPromise = access.sprints
    ? env.DB.prepare(`
        SELECT s.id,s.business_id businessId,s.name,s.goal,s.origin,s.status,s.start_date startDate,s.end_date endDate,s.synced_at syncedAt,
          metric.id metricId,metric.calculated_at calculatedAt,metric.source_revision sourceRevision,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.planned_points ELSE COALESCE((SELECT SUM(m.planned_points) FROM sprint_memberships m WHERE m.sprint_id=s.id AND m.removed_at IS NULL),0) END plannedPoints,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.completed_points ELSE COALESCE((SELECT SUM(m.planned_points) FROM sprint_memberships m JOIN backlog_items item ON item.id=m.backlog_item_id WHERE m.sprint_id=s.id AND m.removed_at IS NULL AND item.status='DONE'),0) END completedPoints,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.planned_items ELSE (SELECT COUNT(*) FROM sprint_memberships m WHERE m.sprint_id=s.id AND m.removed_at IS NULL) END plannedItems,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.completed_items ELSE (SELECT COUNT(*) FROM sprint_memberships m JOIN backlog_items item ON item.id=m.backlog_item_id WHERE m.sprint_id=s.id AND m.removed_at IS NULL AND item.status='DONE') END completedItems,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.progress WHEN COALESCE((SELECT SUM(m.planned_points) FROM sprint_memberships m WHERE m.sprint_id=s.id AND m.removed_at IS NULL),0)>0 THEN ROUND(100.0*COALESCE((SELECT SUM(m.planned_points) FROM sprint_memberships m JOIN backlog_items item ON item.id=m.backlog_item_id WHERE m.sprint_id=s.id AND m.removed_at IS NULL AND item.status='DONE'),0)/(SELECT SUM(m.planned_points) FROM sprint_memberships m WHERE m.sprint_id=s.id AND m.removed_at IS NULL)) WHEN (SELECT COUNT(*) FROM sprint_memberships m WHERE m.sprint_id=s.id AND m.removed_at IS NULL)>0 THEN ROUND(100.0*(SELECT COUNT(*) FROM sprint_memberships m JOIN backlog_items item ON item.id=m.backlog_item_id WHERE m.sprint_id=s.id AND m.removed_at IS NULL AND item.status='DONE')/(SELECT COUNT(*) FROM sprint_memberships m WHERE m.sprint_id=s.id AND m.removed_at IS NULL)) ELSE NULL END progress,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.health ELSE NULL END health,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.completion_method WHEN COALESCE((SELECT SUM(m.planned_points) FROM sprint_memberships m WHERE m.sprint_id=s.id AND m.removed_at IS NULL),0)>0 THEN 'POINTS' WHEN (SELECT COUNT(*) FROM sprint_memberships m WHERE m.sprint_id=s.id AND m.removed_at IS NULL)>0 THEN 'ITEM_COUNT' ELSE 'NOT_AVAILABLE' END completionMethod,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.open_bug_count ELSE (SELECT COUNT(*) FROM sprint_memberships m JOIN backlog_items item ON item.id=m.backlog_item_id WHERE m.sprint_id=s.id AND m.removed_at IS NULL AND item.item_type='BUG' AND item.status<>'DONE') END openBugCount,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.blocker_count ELSE (SELECT COUNT(*) FROM sprint_memberships m JOIN backlog_items item ON item.id=m.backlog_item_id WHERE m.sprint_id=s.id AND m.removed_at IS NULL AND item.blocked=1 AND item.status<>'DONE') END blockerCount
        FROM sprints s
        LEFT JOIN sprint_metric_snapshots metric ON metric.id=(SELECT latest.id FROM sprint_metric_snapshots latest WHERE latest.sprint_id=s.id ORDER BY latest.calculated_at DESC,latest.id DESC LIMIT 1)
        WHERE s.project_id=? AND s.status='ACTIVE' AND s.record_status='ACTIVE'
        ORDER BY s.updated_at DESC,s.id DESC LIMIT 1
      `).bind(projectId).first<Record<string, unknown>>()
    : Promise.resolve(null);

  const historyPromise = access.sprints && access.metrics
    ? env.DB.prepare(`
        SELECT s.id,s.business_id businessId,s.name,s.origin,s.end_date endDate,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.completed_points ELSE COALESCE((SELECT SUM(m.planned_points) FROM sprint_completion_dispositions disposition JOIN sprint_memberships m ON m.id=disposition.membership_id WHERE disposition.sprint_id=s.id AND disposition.disposition='COMPLETED'),0) END completedPoints,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.carryover_count ELSE (SELECT COUNT(*) FROM sprint_completion_dispositions disposition WHERE disposition.sprint_id=s.id AND disposition.disposition='CARRYOVER') END carryoverCount,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.carryover_points ELSE COALESCE((SELECT SUM(m.planned_points) FROM sprint_completion_dispositions disposition JOIN sprint_memberships m ON m.id=disposition.membership_id WHERE disposition.sprint_id=s.id AND disposition.disposition='CARRYOVER'),0) END carryoverPoints,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.calculated_at ELSE s.completed_at END calculatedAt,
          CASE WHEN s.origin='AZURE_DEVOPS' THEN metric.id IS NOT NULL ELSE 1 END evidenceAvailable
        FROM sprints s
        LEFT JOIN sprint_metric_snapshots metric ON metric.id=(SELECT latest.id FROM sprint_metric_snapshots latest WHERE latest.sprint_id=s.id ORDER BY latest.calculated_at DESC,latest.id DESC LIMIT 1)
        WHERE s.project_id=? AND s.status='COMPLETED' AND s.record_status='ACTIVE'
        ORDER BY s.end_date DESC,s.id DESC LIMIT 6
      `).bind(projectId).all<Record<string, unknown>>()
    : Promise.resolve({ results: [] as Record<string, unknown>[] });

  const [link, backlog, composition, sprint, historyResult] = await Promise.all([linkPromise, backlogPromise, compositionPromise, sprintPromise, historyPromise]);
  const history = historyResult.results.filter((row) => Boolean(row.evidenceAvailable));
  const pointSeries = history.filter((row) => typeof row.completedPoints === "number");
  const velocityAverage = pointSeries.length
    ? Math.round(pointSeries.reduce((sum, row) => sum + Number(row.completedPoints), 0) / pointSeries.length * 10) / 10
    : null;

  const backlogEvidence = access.backlog
    ? { available: true as const, summary: backlog ?? {}, composition: composition.results }
    : unavailable("Backlog evidence requires Backlog view permission.");
  const sprintEvidence = access.sprints
    ? { available: true as const, current: sprint ? maskSprintMetric(sprint, access.metrics) : null }
    : unavailable("Sprint evidence requires Sprint view permission.");
  const trendEvidence = access.sprints && access.metrics
    ? {
        available: true as const,
        velocityAverage,
        velocitySeries: [...history].reverse(),
        carryoverCount: history.reduce((sum, row) => sum + Number(row.carryoverCount ?? 0), 0),
        carryoverPoints: history.reduce((sum, row) => sum + Number(row.carryoverPoints ?? 0), 0),
      }
    : unavailable("Velocity and carryover require delivery metric permission.");

  return {
    backlog: backlogEvidence,
    sprint: sprintEvidence,
    trends: trendEvidence,
    source: link
      ? {
          connected: true,
          ...link,
          unmapped: Number(backlog?.unmapped ?? 0),
          sourceMissing: Number(backlog?.sourceMissing ?? 0),
          stale: Number(backlog?.stale ?? 0),
        }
      : { connected: false, reason: "No governed Azure Project link is configured." },
  };
}

function maskSprintMetric(sprint: Record<string, unknown>, canViewMetrics: boolean) {
  if (canViewMetrics || sprint.origin === "LOCAL") return { ...sprint, metricAvailable: sprint.origin === "LOCAL" || Boolean(sprint.metricId) };
  return {
    id: sprint.id,
    businessId: sprint.businessId,
    name: sprint.name,
    goal: sprint.goal,
    origin: sprint.origin,
    status: sprint.status,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    syncedAt: sprint.syncedAt,
    metricAvailable: false,
    metricWithheld: true,
  };
}

export async function getPortfolioDeliveryInsights(access: DeliveryInsightAccess) {
  const backlogPromise = access.backlog
    ? env.DB.prepare(`
        SELECT COUNT(*) total,
          COALESCE(SUM(CASE WHEN status='READY' THEN 1 ELSE 0 END),0) ready,
          COALESCE(SUM(CASE WHEN blocked=1 AND status NOT IN('DONE','REMOVED') THEN 1 ELSE 0 END),0) blockers,
          COALESCE(SUM(CASE WHEN item_type='BUG' AND delivery_state NOT IN('DONE','REMOVED') THEN 1 ELSE 0 END),0) openBugs,
          COALESCE(SUM(CASE WHEN delivery_state='UNMAPPED' THEN 1 ELSE 0 END),0) unmapped,
          COALESCE(SUM(CASE WHEN source_missing_at IS NOT NULL THEN 1 ELSE 0 END),0) sourceMissing,
          COALESCE(SUM(CASE WHEN origin='AZURE_DEVOPS' AND source_missing_at IS NULL AND synced_at<datetime('now','-24 hours') THEN 1 ELSE 0 END),0) stale
        FROM backlog_items WHERE record_status='ACTIVE'
      `).first<CountRow>()
    : Promise.resolve(null);

  const currentSprintPromise = access.sprints && access.metrics
    ? env.DB.prepare(`
        SELECT COUNT(*) active,
          COALESCE(SUM(CASE WHEN metric.health='AT_RISK' THEN 1 ELSE 0 END),0) atRisk,
          COALESCE(SUM(CASE WHEN metric.health='BLOCKED' THEN 1 ELSE 0 END),0) blocked,
          COALESCE(SUM(CASE WHEN metric.id IS NULL THEN 1 ELSE 0 END),0) unavailable,
          ROUND(AVG(metric.progress),1) averageProgress
        FROM sprints sprint
        LEFT JOIN sprint_metric_snapshots metric ON metric.id=(SELECT latest.id FROM sprint_metric_snapshots latest WHERE latest.sprint_id=sprint.id ORDER BY latest.calculated_at DESC,latest.id DESC LIMIT 1)
        WHERE sprint.status='ACTIVE' AND sprint.record_status='ACTIVE'
      `).first<CountRow>()
    : Promise.resolve(null);

  const historyPromise = access.sprints && access.metrics
    ? env.DB.prepare(`
        SELECT ROUND(AVG(completedPoints),1) velocityAverage,COUNT(*) evidenceSprints,
          COALESCE(SUM(carryoverCount),0) carryoverCount,COALESCE(SUM(carryoverPoints),0) carryoverPoints
        FROM (
          SELECT sprint.id,
            CASE WHEN sprint.origin='AZURE_DEVOPS' THEN metric.completed_points ELSE COALESCE((SELECT SUM(m.planned_points) FROM sprint_completion_dispositions disposition JOIN sprint_memberships m ON m.id=disposition.membership_id WHERE disposition.sprint_id=sprint.id AND disposition.disposition='COMPLETED'),0) END completedPoints,
            CASE WHEN sprint.origin='AZURE_DEVOPS' THEN metric.carryover_count ELSE (SELECT COUNT(*) FROM sprint_completion_dispositions disposition WHERE disposition.sprint_id=sprint.id AND disposition.disposition='CARRYOVER') END carryoverCount,
            CASE WHEN sprint.origin='AZURE_DEVOPS' THEN metric.carryover_points ELSE COALESCE((SELECT SUM(m.planned_points) FROM sprint_completion_dispositions disposition JOIN sprint_memberships m ON m.id=disposition.membership_id WHERE disposition.sprint_id=sprint.id AND disposition.disposition='CARRYOVER'),0) END carryoverPoints
          FROM sprints sprint
          LEFT JOIN sprint_metric_snapshots metric ON metric.id=(SELECT latest.id FROM sprint_metric_snapshots latest WHERE latest.sprint_id=sprint.id ORDER BY latest.calculated_at DESC,latest.id DESC LIMIT 1)
          WHERE sprint.status='COMPLETED' AND sprint.record_status='ACTIVE' AND (sprint.origin='LOCAL' OR metric.id IS NOT NULL)
          ORDER BY sprint.end_date DESC LIMIT 60
        ) evidence
      `).first<CountRow>()
    : Promise.resolve(null);

  const backlogAttentionPromise = access.backlog
    ? env.DB.prepare(`
        SELECT 'Backlog' kind,item.business_id businessId,item.title,
          CASE WHEN item.source_missing_at IS NOT NULL THEN 'Source missing' WHEN item.delivery_state='UNMAPPED' THEN 'Unmapped' WHEN item.blocked=1 THEN 'Blocked' ELSE 'Open Bug' END signal,
          NULL dueDate,'Backlog' destination
        FROM backlog_items item
        WHERE item.record_status='ACTIVE' AND (item.source_missing_at IS NOT NULL OR item.delivery_state='UNMAPPED' OR (item.blocked=1 AND item.status NOT IN('DONE','REMOVED')) OR (item.item_type='BUG' AND item.delivery_state NOT IN('DONE','REMOVED')))
        ORDER BY CASE WHEN item.source_missing_at IS NOT NULL THEN 0 WHEN item.blocked=1 THEN 1 WHEN item.delivery_state='UNMAPPED' THEN 2 ELSE 3 END,item.updated_at DESC
        LIMIT 6
      `).all<Record<string, unknown>>()
    : Promise.resolve({ results: [] as Record<string, unknown>[] });

  const sprintAttentionPromise = access.sprints && access.metrics
    ? env.DB.prepare(`
        SELECT 'Sprint' kind,sprint.business_id businessId,sprint.name title,
          CASE WHEN metric.health='BLOCKED' THEN 'Blocked' WHEN metric.health='AT_RISK' THEN 'At risk' ELSE metric.blocker_count||' blockers' END signal,
          sprint.end_date dueDate,'Sprints' destination
        FROM sprints sprint JOIN sprint_metric_snapshots metric ON metric.id=(SELECT latest.id FROM sprint_metric_snapshots latest WHERE latest.sprint_id=sprint.id ORDER BY latest.calculated_at DESC,latest.id DESC LIMIT 1)
        WHERE sprint.status='ACTIVE' AND sprint.record_status='ACTIVE' AND (metric.health IN('AT_RISK','BLOCKED') OR metric.blocker_count>0)
        ORDER BY CASE metric.health WHEN 'BLOCKED' THEN 0 ELSE 1 END,sprint.end_date LIMIT 6
      `).all<Record<string, unknown>>()
    : Promise.resolve({ results: [] as Record<string, unknown>[] });

  const [backlog, currentSprints, history, backlogAttention, sprintAttention] = await Promise.all([backlogPromise, currentSprintPromise, historyPromise, backlogAttentionPromise, sprintAttentionPromise]);
  return {
    backlog: access.backlog ? { available: true as const, ...backlog } : unavailable("Backlog evidence is not available under the current permissions."),
    sprints: access.sprints && access.metrics ? { available: true as const, current: currentSprints, history } : unavailable("Sprint delivery metrics are not available under the current permissions."),
    attention: [...backlogAttention.results, ...sprintAttention.results].slice(0, 10),
  };
}
