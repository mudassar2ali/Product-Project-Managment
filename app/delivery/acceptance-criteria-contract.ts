import { criterionStatuses, validateAcceptanceCriteria } from "./stage2-contract";

export type CriterionInput = {
  given: string;
  when: string;
  then: string;
  status: (typeof criterionStatuses)[number];
};

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export function validateCriteriaInput(raw: unknown) {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rows = Array.isArray(source.criteria) ? source.criteria : [];
  const criteria: CriterionInput[] = rows.slice(0, 50).map((entry) => {
    const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const status = String(row.status ?? "DRAFT") as CriterionInput["status"];
    return {
      given: clean(row.given, 1000),
      when: clean(row.when, 1000),
      then: clean(row.then, 1000),
      status,
    };
  });
  const validation = validateAcceptanceCriteria(criteria);
  const errors = { ...validation.errors };
  if (rows.length > 50) errors.criteria = "A Story may contain up to 50 acceptance criteria.";
  criteria.forEach((row, index) => {
    if (!criterionStatuses.includes(row.status)) errors[`criteria.${index}.status`] = "Select a valid criterion status.";
  });
  return Object.keys(errors).length
    ? { ok: false as const, details: errors }
    : { ok: true as const, value: criteria, version: Number(source.version) };
}
