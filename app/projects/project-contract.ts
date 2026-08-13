import { productPriorities } from "../products/product-contract";

export const projectStatuses = ["Planned", "Active", "On Hold", "Completed", "Cancelled"] as const;
export const projectHealth = ["On Track", "At Risk", "Delayed", "Blocked", "On Hold", "Completed"] as const;
export const signOffStatuses = ["Pending", "Under Review", "Approved", "Approved with Conditions", "Rejected"] as const;
export const releaseStatuses = ["Not Planned", "Planned", "In Progress", "Ready", "Released"] as const;
export const stageKeys = ["requirements", "design", "development", "qa", "uat", "signOff", "deployment"] as const;
export const defaultWeights = { requirements: 10, design: 10, development: 40, qa: 15, uat: 15, signOff: 5, deployment: 5 } as const;

export type ProjectInput = {
  name: string; code: string; productId: string; description: string; objective: string; businessValue: string;
  scope: string; outOfScope: string; startDate: string | null; targetEndDate: string | null; actualEndDate: string | null;
  priority: (typeof productPriorities)[number]; status: (typeof projectStatuses)[number]; health: (typeof projectHealth)[number];
  requirementsProgress: number; designProgress: number; developmentProgress: number; qaProgress: number; uatProgress: number;
  signOffProgress: number; deploymentProgress: number; signOffStatus: (typeof signOffStatuses)[number]; releaseStatus: (typeof releaseStatuses)[number];
  budgetAmount: number; budgetCurrency: string; market: string; customer: string; comments: string;
  weights: Record<(typeof stageKeys)[number], number>;
};

type ValidationResult = { ok: true; value: ProjectInput } | { ok: false; details: Record<string, string> };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const date = (value: unknown) => text(value) || null;
const integer = (value: unknown) => typeof value === "number" ? value : Number(value ?? 0);

export function calculateOverallProgress(input: Pick<ProjectInput, `${(typeof stageKeys)[number]}Progress` | "weights">) {
  return Math.round(stageKeys.reduce((total, stage) => total + input[`${stage}Progress`] * input.weights[stage], 0) / 100);
}

export function validateProjectInput(body: unknown): ValidationResult {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const rawWeights = source.weights && typeof source.weights === "object" ? source.weights as Record<string, unknown> : {};
  const weights = Object.fromEntries(stageKeys.map((stage) => [stage, integer(rawWeights[stage] ?? defaultWeights[stage])])) as ProjectInput["weights"];
  const value: ProjectInput = {
    name: text(source.name), code: text(source.code).toUpperCase(), productId: text(source.productId), description: text(source.description),
    objective: text(source.objective), businessValue: text(source.businessValue), scope: text(source.scope), outOfScope: text(source.outOfScope),
    startDate: date(source.startDate), targetEndDate: date(source.targetEndDate), actualEndDate: date(source.actualEndDate),
    priority: (text(source.priority) || "Medium") as ProjectInput["priority"], status: (text(source.status) || "Active") as ProjectInput["status"],
    health: (text(source.health) || "On Track") as ProjectInput["health"], requirementsProgress: integer(source.requirementsProgress),
    designProgress: integer(source.designProgress), developmentProgress: integer(source.developmentProgress), qaProgress: integer(source.qaProgress),
    uatProgress: integer(source.uatProgress), signOffProgress: integer(source.signOffProgress), deploymentProgress: integer(source.deploymentProgress),
    signOffStatus: (text(source.signOffStatus) || "Pending") as ProjectInput["signOffStatus"], releaseStatus: (text(source.releaseStatus) || "Not Planned") as ProjectInput["releaseStatus"],
    budgetAmount: integer(source.budgetAmount), budgetCurrency: (text(source.budgetCurrency) || "USD").toUpperCase(), market: text(source.market),
    customer: text(source.customer), comments: text(source.comments), weights,
  };
  const details: Record<string, string> = {};
  if (value.name.length < 2 || value.name.length > 140) details.name = "Name must contain 2–140 characters.";
  if (!/^[A-Z][A-Z0-9-]{1,19}$/.test(value.code)) details.code = "Code must start with a letter and use 2–20 uppercase letters, numbers, or hyphens.";
  if (!value.productId) details.productId = "Select a parent Product.";
  if (!projectStatuses.includes(value.status)) details.status = "Select a valid Project status.";
  if (!projectHealth.includes(value.health)) details.health = "Select a valid health status.";
  if (!productPriorities.includes(value.priority)) details.priority = "Select a valid priority.";
  if (!signOffStatuses.includes(value.signOffStatus)) details.signOffStatus = "Select a valid sign-off status.";
  if (!releaseStatuses.includes(value.releaseStatus)) details.releaseStatus = "Select a valid release status.";
  for (const stage of stageKeys) { const field = `${stage}Progress` as const; if (!Number.isInteger(value[field]) || value[field] < 0 || value[field] > 100) details[field] = "Progress must be a whole number from 0 to 100."; }
  const weightTotal = stageKeys.reduce((sum, stage) => sum + weights[stage], 0);
  if (stageKeys.some((stage) => !Number.isInteger(weights[stage]) || weights[stage] < 0 || weights[stage] > 100) || weightTotal !== 100) details.weights = "Stage weights must be whole numbers totaling 100%.";
  if (value.startDate && value.targetEndDate && value.targetEndDate < value.startDate) details.targetEndDate = "Target end cannot be before the start date.";
  if (value.actualEndDate && value.startDate && value.actualEndDate < value.startDate) details.actualEndDate = "Actual end cannot be before the start date.";
  if (!Number.isInteger(value.budgetAmount) || value.budgetAmount < 0) details.budgetAmount = "Budget must be zero or greater.";
  if (!/^[A-Z]{3}$/.test(value.budgetCurrency)) details.budgetCurrency = "Use a three-letter currency code.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value };
}
