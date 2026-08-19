"use client";

import { useEffect, useState } from "react";
import type { ChatGPTUser } from "./chatgpt-auth";
import type { PermissionCode, Principal } from "./authorization";
import { ProductPortfolio } from "./products/product-portfolio";
import { ProjectPortfolio } from "./projects/project-portfolio";
import { IntegrationCenter } from "./integrations/integration-center";
import { AzureSyncPanel } from "./integrations/azure-sync-panel";
import { MilestoneCenter } from "./milestones/milestone-center";
import { RaidCenter } from "./raid/raid-center";
import { IdeaCenter } from "./ideas/idea-center";
import { ExecutiveDashboard } from "./dashboard/executive-dashboard";
import { ReportCenter } from "./reports/report-center";
import { AuditCenter } from "./audit/audit-center";
import { OperationalControlCenter } from "./operations/operational-control-center";
import { BacklogCenter } from "./delivery/backlog-center";
import { StoryCriteriaCenter } from "./delivery/story-criteria-center";
import { DependencyCenter } from "./delivery/dependency-center";
import { SprintCenter } from "./delivery/sprint-center";
import { DocumentCenter } from "./governance/brd-center";
import { GovernanceCenter } from "./governance/governance-center";

type NavItem = {
  label: string;
  icon: string;
  step: number;
  permission: PermissionCode;
};

const navigation: NavItem[] = [
  { label: "Dashboard", icon: "⌂", step: 15, permission: "dashboard.view" },
  { label: "Products", icon: "◫", step: 5, permission: "product.view" },
  { label: "Projects", icon: "◇", step: 6, permission: "project.view" },
  { label: "Backlog", icon: "☷", step: 3, permission: "backlog.view" },
  { label: "Sprints", icon: "◷", step: 6, permission: "sprint.view" },
  { label: "BRD / PRD", icon: "▤", step: 4, permission: "document.view" },
  { label: "Requirements", icon: "☑", step: 11, permission: "requirement.view" },
  { label: "Milestones", icon: "◆", step: 12, permission: "milestone.view" },
  { label: "Ideas", icon: "✦", step: 14, permission: "idea.view" },
  { label: "RAID", icon: "△", step: 13, permission: "raid.view" },
  { label: "Reports", icon: "▥", step: 16, permission: "report.view" },
  { label: "Integrations", icon: "↔", step: 8, permission: "integration.view" },
  { label: "Audit Trail", icon: "◎", step: 17, permission: "audit.view" },
];

function initials(user: ChatGPTUser) {
  const source = user.fullName ?? user.email.split("@")[0];
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

export function CommandCenterShell({ principal }: { principal: Principal }) {
  const { user } = principal;
  const allowedNavigation = navigation.filter((item) => principal.permissions.includes(item.permission));
  const [active, setActive] = useState("Dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deliveryProjectId, setDeliveryProjectId] = useState("");
  const current = allowedNavigation.find((item) => item.label === active) ?? allowedNavigation[0];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const select = (label: string) => {
    setActive(label);
    setMobileOpen(false);
  };

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Skip to content</a>

      {mobileOpen && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`} aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span>PD</span></div>
          <div>
            <strong>Product Development</strong>
            <span>Command Center</span>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list">
          {allowedNavigation.map((item) => (
            <button
              key={item.label}
              className={active === item.label ? "nav-item active" : "nav-item"}
              onClick={() => select(item.label)}
              aria-current={active === item.label ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="build-status"><span aria-hidden="true" /> Stage 3 build</div>
          <p>BRD &amp; PRD authoring active</p>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
          >
            <span /><span /><span />
          </button>
          <div className="breadcrumbs" aria-label="Breadcrumb">
            <span>Command Center</span><b aria-hidden="true">/</b><strong>{active}</strong>
          </div>
          <div className="top-actions">
            <div className="avatar" aria-hidden="true">{initials(user)}</div>
            <div className="user-label">
              <strong>{user.displayName}</strong>
              <span>{principal.roleNames.join(", ")}</span>
              <a href="/signout-with-chatgpt?return_to=%2F">Sign out</a>
            </div>
          </div>
        </header>

        <main id="main-content" className="content" tabIndex={-1}>
          <section className="page-intro">
            <div>
              <div className="eyebrow">{active === "BRD / PRD" || active === "Requirements" ? "STAGE 3 · REQUIREMENTS GOVERNANCE" : active === "Reports" || active === "Audit Trail" ? "STAGE 2–3 · REPORTING & AUDIT" : ["Dashboard", "Projects", "Backlog", "Sprints", "Integrations"].includes(active) ? "STAGE 2 · AGILE DELIVERY" : "STAGE 1 · CORE MANAGEMENT MVP"}</div>
              <h1>{active}</h1>
              <p>{active === "Dashboard"
                ? "A single operational view of products, projects, delivery health and management attention, extended with source-labelled Backlog and Sprint evidence."
                : active === "Projects" ? "Manage Project records and open a source-labelled Stage 2 delivery overview."
                : active === "Reports" ? "Controlled core, Stage 2 delivery and Stage 3 governance reports generated directly from persisted evidence."
                : active === "Audit Trail" ? "Tamper-resistant governance history — spanning Stage 2 delivery and Stage 3 governance entities — plus sanitized synchronization, capacity, freshness and API control evidence."
                : active === "Backlog" ? "Browse one source-labelled local and Azure hierarchy, then inspect delivery evidence without losing Project context."
                : active === "Sprints" ? "Plan local commitments and inspect Azure delivery evidence with the same Project and source context as Backlog."
                : active === "Integrations" ? "Normalize read-only Azure DevOps work-item and Team iteration evidence through governed mappings."
                : active === "BRD / PRD" ? "Author structured Business and Product Requirements Documents with persisted drafts, immutable review evidence and governed version history."
                : active === "Requirements" ? "Register governed Requirements, trace them to Backlog delivery and verification evidence, and open RACI, feasibility and sign-off governance workspaces."
                : `${active} is included in the approved Stage 1 delivery sequence.`}
              </p>
            </div>
            <div className="step-chip">{active === "Requirements" ? "Stage 3 · Step 11" : active === "BRD / PRD" ? "Stage 3 · Step 4" : active === "Reports" || active === "Audit Trail" ? "Stage 3 · Step 12" : active === "Dashboard" || active === "Projects" ? "Stage 2 · Step 11" : active === "Backlog" || active === "Sprints" ? "Stage 2 · Step 10" : active === "Integrations" ? "Stage 2 · Step 9" : `Implementation step ${current?.step ?? 1}`}</div>
          </section>

          {active === "Dashboard" ? (
            <ExecutiveDashboard navigate={select} availableModules={allowedNavigation.map((item) => item.label)} />
          ) : active === "Products" ? (
            <ProductPortfolio canCreate={principal.permissions.includes("product.create")} canEdit={principal.permissions.includes("product.edit")} />
          ) : active === "Projects" ? (
            <ProjectPortfolio canCreate={principal.permissions.includes("project.create")} canEdit={principal.permissions.includes("project.edit")} />
          ) : active === "Backlog" ? (
            <><BacklogCenter canCreate={principal.permissions.includes("backlog.create")} canEdit={principal.permissions.includes("backlog.edit")} canArchive={principal.permissions.includes("backlog.archive")} initialProjectId={deliveryProjectId} onProjectChange={setDeliveryProjectId} onOpenSprints={principal.permissions.includes("sprint.view") ? (projectId) => { setDeliveryProjectId(projectId); select("Sprints"); } : undefined} /><StoryCriteriaCenter canEdit={principal.permissions.includes("backlog.edit")} /><DependencyCenter canEdit={principal.permissions.includes("backlog.edit")} /></>
          ) : active === "Sprints" ? (
            <SprintCenter canCreate={principal.permissions.includes("sprint.create")} canPlan={principal.permissions.includes("sprint.plan")} canActivate={principal.permissions.includes("sprint.activate")} canComplete={principal.permissions.includes("sprint.complete")} canViewMetrics={principal.permissions.includes("delivery.metrics.view")} initialProjectId={deliveryProjectId} onProjectChange={setDeliveryProjectId} onOpenBacklog={principal.permissions.includes("backlog.view") ? (projectId) => { setDeliveryProjectId(projectId); select("Backlog"); } : undefined} />
          ) : active === "BRD / PRD" ? (
            <DocumentCenter canCreate={principal.permissions.includes("document.create")} canEdit={principal.permissions.includes("document.edit")} canVersion={principal.permissions.includes("document.version")} canSubmit={principal.permissions.includes("document.submit")} currentUserId={user.userId} canRequestSignoff={principal.permissions.includes("signoff.request")} canDecideSignoff={principal.permissions.includes("signoff.decide")} canManageSignoff={principal.permissions.includes("signoff.manage")} canWaiveCondition={principal.permissions.includes("signoff.waive_condition")} />
          ) : active === "Requirements" ? (
            <GovernanceCenter
              initialProjectId={deliveryProjectId} onProjectChange={setDeliveryProjectId}
              canCreateRequirement={principal.permissions.includes("requirement.create")} canEditRequirement={principal.permissions.includes("requirement.edit")} canSubmitRequirement={principal.permissions.includes("requirement.submit")} canArchiveRequirement={principal.permissions.includes("requirement.archive")} canLinkRequirement={principal.permissions.includes("requirement.link")}
              canManageTraceability={principal.permissions.includes("traceability.manage")} canRecordEvidence={principal.permissions.includes("traceability.evidence")}
              canViewRaci={principal.permissions.includes("raci.view")} canManageRaci={principal.permissions.includes("raci.manage")} canPublishRaci={principal.permissions.includes("raci.publish")}
              canViewFeasibility={principal.permissions.includes("feasibility.view")} canEditFeasibility={principal.permissions.includes("feasibility.edit")} canSubmitFeasibility={principal.permissions.includes("feasibility.submit")}
              currentUserId={user.userId} canRequestSignoff={principal.permissions.includes("signoff.request")} canDecideSignoff={principal.permissions.includes("signoff.decide")} canManageSignoff={principal.permissions.includes("signoff.manage")} canWaiveCondition={principal.permissions.includes("signoff.waive_condition")}
            />
          ) : active === "Milestones" ? (
            <MilestoneCenter canCreate={principal.permissions.includes("milestone.create")} canEdit={principal.permissions.includes("milestone.edit")} canArchive={principal.permissions.includes("milestone.archive")} />
          ) : active === "RAID" ? (
            <RaidCenter canCreate={principal.permissions.includes("raid.create")} canEscalate={principal.permissions.includes("raid.escalate")} />
          ) : active === "Ideas" ? (
            <IdeaCenter canCreate={principal.permissions.includes("idea.create")} canReview={principal.permissions.includes("idea.review")} canConvert={principal.permissions.includes("idea.convert")} />
          ) : active === "Reports" ? (
            <ReportCenter canExport={principal.permissions.includes("report.export")} />
          ) : active === "Integrations" ? (
            <><IntegrationCenter canConfigure={principal.permissions.includes("integration.configure")} /><AzureSyncPanel canSync={principal.permissions.includes("integration.sync")} /></>
          ) : active === "Audit Trail" ? (
            <>{principal.permissions.includes("integration.diagnostics") && <OperationalControlCenter />}<AuditCenter /></>
          ) : <section className="empty-state"><strong>Module unavailable</strong><p>This capability is not part of the authorized release navigation.</p></section>}
        </main>
      </div>
    </div>
  );
}
