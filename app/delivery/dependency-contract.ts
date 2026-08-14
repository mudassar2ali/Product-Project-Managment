import { dependencyTypes } from "./stage2-contract";

export type DependencyInput = {
  predecessorId: string;
  dependencyType: (typeof dependencyTypes)[number];
  version: number;
};

export function validateDependencyInput(raw: unknown) {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const predecessorId = typeof source.predecessorId === "string" ? source.predecessorId.trim().slice(0, 80) : "";
  const dependencyType = String(source.dependencyType ?? "") as DependencyInput["dependencyType"];
  const version = Number(source.version);
  const details: Record<string, string> = {};
  if (!predecessorId) details.predecessorId = "Select a predecessor work item.";
  if (!dependencyTypes.includes(dependencyType)) details.dependencyType = "Select Blocks, Requires or Relates To.";
  if (!Number.isInteger(version) || version < 1) details.version = "Refresh the work item and try again.";
  return Object.keys(details).length
    ? { ok: false as const, details }
    : { ok: true as const, value: { predecessorId, dependencyType, version } satisfies DependencyInput };
}
