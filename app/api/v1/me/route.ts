import { getChatGPTUser } from "../../../chatgpt-auth";
import { createPrincipal } from "../../../authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  const correlationId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const user = await getChatGPTUser();

  if (!user) {
    return Response.json(
      {
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Sign in is required to access this resource.",
          validationDetails: [],
          correlationId,
          timestamp,
        },
      },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const { getUserRoleCodes } = await import("../../../../db/role-assignments");
  const roleCodes = await getUserRoleCodes(user.userId);
  const principal = createPrincipal(user, roleCodes);

  return Response.json(
    {
      data: {
        id: user.userId,
        email: user.email,
        displayName: user.displayName,
        roles: principal.roleCodes,
        permissions: principal.permissions,
      },
      meta: { correlationId, timestamp },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
