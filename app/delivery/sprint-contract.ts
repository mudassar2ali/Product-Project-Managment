export type SprintInput = { projectId: string; name: string; goal: string; startDate: string; endDate: string; capacityHours: number };
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function validateSprintInput(raw: unknown) {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const value: SprintInput = {
    projectId: clean(source.projectId, 80),
    name: clean(source.name, 120),
    goal: clean(source.goal, 2000),
    startDate: clean(source.startDate, 10),
    endDate: clean(source.endDate, 10),
    capacityHours: Number(source.capacityHours),
  };
  const details: Record<string, string> = {};
  if (!value.projectId) details.projectId = "Select an active Project.";
  if (!value.name) details.name = "Sprint name is required.";
  if (!value.goal) details.goal = "Define the Sprint goal.";
  if (!isoDate.test(value.startDate)) details.startDate = "Enter a valid start date.";
  if (!isoDate.test(value.endDate)) details.endDate = "Enter a valid end date.";
  if (isoDate.test(value.startDate) && isoDate.test(value.endDate) && value.endDate < value.startDate) details.endDate = "End date cannot precede start date.";
  if (!Number.isInteger(value.capacityHours) || value.capacityHours < 0 || value.capacityHours > 100000) details.capacityHours = "Capacity must be a whole number from 0 to 100,000 hours.";
  return Object.keys(details).length ? { ok: false as const, details } : { ok: true as const, value };
}
