import { env } from "cloudflare:workers";
import { calculateOverallProgress, stageKeys, type ProjectInput } from "../app/projects/project-contract";

export type ProjectRecord = Omit<ProjectInput, "weights"> & {
  id: string; businessId: string; productName: string; productCode: string; overallProgress: number;
  recordStatus: string; version: number; createdAt: string; updatedAt: string; weights: ProjectInput["weights"];
};

const columns = `p.id,p.business_id AS businessId,p.name,p.code,p.product_id AS productId,prod.name AS productName,prod.code AS productCode,
 p.description,p.objective,p.business_value AS businessValue,p.scope,p.out_of_scope AS outOfScope,p.start_date AS startDate,
 p.target_end_date AS targetEndDate,p.actual_end_date AS actualEndDate,p.priority,p.status,p.health,p.overall_progress AS overallProgress,
 p.requirements_progress AS requirementsProgress,p.design_progress AS designProgress,p.development_progress AS developmentProgress,
 p.qa_progress AS qaProgress,p.uat_progress AS uatProgress,p.sign_off_progress AS signOffProgress,p.deployment_progress AS deploymentProgress,
 p.sign_off_status AS signOffStatus,p.release_status AS releaseStatus,p.budget_amount AS budgetAmount,p.budget_currency AS budgetCurrency,
 p.market,p.customer,p.comments,p.record_status AS recordStatus,p.version,p.created_at AS createdAt,p.updated_at AS updatedAt`;

async function attachWeights<T extends Omit<ProjectRecord, "weights">>(rows: T[]): Promise<ProjectRecord[]> {
  if (!rows.length) return [];
  const placeholders = rows.map(() => "?").join(",");
  const result = await env.DB.prepare(`SELECT project_id AS projectId,stage,weight FROM project_stage_weights WHERE project_id IN (${placeholders})`).bind(...rows.map((row) => row.id)).all<{ projectId: string; stage: keyof ProjectInput["weights"]; weight: number }>();
  return rows.map((row) => ({ ...row, weights: Object.fromEntries(result.results.filter((item) => item.projectId === row.id).map((item) => [item.stage, item.weight])) as ProjectInput["weights"] }));
}

export async function listProjects(params: { q: string; productId: string; status: string; health: string; page: number; pageSize: number; sort: string }) {
  const conditions = ["p.record_status='ACTIVE'", "prod.record_status='ACTIVE'"];
  const values: unknown[] = [];
  if (params.q) { conditions.push("(p.name LIKE ? OR p.code LIKE ? OR p.business_id LIKE ?)"); const q = `%${params.q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`; values.push(q,q,q); }
  if (params.productId) { conditions.push("p.product_id=?"); values.push(params.productId); }
  if (params.status) { conditions.push("p.status=?"); values.push(params.status); }
  if (params.health) { conditions.push("p.health=?"); values.push(params.health); }
  const order: Record<string,string> = { name:"p.name ASC","-name":"p.name DESC",targetEndDate:"p.target_end_date ASC","-targetEndDate":"p.target_end_date DESC",overallProgress:"p.overall_progress ASC","-overallProgress":"p.overall_progress DESC",updatedAt:"p.updated_at ASC","-updatedAt":"p.updated_at DESC" };
  const where = conditions.join(" AND "); const offset = (params.page - 1) * params.pageSize;
  const [records,count] = await Promise.all([
    env.DB.prepare(`SELECT ${columns} FROM projects p JOIN products prod ON prod.id=p.product_id WHERE ${where} ORDER BY ${order[params.sort] ?? "p.updated_at DESC"} LIMIT ? OFFSET ?`).bind(...values,params.pageSize,offset).all<Omit<ProjectRecord,"weights">>(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM projects p JOIN products prod ON prod.id=p.product_id WHERE ${where}`).bind(...values).first<{total:number}>(),
  ]);
  return { items: await attachWeights(records.results), total: Number(count?.total ?? 0) };
}

export async function getProject(id: string) {
  const record = await env.DB.prepare(`SELECT ${columns} FROM projects p JOIN products prod ON prod.id=p.product_id WHERE p.id=? AND p.record_status='ACTIVE'`).bind(id).first<Omit<ProjectRecord,"weights">>();
  return record ? (await attachWeights([record]))[0] : null;
}

export async function getProjectOverview(id: string) {
  const project = await getProject(id);
  if (!project) return null;
  const activity = await env.DB.prepare(`
    SELECT action, source, correlation_id AS correlationId, occurred_at AS occurredAt
    FROM audit_logs WHERE entity_type='Project' AND entity_id=?
    ORDER BY occurred_at DESC LIMIT 12
  `).bind(id).all<{ action: string; source: string; correlationId: string; occurredAt: string }>();
  return {
    project,
    stageProgress: stageKeys.map((stage) => ({
      stage,
      completion: project[`${stage}Progress`],
      weight: project.weights[stage],
      weightedContribution: Math.round(project[`${stage}Progress`] * project.weights[stage] * 100) / 10000,
      source: stage === "development" ? "Manual — no engineering provider linked" : "Project record",
    })),
    delivery: { connected: false, provider: null, lastSync: null },
    relatedModules: {
      milestones: { available: false, reason: "Milestone Management is delivered in Step 12." },
      raid: { available: false, reason: "RAID Management is delivered in Step 13." },
    },
    activity: activity.results,
    calculatedAt: project.updatedAt,
  };
}

async function nextBusinessId() {
  const result = await env.DB.prepare(`INSERT INTO business_sequences (entity_type,next_value,updated_at) VALUES ('PROJECT',2,CURRENT_TIMESTAMP) ON CONFLICT(entity_type) DO UPDATE SET next_value=next_value+1,updated_at=CURRENT_TIMESTAMP RETURNING next_value-1 AS value`).first<{value:number}>();
  return `PROJ-${String(result?.value ?? 1).padStart(4,"0")}`;
}

const projectValues = (input: ProjectInput) => [input.productId,input.name,input.code,input.description,input.objective,input.businessValue,input.scope,input.outOfScope,input.startDate,input.targetEndDate,input.actualEndDate,input.priority,input.status,input.health,calculateOverallProgress(input),input.requirementsProgress,input.designProgress,input.developmentProgress,input.qaProgress,input.uatProgress,input.signOffProgress,input.deploymentProgress,input.signOffStatus,input.releaseStatus,input.budgetAmount,input.budgetCurrency,input.market,input.customer,input.comments];

export async function createProject(input: ProjectInput, actor: string, correlationId: string) {
  const product = await env.DB.prepare("SELECT id FROM products WHERE id=? AND record_status='ACTIVE'").bind(input.productId).first();
  if (!product) return { kind: "invalid_product" as const };
  const id=crypto.randomUUID(), businessId=await nextBusinessId();
  const statements = [env.DB.prepare(`INSERT INTO projects (id,business_id,product_id,name,code,description,objective,business_value,scope,out_of_scope,start_date,target_end_date,actual_end_date,priority,status,health,overall_progress,requirements_progress,design_progress,development_progress,qa_progress,uat_progress,sign_off_progress,deployment_progress,sign_off_status,release_status,budget_amount,budget_currency,market,customer,comments,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,businessId,...projectValues(input),actor,actor)];
  for (const stage of stageKeys) statements.push(env.DB.prepare("INSERT INTO project_stage_weights (id,project_id,stage,weight,created_by,updated_by) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),id,stage,input.weights[stage],actor,actor));
  statements.push(env.DB.prepare(`INSERT INTO audit_logs (id,entity_type,entity_id,action,after_json,source,correlation_id) VALUES (?,?,?,?,?,'APPLICATION',?)`).bind(crypto.randomUUID(),"Project",id,"CREATE",JSON.stringify({businessId,name:input.name,code:input.code,productId:input.productId,health:input.health}),correlationId));
  await env.DB.batch(statements);
  return { kind: "ok" as const, project: await getProject(id) };
}

export async function updateProject(id: string,input: ProjectInput,expectedVersion:number,actor:string,correlationId:string) {
  const before=await getProject(id); if(!before) return {kind:"not_found" as const};
  const product=await env.DB.prepare("SELECT id FROM products WHERE id=? AND record_status='ACTIVE'").bind(input.productId).first(); if(!product) return {kind:"invalid_product" as const};
  const result=await env.DB.prepare(`UPDATE projects SET product_id=?,name=?,code=?,description=?,objective=?,business_value=?,scope=?,out_of_scope=?,start_date=?,target_end_date=?,actual_end_date=?,priority=?,status=?,health=?,overall_progress=?,requirements_progress=?,design_progress=?,development_progress=?,qa_progress=?,uat_progress=?,sign_off_progress=?,deployment_progress=?,sign_off_status=?,release_status=?,budget_amount=?,budget_currency=?,market=?,customer=?,comments=?,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND record_status='ACTIVE'`).bind(...projectValues(input),actor,id,expectedVersion).run();
  if(!result.meta.changes) return {kind:"conflict" as const};
  const statements=stageKeys.map((stage)=>env.DB.prepare("UPDATE project_stage_weights SET weight=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE project_id=? AND stage=?").bind(input.weights[stage],actor,id,stage));
  statements.push(env.DB.prepare(`INSERT INTO audit_logs (id,entity_type,entity_id,action,before_json,after_json,source,correlation_id) VALUES (?,?,?,?,?,?,'APPLICATION',?)`).bind(crypto.randomUUID(),"Project",id,"UPDATE",JSON.stringify(before),JSON.stringify({...input,overallProgress:calculateOverallProgress(input)}),correlationId));
  await env.DB.batch(statements); return {kind:"ok" as const,project:await getProject(id)};
}

export async function archiveProject(id:string,expectedVersion:number,reason:string,actor:string,correlationId:string){
  const before=await getProject(id); if(!before)return{kind:"not_found" as const};
  const result=await env.DB.prepare("UPDATE projects SET record_status='ARCHIVED',archived_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND record_status='ACTIVE'").bind(actor,id,expectedVersion).run();
  if(!result.meta.changes)return{kind:"conflict" as const};
  await env.DB.prepare(`INSERT INTO audit_logs (id,entity_type,entity_id,action,before_json,after_json,source,correlation_id) VALUES (?,?,?,?,?,?,'APPLICATION',?)`).bind(crypto.randomUUID(),"Project",id,"ARCHIVE",JSON.stringify(before),JSON.stringify({reason}),correlationId).run();
  return{kind:"ok" as const};
}
