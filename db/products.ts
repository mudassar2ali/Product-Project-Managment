import { env } from "cloudflare:workers";
import type { ProductInput } from "../app/products/product-contract";

export type ProductRecord = ProductInput & {
  id: string;
  businessId: string;
  recordStatus: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

const selectColumns = `
  id, business_id AS businessId, name, code, description, category, market, region,
  customer_segment AS customerSegment, stage, start_date AS startDate,
  target_launch_date AS targetLaunchDate, actual_launch_date AS actualLaunchDate,
  status, priority, strategic_objective AS strategicObjective, business_value AS businessValue,
  progress, notes, record_status AS recordStatus, version, created_at AS createdAt, updated_at AS updatedAt
`;

export async function listProducts(params: { q: string; status: string; stage: string; priority: string; page: number; pageSize: number; sort: string }) {
  const conditions = ["record_status = 'ACTIVE'"];
  const values: unknown[] = [];
  if (params.q) { conditions.push("(name LIKE ? OR code LIKE ? OR business_id LIKE ?)"); const q = `%${params.q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`; values.push(q, q, q); }
  if (params.status) { conditions.push("status = ?"); values.push(params.status); }
  if (params.stage) { conditions.push("stage = ?"); values.push(params.stage); }
  if (params.priority) { conditions.push("priority = ?"); values.push(params.priority); }
  const orderBy: Record<string, string> = { name: "name ASC", "-name": "name DESC", targetLaunchDate: "target_launch_date ASC", "-targetLaunchDate": "target_launch_date DESC", progress: "progress ASC", "-progress": "progress DESC", updatedAt: "updated_at ASC", "-updatedAt": "updated_at DESC" };
  const where = conditions.join(" AND ");
  const offset = (params.page - 1) * params.pageSize;
  const [rows, count] = await Promise.all([
    env.DB.prepare(`SELECT ${selectColumns} FROM products WHERE ${where} ORDER BY ${orderBy[params.sort] ?? "updated_at DESC"} LIMIT ? OFFSET ?`).bind(...values, params.pageSize, offset).all<ProductRecord>(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM products WHERE ${where}`).bind(...values).first<{ total: number }>(),
  ]);
  return { items: rows.results, total: Number(count?.total ?? 0) };
}

export async function getProduct(id: string) {
  return env.DB.prepare(`SELECT ${selectColumns} FROM products WHERE id = ? AND record_status = 'ACTIVE'`).bind(id).first<ProductRecord>();
}

async function nextBusinessId() {
  const result = await env.DB.prepare(`
    INSERT INTO business_sequences (entity_type, next_value, updated_at) VALUES ('PRODUCT', 2, CURRENT_TIMESTAMP)
    ON CONFLICT(entity_type) DO UPDATE SET next_value = next_value + 1, updated_at = CURRENT_TIMESTAMP
    RETURNING next_value - 1 AS value
  `).first<{ value: number }>();
  return `PROD-${String(result?.value ?? 1).padStart(4, "0")}`;
}

export async function createProduct(input: ProductInput, actor: string, correlationId: string) {
  const id = crypto.randomUUID();
  const businessId = await nextBusinessId();
  const auditId = crypto.randomUUID();
  const values = [id, businessId, input.name, input.code, input.description, input.category, input.market, input.region, input.customerSegment, input.stage, input.startDate, input.targetLaunchDate, input.actualLaunchDate, input.status, input.priority, input.strategicObjective, input.businessValue, input.progress, input.notes, actor, actor];
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO products (id,business_id,name,code,description,category,market,region,customer_segment,stage,start_date,target_launch_date,actual_launch_date,status,priority,strategic_objective,business_value,progress,notes,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values),
    env.DB.prepare(`INSERT INTO audit_logs (id,entity_type,entity_id,action,after_json,source,correlation_id,occurred_at) VALUES (?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)`).bind(auditId, "Product", id, "CREATE", JSON.stringify({ businessId, name: input.name, code: input.code, stage: input.stage, status: input.status }), correlationId),
  ]);
  return getProduct(id);
}

export async function updateProduct(id: string, input: ProductInput, expectedVersion: number, actor: string, correlationId: string) {
  const before = await getProduct(id);
  if (!before) return { kind: "not_found" as const };
  const result = await env.DB.prepare(`UPDATE products SET name=?,code=?,description=?,category=?,market=?,region=?,customer_segment=?,stage=?,start_date=?,target_launch_date=?,actual_launch_date=?,status=?,priority=?,strategic_objective=?,business_value=?,progress=?,notes=?,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND record_status='ACTIVE'`).bind(input.name,input.code,input.description,input.category,input.market,input.region,input.customerSegment,input.stage,input.startDate,input.targetLaunchDate,input.actualLaunchDate,input.status,input.priority,input.strategicObjective,input.businessValue,input.progress,input.notes,actor,id,expectedVersion).run();
  if (!result.meta.changes) return { kind: "conflict" as const };
  await env.DB.prepare(`INSERT INTO audit_logs (id,entity_type,entity_id,action,before_json,after_json,source,correlation_id,occurred_at) VALUES (?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),"Product",id,"UPDATE",JSON.stringify(before),JSON.stringify(input),correlationId).run();
  return { kind: "ok" as const, product: await getProduct(id) };
}

export async function archiveProduct(id: string, expectedVersion: number, reason: string, actor: string, correlationId: string) {
  const before = await getProduct(id);
  if (!before) return { kind: "not_found" as const };
  const result = await env.DB.prepare(`UPDATE products SET record_status='ARCHIVED',archived_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND record_status='ACTIVE'`).bind(actor,id,expectedVersion).run();
  if (!result.meta.changes) return { kind: "conflict" as const };
  await env.DB.prepare(`INSERT INTO audit_logs (id,entity_type,entity_id,action,before_json,after_json,source,correlation_id,occurred_at) VALUES (?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),"Product",id,"ARCHIVE",JSON.stringify(before),JSON.stringify({ reason }),correlationId).run();
  return { kind: "ok" as const };
}
