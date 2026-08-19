import { env } from "cloudflare:workers";
import type { RaciMatrixPutInput } from "../app/governance/raci-contract";

async function nextBusinessId() {
  const result = await env.DB
    .prepare(
      "INSERT INTO business_sequences(entity_type,next_value,updated_at) VALUES('RACI',2,CURRENT_TIMESTAMP) ON CONFLICT(entity_type) DO UPDATE SET next_value=next_value+1,updated_at=CURRENT_TIMESTAMP RETURNING next_value-1 value",
    )
    .bind()
    .first<{ value: number }>();
  return `RACI-${String(result?.value ?? 1).padStart(4, "0")}`;
}

async function loadCurrentMatrix(projectId: string) {
  const draft = await env.DB
    .prepare("SELECT id,business_id businessId,project_id projectId,title,status,revision,published_at publishedAt,version FROM raci_matrices WHERE project_id=? AND status='DRAFT'")
    .bind(projectId)
    .first();
  if (draft) return draft;
  return env.DB
    .prepare("SELECT id,business_id businessId,project_id projectId,title,status,revision,published_at publishedAt,version FROM raci_matrices WHERE project_id=? AND status='PUBLISHED' ORDER BY revision DESC LIMIT 1")
    .bind(projectId)
    .first();
}

export async function getRaciWorkspace(projectId: string) {
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id=? AND record_status='ACTIVE'").bind(projectId).first<{ id: string }>();
  if (!project) return { kind: "not_found" as const };
  const matrix = await loadCurrentMatrix(projectId);
  const stakeholders = await env.DB
    .prepare("SELECT id,user_id userId,project_id projectId,display_name displayName,function,organization,active FROM governance_stakeholders WHERE project_id=? AND active=1 ORDER BY display_name")
    .bind(projectId)
    .all();
  if (!matrix) return { kind: "ok" as const, matrix: null, stakeholders: stakeholders.results, activities: [] };
  const activities = await env.DB
    .prepare("SELECT id,matrix_id matrixId,activity_key activityKey,name,sequence,governed_subject_type governedSubjectType,governed_subject_id governedSubjectId FROM raci_activities WHERE matrix_id=? ORDER BY sequence")
    .bind((matrix as { id: string }).id)
    .all();
  const activityIds = (activities.results as Array<{ id: string }>).map((activity) => activity.id);
  const assignments = activityIds.length
    ? await env.DB
        .prepare(
          `SELECT a.id,a.activity_id activityId,a.stakeholder_id stakeholderId,a.responsibility,s.display_name stakeholderDisplayName
           FROM raci_assignments a JOIN governance_stakeholders s ON s.id=a.stakeholder_id
           WHERE a.activity_id IN (${activityIds.map(() => "?").join(",")}) ORDER BY a.created_at`,
        )
        .bind(...activityIds)
        .all()
    : { results: [] };
  const assignmentsByActivity = new Map<string, unknown[]>();
  for (const assignment of assignments.results as Array<{ activityId: string } & Record<string, unknown>>) {
    const list = assignmentsByActivity.get(assignment.activityId) ?? [];
    list.push(assignment);
    assignmentsByActivity.set(assignment.activityId, list);
  }
  const activitiesWithAssignments = (activities.results as Array<{ id: string } & Record<string, unknown>>).map((activity) => ({
    ...activity,
    assignments: assignmentsByActivity.get(activity.id) ?? [],
  }));
  return { kind: "ok" as const, matrix, stakeholders: stakeholders.results, activities: activitiesWithAssignments };
}

export async function putRaciMatrix(projectId: string, input: RaciMatrixPutInput, actor: string, correlationId: string) {
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id=? AND record_status='ACTIVE'").bind(projectId).first<{ id: string }>();
  if (!project) return { kind: "not_found" as const };

  const existingDraft = await env.DB
    .prepare("SELECT id,version FROM raci_matrices WHERE project_id=? AND status='DRAFT'")
    .bind(projectId)
    .first<{ id: string; version: number }>();

  const stakeholderInvalidRefs = input.activities
    .flatMap((activity) => activity.assignments)
    .some((assignment) => !input.stakeholders.some((stakeholder) => stakeholder.key === assignment.stakeholderKey));
  if (stakeholderInvalidRefs) return { kind: "invalid_stakeholder_reference" as const };

  const stakeholderStatements = input.stakeholders.map((stakeholder) =>
    stakeholder.id
      ? env.DB
          .prepare(
            "UPDATE governance_stakeholders SET display_name=?,function=?,organization=?,user_id=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND project_id=? RETURNING id",
          )
          .bind(stakeholder.displayName, stakeholder.function, stakeholder.organization, stakeholder.userId, actor, stakeholder.id, projectId)
      : env.DB
          .prepare(
            `INSERT INTO governance_stakeholders(id,user_id,project_id,display_name,function,organization,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?)
             ON CONFLICT(project_id,display_name) DO UPDATE SET function=excluded.function,organization=excluded.organization,user_id=excluded.user_id,active=1,updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by
             RETURNING id`,
          )
          .bind(crypto.randomUUID(), stakeholder.userId, projectId, stakeholder.displayName, stakeholder.function, stakeholder.organization, actor, actor),
  );
  const stakeholderResults = stakeholderStatements.length ? await env.DB.batch(stakeholderStatements) : [];
  const stakeholderIdByKey = new Map<string, string>();
  input.stakeholders.forEach((stakeholder, index) => {
    const row = (stakeholderResults[index]?.results as Array<{ id: string }> | undefined)?.[0];
    if (row) stakeholderIdByKey.set(stakeholder.key, row.id);
  });
  const unresolvedStakeholder = input.stakeholders.some((stakeholder) => !stakeholderIdByKey.has(stakeholder.key));
  if (unresolvedStakeholder) return { kind: "invalid_stakeholder_reference" as const };

  const matrixId = existingDraft?.id ?? crypto.randomUUID();
  const activityIds = input.activities.map(() => crypto.randomUUID());

  const statements = [];
  if (!existingDraft) {
    const maxRevisionRow = await env.DB.prepare("SELECT MAX(revision) maxRevision FROM raci_matrices WHERE project_id=?").bind(projectId).first<{ maxRevision: number | null }>();
    const revision = (maxRevisionRow?.maxRevision ?? 0) + 1;
    const businessId = await nextBusinessId();
    statements.push(
      env.DB
        .prepare("INSERT INTO raci_matrices(id,business_id,project_id,title,status,revision,created_by,updated_by) VALUES(?,?,?,?,'DRAFT',?,?,?)")
        .bind(matrixId, businessId, projectId, input.title, revision, actor, actor),
    );
  } else {
    statements.push(
      env.DB
        .prepare("UPDATE raci_matrices SET title=?,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=? AND status='DRAFT'")
        .bind(input.title, actor, matrixId, input.expectedVersion),
    );
  }
  statements.push(
    env.DB.prepare("DELETE FROM raci_assignments WHERE activity_id IN (SELECT id FROM raci_activities WHERE matrix_id=?)").bind(matrixId),
    env.DB.prepare("DELETE FROM raci_activities WHERE matrix_id=?").bind(matrixId),
  );
  input.activities.forEach((activity, index) => {
    statements.push(
      env.DB
        .prepare(
          "INSERT INTO raci_activities(id,matrix_id,activity_key,name,sequence,governed_subject_type,governed_subject_id,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(activityIds[index], matrixId, activity.activityKey, activity.name, activity.sequence, activity.governedSubjectType, activity.governedSubjectId, actor, actor),
    );
    for (const assignment of activity.assignments) {
      statements.push(
        env.DB
          .prepare("INSERT INTO raci_assignments(id,activity_id,stakeholder_id,responsibility,created_by,updated_by) VALUES(?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), activityIds[index], stakeholderIdByKey.get(assignment.stakeholderKey), assignment.responsibility, actor, actor),
      );
    }
  });
  statements.push(
    env.DB
      .prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), "RaciMatrix", matrixId, "SAVE_DRAFT", JSON.stringify({ activityCount: input.activities.length, stakeholderCount: input.stakeholders.length }), actor, correlationId),
  );
  const results = await env.DB.batch(statements);
  const saveOk = existingDraft ? Boolean(results[0]?.meta.changes) : true;
  if (!saveOk) return { kind: "conflict" as const };

  if (input.publish) {
    const publishResults = await env.DB.batch([
      env.DB
        .prepare("UPDATE raci_matrices SET status='PUBLISHED',published_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND status='DRAFT'")
        .bind(actor, matrixId),
      env.DB
        .prepare("UPDATE raci_matrices SET status='SUPERSEDED',version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE project_id=? AND status='PUBLISHED' AND id<>?")
        .bind(actor, projectId, matrixId),
      env.DB
        .prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,after_json,actor_user_id,source,correlation_id,occurred_at) VALUES(?,?,?,?,?,?,'APPLICATION',?,CURRENT_TIMESTAMP)")
        .bind(crypto.randomUUID(), "RaciMatrix", matrixId, "PUBLISH", JSON.stringify({ matrixId }), actor, correlationId),
    ]);
    if (!publishResults[0]?.meta.changes) return { kind: "conflict" as const };
  }

  return { kind: "ok" as const, matrixId };
}
