import { env } from "cloudflare:workers";
import { roleDescriptions, summarizePermissionGroups, type RoleCode } from "../app/authorization";

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export type AdministeredUser = {
  id: string;
  displayName: string;
  email: string;
  active: boolean;
  lastSeenAt: string;
  roleCodes: string[];
};

export async function listUsersWithRoles(input: { q: string; page: number; pageSize: number }) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (input.q) {
    const q = `%${escapeLike(input.q)}%`;
    conditions.push("(u.display_name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')");
    values.push(q, q);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (input.page - 1) * input.pageSize;
  const [rows, count] = await Promise.all([
    env.DB.prepare(`
      SELECT u.id id, u.display_name displayName, u.email email, u.active active, u.last_seen_at lastSeenAt,
        (SELECT GROUP_CONCAT(r.code) FROM user_role_assignments a JOIN roles r ON r.id=a.role_id WHERE a.user_id=u.id) roleCodesRaw
      FROM users u ${where} ORDER BY u.display_name LIMIT ? OFFSET ?
    `).bind(...values, input.pageSize, offset).all<{ id: string; displayName: string; email: string; active: number; lastSeenAt: string; roleCodesRaw: string | null }>(),
    env.DB.prepare(`SELECT COUNT(*) total FROM users u ${where}`).bind(...values).first<{ total: number }>(),
  ]);
  const items: AdministeredUser[] = rows.results.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    active: Boolean(row.active),
    lastSeenAt: row.lastSeenAt,
    roleCodes: row.roleCodesRaw ? row.roleCodesRaw.split(",") : [],
  }));
  return { items, total: Number(count?.total ?? 0) };
}

export async function listRoleCatalog() {
  const rows = await env.DB.prepare("SELECT code, name FROM roles ORDER BY name").all<{ code: string; name: string }>();
  return rows.results.map((row) => ({
    code: row.code,
    name: row.name,
    description: roleDescriptions[row.code as RoleCode] ?? "",
    permissionGroups: summarizePermissionGroups(row.code as RoleCode),
  }));
}

export async function getUserRoleAssignments(userId: string) {
  const user = await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(userId).first<{ id: string }>();
  if (!user) return null;
  const rows = await env.DB.prepare(`
    SELECT a.id id, r.code roleCode, r.name roleName, a.created_at assignedAt, a.created_by assignedBy
    FROM user_role_assignments a JOIN roles r ON r.id=a.role_id
    WHERE a.user_id=? ORDER BY r.name
  `).bind(userId).all<{ id: string; roleCode: string; roleName: string; assignedAt: string; assignedBy: string | null }>();
  return rows.results;
}

export async function assignRole(userId: string, roleCode: string, actor: string, correlationId: string) {
  const [user, role] = await Promise.all([
    env.DB.prepare("SELECT id FROM users WHERE id=?").bind(userId).first<{ id: string }>(),
    env.DB.prepare("SELECT id FROM roles WHERE code=?").bind(roleCode).first<{ id: string }>(),
  ]);
  if (!user) return { kind: "user_not_found" as const };
  if (!role) return { kind: "invalid_role" as const };
  const id = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO user_role_assignments (id, user_id, role_id, scope_type, scope_id, created_by, updated_by)
        VALUES (?, ?, ?, 'GLOBAL', '*', ?, ?)
      `).bind(id, userId, role.id, actor, actor),
      env.DB.prepare(`
        INSERT INTO audit_logs (id, entity_type, entity_id, action, after_json, actor_user_id, source, correlation_id)
        VALUES (?, 'UserRoleAssignment', ?, 'ROLE_ASSIGN', ?, ?, 'APPLICATION', ?)
      `).bind(crypto.randomUUID(), id, JSON.stringify({ userId, roleCode }), actor, correlationId),
    ]);
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return { kind: "duplicate" as const };
    throw error;
  }
  return { kind: "ok" as const, assignments: await getUserRoleAssignments(userId) };
}

export async function revokeRole(userId: string, assignmentId: string, actor: string, correlationId: string) {
  const assignment = await env.DB.prepare(`
    SELECT a.id id, r.code roleCode FROM user_role_assignments a JOIN roles r ON r.id=a.role_id
    WHERE a.id=? AND a.user_id=?
  `).bind(assignmentId, userId).first<{ id: string; roleCode: string }>();
  if (!assignment) return { kind: "not_found" as const };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM user_role_assignments WHERE id=?").bind(assignmentId),
    env.DB.prepare(`
      INSERT INTO audit_logs (id, entity_type, entity_id, action, before_json, actor_user_id, source, correlation_id)
      VALUES (?, 'UserRoleAssignment', ?, 'ROLE_REVOKE', ?, ?, 'APPLICATION', ?)
    `).bind(crypto.randomUUID(), assignmentId, JSON.stringify({ userId, roleCode: assignment.roleCode }), actor, correlationId),
  ]);
  return { kind: "ok" as const, assignments: await getUserRoleAssignments(userId) };
}
