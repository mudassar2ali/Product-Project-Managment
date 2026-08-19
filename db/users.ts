import { env } from "cloudflare:workers";

export type UserOption = { id: string; displayName: string; email: string };

export async function listActiveUsers() {
  const rows = await env.DB.prepare("SELECT id,display_name displayName,email FROM users WHERE active=1 ORDER BY display_name").all<UserOption>();
  return rows.results;
}
