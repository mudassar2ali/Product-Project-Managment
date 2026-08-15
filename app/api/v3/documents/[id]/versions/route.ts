import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("document.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getBrdWorkspace } = await import("../../../../../../db/governance-documents");
  const result = await getBrdWorkspace(id);
  if (result.kind === "not_found") return apiError(404, "BRD_NOT_FOUND", "BRD was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result.versions, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("document.version");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const changeSummary = typeof source.changeSummary === "string" ? source.changeSummary.trim() : "";
  if (changeSummary.length < 5 || changeSummary.length > 2000) return apiError(422, "VALIDATION_FAILED", "Describe why this revision is needed.", context.correlationId, context.timestamp, { changeSummary: "Use 5–2,000 characters." });
  const { id } = await params;
  const { createBrdRevision } = await import("../../../../../../db/governance-documents");
  const result = await createBrdRevision(id, changeSummary, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "BRD_NOT_FOUND", "BRD was not found."],
    draft_exists: [409, "DRAFT_ALREADY_EXISTS", "Complete or discard the current draft before creating another revision."],
    not_eligible: [409, "REVISION_NOT_ALLOWED", "A revision can begin only from an approved or rejected version."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result.workspace, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
