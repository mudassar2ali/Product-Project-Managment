import { defectSeverities, executionResults, type DefectSeverity, type ExecutionResult } from "./stage4-contract";

export type LinkedDefectInput = {
  title: string;
  description: string;
  stepsToReproduce: string;
  severity: DefectSeverity;
};

export type ExecutionInput = {
  result: ExecutionResult;
  executedAt: string | null;
  actualResult: string;
  evidenceReference: string;
  defect: LinkedDefectInput | null;
};

type Result<T> = { ok: true; value: T } | { ok: false; details: Record<string, string> };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const isoTimestamp = (value: unknown) => {
  const candidate = text(value);
  if (!candidate) return null;
  return Number.isNaN(Date.parse(candidate)) ? "INVALID" : candidate;
};

export function parseExecutionResult(value: unknown): ExecutionResult | null {
  const candidate = text(value).toUpperCase();
  return (executionResults as readonly string[]).includes(candidate) ? (candidate as ExecutionResult) : null;
}

export function parseDefectSeverity(value: unknown): DefectSeverity | null {
  const candidate = text(value).toUpperCase();
  return (defectSeverities as readonly string[]).includes(candidate) ? (candidate as DefectSeverity) : null;
}

export function validateExecutionInput(body: unknown): Result<ExecutionInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const requestedResult = text(source.result).toUpperCase();
  const result = requestedResult ? parseExecutionResult(requestedResult) : null;
  const executedAtRaw = isoTimestamp(source.executedAt);
  const actualResult = text(source.actualResult).slice(0, 4000);
  const evidenceReference = text(source.evidenceReference).slice(0, 500);

  const details: Record<string, string> = {};
  if (!result) details.result = "Select a valid execution result.";
  if (executedAtRaw === "INVALID") details.executedAt = "Enter a valid execution time.";

  const defectSource = source.defect;
  let defect: LinkedDefectInput | null = null;
  if (defectSource !== null && defectSource !== undefined) {
    if (typeof defectSource !== "object") {
      details.defect = "Defect details must be an object.";
    } else if (result !== "FAIL" && result !== "BLOCKED") {
      details.defect = "A linked defect can only be logged for a Fail or Blocked result.";
    } else {
      const record = defectSource as Record<string, unknown>;
      const title = text(record.title).slice(0, 200);
      const description = text(record.description).slice(0, 4000);
      const stepsToReproduce = text(record.stepsToReproduce).slice(0, 4000);
      const requestedSeverity = text(record.severity).toUpperCase();
      const severity = requestedSeverity ? parseDefectSeverity(requestedSeverity) : "MEDIUM";
      if (!title) details["defect.title"] = "Enter a defect title.";
      if (!severity) details["defect.severity"] = "Select a valid defect severity.";
      if (title && severity) defect = { title, description, stepsToReproduce, severity };
    }
  }

  return Object.keys(details).length
    ? { ok: false, details }
    : {
      ok: true,
      value: {
        result: result ?? ("NOT_EXECUTED" as ExecutionResult),
        executedAt: executedAtRaw === "INVALID" ? null : executedAtRaw,
        actualResult,
        evidenceReference,
        defect,
      },
    };
}
