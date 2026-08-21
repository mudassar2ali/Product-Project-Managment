import { env } from "cloudflare:workers";

export const rateLimitPolicies = {
  ADVANCED_SYNC: { limit: 5, windowSeconds: 300 },
  REPORT_EXPORT: { limit: 30, windowSeconds: 300 },
  GOVERNANCE_SUBMIT: { limit: 20, windowSeconds: 300 },
  SIGNOFF_DECISION: { limit: 20, windowSeconds: 300 },
  TRACEABILITY_QUERY: { limit: 20, windowSeconds: 300 },
  READINESS_RECALCULATE: { limit: 20, windowSeconds: 300 },
  UAT_EXECUTION_INSERT: { limit: 20, windowSeconds: 300 },
  DEFECT_CREATE: { limit: 20, windowSeconds: 300 },
} as const;

export type RateLimitedOperation = keyof typeof rateLimitPolicies;
export type OperationalOutcome = "SUCCESS" | "REJECTED" | "ERROR" | "RATE_LIMITED";

const sensitive = /token|secret|password|credential|authorization|api.?key|private.?key|cookie/i;
const scalar = (value: unknown): value is string | number | boolean | null => value === null || ["string", "number", "boolean"].includes(typeof value);

async function hashScope(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function consumeRateLimit(operation: RateLimitedOperation, caller: string, resource = "*") {
  const policy = rateLimitPolicies[operation];
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSeconds / policy.windowSeconds) * policy.windowSeconds;
  const retryAfter = Math.max(1, windowStart + policy.windowSeconds - nowSeconds);
  const scopeKey = await hashScope(`${caller}:${resource}`);
  const expiresAt = new Date((windowStart + policy.windowSeconds) * 1000).toISOString();
  const row = await env.DB.prepare(`
    INSERT INTO operational_rate_limits(operation,scope_key,window_start,request_count,limit_value,window_seconds,expires_at,updated_at)
    VALUES(?,?,?,1,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(operation,scope_key,window_start) DO UPDATE SET
      request_count=operational_rate_limits.request_count+1,
      limit_value=excluded.limit_value,
      window_seconds=excluded.window_seconds,
      expires_at=excluded.expires_at,
      updated_at=CURRENT_TIMESTAMP
    WHERE operational_rate_limits.request_count<excluded.limit_value
    RETURNING request_count
  `).bind(operation, scopeKey, windowStart, policy.limit, policy.windowSeconds, expiresAt).first<{ request_count: number }>();
  const count = Number(row?.request_count ?? policy.limit);
  return {
    allowed: Boolean(row),
    limit: policy.limit,
    remaining: row ? Math.max(0, policy.limit - count) : 0,
    retryAfter,
  };
}

export function rateLimitHeaders(result: { limit: number; remaining: number; retryAfter: number }) {
  return {
    "retry-after": String(result.retryAfter),
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
  };
}

function safeDetails(input: Record<string, unknown> | undefined) {
  if (!input) return "{}";
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input).slice(0, 16)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(key) || sensitive.test(key) || !scalar(value)) continue;
    output[key] = typeof value === "string" ? value.slice(0, 160) : value;
  }
  return JSON.stringify(output);
}

export async function recordOperationalEvent(input: {
  operation: string;
  outcome: OperationalOutcome;
  durationMs: number;
  statusCode: number;
  actorUserId: string;
  correlationId: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await env.DB.prepare(`
      INSERT INTO operational_events(id,operation,outcome,duration_ms,status_code,entity_type,entity_id,actor_user_id,correlation_id,details_json)
      VALUES(?,?,?,?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(),
      input.operation.slice(0, 64),
      input.outcome,
      Math.min(600_000, Math.max(0, Math.round(input.durationMs))),
      Math.min(599, Math.max(100, Math.round(input.statusCode))),
      input.entityType?.slice(0, 64) ?? null,
      input.entityId?.slice(0, 160) ?? null,
      input.actorUserId,
      input.correlationId.slice(0, 160),
      safeDetails(input.details),
    ).run();
  } catch {
    // Telemetry cannot replace or break the governed business response.
  }
}

const numeric = (value: unknown) => Number(value ?? 0);

export async function getOperationalStatus() {
  const [policies, eventSummary, operations, syncSummary, leaseSummary, freshness, deliverySummary, auditSummary, triggers, recentExceptions] = await Promise.all([
    env.DB.prepare("SELECT key,category,integer_value integerValue,text_value textValue,description,enforced FROM operational_policies ORDER BY category,key").all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN outcome='ERROR' THEN 1 ELSE 0 END),0) errors,COALESCE(SUM(CASE WHEN outcome='RATE_LIMITED' THEN 1 ELSE 0 END),0) rateLimited,ROUND(AVG(duration_ms),1) averageDurationMs,COALESCE(MAX(duration_ms),0) maxDurationMs FROM operational_events WHERE occurred_at>=datetime('now','-24 hours')`).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT operation,COUNT(*) requests,COALESCE(SUM(CASE WHEN outcome='ERROR' THEN 1 ELSE 0 END),0) errors,COALESCE(SUM(CASE WHEN outcome='RATE_LIMITED' THEN 1 ELSE 0 END),0) rateLimited,ROUND(AVG(duration_ms),1) averageDurationMs,MAX(duration_ms) maxDurationMs FROM operational_events WHERE occurred_at>=datetime('now','-24 hours') GROUP BY operation ORDER BY requests DESC,operation LIMIT 12`).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN status='SUCCEEDED' THEN 1 ELSE 0 END),0) succeeded,COALESCE(SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END),0) failed,ROUND(AVG(CASE WHEN completed_at IS NOT NULL THEN (julianday(completed_at)-julianday(started_at))*86400000 END),1) averageDurationMs,COALESCE(SUM(pages_read),0) pagesRead,COALESCE(SUM(items_seen),0) itemsSeen,COALESCE(MAX(completed_at),'Never') lastCompletedAt FROM azure_sync_runs WHERE started_at>=datetime('now','-24 hours')`).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN status='RUNNING' AND lock_expires_at>=CURRENT_TIMESTAMP THEN 1 ELSE 0 END),0) active,COALESCE(SUM(CASE WHEN status='RUNNING' AND lock_expires_at<CURRENT_TIMESTAMP THEN 1 ELSE 0 END),0) expired FROM azure_sync_runs`).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COUNT(*) linkedProjects,COALESCE(SUM(CASE WHEN latest.completed_at IS NULL OR latest.completed_at<datetime('now','-24 hours') THEN 1 ELSE 0 END),0) staleLinks,(SELECT COUNT(*) FROM backlog_items WHERE origin='AZURE_DEVOPS' AND record_status='ACTIVE' AND source_missing_at IS NOT NULL) sourceMissing,(SELECT COUNT(*) FROM backlog_items WHERE origin='AZURE_DEVOPS' AND record_status='ACTIVE' AND delivery_state='UNMAPPED') unmapped FROM azure_project_links link LEFT JOIN azure_sync_runs latest ON latest.id=(SELECT run.id FROM azure_sync_runs run WHERE run.link_id=link.id AND run.status='SUCCEEDED' ORDER BY run.completed_at DESC,run.id DESC LIMIT 1) WHERE link.record_status='ACTIVE'`).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM backlog_items WHERE record_status='ACTIVE' AND blocked=1 AND delivery_state NOT IN('DONE','REMOVED')) blockedItems,(SELECT COUNT(*) FROM backlog_items WHERE record_status='ACTIVE' AND item_type='BUG' AND delivery_state NOT IN('DONE','REMOVED')) openBugs,(SELECT COALESCE(SUM(metric.blocker_count),0) FROM sprint_metric_snapshots metric WHERE metric.id=(SELECT latest.id FROM sprint_metric_snapshots latest WHERE latest.sprint_id=metric.sprint_id ORDER BY latest.calculated_at DESC,latest.id DESC LIMIT 1)) metricBlockers,(SELECT COALESCE(SUM(metric.carryover_count),0) FROM sprint_metric_snapshots metric WHERE metric.id=(SELECT latest.id FROM sprint_metric_snapshots latest WHERE latest.sprint_id=metric.sprint_id ORDER BY latest.calculated_at DESC,latest.id DESC LIMIT 1)) carryoverItems,(SELECT COALESCE(SUM(metric.carryover_points),0) FROM sprint_metric_snapshots metric WHERE metric.id=(SELECT latest.id FROM sprint_metric_snapshots latest WHERE latest.sprint_id=metric.sprint_id ORDER BY latest.calculated_at DESC,latest.id DESC LIMIT 1)) carryoverPoints`).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN date(occurred_at)=date('now') THEN 1 ELSE 0 END),0) today,COALESCE(SUM(CASE WHEN source='APPLICATION' AND actor_user_id IS NULL THEN 1 ELSE 0 END),0) unattributedApplicationEvents FROM audit_logs`).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name IN('trg_audit_logs_immutable_update','trg_audit_logs_immutable_delete')`).first<{ count: number }>(),
    env.DB.prepare(`SELECT operation,outcome,status_code statusCode,entity_type entityType,entity_id entityId,correlation_id correlationId,details_json detailsJson,occurred_at occurredAt FROM operational_events WHERE outcome<>'SUCCESS' AND occurred_at>=datetime('now','-24 hours') ORDER BY occurred_at DESC,id DESC LIMIT 8`).all<Record<string, unknown>>(),
  ]);

  const leases = { active: numeric(leaseSummary?.active), expired: numeric(leaseSummary?.expired) };
  const source = { linkedProjects: numeric(freshness?.linkedProjects), staleLinks: numeric(freshness?.staleLinks), sourceMissing: numeric(freshness?.sourceMissing), unmapped: numeric(freshness?.unmapped) };
  const delivery = { blockedItems: numeric(deliverySummary?.blockedItems), openBugs: numeric(deliverySummary?.openBugs), metricBlockers: numeric(deliverySummary?.metricBlockers), carryoverItems: numeric(deliverySummary?.carryoverItems), carryoverPoints: numeric(deliverySummary?.carryoverPoints) };
  const sync = {
    succeeded: numeric(syncSummary?.succeeded), failed: numeric(syncSummary?.failed), averageDurationMs: numeric(syncSummary?.averageDurationMs),
    pagesRead: numeric(syncSummary?.pagesRead), itemsSeen: numeric(syncSummary?.itemsSeen), lastCompletedAt: String(syncSummary?.lastCompletedAt ?? "Never"),
  };
  const telemetry = {
    total: numeric(eventSummary?.total), errors: numeric(eventSummary?.errors), rateLimited: numeric(eventSummary?.rateLimited),
    averageDurationMs: numeric(eventSummary?.averageDurationMs), maxDurationMs: numeric(eventSummary?.maxDurationMs),
    operations: operations.results.map((row) => ({ operation: String(row.operation), requests: numeric(row.requests), errors: numeric(row.errors), rateLimited: numeric(row.rateLimited), averageDurationMs: numeric(row.averageDurationMs), maxDurationMs: numeric(row.maxDurationMs) })),
  };
  const exceptions = recentExceptions.results.map((row) => ({
    operation: String(row.operation), outcome: String(row.outcome), statusCode: numeric(row.statusCode), entityType: row.entityType ? String(row.entityType) : null,
    entityId: row.entityId ? String(row.entityId) : null, correlationId: String(row.correlationId), occurredAt: String(row.occurredAt), details: parseDetails(row.detailsJson),
  }));
  const controlsHealthy = numeric(triggers?.count) === 2 && leases.expired === 0;
  const deliveryHealthy = sync.failed === 0 && source.staleLinks === 0 && delivery.blockedItems === 0;
  return {
    status: controlsHealthy && deliveryHealthy ? "HEALTHY" : "ATTENTION",
    controls: { databaseReachable: true, auditImmutable: numeric(triggers?.count) === 2, rateLimits: "D1 fixed-window", telemetry: "Sanitized scalar evidence" },
    policies: policies.results,
    telemetry,
    sync,
    leases,
    source,
    delivery,
    audit: { total: numeric(auditSummary?.total), today: numeric(auditSummary?.today), unattributedApplicationEvents: numeric(auditSummary?.unattributedApplicationEvents), minimumRetentionDays: 365, automaticDeletion: false },
    exceptions,
    generatedAt: new Date().toISOString(),
  };
}

function parseDetails(value: unknown) {
  try { return JSON.parse(String(value ?? "{}")) as Record<string, unknown>; }
  catch { return {}; }
}
