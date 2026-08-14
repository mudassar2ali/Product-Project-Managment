export const completionDispositions = ["COMPLETED", "CARRYOVER", "BACKLOG", "REMOVED"] as const;
export type CompletionDisposition = { membershipId: string; disposition: (typeof completionDispositions)[number]; targetSprintId: string | null; reason: string };

export function validateCompletionInput(raw: unknown) {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rows = Array.isArray(source.dispositions) ? source.dispositions.slice(0, 100) : [];
  const dispositions: CompletionDisposition[] = rows.map(entry => { const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}; return { membershipId: typeof row.membershipId === "string" ? row.membershipId.trim().slice(0, 80) : "", disposition: String(row.disposition ?? "") as CompletionDisposition["disposition"], targetSprintId: typeof row.targetSprintId === "string" && row.targetSprintId.trim() ? row.targetSprintId.trim().slice(0, 80) : null, reason: typeof row.reason === "string" ? row.reason.trim().slice(0, 500) : "" }; });
  const details: Record<string, string> = {};
  if (!rows.length) details.dispositions = "Every Sprint item needs a completion disposition.";
  dispositions.forEach((row, index) => { if (!row.membershipId) details[`dispositions.${index}.membershipId`] = "Membership is required."; if (!completionDispositions.includes(row.disposition)) details[`dispositions.${index}.disposition`] = "Select a valid disposition."; if (row.disposition === "CARRYOVER" && !row.targetSprintId) details[`dispositions.${index}.targetSprintId`] = "Select a target Planned Sprint."; if (row.disposition !== "COMPLETED" && !row.reason) details[`dispositions.${index}.reason`] = "Explain the unfinished-item disposition."; });
  const version = Number(source.version); if (!Number.isInteger(version) || version < 1) details.version = "Refresh the Sprint and try again.";
  return Object.keys(details).length ? { ok: false as const, details } : { ok: true as const, value: { version, dispositions } };
}

export function validateScopeChangeInput(raw: unknown) {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}, action = String(source.action ?? ""), reason = typeof source.reason === "string" ? source.reason.trim().slice(0, 500) : "", version = Number(source.version);
  const details: Record<string, string> = {};
  if (action !== "ADD" && action !== "REMOVE") details.action = "Select Add or Remove.";
  if (!reason) details.reason = "Explain why active Sprint scope is changing.";
  if (!Number.isInteger(version) || version < 1) details.version = "Refresh the Sprint and try again.";
  const backlogItemId = typeof source.backlogItemId === "string" ? source.backlogItemId.trim().slice(0, 80) : "", membershipId = typeof source.membershipId === "string" ? source.membershipId.trim().slice(0, 80) : "";
  if (action === "ADD" && !backlogItemId) details.backlogItemId = "Select a Ready Backlog item.";
  if (action === "REMOVE" && !membershipId) details.membershipId = "Select a Sprint item.";
  return Object.keys(details).length ? { ok: false as const, details } : { ok: true as const, value: { action: action as "ADD" | "REMOVE", reason, version, backlogItemId, membershipId } };
}
