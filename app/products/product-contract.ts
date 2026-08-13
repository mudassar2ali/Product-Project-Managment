export const productStages = [
  "Idea", "Discovery", "Business Case", "Approved", "Requirements", "Design",
  "Development", "Testing", "UAT", "Pilot", "Production", "Growth",
  "Maintenance", "Sunset",
] as const;
export const productStatuses = ["Active", "On Hold", "Completed", "Cancelled"] as const;
export const productPriorities = ["Low", "Medium", "High", "Critical"] as const;

export type ProductInput = {
  name: string;
  code: string;
  description: string;
  category: string;
  market: string;
  region: string;
  customerSegment: string;
  stage: (typeof productStages)[number];
  startDate: string | null;
  targetLaunchDate: string | null;
  actualLaunchDate: string | null;
  status: (typeof productStatuses)[number];
  priority: (typeof productPriorities)[number];
  strategicObjective: string;
  businessValue: string;
  progress: number;
  notes: string;
};

type ValidationResult = { ok: true; value: ProductInput } | { ok: false; details: Record<string, string> };

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const optionalDate = (value: unknown) => {
  const candidate = text(value);
  return candidate === "" ? null : candidate;
};
const isIsoDate = (value: string | null) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);

export function validateProductInput(body: unknown): ValidationResult {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const stage = text(source.stage) || "Idea";
  const status = text(source.status) || "Active";
  const priority = text(source.priority) || "Medium";
  const progress = typeof source.progress === "number" ? source.progress : Number(source.progress ?? 0);
  const value: ProductInput = {
    name: text(source.name),
    code: text(source.code).toUpperCase(),
    description: text(source.description),
    category: text(source.category) || "General",
    market: text(source.market),
    region: text(source.region),
    customerSegment: text(source.customerSegment),
    stage: stage as ProductInput["stage"],
    startDate: optionalDate(source.startDate),
    targetLaunchDate: optionalDate(source.targetLaunchDate),
    actualLaunchDate: optionalDate(source.actualLaunchDate),
    status: status as ProductInput["status"],
    priority: priority as ProductInput["priority"],
    strategicObjective: text(source.strategicObjective),
    businessValue: text(source.businessValue),
    progress,
    notes: text(source.notes),
  };
  const details: Record<string, string> = {};
  if (value.name.length < 2 || value.name.length > 120) details.name = "Name must contain 2–120 characters.";
  if (!/^[A-Z][A-Z0-9-]{1,19}$/.test(value.code)) details.code = "Code must start with a letter and use 2–20 uppercase letters, numbers, or hyphens.";
  if (value.description.length > 2000) details.description = "Description cannot exceed 2,000 characters.";
  if (!productStages.includes(value.stage)) details.stage = "Select a valid Product stage.";
  if (!productStatuses.includes(value.status)) details.status = "Select a valid Product status.";
  if (!productPriorities.includes(value.priority)) details.priority = "Select a valid priority.";
  if (!Number.isInteger(value.progress) || value.progress < 0 || value.progress > 100) details.progress = "Progress must be a whole number from 0 to 100.";
  for (const field of ["startDate", "targetLaunchDate", "actualLaunchDate"] as const) {
    if (!isIsoDate(value[field])) details[field] = "Use a valid ISO date.";
  }
  if (value.startDate && value.targetLaunchDate && value.targetLaunchDate < value.startDate) details.targetLaunchDate = "Target launch cannot be before the start date.";
  if (value.actualLaunchDate && value.startDate && value.actualLaunchDate < value.startDate) details.actualLaunchDate = "Actual launch cannot be before the start date.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value };
}
