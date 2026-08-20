import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("release.readiness");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { calculateAndPersistReadiness } = await import("../../../../../../db/release-readiness");
  const result = await calculateAndPersistReadiness(id, context.principal.user.userId, context.correlationId);
  if (result.kind !== "ok") return apiError(404, "RELEASE_NOT_FOUND", "Release was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result.snapshot, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
