import { deploymentStatuses, environmentTiers, type DeploymentStatus, type EnvironmentTier } from "./stage4-contract";

export type EnvironmentRegistrationInput = {
  code: string;
  name: string;
  tier: EnvironmentTier;
};

export type DeploymentRecordInput = {
  environmentId: string;
  status: DeploymentStatus;
  startedAt: string | null;
  completedAt: string | null;
  deploymentReference: string;
  rollbackOfId: string | null;
  notes: string;
};

type Result<T> = { ok: true; value: T } | { ok: false; details: Record<string, string> };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const identifier = (value: unknown) => {
  const candidate = text(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : "";
};
const isoTimestamp = (value: unknown) => {
  const candidate = text(value);
  if (!candidate) return null;
  return Number.isNaN(Date.parse(candidate)) ? "INVALID" : candidate;
};

export function parseDeploymentStatus(value: unknown): DeploymentStatus | null {
  const candidate = text(value).toUpperCase();
  return (deploymentStatuses as readonly string[]).includes(candidate) ? (candidate as DeploymentStatus) : null;
}

export function parseEnvironmentTier(value: unknown): EnvironmentTier | null {
  const candidate = text(value).toUpperCase();
  return (environmentTiers as readonly string[]).includes(candidate) ? (candidate as EnvironmentTier) : null;
}

export function validateEnvironmentRegistrationInput(body: unknown): Result<EnvironmentRegistrationInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code = text(source.code).toUpperCase().slice(0, 40);
  const name = text(source.name).slice(0, 120);
  const requestedTier = text(source.tier).toUpperCase();
  const tier = requestedTier ? parseEnvironmentTier(requestedTier) : "NON_PROD";
  const details: Record<string, string> = {};
  if (!code) details.code = "Enter an environment code (e.g. UAT, STAGING, PRODUCTION).";
  if (!name) details.name = "Enter an environment name.";
  if (!tier) details.tier = "Select a valid environment tier.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value: { code, name, tier: tier ?? ("NON_PROD" as EnvironmentTier) } };
}

export function validateDeploymentRecordInput(body: unknown): Result<DeploymentRecordInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const environmentId = identifier(source.environmentId);
  const requestedStatus = text(source.status).toUpperCase();
  const status = requestedStatus ? parseDeploymentStatus(requestedStatus) : "PLANNED";
  const startedAtRaw = isoTimestamp(source.startedAt);
  const completedAtRaw = isoTimestamp(source.completedAt);
  const deploymentReference = text(source.deploymentReference).slice(0, 500);
  const rollbackOfIdRaw = text(source.rollbackOfId);
  const rollbackOfId = rollbackOfIdRaw ? identifier(rollbackOfIdRaw) || "INVALID" : null;
  const notes = text(source.notes).slice(0, 2000);

  const details: Record<string, string> = {};
  if (!environmentId) details.environmentId = "Select an environment.";
  if (!status) details.status = "Select a valid deployment status.";
  if (startedAtRaw === "INVALID") details.startedAt = "Enter a valid start time.";
  if (completedAtRaw === "INVALID") details.completedAt = "Enter a valid completion time.";
  if (rollbackOfId === "INVALID") details.rollbackOfId = "Select a valid deployment to roll back.";
  if (status === "ROLLED_BACK" && !rollbackOfId) details.rollbackOfId = "A rollback requires the deployment it rolls back.";

  return Object.keys(details).length
    ? { ok: false, details }
    : {
      ok: true,
      value: {
        environmentId,
        status: status ?? ("PLANNED" as DeploymentStatus),
        startedAt: startedAtRaw === "INVALID" ? null : startedAtRaw,
        completedAt: completedAtRaw === "INVALID" ? null : completedAtRaw,
        deploymentReference,
        rollbackOfId: rollbackOfId === "INVALID" ? null : rollbackOfId,
        notes,
      },
    };
}
