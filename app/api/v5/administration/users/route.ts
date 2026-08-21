import { authorizeApi, apiHeaders, isResponse } from "../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await authorizeApi("admin.users");
  if (isResponse(context)) return context;
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "30", 10) || 30));
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const { listUsersWithRoles } = await import("../../../../../db/administration");
  const result = await listUsersWithRoles({ q, page, pageSize });
  return Response.json(
    { data: result.items, meta: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize), correlationId: context.correlationId, timestamp: context.timestamp } },
    { headers: apiHeaders(context.correlationId) },
  );
}
