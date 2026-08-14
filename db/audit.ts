import { env } from "cloudflare:workers";

export type AuditInput = { q?:string;entity?:string;action?:string;source?:string;from?:string;to?:string;page?:number;pageSize?:number };
const sensitive = /token|secret|password|credential|authorization|api.?key|private.?key|cookie/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive.test(key) ? "[REDACTED]" : redact(item)]));
  return value;
}

function parse(value: string | null) {
  if (!value) return null;
  try { return redact(JSON.parse(value)); }
  catch { return "[UNAVAILABLE]"; }
}

export async function listAudit(input: AuditInput) {
  const where: string[] = ["1=1"];
  const bindings: unknown[] = [];
  if (input.entity) { where.push("a.entity_type=?"); bindings.push(input.entity); }
  if (input.action) { where.push("a.action=?"); bindings.push(input.action); }
  if (input.source) { where.push("a.source=?"); bindings.push(input.source); }
  if (input.from) { where.push("date(a.occurred_at)>=date(?)"); bindings.push(input.from); }
  if (input.to) { where.push("date(a.occurred_at)<=date(?)"); bindings.push(input.to); }
  if (input.q) {
    where.push("(lower(a.entity_id) LIKE ? ESCAPE '\\' OR lower(a.correlation_id) LIKE ? ESCAPE '\\' OR lower(COALESCE(u.display_name,'')) LIKE ? ESCAPE '\\')");
    const escaped = input.q.toLowerCase().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const query = `%${escaped}%`;
    bindings.push(query, query, query);
  }
  const page = Math.max(1, input.page || 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize || 25));
  const filter = where.join(" AND ");
  const [rows, count, facets] = await Promise.all([
    env.DB.prepare(`SELECT a.id,a.entity_type entityType,a.entity_id entityId,a.action,a.before_json beforeJson,a.after_json afterJson,COALESCE(u.display_name,'System / service') actor,a.source,a.correlation_id correlationId,a.occurred_at occurredAt FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE ${filter} ORDER BY a.occurred_at DESC,a.id DESC LIMIT ? OFFSET ?`).bind(...bindings, pageSize, (page - 1) * pageSize).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COUNT(*) total FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE ${filter}`).bind(...bindings).first<{ total: number }>(),
    env.DB.prepare("SELECT (SELECT COUNT(*) FROM audit_logs) total,(SELECT COUNT(DISTINCT entity_type) FROM audit_logs) entities,(SELECT COUNT(*) FROM audit_logs WHERE source='AZURE_DEVOPS') integrations,(SELECT COUNT(*) FROM audit_logs WHERE date(occurred_at)=date('now')) today,(SELECT COUNT(*) FROM audit_logs WHERE source='APPLICATION' AND actor_user_id IS NULL) unattributedApplicationEvents").first<Record<string, number>>(),
  ]);
  return {
    rows: rows.results.map((row) => ({ ...row, before:parse(row.beforeJson as string | null), after:parse(row.afterJson as string | null), beforeJson: undefined, afterJson: undefined })),
    total: Number(count?.total ?? 0),
    summary: facets ?? { total:0,entities:0,integrations:0,today:0,unattributedApplicationEvents:0 },
    parameters: { ...input, page, pageSize },
    generatedAt: new Date().toISOString(),
    retention: "Immutable governance events have a 365-day minimum hot-retention policy. Automatic deletion is disabled for this private rollout.",
  };
}
