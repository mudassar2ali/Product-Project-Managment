import { authorizeApi, apiError, isResponse } from "../../v1/api-helpers";
import { validateSprintInput } from "../../../delivery/sprint-contract";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await authorizeApi("sprint.view"); if (isResponse(context)) return context;
  const url = new URL(request.url), page = Math.max(1, Number(url.searchParams.get("page") || 1)), pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 50)));
  const { listSprints } = await import("../../../../db/sprints");
  const result = await listSprints({ projectId: url.searchParams.get("projectId") || "", status: url.searchParams.get("status") || "", origin: url.searchParams.get("origin") || "", page, pageSize });
  return Response.json({ data: result.items, meta: { page, pageSize, total: result.total, correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await authorizeApi("sprint.create"); if (isResponse(context)) return context;
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateSprintInput(body); if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the Sprint fields.", context.correlationId, context.timestamp, validation.details);
  const { createSprint } = await import("../../../../db/sprints");
  const result = await createSprint(validation.value, context.principal.user.userId, context.correlationId);
  if (result.kind === "invalid_project") return apiError(422, "INVALID_PROJECT", "Select an active Project.", context.correlationId, context.timestamp, { projectId: "The selected Project is unavailable." });
  return Response.json({ data: result }, { status: 201, headers: { "cache-control": "no-store" } });
}
