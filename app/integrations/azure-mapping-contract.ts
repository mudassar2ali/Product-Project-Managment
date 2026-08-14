export const azureMappingKinds = ["TYPE", "STATE"] as const;
export const azureNormalizedTypes = ["EPIC", "FEATURE", "STORY", "TASK", "BUG"] as const;
export const azureNormalizedStates = ["PROPOSED", "READY", "IN_PROGRESS", "VALIDATION", "DONE", "REMOVED"] as const;

export type AzureMappingEntryInput = {
  mappingKind: (typeof azureMappingKinds)[number];
  externalValue: string;
  normalizedValue: (typeof azureNormalizedTypes)[number] | (typeof azureNormalizedStates)[number];
};

export const recommendedAzureMappings: AzureMappingEntryInput[] = [
  { mappingKind: "TYPE", externalValue: "Epic", normalizedValue: "EPIC" },
  { mappingKind: "TYPE", externalValue: "Feature", normalizedValue: "FEATURE" },
  { mappingKind: "TYPE", externalValue: "User Story", normalizedValue: "STORY" },
  { mappingKind: "TYPE", externalValue: "Product Backlog Item", normalizedValue: "STORY" },
  { mappingKind: "TYPE", externalValue: "Task", normalizedValue: "TASK" },
  { mappingKind: "TYPE", externalValue: "Bug", normalizedValue: "BUG" },
  { mappingKind: "STATE", externalValue: "New", normalizedValue: "PROPOSED" },
  { mappingKind: "STATE", externalValue: "Approved", normalizedValue: "READY" },
  { mappingKind: "STATE", externalValue: "Committed", normalizedValue: "READY" },
  { mappingKind: "STATE", externalValue: "Active", normalizedValue: "IN_PROGRESS" },
  { mappingKind: "STATE", externalValue: "In Progress", normalizedValue: "IN_PROGRESS" },
  { mappingKind: "STATE", externalValue: "Resolved", normalizedValue: "VALIDATION" },
  { mappingKind: "STATE", externalValue: "Closed", normalizedValue: "DONE" },
  { mappingKind: "STATE", externalValue: "Done", normalizedValue: "DONE" },
  { mappingKind: "STATE", externalValue: "Removed", normalizedValue: "REMOVED" },
];

export const mappingKey = (value: string) => value.trim().toLocaleLowerCase("en-US");

export function validateAzureMappings(raw: unknown) {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rows = Array.isArray(source.entries) ? source.entries.slice(0, 200) : [];
  const entries: AzureMappingEntryInput[] = rows.map(item => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      mappingKind: String(row.mappingKind ?? "") as AzureMappingEntryInput["mappingKind"],
      externalValue: typeof row.externalValue === "string" ? row.externalValue.trim().slice(0, 100) : "",
      normalizedValue: String(row.normalizedValue ?? "") as AzureMappingEntryInput["normalizedValue"],
    };
  });
  const details: Record<string, string> = {};
  if (!rows.length) details.entries = "Add at least one type mapping and one state mapping.";
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    if (!azureMappingKinds.includes(entry.mappingKind)) details[`entries.${index}.mappingKind`] = "Select Type or State.";
    if (!entry.externalValue) details[`entries.${index}.externalValue`] = "External Azure value is required.";
    const allowed = entry.mappingKind === "TYPE" ? azureNormalizedTypes : azureNormalizedStates;
    if (!(allowed as readonly string[]).includes(entry.normalizedValue)) details[`entries.${index}.normalizedValue`] = "Select a compatible normalized value.";
    const key = `${entry.mappingKind}:${mappingKey(entry.externalValue)}`;
    if (seen.has(key)) details[`entries.${index}.externalValue`] = "Each external value may be mapped once per kind.";
    seen.add(key);
  });
  if (!entries.some(entry => entry.mappingKind === "TYPE")) details.types = "Add at least one work-item type mapping.";
  if (!entries.some(entry => entry.mappingKind === "STATE")) details.states = "Add at least one work-item state mapping.";
  const version = Number(source.version);
  if (!Number.isInteger(version) || version < 1) details.version = "Refresh the connection mappings and try again.";
  return Object.keys(details).length ? { ok: false as const, details } : { ok: true as const, value: { entries, version } };
}
