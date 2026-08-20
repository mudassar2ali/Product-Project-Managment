import { authorizeApi, apiError, apiHeaders, isResponse } from "../../v1/api-helpers";
import { releaseStatuses } from "../../../releases/stage4-contract";
import { validateReleaseRegistrationInput } from "../../../releases/release-contract";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await authorizeApi("release.view");
  if (isResponse(context)) return context;
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "30", 10) || 30));
  const status = url.searchParams.get("status") ?? "";
  if (status && !(releaseStatuses as readonly string[]).includes(status)) return apiError(422, "VALIDATION_FAILED", "Select a valid Release status.", context.correlationId, context.timestamp, { status: "Status is not supported." });
  const { listReleases } = await import("../../../../db/releases");
  const result = await listReleases({
    q: (url.searchParams.get("q") ?? "").trim().slice(0, 120),
    projectId: (url.searchParams.get("projectId") ?? "").slice(0, 128),
    status,
    page,
    pageSize,
  });
  return Response.json({ data: result.items, meta: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize), correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function POST(request: Request) {
  const context = await authorizeApi("release.create");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateReleaseRegistrationInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { createRelease } = await import("../../../../db/releases");
  const result = await createRelease(validation.value, context.principal.user.userId, context.correlationId);
  if (result.kind === "invalid_project") return apiError(422, "INVALID_PROJECT", "Select an active Project.", context.correlationId, context.timestamp, { projectId: "The selected Project is unavailable." });
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
