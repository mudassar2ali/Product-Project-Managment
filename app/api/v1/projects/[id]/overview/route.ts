import { authorizeApi, apiError, isResponse } from "../../../api-helpers";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("project.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getProjectOverview } = await import("../../../../../../db/projects");
  const overview = await getProjectOverview(id, {
    backlog: context.principal.permissions.includes("backlog.view"),
    sprints: context.principal.permissions.includes("sprint.view"),
    metrics: context.principal.permissions.includes("delivery.metrics.view"),
  }, {
    documents: context.principal.permissions.includes("document.view"),
    requirements: context.principal.permissions.includes("requirement.view"),
    signoffs: context.principal.permissions.includes("signoff.view"),
    raci: context.principal.permissions.includes("raci.view"),
    feasibility: context.principal.permissions.includes("feasibility.view"),
  });
  if (!overview) return apiError(404, "PROJECT_NOT_FOUND", "Project was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: overview, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: { "cache-control": "no-store" } });
}
