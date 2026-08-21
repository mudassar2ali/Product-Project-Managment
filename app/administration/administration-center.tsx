"use client";

import { useCallback, useEffect, useState } from "react";

type AdministeredUser = { id: string; displayName: string; email: string; active: boolean; lastSeenAt: string; roleCodes: string[] };
type RoleCatalogEntry = { code: string; name: string; description: string; permissionGroups: string[] };
type RoleAssignment = { id: string; roleCode: string; roleName: string; assignedAt: string; assignedBy: string | null };
type ApiError = { error?: { message?: string } };

export function AdministrationCenter({ canManageUsers, canManageRoles }: { canManageUsers: boolean; canManageRoles: boolean }) {
  const [users, setUsers] = useState<AdministeredUser[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [usersError, setUsersError] = useState("");

  const [roles, setRoles] = useState<RoleCatalogEntry[] | null>(null);
  const [rolesError, setRolesError] = useState("");

  const [selected, setSelected] = useState<AdministeredUser | null>(null);
  const [assignments, setAssignments] = useState<RoleAssignment[] | null>(null);
  const [panelError, setPanelError] = useState("");
  const [panelLoading, setPanelLoading] = useState(false);
  const [pendingRole, setPendingRole] = useState("");
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!canManageUsers) return;
    setUsersError("");
    const parameters = new URLSearchParams({ q, page: String(page), pageSize: "20" });
    const response = await fetch(`/api/v5/administration/users?${parameters}`);
    const body: { data?: AdministeredUser[]; meta?: { total?: number } } & ApiError = await response.json();
    if (!response.ok) setUsersError(body.error?.message ?? "Users could not be loaded.");
    else { setUsers(body.data ?? []); setTotal(body.meta?.total ?? 0); }
    setUsersLoaded(true);
  }, [q, page, canManageUsers]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadUsers(); }, 140);
    return () => clearTimeout(timer);
  }, [loadUsers]);

  useEffect(() => {
    if (!canManageRoles) return;
    let cancelled = false;
    fetch("/api/v5/administration/roles")
      .then(async (response) => {
        const body: { data?: RoleCatalogEntry[] } & ApiError = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Role catalog could not be loaded.");
        if (!cancelled) setRoles(body.data ?? []);
      })
      .catch((caught) => { if (!cancelled) setRolesError(caught.message); });
    return () => { cancelled = true; };
  }, [canManageRoles]);

  const openUser = useCallback(async (user: AdministeredUser) => {
    if (!canManageRoles) return;
    setSelected(user);
    setAssignments(null);
    setPanelError("");
    setPendingRole("");
    setPanelLoading(true);
    const response = await fetch(`/api/v5/administration/users/${user.id}/roles`);
    const body: { data?: RoleAssignment[] } & ApiError = await response.json();
    if (!response.ok) setPanelError(body.error?.message ?? "This user's roles could not be loaded.");
    else setAssignments(body.data ?? []);
    setPanelLoading(false);
  }, [canManageRoles]);

  const assign = async () => {
    if (!selected || !pendingRole) return;
    setSaving(true);
    setPanelError("");
    const response = await fetch(`/api/v5/administration/users/${selected.id}/roles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleCode: pendingRole }),
    });
    const body: { data?: RoleAssignment[] } & ApiError = await response.json();
    if (!response.ok) setPanelError(body.error?.message ?? "Role could not be assigned.");
    else { setAssignments(body.data ?? []); setPendingRole(""); await loadUsers(); }
    setSaving(false);
  };

  const revoke = async (assignmentId: string) => {
    if (!selected) return;
    setSaving(true);
    setPanelError("");
    const response = await fetch(`/api/v5/administration/users/${selected.id}/roles/${assignmentId}`, { method: "DELETE" });
    const body: { data?: RoleAssignment[] } & ApiError = await response.json();
    if (!response.ok) setPanelError(body.error?.message ?? "Role could not be revoked.");
    else { setAssignments(body.data ?? []); await loadUsers(); }
    setSaving(false);
  };

  const availableRoles = (roles ?? []).filter((role) => !(assignments ?? []).some((assignment) => assignment.roleCode === role.code));

  if (!canManageUsers) {
    return <div className="module-state empty-state"><span>◍</span><strong>Administration unavailable</strong><p>You do not have permission to view Administration.</p></div>;
  }

  return (
    <div className="administration-center">
      <section className="portfolio-module">
        <div className="portfolio-toolbar">
          <div><span className="section-kicker">USER DIRECTORY</span><h2>Users <small>{total}</small></h2></div>
          <label className="search-field"><span>Name or email</span><input value={q} onChange={(event) => { setPage(1); setQ(event.target.value); }} placeholder="Search users" /></label>
        </div>
        {usersError && <div className="form-error integration-error" role="alert">{usersError}</div>}
        {!usersLoaded ? (
          <div className="module-state" role="status"><span className="loader" />Loading users…</div>
        ) : !users.length ? (
          <div className="module-state empty-state"><span>◫</span><strong>No users found</strong><p>Adjust your search, or wait for users to sign in.</p></div>
        ) : (
          <div className="table-shell">
            <table className="portfolio-table">
              <thead><tr><th>User</th><th>Roles</th><th>Last seen</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className={selected?.id === user.id ? "row-selected" : ""}>
                    <td><strong>{user.displayName}</strong><span>{user.email}</span></td>
                    <td>
                      {user.roleCodes.length
                        ? user.roleCodes.map((code) => <span key={code} className="neutral-badge">{code}</span>)
                        : <span className="neutral-badge">EXECUTIVE_VIEWER (default)</span>}
                    </td>
                    <td>{new Date(user.lastSeenAt).toLocaleString()}</td>
                    <td>{canManageRoles && <button className="row-action" onClick={() => void openUser(user)} aria-label={`Manage roles for ${user.displayName}`}>Manage roles</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="report-footer">
          <span>{total} users</span>
          <div>
            <button disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <b>Page {page}</b>
            <button disabled={page * 20 >= total} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </footer>
      </section>

      {canManageRoles && selected && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="role-panel-title">
            <div className="dialog-header">
              <div><span className="section-kicker">ROLE ASSIGNMENT</span><h2 id="role-panel-title">{selected.displayName}</h2></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close role assignment panel">×</button>
            </div>
            {panelLoading ? (
              <div className="module-state" role="status"><span className="loader" />Loading roles…</div>
            ) : (
              <>
                {panelError && <div className="form-error" role="alert">{panelError}</div>}
                <ul className="assignment-list">
                  {(assignments ?? []).map((assignment) => (
                    <li key={assignment.id}>
                      <div><strong>{assignment.roleName}</strong><span>Assigned {new Date(assignment.assignedAt).toLocaleDateString()}</span></div>
                      <button className="text-action" disabled={saving} onClick={() => void revoke(assignment.id)}>Revoke</button>
                    </li>
                  ))}
                  {!(assignments ?? []).length && (
                    <li className="assignment-empty">No database-assigned roles — this user currently resolves to the default Executive / Viewer role.</li>
                  )}
                </ul>
                <div className="dialog-actions assignment-actions">
                  <label className="field">
                    <span>Assign a role</span>
                    <select value={pendingRole} onChange={(event) => setPendingRole(event.target.value)}>
                      <option value="">Select a role</option>
                      {availableRoles.map((role) => <option key={role.code} value={role.code}>{role.name}</option>)}
                    </select>
                  </label>
                  <button className="primary-action" disabled={!pendingRole || saving} onClick={() => void assign()}>{saving ? "Saving…" : "Assign role"}</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {canManageRoles && (
        <section className="portfolio-module">
          <div className="portfolio-toolbar"><div><span className="section-kicker">ROLE CATALOG</span><h2>System roles <small>{roles?.length ?? 0}</small></h2></div></div>
          {rolesError && <div className="form-error integration-error" role="alert">{rolesError}</div>}
          {!roles ? (
            <div className="module-state" role="status"><span className="loader" />Loading role catalog…</div>
          ) : (
            <div className="role-catalog-grid">
              {roles.map((role) => (
                <article key={role.code} className="role-catalog-card">
                  <strong>{role.name}</strong>
                  <p>{role.description}</p>
                  <div className="permission-group-tags">{role.permissionGroups.map((group) => <span key={group} className="neutral-badge">{group}</span>)}</div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
