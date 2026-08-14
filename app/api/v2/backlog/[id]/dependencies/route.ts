import { authorizeApi, apiError, isResponse } from "../../../../v1/api-helpers";
import { validateDependencyInput } from "../../../../../delivery/dependency-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("backlog.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { listDependencies } = await import("../../../../../../db/backlog-dependencies");
  const result = await listDependencies(id);
  if (result.kind === "not_found") return apiError(404, "BACKLOG_ITEM_NOT_FOUND", "Backlog item was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("backlog.edit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateDependencyInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the dependency fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { addDependency } = await import("../../../../../../db/backlog-dependencies");
  try {
    const result = await addDependency(id, validation.value, context.principal.user.userId, context.correlationId);
    const map = {
      not_found: [404, "BACKLOG_ITEM_NOT_FOUND", "One of the work items was not found."],
      read_only: [409, "AZURE_ORIGIN_READ_ONLY", "Azure-origin dependencies are read-only."],
      self: [422, "SELF_DEPENDENCY", "A work item cannot depend on itself."],
      scope: [422, "DEPENDENCY_SCOPE_MISMATCH", "Dependencies must stay within the same Project and origin."],
      conflict: [409, "VERSION_CONFLICT", "This work item changed. Refresh and try again."],
      not_ready: [409, "UNRESOLVED_DEPENDENCY", "A Ready item cannot gain an unresolved blocking dependency."],
      duplicate: [409, "DUPLICATE_DEPENDENCY", "This dependency already exists."],
      cycle: [409, "DEPENDENCY_CYCLE", "This relationship would create a dependency cycle."],
    } as const;
    if (result.kind !== "ok") { const error = map[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
    return Response.json({ data: result }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch { return apiError(500, "DEPENDENCY_CREATE_FAILED", "The dependency could not be created.", context.correlationId, context.timestamp); }
}
