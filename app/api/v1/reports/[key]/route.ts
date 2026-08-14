import { authorizeApi, apiError, apiHeaders, isResponse } from "../../api-helpers";
import { getReport, isReportKey, reportCsv } from "../../../../../db/reports";

// All responses use cache-control: no-store through the shared API headers.
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const csv = url.searchParams.get("format") === "csv";
  const auth = await authorizeApi(csv ? "report.export" : "report.view");
  if (isResponse(auth)) return auth;
  const { key } = await params;
  if (!isReportKey(key)) return apiError(404, "REPORT_NOT_FOUND", "The requested report is not available.", auth.correlationId, auth.timestamp);

  const operations = csv ? await import("../../../../../db/operations") : null;
  const observe = (outcome: "SUCCESS" | "ERROR" | "RATE_LIMITED", statusCode: number, details: Record<string, unknown> = {}) => operations?.recordOperationalEvent({
    operation: "REPORT_EXPORT",
    outcome,
    statusCode,
    durationMs: Date.now() - startedAt,
    actorUserId: auth.principal.user.userId,
    correlationId: auth.correlationId,
    entityType: "Report",
    entityId: key,
    details,
  });
  const rateLimit = operations ? await operations.consumeRateLimit("REPORT_EXPORT", auth.principal.user.userId) : null;
  if (operations && rateLimit && !rateLimit.allowed) {
    await observe("RATE_LIMITED", 429, { reportKey: key, errorCode: "OPERATION_RATE_LIMITED", retryAfterSeconds: rateLimit.retryAfter });
    return apiError(429, "OPERATION_RATE_LIMITED", "Report export is temporarily limited. Try again after the stated interval.", auth.correlationId, auth.timestamp, [], operations.rateLimitHeaders(rateLimit));
  }

  try {
    const report = await getReport(key, {
      q: (url.searchParams.get("q") || "").slice(0,140),
      page: Number(url.searchParams.get("page") || 1),
      pageSize: Number(url.searchParams.get("pageSize") || 25),
      exportAll:csv,
    });
    if (csv) {
      await observe("SUCCESS", 200, { reportKey: key, rows: report.rows.length, filteredRows: report.total });
      return new Response(reportCsv(report), { headers: { ...apiHeaders(auth.correlationId, rateLimit && operations ? operations.rateLimitHeaders(rateLimit) : {}), "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${key}-report.csv"`, "x-content-type-options": "nosniff" } });
    }
    return Response.json({ data: report, meta: { correlationId: auth.correlationId, timestamp: auth.timestamp } }, { headers: apiHeaders(auth.correlationId) });
  } catch {
    await observe("ERROR", 500, { reportKey: key, errorCode: "REPORT_GENERATION_FAILED" });
    return apiError(500, "REPORT_GENERATION_FAILED", "The report could not be generated from persisted evidence.", auth.correlationId, new Date().toISOString());
  }
}
