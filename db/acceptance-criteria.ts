import { env } from "cloudflare:workers";
import type { CriterionInput } from "../app/delivery/acceptance-criteria-contract";

export async function getStoryCriteria(itemId: string) {
  const story = await env.DB.prepare("SELECT id,business_id businessId,title,item_type itemType,origin,story_actor storyActor,story_capability storyCapability,business_value businessValue,status,version FROM backlog_items WHERE id=? AND record_status='ACTIVE'").bind(itemId).first();
  if (!story) return { kind: "not_found" as const };
  if (story.itemType !== "STORY") return { kind: "not_story" as const };
  const result = await env.DB.prepare("SELECT id,sequence,given_text givenText,when_text whenText,then_text thenText,status,version FROM acceptance_criteria WHERE backlog_item_id=? ORDER BY sequence").bind(itemId).all();
  return { kind: "ok" as const, story, criteria: result.results };
}

export async function replaceStoryCriteria(itemId: string, criteria: CriterionInput[], version: number, actor: string, correlationId: string) {
  const story = await env.DB.prepare("SELECT id,business_id businessId,item_type itemType,origin,status,version FROM backlog_items WHERE id=? AND record_status='ACTIVE'").bind(itemId).first<{ id: string; businessId: string; itemType: string; origin: string; status: string; version: number }>();
  if (!story) return { kind: "not_found" as const };
  if (story.itemType !== "STORY") return { kind: "not_story" as const };
  if (story.origin !== "LOCAL") return { kind: "read_only" as const };
  if (!Number.isInteger(version) || story.version !== version) return { kind: "conflict" as const };
  const before = await env.DB.prepare("SELECT sequence,given_text givenText,when_text whenText,then_text thenText,status FROM acceptance_criteria WHERE backlog_item_id=? ORDER BY sequence").bind(itemId).all();
  const statements = [env.DB.prepare("DELETE FROM acceptance_criteria WHERE backlog_item_id=?").bind(itemId)];
  criteria.forEach((criterion, index) => statements.push(env.DB.prepare("INSERT INTO acceptance_criteria(id,backlog_item_id,sequence,given_text,when_text,then_text,status,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), itemId, index + 1, criterion.given, criterion.when, criterion.then, criterion.status, actor, actor)));
  statements.push(env.DB.prepare("UPDATE backlog_items SET version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND version=?").bind(actor, itemId, version));
  statements.push(env.DB.prepare("INSERT INTO audit_logs(id,entity_type,entity_id,action,before_json,after_json,actor_user_id,source,correlation_id) VALUES(?,?,?,?,?,?,?,'APPLICATION',?)").bind(crypto.randomUUID(), "BacklogItem", itemId, "ACCEPTANCE_CRITERIA_REPLACE", JSON.stringify(before.results), JSON.stringify(criteria), actor, correlationId));
  await env.DB.batch(statements);
  return { kind: "ok" as const, version: version + 1 };
}
