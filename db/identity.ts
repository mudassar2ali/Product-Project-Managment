import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "../app/chatgpt-auth";

export async function ensureAuthenticatedUser(user: ChatGPTUser) {
  const record = await env.DB.prepare(`
    INSERT INTO users(id,external_user_id,email,display_name,last_seen_at,created_by,updated_by)
    VALUES(?,?,?,?,CURRENT_TIMESTAMP,?,?)
    ON CONFLICT(external_user_id) DO UPDATE SET
      email=excluded.email,
      display_name=excluded.display_name,
      active=1,
      last_seen_at=CURRENT_TIMESTAMP,
      updated_at=CURRENT_TIMESTAMP,
      updated_by=excluded.updated_by
    RETURNING id
  `).bind(user.userId, user.userId, user.email, user.displayName, user.userId, user.userId).first<{ id: string }>();
  if (!record?.id) throw new Error("IDENTITY_PERSISTENCE_FAILED");
  return record.id;
}
