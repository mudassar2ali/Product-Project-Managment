import { authorizeApi, apiHeaders, isResponse } from "../api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await authorizeApi("dashboard.view");
  if (isResponse(context)) return context;
  const { listActiveUsers } = await import("../../../../db/users");
  const items = await listActiveUsers();
  return Response.json({ data: items, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
