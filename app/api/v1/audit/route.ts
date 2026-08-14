import { authorizeApi, apiError, apiHeaders, isResponse } from "../api-helpers";
import { listAudit } from "../../../../db/audit";

// All responses use cache-control: no-store through the shared API headers.
export const dynamic = "force-dynamic";

const entities = new Set(["Product","Project","Milestone","RAID","Idea","AzureConnection","AzureProjectLink","BacklogItem","Sprint"]);
const sources = new Set(["APPLICATION","AZURE_DEVOPS"]);
const validDate = (value: string) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).valueOf()));

export async function GET(request: Request) {
  const auth = await authorizeApi("audit.view");
  if (isResponse(auth)) return auth;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").slice(0, 140);
  const entity = (url.searchParams.get("entity") || "").slice(0, 64);
  const action = (url.searchParams.get("action") || "").slice(0, 48);
  const source = (url.searchParams.get("source") || "").slice(0, 32);
  const from = (url.searchParams.get("from") || "").slice(0, 10);
  const to = (url.searchParams.get("to") || "").slice(0, 10);
  const details: Record<string, string> = {};
  if (entity && !entities.has(entity)) details.entity = "Select a governed entity type.";
  if (action && !/^[A-Z][A-Z0-9_]{0,47}$/.test(action)) details.action = "Use a governed audit action.";
  if (source && !sources.has(source)) details.source = "Select a governed event source.";
  if (!validDate(from)) details.from = "Use a valid YYYY-MM-DD date.";
  if (!validDate(to)) details.to = "Use a valid YYYY-MM-DD date.";
  if (from && to && from > to) details.to = "The end date must be on or after the start date.";
  if (Object.keys(details).length) return apiError(422, "VALIDATION_FAILED", "Review the audit filters.", auth.correlationId, auth.timestamp, details);
  const data = await listAudit({ q, entity, action, source, from, to, page:Number(url.searchParams.get("page") || 1), pageSize:Number(url.searchParams.get("pageSize") || 25) });
  return Response.json({ data, meta: { correlationId:auth.correlationId,timestamp:data.generatedAt } }, { headers: apiHeaders(auth.correlationId) });
}
