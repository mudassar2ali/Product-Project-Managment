import "server-only";
import type { ChatGPTUser } from "./chatgpt-auth";

export const permissions = [
  "dashboard.view",
  "product.view", "product.create", "product.edit", "product.archive", "product.export",
  "project.view", "project.create", "project.edit", "project.archive", "project.export", "project.override_health",
  "milestone.view", "milestone.create", "milestone.edit", "milestone.archive",
  "raid.view", "raid.create", "raid.edit", "raid.archive", "raid.escalate", "raid.export",
  "idea.view", "idea.create", "idea.edit", "idea.review", "idea.convert",
  "report.view", "report.export",
  "integration.view", "integration.configure", "integration.sync", "integration.diagnostics",
  "admin.users", "admin.roles", "admin.settings", "audit.view",
] as const;

export type PermissionCode = (typeof permissions)[number];
export type RoleCode = keyof typeof rolePermissions;

const viewerPermissions: PermissionCode[] = [
  "dashboard.view", "product.view", "project.view", "milestone.view", "raid.view",
  "idea.view", "report.view", "integration.view",
];

export const rolePermissions = {
  ADMINISTRATOR: [...permissions],
  PRODUCT_DEVELOPMENT_MANAGER: permissions.filter((permission) =>
    !permission.startsWith("admin."),
  ),
  PRODUCT_MANAGER: [
    ...viewerPermissions,
    "product.create", "product.edit", "product.export",
    "project.create", "project.edit", "project.export",
    "milestone.create", "milestone.edit",
    "raid.create", "raid.edit", "raid.escalate", "raid.export",
    "idea.create", "idea.edit", "idea.review", "idea.convert",
    "report.export", "integration.sync",
  ],
  BUSINESS_ANALYST: [
    ...viewerPermissions, "milestone.create", "milestone.edit", "raid.create", "raid.edit",
    "idea.create", "idea.edit", "idea.review",
  ],
  ENGINEERING_LEAD: [
    ...viewerPermissions, "project.edit", "milestone.edit", "raid.create", "raid.edit", "integration.sync",
  ],
  DEVELOPER: ["dashboard.view", "product.view", "project.view", "milestone.view", "raid.view", "raid.edit", "integration.view"],
  QA: [...viewerPermissions, "project.edit", "raid.create", "raid.edit"],
  FINANCE: ["dashboard.view", "product.view", "product.edit", "project.view", "project.edit", "report.view", "report.export"],
  COMPLIANCE_LEGAL: ["dashboard.view", "product.view", "project.view", "milestone.view", "raid.view", "raid.create", "raid.edit", "idea.view", "report.view"],
  STAKEHOLDER_APPROVER: viewerPermissions,
  EXECUTIVE_VIEWER: viewerPermissions,
} as const satisfies Record<string, readonly PermissionCode[]>;

const roleNames: Record<RoleCode, string> = {
  ADMINISTRATOR: "Administrator",
  PRODUCT_DEVELOPMENT_MANAGER: "Product Development Manager",
  PRODUCT_MANAGER: "Product Manager",
  BUSINESS_ANALYST: "Business Analyst",
  ENGINEERING_LEAD: "Engineering Lead",
  DEVELOPER: "Developer",
  QA: "QA",
  FINANCE: "Finance",
  COMPLIANCE_LEGAL: "Compliance / Legal",
  STAKEHOLDER_APPROVER: "Stakeholder / Approver",
  EXECUTIVE_VIEWER: "Executive / Viewer",
};

export type Principal = {
  user: ChatGPTUser;
  roleCodes: RoleCode[];
  roleNames: string[];
  permissions: PermissionCode[];
};

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  readonly status = 403;
  constructor(readonly permission: PermissionCode) {
    super("You do not have permission to perform this action.");
    this.name = "AuthorizationError";
  }
}

export function createPrincipal(user: ChatGPTUser, roleCodes: RoleCode[] = ["EXECUTIVE_VIEWER"]): Principal {
  const validRoles = [...new Set(roleCodes)].filter((role): role is RoleCode => role in rolePermissions);
  const effectiveRoles = validRoles.length ? validRoles : ["EXECUTIVE_VIEWER"];
  const effectivePermissions = [...new Set(effectiveRoles.flatMap((role) => rolePermissions[role]))];
  return {
    user,
    roleCodes: effectiveRoles,
    roleNames: effectiveRoles.map((role) => roleNames[role]),
    permissions: effectivePermissions,
  };
}

export function hasPermission(principal: Principal, permission: PermissionCode): boolean {
  return principal.permissions.includes(permission);
}

export function requirePermission(principal: Principal, permission: PermissionCode): void {
  if (!hasPermission(principal, permission)) throw new AuthorizationError(permission);
}
