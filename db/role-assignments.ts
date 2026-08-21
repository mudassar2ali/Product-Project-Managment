import { env } from "cloudflare:workers";
import type { RoleCode } from "../app/authorization";

// Stage 5 Step 2 -- database-driven role resolution. `users.id` is always the raw
// ChatGPT-identity `userId` (db/identity.ts's ensureAuthenticatedUser uses it as both `id`
// and `external_user_id`), so role assignments can be looked up by that identifier directly
// -- no dependency on the user row having been persisted first, and no reordering needed in
// authorizeApi. Every row this project's own write path ever produces is GLOBAL/*, matching
// the ck_user_role_assignment_scope_global constraint added in Step 1, so no scope filter
// beyond that is required here; a future stage that builds project-scoped assignment would
// extend this query, not replace it.
export async function getUserRoleCodes(userId: string): Promise<RoleCode[]> {
  const rows = await env.DB.prepare(`
    SELECT r.code code
    FROM user_role_assignments a
    JOIN roles r ON r.id = a.role_id
    WHERE a.user_id = ? AND a.scope_type = 'GLOBAL' AND a.scope_id = '*'
  `).bind(userId).all<{ code: string }>();
  return rows.results.map((row) => row.code as RoleCode);
}
