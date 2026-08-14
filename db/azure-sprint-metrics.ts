import { env } from "cloudflare:workers";
import type { ExternalSprintSource, ExternalWorkItem } from "../app/integrations/engineering-delivery-provider";

export type MetricSyncContext = { id: string; projectId: string; connectionId: string; azureProjectId: string; azureTeamId: string | null };
export type NormalizedMetricItem = ExternalWorkItem & { normalizedType: string | null; normalizedState: string | null };

type ExistingSprint = { id: string; externalId: string; name: string; externalPath: string; startDate: string; endDate: string; status: string; sourceRevision: string | null };
type MetricPolicy = { id: string; healthTolerancePercentage: number; blockerThreshold: number; zeroProgressDays: number; velocityLookback: number };
type HistoricalItem = { externalId: string; externalRevision: string; normalizedType: string | null; normalizedState: string | null; storyPoints: number | null; remainingWork: number | null; blocked: number; iterationId: string; sourceChangedAt: string | null; syncedAt: string };
type ScopeItem = { externalId: string; normalizedType: string | null; normalizedState: string | null; storyPoints: number | null; remainingWork: number | null; blocked: boolean; iterationId: string; observedAt: string };
type PriorBurndown = { sprintId: string; snapshotDate: string; plannedScope: number };

const defaults: MetricPolicy = { id: "DEFAULT", healthTolerancePercentage: 15, blockerThreshold: 3, zeroProgressDays: 2, velocityLookback: 6 };
const executionTypes = new Set(["STORY", "TASK", "BUG"]);
const terminalStates = new Set(["DONE", "REMOVED"]);
const dayMilliseconds = 86_400_000;
const dateValue = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`).getTime();
const daysInclusive = (start: string, end: string) => Math.max(1, Math.floor((dateValue(end) - dateValue(start)) / dayMilliseconds) + 1);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

async function revision(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input || "EMPTY"));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function sprintStatus(startDate: string, finishDate: string, currentDate: string) {
  if (currentDate < startDate) return "PLANNED";
  if (currentDate > finishDate) return "COMPLETED";
  return "ACTIVE";
}

function businessId(linkId: string, iterationId: string) {
  const link = linkId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
  const iteration = iterationId.replace(/[^a-z0-9]/gi, "").slice(0, 32).toUpperCase();
  return `ADO-SPR-${link}-${iteration}`;
}

export async function prepareAzureSprintMetricSync(args: { runId: string; context: MetricSyncContext; itemSourceRevision: string; items: NormalizedMetricItem[]; sprintSource: ExternalSprintSource | null; actor: string; correlationId: string; calculatedAt: string }) {
  const statements: ReturnType<typeof env.DB.prepare>[] = [];
  if (!args.sprintSource) {
    statements.push(env.DB.prepare("INSERT INTO azure_sync_diagnostics(id,sync_run_id,link_id,code,severity,occurrences,message,created_by,updated_by) VALUES(?,?,?,'AZURE_TEAM_REQUIRED','WARNING',1,'Sprint history requires a configured Azure Team; normalized work-item evidence was preserved.',?,?)").bind(crypto.randomUUID(), args.runId, args.context.id, args.actor, args.actor));
    return { statements, iterationsSeen: 0, sprintsInserted: 0, sprintsUpdated: 0, sprintsSkipped: 0, metricSnapshotsInserted: 0, burndownSnapshotsInserted: 0, teamRequired: true, historyTruncated: false };
  }

  const [policyRow, existingRows, historicalRows, metricRows, burndownRows] = await Promise.all([
    env.DB.prepare("SELECT id,health_tolerance_percentage healthTolerancePercentage,blocker_threshold blockerThreshold,zero_progress_days zeroProgressDays,velocity_lookback velocityLookback FROM delivery_metric_policies WHERE active=1 LIMIT 1").first<MetricPolicy>(),
    env.DB.prepare("SELECT id,external_id externalId,name,external_path externalPath,start_date startDate,end_date endDate,status,source_revision sourceRevision FROM sprints WHERE project_id=? AND origin='AZURE_DEVOPS' AND record_status='ACTIVE'").bind(args.context.projectId).all<ExistingSprint>(),
    env.DB.prepare("SELECT external_id externalId,external_revision externalRevision,normalized_type normalizedType,normalized_state normalizedState,story_points storyPoints,remaining_work remainingWork,blocked,iteration_id iterationId,source_changed_at sourceChangedAt,synced_at syncedAt FROM azure_work_item_snapshots WHERE link_id=? AND iteration_id IS NOT NULL").bind(args.context.id).all<HistoricalItem>(),
    env.DB.prepare("SELECT id,sprint_id sprintId,source_revision sourceRevision FROM sprint_metric_snapshots WHERE link_id=?").bind(args.context.id).all<{ id: string; sprintId: string; sourceRevision: string }>(),
    env.DB.prepare("SELECT sprint_id sprintId,snapshot_date snapshotDate,planned_scope plannedScope FROM daily_burndown_snapshots WHERE sprint_id IN(SELECT id FROM sprints WHERE project_id=? AND origin='AZURE_DEVOPS') ORDER BY snapshot_date DESC,calculated_at DESC").bind(args.context.projectId).all<PriorBurndown>(),
  ]);
  const policy = policyRow ?? defaults;
  const existingByExternal = new Map(existingRows.results.map(sprint => [sprint.externalId, sprint]));
  const metricByKey = new Map(metricRows.results.map(metric => [`${metric.sprintId}:${metric.sourceRevision}`, metric.id]));
  const latestBurndown = new Map<string, PriorBurndown>();
  for (const row of burndownRows.results) if (!latestBurndown.has(row.sprintId)) latestBurndown.set(row.sprintId, row);
  const currentDate = args.calculatedAt.slice(0, 10);
  const iterations = args.sprintSource.iterations;
  const iterationById = new Map(iterations.map(iteration => [iteration.id, iteration]));
  const scopeByIteration = new Map<string, Map<string, ScopeItem>>();
  const addScope = (item: ScopeItem) => {
    if (!iterationById.has(item.iterationId)) return;
    const scope = scopeByIteration.get(item.iterationId) ?? new Map<string, ScopeItem>(), prior = scope.get(item.externalId);
    if (!prior || prior.observedAt <= item.observedAt) scope.set(item.externalId, item);
    scopeByIteration.set(item.iterationId, scope);
  };
  for (const item of historicalRows.results) addScope({ ...item, blocked: Boolean(item.blocked), observedAt: item.sourceChangedAt ?? item.syncedAt });
  for (const item of args.items) if (item.iterationId) addScope({ ...item, iterationId: item.iterationId, observedAt: item.sourceChangedAt ?? args.calculatedAt });

  const historyByItem = new Map<string, ScopeItem[]>();
  for (const scope of scopeByIteration.values()) for (const item of scope.values()) {
    const history = historyByItem.get(item.externalId) ?? [];
    history.push(item); historyByItem.set(item.externalId, history);
  }
  const carryoverByIteration = new Map<string, Map<string, ScopeItem>>();
  for (const history of historyByItem.values()) {
    history.sort((left, right) => {
      const leftStart = iterationById.get(left.iterationId)?.startDate ?? "", rightStart = iterationById.get(right.iterationId)?.startDate ?? "";
      return `${leftStart}:${left.iterationId}`.localeCompare(`${rightStart}:${right.iterationId}`);
    });
    for (let index = 0; index < history.length - 1; index += 1) {
      const prior = history[index], next = history[index + 1];
      if (prior.iterationId === next.iterationId || terminalStates.has(prior.normalizedState ?? "")) continue;
      const moved = carryoverByIteration.get(prior.iterationId) ?? new Map<string, ScopeItem>();
      moved.set(prior.externalId, prior); carryoverByIteration.set(prior.iterationId, moved);
    }
  }

  let sprintsInserted = 0, sprintsUpdated = 0, sprintsSkipped = 0, metricSnapshotsInserted = 0, burndownSnapshotsInserted = 0;
  for (const iteration of iterations) {
    if (!iteration.startDate || !iteration.finishDate) continue;
    const startDate = iteration.startDate.slice(0, 10), endDate = iteration.finishDate.slice(0, 10), status = sprintStatus(startDate, endDate, currentDate);
    const existing = existingByExternal.get(iteration.id), sprintId = existing?.id ?? crypto.randomUUID();
    const scope = [...(scopeByIteration.get(iteration.id)?.values() ?? [])].filter(item => executionTypes.has(item.normalizedType ?? "") && item.normalizedState && item.normalizedState !== "REMOVED");
    const stories = scope.filter(item => item.normalizedType === "STORY"), plannedPoints = sum(stories.map(item => item.storyPoints ?? 0)), completedPoints = sum(stories.filter(item => item.normalizedState === "DONE").map(item => item.storyPoints ?? 0));
    const plannedItems = scope.length, completedItems = scope.filter(item => item.normalizedState === "DONE").length, remainingWork = sum(scope.filter(item => item.normalizedState !== "DONE").map(item => item.remainingWork ?? 0));
    const bugs = scope.filter(item => item.normalizedType === "BUG"), openBugCount = bugs.filter(item => !terminalStates.has(item.normalizedState ?? "")).length, blockerCount = scope.filter(item => item.blocked && !terminalStates.has(item.normalizedState ?? "")).length;
    const carryover = [...(carryoverByIteration.get(iteration.id)?.values() ?? [])].filter(item => executionTypes.has(item.normalizedType ?? "")), carryoverCount = carryover.length, carryoverPoints = sum(carryover.filter(item => item.normalizedType === "STORY").map(item => item.storyPoints ?? 0));
    const completionMethod = plannedPoints > 0 ? "POINTS" : plannedItems > 0 ? "ITEM_COUNT" : "NOT_AVAILABLE", numerator = completionMethod === "POINTS" ? completedPoints : completionMethod === "ITEM_COUNT" ? completedItems : null, denominator = completionMethod === "POINTS" ? plannedPoints : completionMethod === "ITEM_COUNT" ? plannedItems : null;
    const progress = denominator ? Math.min(100, Math.round((numerator ?? 0) / denominator * 100)) : 0, totalDays = daysInclusive(startDate, endDate), elapsedDays = currentDate < startDate ? 0 : Math.min(totalDays, daysInclusive(startDate, currentDate)), expectedProgress = Math.min(100, Math.round(elapsedDays / totalDays * 100));
    const health = status === "COMPLETED" ? "COMPLETED" : status === "PLANNED" ? "ON_TRACK" : blockerCount >= policy.blockerThreshold || (elapsedDays > policy.zeroProgressDays && progress === 0) ? "BLOCKED" : blockerCount > 0 || progress + policy.healthTolerancePercentage < expectedProgress ? "AT_RISK" : "ON_TRACK";
    const formula = completionMethod === "POINTS" ? "completed mapped Story/PBI points / mapped Story/PBI scope points × 100" : completionMethod === "ITEM_COUNT" ? "completed mapped execution items / mapped execution scope items × 100" : "Not available: no mapped point or item denominator";
    const sprintRevision = await revision(`${args.itemSourceRevision}:${args.sprintSource.sourceRevision}:${iteration.id}:${currentDate}:${status}:${plannedPoints}:${completedPoints}:${plannedItems}:${completedItems}:${remainingWork}:${openBugCount}:${blockerCount}:${carryoverCount}:${carryoverPoints}:${expectedProgress}:${health}`);
    const changed = !existing || existing.name !== iteration.name || existing.externalPath !== iteration.path || existing.startDate !== startDate || existing.endDate !== endDate || existing.status !== status || existing.sourceRevision !== sprintRevision;
    if (!existing) sprintsInserted += 1; else if (changed) sprintsUpdated += 1; else sprintsSkipped += 1;
    statements.push(env.DB.prepare("INSERT INTO sprints(id,business_id,project_id,name,goal,origin,external_id,external_path,source_revision,synced_at,start_date,end_date,status,capacity_hours,committed_points,activated_at,completed_at,created_by,updated_by) VALUES(?,?,?,?,?,'AZURE_DEVOPS',?,?,?,?,?,?,?,0,?,?,?,?,?) ON CONFLICT(project_id,origin,external_id) DO UPDATE SET name=excluded.name,external_path=excluded.external_path,source_revision=excluded.source_revision,synced_at=excluded.synced_at,start_date=excluded.start_date,end_date=excluded.end_date,status=excluded.status,committed_points=excluded.committed_points,activated_at=excluded.activated_at,completed_at=excluded.completed_at,version=sprints.version+1,updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by WHERE sprints.name<>excluded.name OR sprints.external_path<>excluded.external_path OR sprints.start_date<>excluded.start_date OR sprints.end_date<>excluded.end_date OR sprints.status<>excluded.status OR sprints.source_revision IS NOT excluded.source_revision").bind(sprintId, businessId(args.context.id, iteration.id), args.context.projectId, iteration.name, "Azure Team iteration evidence; delivery goal remains in Azure DevOps.", iteration.id, iteration.path, sprintRevision, args.calculatedAt, startDate, endDate, status, plannedPoints, `${startDate}T00:00:00.000Z`, status === "COMPLETED" ? `${endDate}T23:59:59.999Z` : null, args.actor, args.actor));

    const metricKey = `${sprintId}:${sprintRevision}`, existingMetricId = metricByKey.get(metricKey), metricId = existingMetricId ?? crypto.randomUUID();
    if (!existingMetricId) {
      metricSnapshotsInserted += 1;
      statements.push(env.DB.prepare("INSERT INTO sprint_metric_snapshots(id,sprint_id,link_id,sync_run_id,policy_id,source_origin,source_revision,planned_points,completed_points,planned_items,completed_items,remaining_work,bug_count,open_bug_count,blocker_count,carryover_count,carryover_points,elapsed_days,total_days,progress,expected_progress,health,completion_method,numerator,denominator,formula,health_tolerance_percentage,blocker_threshold,zero_progress_days,velocity_lookback,calculated_at,created_by,updated_by) VALUES(?,?,?,?,?,'AZURE_DEVOPS',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(metricId, sprintId, args.context.id, args.runId, policy.id, sprintRevision, plannedPoints, completedPoints, plannedItems, completedItems, remainingWork, bugs.length, openBugCount, blockerCount, carryoverCount, carryoverPoints, elapsedDays, totalDays, progress, expectedProgress, health, completionMethod, numerator, denominator, formula, policy.healthTolerancePercentage, policy.blockerThreshold, policy.zeroProgressDays, policy.velocityLookback, args.calculatedAt, args.actor, args.actor));
    }
    const snapshotDate = currentDate, burndownRevision = sprintRevision, prior = latestBurndown.get(sprintId), plannedScope = completionMethod === "POINTS" ? plannedPoints : plannedItems, completedScope = completionMethod === "POINTS" ? completedPoints : completedItems, remainingScope = Math.max(0, plannedScope - completedScope), idealRemainingScope = Math.max(0, Math.round(plannedScope * (100 - expectedProgress) / 100)), scopeChange = prior ? plannedScope - prior.plannedScope : 0;
    const dailyExists = await env.DB.prepare("SELECT id FROM daily_burndown_snapshots WHERE sprint_id=? AND snapshot_date=? AND source_revision=? LIMIT 1").bind(sprintId, snapshotDate, burndownRevision).first();
    if (!dailyExists) {
      burndownSnapshotsInserted += 1;
      statements.push(env.DB.prepare("INSERT INTO daily_burndown_snapshots(id,sprint_id,metric_snapshot_id,snapshot_date,planned_scope,remaining_scope,completed_scope,ideal_remaining_scope,scope_change,source_origin,source_revision,calculated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,'AZURE_DEVOPS',?,?,?,?)").bind(crypto.randomUUID(), sprintId, metricId, snapshotDate, plannedScope, remainingScope, completedScope, idealRemainingScope, scopeChange, burndownRevision, args.calculatedAt, args.actor, args.actor));
    }
  }
  if (args.sprintSource.truncated) statements.push(env.DB.prepare("INSERT INTO azure_sync_diagnostics(id,sync_run_id,link_id,code,severity,occurrences,message,created_by,updated_by) VALUES(?,?,?,'AZURE_SPRINT_HISTORY_BOUNDED','INFO',1,'Sprint history was intentionally bounded to the 50 most recent dated Team iterations.',?,?)").bind(crypto.randomUUID(), args.runId, args.context.id, args.actor, args.actor));
  if (metricSnapshotsInserted) statements.push(env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'AZURE_DEVOPS',?)").bind(crypto.randomUUID(), "AzureProjectLink", args.context.id, "AZURE_SPRINT_METRICS", JSON.stringify({ runId: args.runId, iterationsSeen: iterations.length, sprintsInserted, sprintsUpdated, sprintsSkipped, metricSnapshotsInserted, burndownSnapshotsInserted, velocityLookback: policy.velocityLookback }), args.actor, args.correlationId));
  return { statements, iterationsSeen: iterations.length, sprintsInserted, sprintsUpdated, sprintsSkipped, metricSnapshotsInserted, burndownSnapshotsInserted, teamRequired: false, historyTruncated: args.sprintSource.truncated };
}
