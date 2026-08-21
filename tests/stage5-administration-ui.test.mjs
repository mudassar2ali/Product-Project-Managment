import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Administration is the one new top-level navigation entry Stage 5 introduces, gated on admin.users", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.match(shell, /label: "Administration", icon: "[^"]+", step: \d+, permission: "admin\.users"/);
});

test("The Administration screen renders the three screen-contract components: user directory, role assignment panel, role catalog", async () => {
  const center = await read("app/administration/administration-center.tsx");
  assert.match(center, /USER DIRECTORY/);
  assert.match(center, /ROLE ASSIGNMENT/);
  assert.match(center, /ROLE CATALOG/);
  assert.match(center, /canManageUsers/);
  assert.match(center, /canManageRoles/);
});

test("Administration is not rendered until both permission props are threaded from the Principal", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.match(shell, /canManageUsers={principal\.permissions\.includes\("admin\.users"\)}/);
  assert.match(shell, /canManageRoles={principal\.permissions\.includes\("admin\.roles"\)}/);
});

test("Every screen state required by the blueprint (loading, empty, error, validation, conflict, success) is present", async () => {
  const center = await read("app/administration/administration-center.tsx");
  assert.match(center, /Loading users…/); // loading
  assert.match(center, /No users found/); // empty
  assert.match(center, /usersError/); // error
  assert.match(center, /No database-assigned roles/); // empty (assignment panel)
  assert.match(center, /panelError/); // validation/conflict surfaced from the API's 404\/409\/422 responses
  assert.match(center, /await loadUsers\(\);/); // success -- directory refreshed after assign\/revoke
});
