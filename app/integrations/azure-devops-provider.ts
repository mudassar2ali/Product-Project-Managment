import type { AdvancedWorkItemSource, ConnectionTestResult, DevelopmentMetrics, EngineeringDeliveryProvider, ExternalIteration, ExternalSprintSource, ExternalWorkItem, ExternalWorkItemRelation, SprintMetrics } from "./engineering-delivery-provider";

type Config = { organization: string; authType: "ENTRA_APPLICATION" | "PAT"; credential: string };
type AzureList<T> = { count: number; value: T[] };
type AzureRelation = { rel?: string; url?: string; attributes?: Record<string, unknown> };
type Item = { id: number; rev: number; fields: Record<string, unknown>; relations?: AzureRelation[] };
type AzureError = Error & { status?: number; retryAfter?: number };

const advancedFields = ["System.Id", "System.Rev", "System.WorkItemType", "System.State", "System.Title", "System.AssignedTo", "System.Parent", "System.IterationId", "System.IterationPath", "System.ChangedDate", "System.Tags", "Microsoft.VSTS.Scheduling.StoryPoints", "Microsoft.VSTS.Scheduling.Effort", "Microsoft.VSTS.Scheduling.RemainingWork", "Microsoft.VSTS.Common.Blocked", "System.Reason"];
const doneStates = new Set(["closed", "done", "completed", "resolved", "removed"]);
const activeStates = new Set(["active", "committed", "in progress", "doing"]);
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export class AzureDevOpsProvider implements EngineeringDeliveryProvider {
  constructor(private readonly config: Config) {}

  private auth() { return this.config.authType === "PAT" ? `Basic ${btoa(`:${this.config.credential}`)}` : `Bearer ${this.config.credential}`; }

  private async call<T>(path: string, init?: RequestInit, retries = 1): Promise<{ body: T; continuationToken: string | null }> {
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`https://dev.azure.com/${encodeURIComponent(this.config.organization)}${path}`, { ...init, headers: { accept: "application/json", authorization: this.auth(), ...(init?.headers ?? {}) }, signal: controller.signal });
        if (response.status === 429 && attempt < retries) {
          const retryAfter = Math.min(3, Math.max(0, Number(response.headers.get("retry-after") ?? 1)));
          await delay(retryAfter * 1000);
          continue;
        }
        if (!response.ok) {
          const error = new Error(`Azure DevOps returned ${response.status}.`) as AzureError;
          error.status = response.status;
          error.retryAfter = Number(response.headers.get("retry-after") ?? 0) || undefined;
          throw error;
        }
        return { body: await response.json() as T, continuationToken: response.headers.get("x-ms-continuationtoken") };
      } finally { clearTimeout(timeout); }
    }
  }

  private async request<T>(path: string) { return (await this.call<T>(path)).body; }
  private async query<T>(path: string, body: unknown) { return (await this.call<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).body; }

  private async listAll<T>(path: string) {
    return (await this.listAllWithMeta<T>(path)).values;
  }

  private async listAllWithMeta<T>(path: string) {
    const values: T[] = []; let continuationToken: string | null = null, pages = 0;
    do {
      const separator = path.includes("?") ? "&" : "?", page: { body: AzureList<T>; continuationToken: string | null } = await this.call<AzureList<T>>(`${path}${continuationToken ? `${separator}continuationToken=${encodeURIComponent(continuationToken)}` : ""}`);
      values.push(...page.body.value); continuationToken = page.continuationToken; pages += 1;
      if (pages >= 50 && continuationToken) throw new Error("Azure pagination exceeded the safe page limit.");
    } while (continuationToken);
    return { values, pages };
  }

  private async revision(input: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input || "EMPTY"));
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const testedAt = new Date().toISOString();
    try { const projects = await this.getProjects(); return { ok: true, authenticated: true, projectsVisible: projects.length, testedAt, message: `Connection succeeded. ${projects.length} Projects visible.` }; }
    catch (error) { const status = (error as AzureError).status, code = status === 401 ? "AZURE_AUTHENTICATION_FAILED" : status === 403 ? "AZURE_PERMISSION_DENIED" : status === 429 ? "AZURE_RATE_LIMITED" : error instanceof DOMException && error.name === "AbortError" ? "AZURE_TIMEOUT" : "AZURE_API_FAILURE"; return { ok: false, authenticated: false, projectsVisible: 0, testedAt, errorCode: code, message: "Azure DevOps could not be reached." }; }
  }

  async getProjects() { const rows = await this.listAll<{ id: string; name: string; description?: string; state: string; url: string }>("/_apis/projects?stateFilter=WellFormed&$top=100&api-version=7.1"); return rows.map(project => ({ id: project.id, name: project.name, description: project.description ?? null, state: project.state, url: project.url })); }
  async getTeams(projectId: string) { const rows = await this.listAll<{ id: string; name: string; description?: string; url: string }>(`/_apis/projects/${encodeURIComponent(projectId)}/teams?$top=100&api-version=7.1`); return rows.map(team => ({ id: team.id, name: team.name, description: team.description ?? null, url: team.url })); }
  async getIterations(projectId: string, teamId: string) { const rows = await this.listAll<{ id: string; name: string; path: string; attributes?: { startDate?: string; finishDate?: string } }>(`/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}/_apis/work/teamsettings/iterations?api-version=7.1`); return rows.map(iteration => ({ id: iteration.id, name: iteration.name, path: iteration.path, startDate: iteration.attributes?.startDate ?? null, finishDate: iteration.attributes?.finishDate ?? null })); }
  async getSprintHistory(projectId: string, teamId: string): Promise<ExternalSprintSource> {
    const result = await this.listAllWithMeta<{ id: string; name: string; path: string; attributes?: { startDate?: string; finishDate?: string } }>(`/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}/_apis/work/teamsettings/iterations?api-version=7.1`);
    const all: ExternalIteration[] = result.values.map(iteration => ({ id: iteration.id, name: iteration.name, path: iteration.path, startDate: iteration.attributes?.startDate ?? null, finishDate: iteration.attributes?.finishDate ?? null })).filter(iteration => Boolean(iteration.startDate && iteration.finishDate)).sort((left, right) => `${right.finishDate}:${right.id}`.localeCompare(`${left.finishDate}:${left.id}`));
    const iterations = all.slice(0, 50), sourceRevision = await this.revision(iterations.map(iteration => `${iteration.id}:${iteration.path}:${iteration.startDate}:${iteration.finishDate}`).join("|"));
    return { iterations, pagesRead: result.pages, sourceRevision, retrievedAt: new Date().toISOString(), complete: true, truncated: all.length > iterations.length };
  }
  async getCurrentSprint(projectId: string, teamId: string) { const rows = await this.listAll<{ id: string; name: string; path: string; attributes?: { startDate?: string; finishDate?: string } }>(`/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}/_apis/work/teamsettings/iterations?$timeframe=current&api-version=7.1`), iteration = rows[0]; return iteration ? { id: iteration.id, name: iteration.name, path: iteration.path, startDate: iteration.attributes?.startDate ?? null, finishDate: iteration.attributes?.finishDate ?? null } : null; }

  async getWorkItems(projectId: string, ids: number[]) {
    if (!ids.length) return [];
    return (await this.request<{ value: Item[] }>(`/${encodeURIComponent(projectId)}/_apis/wit/workitems?ids=${ids.slice(0, 200).join(",")}&fields=System.Id,System.State,System.WorkItemType,System.ChangedDate&api-version=7.1`)).value;
  }
  async getWorkItem(projectId: string, id: number) { return (await this.getWorkItems(projectId, [id]))[0] ?? null; }

  private async hydrate(projectId: string, ids: number[]) { const items: Item[] = []; for (let index = 0; index < ids.length; index += 200) items.push(...await this.getWorkItems(projectId, ids.slice(index, index + 200)) as Item[]); return items; }

  async getAdvancedWorkItems(projectId: string, teamId?: string | null): Promise<AdvancedWorkItemSource> {
    const scope = teamId ? `/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}` : `/${encodeURIComponent(projectId)}`;
    const wiql = await this.query<{ workItems: Array<{ id: number }> }>(`${scope}/_apis/wit/wiql?$top=20000&api-version=7.1`, { query: "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.Id]" });
    const ids = [...new Set(wiql.workItems.map(item => item.id))], rawItems: Item[] = [];
    for (let index = 0; index < ids.length; index += 200) {
      const batch = await this.query<{ value: Item[] }>(`/${encodeURIComponent(projectId)}/_apis/wit/workitemsbatch?api-version=7.1`, { ids: ids.slice(index, index + 200), fields: advancedFields, $expand: "Relations", errorPolicy: "Omit" });
      rawItems.push(...batch.value);
    }
    const items = rawItems.map(item => this.toExternalWorkItem(projectId, item));
    const revisionInput = items.map(item => `${item.externalId}:${item.externalRevision}`).sort().join("|") || "EMPTY";
    const sourceRevision = await this.revision(revisionInput);
    return { items, pagesRead: 1 + Math.ceil(ids.length / 200), sourceRevision, retrievedAt: new Date().toISOString(), complete: ids.length < 20000 && rawItems.length === ids.length };
  }

  private toExternalWorkItem(projectId: string, item: Item): ExternalWorkItem {
    const fields = item.fields, assigned = fields["System.AssignedTo"], assignedObject = assigned && typeof assigned === "object" ? assigned as Record<string, unknown> : null;
    const relations: ExternalWorkItemRelation[] = (item.relations ?? []).flatMap(relation => { const match = relation.url?.match(/\/workItems\/(\d+)(?:\?.*)?$/i); return relation.rel && match ? [{ relationType: relation.rel, targetExternalId: match[1] }] : []; });
    const parentField = fields["System.Parent"], hierarchyParent = relations.find(relation => relation.relationType === "System.LinkTypes.Hierarchy-Reverse")?.targetExternalId;
    const tags = text(fields["System.Tags"]), blockedField = String(fields["Microsoft.VSTS.Common.Blocked"] ?? "").toLocaleLowerCase("en-US"), blocked = ["yes", "true", "1", "blocked"].includes(blockedField) || tags.split(";").some(tag => tag.trim().toLocaleLowerCase("en-US") === "blocked");
    return { externalId: String(item.id), externalRevision: String(item.rev), externalType: text(fields["System.WorkItemType"]) || "Unknown", externalState: text(fields["System.State"]) || "Unknown", parentExternalId: typeof parentField === "number" || typeof parentField === "string" ? String(parentField) : hierarchyParent ?? null, title: text(fields["System.Title"]) || `Azure work item ${item.id}`, owner: assignedObject ? text(assignedObject.displayName) || text(assignedObject.uniqueName) || null : text(assigned) || null, storyPoints: finite(fields["Microsoft.VSTS.Scheduling.StoryPoints"] ?? fields["Microsoft.VSTS.Scheduling.Effort"]), remainingWork: finite(fields["Microsoft.VSTS.Scheduling.RemainingWork"]), blocked, blockedReason: blocked ? text(fields["System.Reason"]) || "Blocked in Azure DevOps" : null, iterationId: text(fields["System.IterationId"]) || null, iterationPath: text(fields["System.IterationPath"]) || null, relations, sourceUrl: `https://dev.azure.com/${encodeURIComponent(this.config.organization)}/${encodeURIComponent(projectId)}/_workitems/edit/${item.id}`, sourceChangedAt: text(fields["System.ChangedDate"]) || null };
  }

  async getSprintMetrics(projectId: string, teamId: string, iterationId: string): Promise<SprintMetrics> { const iteration = (await this.getIterations(projectId, teamId)).find(value => value.id === iterationId); if (!iteration) throw new Error("Current Azure iteration was not found."); const result = await this.request<{ workItemRelations: Array<{ target?: { id: number } }> }>(`/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}/_apis/work/teamsettings/iterations/${encodeURIComponent(iterationId)}/workitems?api-version=7.1`), ids = [...new Set(result.workItemRelations.map(value => value.target?.id).filter((id): id is number => typeof id === "number"))], items = await this.hydrate(projectId, ids), completed = items.filter(item => doneStates.has(String(item.fields["System.State"] ?? "").toLowerCase())).length, total = items.length, progress = total ? Math.round(completed/total*100) : 0, daysRemaining = iteration.finishDate ? Math.ceil((new Date(iteration.finishDate).getTime() - Date.now()) / 86400000) : null, elapsed = iteration.startDate && iteration.finishDate ? Math.max(0, Math.min(1, (Date.now() - new Date(iteration.startDate).getTime()) / (new Date(iteration.finishDate).getTime() - new Date(iteration.startDate).getTime()))) : null, health = daysRemaining !== null && daysRemaining < 0 && progress < 100 ? "OVERDUE" : elapsed !== null && progress + 15 < elapsed * 100 ? "AT_RISK" : "ON_TRACK"; return { ...iteration, totalItems: total, completedItems: completed, activeItems: total - completed, progress, daysRemaining, health, sourceRevision: items.map(item => `${item.id}:${item.rev}`).sort().join("|") || "EMPTY" }; }
  async getDevelopmentMetrics(projectId: string, teamId?: string | null): Promise<DevelopmentMetrics> { void teamId; const result = await this.query<{ workItems: Array<{ id: number }> }>(`/${encodeURIComponent(projectId)}/_apis/wit/wiql?api-version=7.1`, { query: "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.ChangedDate] DESC" }), items = await this.hydrate(projectId, result.workItems.slice(0, 1000).map(item => item.id)), completed = items.filter(item => doneStates.has(String(item.fields["System.State"] ?? "").toLowerCase())).length, active = items.filter(item => activeStates.has(String(item.fields["System.State"] ?? "").toLowerCase())).length, total = items.length; return { totalItems: total, completedItems: completed, activeItems: active, otherItems: total - completed - active, progress: total ? Math.round(completed/total*100) : 0, sourceRevision: items.map(item => `${item.id}:${item.rev}`).sort().join("|") || "EMPTY" }; }
}
