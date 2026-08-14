import { authorizeApi, apiError, apiHeaders, isResponse } from "../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await authorizeApi("integration.diagnostics");
  if (isResponse(context)) return context;
  try {
    const { getOperationalStatus } = await import("../../../../db/operations");
    const data = await getOperationalStatus();
    return Response.json({ data, meta: { correlationId: context.correlationId, timestamp: data.generatedAt } }, { headers: apiHeaders(context.correlationId) });
  } catch {
    return apiError(500, "OPERATIONAL_STATUS_UNAVAILABLE", "Operational control evidence is temporarily unavailable.", context.correlationId, new Date().toISOString());
  }
}
