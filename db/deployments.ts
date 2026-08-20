import { env } from "cloudflare:workers";
import { assertDeploymentCompletionConsistent, assertReleaseTransition } from "../app/releases/stage4-contract";
import type { DeploymentRecordInput, EnvironmentRegistrationInput } from "../app/releases/deployment-contract";

export type EnvironmentRow = {
  id: string; projectId: string; code: string; name: string; tier: string; active: number;
};

export type DeploymentRecordRow = {
  id: string; releaseId: string; environmentId: string; environmentCode: string; environmentName: string; environmentTier: string;
  status: string; deployedByUserId: string | null; deployedByName: string | null;
  startedAt: string; completedAt: string | null; deploymentReference: string; rollbackOfId: string | null; notes: string;
  version: number; createdAt: string; updatedAt: string;
};

export async function listEnvironments(projectId: string) {
  const rows = await env.DB.prepare(`
    SELECT id,project_id projectId,code,name,tier,active FROM release_environments
    WHERE project_id=? ORDER BY tier DESC, code ASC
  `).bind(projectId).all<EnvironmentRow>();
  return rows.results;
}

export async function createEnvironment(projectId: string, input: EnvironmentRegistrationInput, actor: string, correlationId: string) {
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id=? AND record_status='ACTIVE'").bind(projectId).first<{ id: string }>();
  if (!project) return { kind: "invalid_project" as const };
  const id = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO release_environments(id,project_id,code,name,tier,created_by,updated_by) VALUES(?,?,?,?,?,?,?)").bind(id, projectId, input.code, input.name, input.tier, actor, actor),
      env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)`)
        .bind(crypto.randomUUID(), "ReleaseEnvironment", id, "CREATE", JSON.stringify({ projectId, code: input.code, name: input.name, tier: input.tier }), actor, correlationId),
    ]);
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return { kind: "duplicate" as const };
    throw error;
  }
  return { kind: "ok" as const, items: await listEnvironments(projectId) };
}

async function deploymentRecordsFor(releaseId: string) {
  const rows = await env.DB.prepare(`
    SELECT d.id,d.release_id releaseId,d.environment_id environmentId,e.code environmentCode,e.name environmentName,e.tier environmentTier,
      d.status,d.deployed_by_user_id deployedByUserId,u.display_name deployedByName,
      d.started_at startedAt,d.completed_at completedAt,d.deployment_reference deploymentReference,d.rollback_of_id rollbackOfId,d.notes,
      d.version,d.created_at createdAt,d.updated_at updatedAt
    FROM deployment_records d
    JOIN release_environments e ON e.id=d.environment_id
    LEFT JOIN users u ON u.id=d.deployed_by_user_id
    WHERE d.release_id=? ORDER BY d.started_at DESC
  `).bind(releaseId).all<DeploymentRecordRow>();
  return rows.results;
}

export async function listDeploymentRecords(releaseId: string) {
  return deploymentRecordsFor(releaseId);
}

export async function recordDeployment(releaseId: string, input: DeploymentRecordInput, actor: string, correlationId: string) {
  const release = await env.DB.prepare("SELECT id,project_id projectId,status,version FROM releases WHERE id=? AND record_status='ACTIVE'").bind(releaseId).first<{ id: string; projectId: string; status: string; version: number }>();
  if (!release) return { kind: "not_found" as const };
  if (release.status === "CANCELLED") return { kind: "release_cancelled" as const };

  const environment = await env.DB.prepare("SELECT id,project_id projectId,tier,active FROM release_environments WHERE id=?").bind(input.environmentId).first<{ id: string; projectId: string; tier: string; active: number }>();
  if (!environment || environment.projectId !== release.projectId || !environment.active) return { kind: "invalid_environment" as const };

  try {
    assertDeploymentCompletionConsistent(input.status, input.completedAt);
  } catch {
    return { kind: "completion_invalid" as const };
  }

  if (input.status === "ROLLED_BACK") {
    const target = await env.DB.prepare("SELECT id FROM deployment_records WHERE id=? AND release_id=? AND status='SUCCEEDED'").bind(input.rollbackOfId, releaseId).first<{ id: string }>();
    if (!target) return { kind: "invalid_rollback_target" as const };
  }

  const id = crypto.randomUUID();
  const statements = [
    env.DB.prepare(`
      INSERT INTO deployment_records(id,release_id,environment_id,status,deployed_by_user_id,started_at,completed_at,deployment_reference,rollback_of_id,notes,created_by,updated_by)
      VALUES(?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),?,?,?,?,?,?)
    `).bind(id, releaseId, input.environmentId, input.status, actor, input.startedAt, input.completedAt, input.deploymentReference, input.rollbackOfId, input.notes, actor, actor),
    env.DB.prepare(`INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,'APPLICATION',?)`)
      .bind(crypto.randomUUID(), "Release", releaseId, "DEPLOYMENT_RECORD", JSON.stringify({ deploymentId: id, environmentId: input.environmentId, status: input.status, rollbackOfId: input.rollbackOfId }), actor, correlationId),
  ];

  let nextReleaseStatus: "RELEASED" | "ROLLED_BACK" | null = null;
  if (input.status === "SUCCEEDED" && environment.tier === "PROD") {
    try { assertReleaseTransition(release.status as never, "RELEASED"); nextReleaseStatus = "RELEASED"; } catch { /* release not yet ready to close — deployment is still recorded as evidence */ }
  } else if (input.status === "ROLLED_BACK") {
    try { assertReleaseTransition(release.status as never, "ROLLED_BACK"); nextReleaseStatus = "ROLLED_BACK"; } catch { /* not a valid transition from the current status — evidence only */ }
  }

  if (nextReleaseStatus === "RELEASED") {
    statements.push(env.DB.prepare("UPDATE releases SET status='RELEASED',released_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=?").bind(actor, releaseId, release.version));
  } else if (nextReleaseStatus === "ROLLED_BACK") {
    statements.push(env.DB.prepare("UPDATE releases SET status='ROLLED_BACK',version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=?").bind(actor, releaseId, release.version));
  }

  await env.DB.batch(statements);
  return { kind: "ok" as const, deployments: await deploymentRecordsFor(releaseId), releaseStatus: nextReleaseStatus ?? release.status };
}
