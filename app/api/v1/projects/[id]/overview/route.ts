import { authorizeApi, apiError, isResponse } from "../../../api-helpers";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("project.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getProjectOverview } = await import("../../../../../../db/projects");
  const overview = await getProjectOverview(id);
  if (!overview) return apiError(404, "PROJECT_NOT_FOUND", "Project was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: overview, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: { "cache-control": "no-store" } });
}
