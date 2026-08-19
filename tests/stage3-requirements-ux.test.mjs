import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Requirements navigation is wired to the Governance Center with the correct permission and step", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.match(shell, /\{ label: "Requirements", icon: "☑", step: 11, permission: "requirement\.view" \}/);
  assert.match(shell, /import \{ GovernanceCenter \} from ".\/governance\/governance-center";/);
  assert.match(shell, /active === "Requirements" \? \(\s*<GovernanceCenter/);
  assert.match(shell, /canCreateRequirement=\{principal\.permissions\.includes\("requirement\.create"\)\}/);
  assert.match(shell, /canManageTraceability=\{principal\.permissions\.includes\("traceability\.manage"\)\}/);
  assert.match(shell, /canViewRaci=\{principal\.permissions\.includes\("raci\.view"\)\}/);
  assert.match(shell, /canViewFeasibility=\{principal\.permissions\.includes\("feasibility\.view"\)\}/);
  assert.match(shell, /currentUserId=\{user\.userId\}/);
});

test("Governance Center composes Requirements, Traceability, RACI and Feasibility behind an internal tab strip", async () => {
  const center = await read("app/governance/governance-center.tsx");
  assert.match(center, /const governanceTabs = \["Summary", "Requirements", "Traceability", "RACI", "Feasibility"\] as const;/);
  assert.match(center, /import \{ RequirementCenter \} from ".\/requirement-center";/);
  assert.match(center, /import \{ TraceabilityPanel \} from ".\/traceability-panel";/);
  assert.match(center, /import \{ RaciPanel \} from ".\/raci-panel";/);
  assert.match(center, /import \{ FeasibilityPanel \} from ".\/feasibility-panel";/);
  assert.match(center, /document-type-tabs/);
  assert.match(center, /Select a Project to view RACI and Feasibility status/);
});

test("Requirement Center covers registration, draft editing, submission, archival and traceability sub-panels", async () => {
  const center = await read("app/governance/requirement-center.tsx");
  assert.match(center, /fetch\(`\/api\/v3\/requirements\?\$\{params\}`/);
  assert.match(center, /method: "POST", headers: \{ "content-type": "application\/json", accept: "application\/json" \},\s*body: JSON\.stringify\(\{ \.\.\.registration/);
  assert.match(center, /method: "PATCH"/);
  assert.match(center, /\/submit`/);
  assert.match(center, /method: "DELETE"/);
  assert.match(center, /\/relationships`/);
  assert.match(center, /\/backlog-links`/);
  assert.match(center, /\/evidence`/);
  assert.match(center, /\/traceability`/);
  assert.match(center, /import \{ SignoffPanel \} from ".\/signoff-panel";/);
  assert.match(center, /subjectType="REQUIREMENT_REVISION"/);
  assert.match(center, /subjectEligible=\{currentRevision\.governanceStatus === "IN_REVIEW"\}/);
});

test("Traceability Panel surfaces portfolio coverage, gaps and per-requirement delivery status", async () => {
  const panel = await read("app/governance/traceability-panel.tsx");
  assert.match(panel, /fetch\(`\/api\/v3\/traceability\?\$\{params\}`/);
  assert.match(panel, /Coverage gaps/);
  assert.match(panel, /deliveryStatus/);
});

test("BRD/PRD document workspace embeds contextual sign-off once a version leaves DRAFT", async () => {
  const center = await read("app/governance/brd-center.tsx");
  assert.match(center, /import \{ SignoffPanel \} from ".\/signoff-panel";/);
  assert.match(center, /subjectType="DOCUMENT_VERSION"/);
  assert.match(center, /subjectId=\{workspace\.document\.currentVersionId\}/);
  assert.match(center, /currentUserId, canRequestSignoff, canDecideSignoff, canManageSignoff, canWaiveCondition/);
});

test("globals.css defines the bespoke classes referenced by the new governance panels", async () => {
  const css = await read("app/globals.css");
  for (const selector of [".signoff-panel", ".signoff-lane-row", ".raci-workspace", ".raci-section", ".feasibility-layout", ".feasibility-detail", ".requirement-workspace", ".traceability-panel", ".governance-summary", ".governance-center"]) {
    assert.match(css, new RegExp(selector.replace(".", "\\.")));
  }
});

test("the three previously-flagged governance panels defer their initial load through window.setTimeout rather than a synchronous setState-in-effect", async () => {
  for (const file of ["app/governance/signoff-panel.tsx", "app/governance/raci-panel.tsx", "app/governance/feasibility-panel.tsx"]) {
    const source = await read(file);
    assert.match(source, /window\.setTimeout\(\(\) => void load\(\), 0\)/);
  }
});

test("Requirement Center and Traceability Panel defer their initial load through a debounced window.setTimeout", async () => {
  for (const file of ["app/governance/requirement-center.tsx", "app/governance/traceability-panel.tsx"]) {
    const source = await read(file);
    assert.match(source, /window\.setTimeout\(\(\) => void load(?:List)?\(/);
  }
});
