import { env } from "cloudflare:workers";
import type { ExternalProject } from "../app/integrations/engineering-delivery-provider";
import { defaultWeights } from "../app/projects/project-contract";

// Stable IDs make retries and concurrent imports reuse the same records.
export async function importAzureProject(connection: { id: string; organization: string }, source: ExternalProject, actor: string, correlationId: string) {
  const existing = await env.DB.prepare("SELECT id,project_id projectId,record_status recordStatus FROM azure_project_links WHERE connection_id=? AND azure_project_id=? ORDER BY record_status='ACTIVE' DESC LIMIT 1").bind(connection.id, source.id).first<{ id: string; projectId: string; recordStatus: string }>();
  if (existing) {
    if (existing.recordStatus !== "ACTIVE") throw new Error("This Azure Project has an archived mapping. Restore it before importing again.");
    return { linkId: existing.id, projectId: existing.projectId, created: false };
  }
  const productId = `azure-org-${connection.id}`, projectId = `azure-project-${connection.id}-${source.id}`, linkId = `azure-link-${connection.id}-${source.id}`;
  const code = `AZ-${source.id.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  const statements = [
    env.DB.prepare("INSERT INTO products(id,business_id,name,code,description,created_by,updated_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(productId, `ADO-ORG-${connection.id}`, `Azure · ${connection.organization}`, `AZ-${connection.id.replaceAll("-", "").slice(0, 16).toUpperCase()}`, "Projects imported from Azure DevOps.", actor, actor),
    env.DB.prepare("INSERT INTO projects(id,business_id,name,code,product_id,description,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(projectId, `ADO-PROJ-${connection.id}-${source.id}`, source.name, code, productId, source.description ?? "", actor, actor),
    ...Object.entries(defaultWeights).map(([stage, weight]) => env.DB.prepare("INSERT INTO project_stage_weights(id,project_id,stage,weight,created_by,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING").bind(`${projectId}-${stage}`, projectId, stage, weight, actor, actor)),
    env.DB.prepare("INSERT INTO azure_project_links(id,project_id,connection_id,azure_project_id,azure_project_name,last_validation_status,created_by,updated_by) VALUES(?,?,?,?,?,'VALIDATED',?,?) ON CONFLICT(id) DO NOTHING").bind(linkId, projectId, connection.id, source.id, source.name, actor, actor),
    env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,actor_user_id,source,correlation_id) VALUES(?, 'AzureProjectLink',?,'IMPORT_PROJECT',?,'AZURE_DEVOPS',?) ON CONFLICT(id) DO NOTHING").bind(`import-${linkId}`, linkId, actor, correlationId),
  ];
  await env.DB.batch(statements);
  return { linkId, projectId, created: true };
}
