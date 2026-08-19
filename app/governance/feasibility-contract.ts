import { feasibilityStatuses } from "./stage3-contract";

export type FeasibilityStatus = (typeof feasibilityStatuses)[number];

export const feasibilityEstimateUnits = ["HOURS", "DAYS", "STORY_POINTS"] as const;
export type FeasibilityEstimateUnit = (typeof feasibilityEstimateUnits)[number];

export type FeasibilityAssessmentRegistrationInput = {
  backlogFeatureId: string | null;
  ownerUserId: string | null;
};

export type FeasibilityRevisionInput = {
  technicalSpike: string;
  architectureReview: string;
  feasibilitySummary: string;
  integrationRequirements: string;
  securityReview: string;
  technicalConstraints: string;
  technicalDebtRisk: string;
  engineeringEstimate: number | null;
  estimateUnit: FeasibilityEstimateUnit | null;
  recommendation: string;
};

type Result<T> = { ok: true; value: T } | { ok: false; details: Record<string, string> };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const identifier = (value: unknown) => {
  const candidate = text(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : "";
};

export function validateFeasibilityAssessmentRegistrationInput(body: unknown): Result<FeasibilityAssessmentRegistrationInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawBacklogFeatureId = text(source.backlogFeatureId);
  const rawOwnerUserId = text(source.ownerUserId);
  const value: FeasibilityAssessmentRegistrationInput = {
    backlogFeatureId: rawBacklogFeatureId ? identifier(source.backlogFeatureId) || "INVALID" : null,
    ownerUserId: rawOwnerUserId ? identifier(source.ownerUserId) || "INVALID" : null,
  };
  const details: Record<string, string> = {};
  if (value.backlogFeatureId === "INVALID") details.backlogFeatureId = "Select a valid Backlog feature.";
  if (value.ownerUserId === "INVALID") details.ownerUserId = "Select a valid owner.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value };
}

export function validateFeasibilityRevisionInput(body: unknown): Result<FeasibilityRevisionInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const requestedUnit = text(source.estimateUnit).toUpperCase();
  const estimateUnit = (feasibilityEstimateUnits as readonly string[]).includes(requestedUnit) ? (requestedUnit as FeasibilityEstimateUnit) : null;
  const rawEstimate = source.engineeringEstimate;
  const engineeringEstimate = rawEstimate === "" || rawEstimate === null || rawEstimate === undefined ? null : Number(rawEstimate);
  const value: FeasibilityRevisionInput = {
    technicalSpike: text(source.technicalSpike),
    architectureReview: text(source.architectureReview),
    feasibilitySummary: text(source.feasibilitySummary),
    integrationRequirements: text(source.integrationRequirements),
    securityReview: text(source.securityReview),
    technicalConstraints: text(source.technicalConstraints),
    technicalDebtRisk: text(source.technicalDebtRisk),
    engineeringEstimate: engineeringEstimate === null || Number.isNaN(engineeringEstimate) ? null : Math.round(engineeringEstimate),
    estimateUnit,
    recommendation: text(source.recommendation),
  };
  const details: Record<string, string> = {};
  for (const [field, label] of [
    ["technicalSpike", "Technical spike"],
    ["architectureReview", "Architecture review"],
    ["feasibilitySummary", "Feasibility summary"],
    ["integrationRequirements", "Integration requirements"],
    ["securityReview", "Security review"],
    ["technicalConstraints", "Technical constraints"],
    ["technicalDebtRisk", "Technical debt risk"],
    ["recommendation", "Recommendation"],
  ] as const) {
    if ((value as unknown as Record<string, string>)[field].length > 20_000) details[field] = `${label} cannot exceed 20,000 characters.`;
  }
  const rawEstimateProvided = rawEstimate !== "" && rawEstimate !== null && rawEstimate !== undefined;
  if (rawEstimateProvided && (value.engineeringEstimate === null || value.engineeringEstimate < 0)) details.engineeringEstimate = "Provide a non-negative engineering estimate.";
  if ((value.engineeringEstimate === null) !== (estimateUnit === null)) {
    details.estimateUnit = "An engineering estimate and its unit must be provided together.";
  } else if (rawEstimateProvided && !estimateUnit) {
    details.estimateUnit = "Select Hours, Days, or Story Points.";
  }
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value };
}

export function incompleteFeasibilityRevision(revision: FeasibilityRevisionInput) {
  const missing: string[] = [];
  if (!revision.feasibilitySummary.trim()) missing.push("feasibilitySummary");
  if (!revision.recommendation.trim()) missing.push("recommendation");
  return missing;
}
