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
import { BacklogCenter } from "./delivery/backlog-center";
import { StoryCriteriaCenter } from "./delivery/story-criteria-center";
import { DependencyCenter } from "./delivery/dependency-center";
import { SprintCenter } from "./delivery/sprint-center";

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
  { label: "Milestones", icon: "◆", step: 12, permission: "milestone.view" },
  { label: "Ideas", icon: "✦", step: 14, permission: "idea.view" },
  { label: "RAID", icon: "△", step: 13, permission: "raid.view" },
  { label: "Reports", icon: "▥", step: 16, permission: "report.view" },
  { label: "Integrations", icon: "↔", step: 8, permission: "integration.view" },
  { label: "Audit Trail", icon: "◎", step: 17, permission: "audit.view" },
  { label: "Administration", icon: "⚙", step: 3, permission: "admin.users" },
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
  const [notice, setNotice] = useState(false);
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
    setNotice(false);
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
          <div className="build-status"><span aria-hidden="true" /> Stage 1 build</div>
          <p>Architecture approved</p>
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
            <button className="icon-button" aria-label="Search" onClick={() => setNotice(true)}>⌕</button>
            <button className="icon-button notification" aria-label="Notifications" onClick={() => setNotice(true)}>♢<i /></button>
            <div className="avatar" aria-hidden="true">{initials(user)}</div>
            <div className="user-label">
              <strong>{user.displayName}</strong>
              <span>{principal.roleNames.join(", ")}</span>
              <a href="/signout-with-chatgpt?return_to=%2F">Sign out</a>
            </div>
          </div>
        </header>

        <main id="main-content" className="content" tabIndex={-1}>
          {notice && (
            <div className="inline-notice" role="status">
              Search and notifications are scheduled for their authorized Stage 1 steps.
              <button onClick={() => setNotice(false)} aria-label="Dismiss message">×</button>
            </div>
          )}

          <section className="page-intro">
            <div>
              <div className="eyebrow">{active === "Backlog" || active === "Sprints" || active === "Integrations" ? "STAGE 2 · AGILE DELIVERY" : "STAGE 1 · CORE MANAGEMENT MVP"}</div>
              <h1>{active}</h1>
              <p>{active === "Dashboard"
                ? "A single operational view of products, projects, delivery health and management attention."
                : active === "Reports" ? "Controlled portfolio reports generated directly from persisted management evidence."
                : active === "Audit Trail" ? "Read-only evidence of governed changes, actors, sources and correlation identifiers."
                : active === "Backlog" ? "Browse one source-labelled local and Azure hierarchy, then inspect delivery evidence without losing Project context."
                : active === "Sprints" ? "Plan local commitments and inspect Azure delivery evidence with the same Project and source context as Backlog."
                : active === "Integrations" ? "Normalize read-only Azure DevOps work-item and Team iteration evidence through governed mappings."
                : `${active} is included in the approved Stage 1 delivery sequence.`}
              </p>
            </div>
            <div className="step-chip">{active === "Backlog" || active === "Sprints" ? "Stage 2 · Step 10" : active === "Integrations" ? "Stage 2 · Step 9" : `Implementation step ${current?.step ?? 1}`}</div>
          </section>

          {active === "Dashboard" ? (
            <ExecutiveDashboard navigate={select} />
          ) : active === "Products" ? (
            <ProductPortfolio canCreate={principal.permissions.includes("product.create")} canEdit={principal.permissions.includes("product.edit")} />
          ) : active === "Projects" ? (
            <ProjectPortfolio canCreate={principal.permissions.includes("project.create")} canEdit={principal.permissions.includes("project.edit")} />
          ) : active === "Backlog" ? (
            <><BacklogCenter canCreate={principal.permissions.includes("backlog.create")} canEdit={principal.permissions.includes("backlog.edit")} canArchive={principal.permissions.includes("backlog.archive")} initialProjectId={deliveryProjectId} onProjectChange={setDeliveryProjectId} onOpenSprints={principal.permissions.includes("sprint.view") ? (projectId) => { setDeliveryProjectId(projectId); select("Sprints"); } : undefined} /><StoryCriteriaCenter canEdit={principal.permissions.includes("backlog.edit")} /><DependencyCenter canEdit={principal.permissions.includes("backlog.edit")} /></>
          ) : active === "Sprints" ? (
            <SprintCenter canCreate={principal.permissions.includes("sprint.create")} canPlan={principal.permissions.includes("sprint.plan")} canActivate={principal.permissions.includes("sprint.activate")} canComplete={principal.permissions.includes("sprint.complete")} canViewMetrics={principal.permissions.includes("delivery.metrics.view")} initialProjectId={deliveryProjectId} onProjectChange={setDeliveryProjectId} onOpenBacklog={principal.permissions.includes("backlog.view") ? (projectId) => { setDeliveryProjectId(projectId); select("Backlog"); } : undefined} />
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
            <AuditCenter />
          ) : <><section className="foundation-panel" aria-labelledby="foundation-title">
            <div className="foundation-copy">
              <div className="foundation-icon" aria-hidden="true">⌁</div>
              <div>
                <span className="section-kicker">APPLICATION FOUNDATION</span>
                <h2 id="foundation-title">The command center shell is ready</h2>
                <p>
                  Stage 1 is being delivered in the mandated sequence. This screen intentionally contains no
                  fabricated portfolio statistics or placeholder business records.
                </p>
              </div>
            </div>
            <div className="foundation-state"><span /> Shell active</div>
          </section>

          <section className="sequence" aria-labelledby="sequence-title">
            <div className="section-heading">
              <div><span className="section-kicker">DELIVERY CONTROL</span><h2 id="sequence-title">Authorized implementation sequence</h2></div>
              <span className="sequence-count">1 of 18 in progress</span>
            </div>
            <div className="sequence-grid">
              <article className="sequence-card current-card">
                <span className="step-number">01</span>
                <div><h3>Application Shell</h3><p>Responsive navigation, accessible structure and enterprise design system.</p></div>
                <span className="status-pill in-progress">In progress</span>
              </article>
              <article className="sequence-card">
                <span className="step-number">02</span>
                <div><h3>Authentication</h3><p>Private access and verified workspace identity.</p></div>
                <span className="status-pill queued">Next</span>
              </article>
              <article className="sequence-card">
                <span className="step-number">03</span>
                <div><h3>Roles &amp; Permissions</h3><p>Server-enforced, deny-by-default access policies.</p></div>
                <span className="status-pill planned">Planned</span>
              </article>
            </div>
          </section>

          <section className="principles" aria-label="Implementation principles">
            <div><span className="principle-icon shield" aria-hidden="true">◆</span><div><strong>Secure by design</strong><p>Authorization and secrets remain server-side.</p></div></div>
            <div><span className="principle-icon data" aria-hidden="true">≡</span><div><strong>Persisted truth</strong><p>Business data will come from relational storage.</p></div></div>
            <div><span className="principle-icon trace" aria-hidden="true">↗</span><div><strong>Full traceability</strong><p>Governed changes create an audit history.</p></div></div>
          </section>
          </>}
        </main>
      </div>
    </div>
  );
}
