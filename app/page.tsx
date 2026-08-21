import type { Metadata } from "next";
import { CommandCenterShell } from "./command-center-shell";
import { requireChatGPTUser } from "./chatgpt-auth";
import { createPrincipal, requirePermission } from "./authorization";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Command Center",
  description: "Enterprise product and project portfolio command center.",
};

export default async function Home() {
  const user = await requireChatGPTUser("/");
  const { getUserRoleCodes } = await import("../db/role-assignments");
  const roleCodes = await getUserRoleCodes(user.userId);
  const principal = createPrincipal(user, roleCodes);
  requirePermission(principal, "dashboard.view");
  return <CommandCenterShell principal={principal} />;
}
