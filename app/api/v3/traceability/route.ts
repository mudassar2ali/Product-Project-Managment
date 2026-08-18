import { authorizeApi, apiHeaders, isResponse } from "../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await authorizeApi("traceability.view");
  if (isResponse(context)) return context;
  const url = new URL(request.url);
  const { getPortfolioTraceability } = await import("../../../../db/requirement-coverage");
  const result = await getPortfolioTraceability({
    productId: (url.searchParams.get("productId") ?? "").slice(0, 128),
    projectId: (url.searchParams.get("projectId") ?? "").slice(0, 128),
  });
  return Response.json(
    {
      data: { items: result.items, gaps: result.gaps, coverage: result.coverage },
      meta: { total: result.items.length, gapCount: result.gaps.length, calculatedAt: result.calculatedAt, correlationId: context.correlationId, timestamp: context.timestamp },
    },
    { headers: apiHeaders(context.correlationId) },
  );
}
