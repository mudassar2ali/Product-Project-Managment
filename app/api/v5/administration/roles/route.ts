import { authorizeApi, apiHeaders, isResponse } from "../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await authorizeApi("admin.roles");
  if (isResponse(context)) return context;
  const { listRoleCatalog } = await import("../../../../../db/administration");
  const roles = await listRoleCatalog();
  return Response.json({ data: roles, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
