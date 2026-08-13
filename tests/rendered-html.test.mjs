import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/", authenticated = true) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: {
        accept: path.startsWith("/api/") ? "application/json" : "text/html",
        ...(authenticated
          ? {
              "oai-authenticated-user-id": "test-user-1",
              "oai-authenticated-user-email": "alex.morgan@example.com",
              "oai-authenticated-user-full-name": "Alex%20Morgan",
              "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
            }
          : {}),
      },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Stage 1 application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Product Development/);
  assert.match(html, /Command Center/);
  assert.match(html, /Primary navigation/);
  assert.match(html, /Application Shell/);
  assert.match(html, /Alex Morgan/);
  assert.match(html, /Sign out/);
  assert.match(html, /no fabricated portfolio statistics/i);
  assert.match(html, /Skip to content/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("redirects anonymous browser requests to the platform sign-in flow", async () => {
  const response = await render("/", false);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/signin-with-chatgpt?return_to=%2F");
});

test("rejects anonymous API access and returns authenticated identity safely", async () => {
  const anonymous = await render("/api/v1/me", false);
  assert.equal(anonymous.status, 401);
  const anonymousBody = await anonymous.json();
  assert.equal(anonymousBody.error.code, "AUTHENTICATION_REQUIRED");
  assert.ok(anonymousBody.error.correlationId);

  const authenticated = await render("/api/v1/me", true);
  assert.equal(authenticated.status, 200);
  const authenticatedBody = await authenticated.json();
  assert.equal(authenticatedBody.data.id, "test-user-1");
  assert.equal(authenticatedBody.data.displayName, "Alex Morgan");
  assert.equal(authenticatedBody.data.email, "alex.morgan@example.com");
  assert.deepEqual(authenticatedBody.data.roles, ["EXECUTIVE_VIEWER"]);
  assert.ok(authenticatedBody.data.permissions.includes("dashboard.view"));
  assert.ok(!authenticatedBody.data.permissions.includes("admin.users"));
});

test("keeps the shell accessible and the starter preview removed", async () => {
  const [shell, css, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/command-center-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(shell, /aria-label="Primary navigation"/);
  assert.match(shell, /aria-current=/);
  assert.match(shell, /id="main-content"/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /principal\.roleNames/);
  assert.match(shell, /principal\.permissions\.includes/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /button:focus-visible/);
  assert.match(page, /<CommandCenterShell principal=\{principal\} \/>/);
  assert.match(page, /requireChatGPTUser\("\/"\)/);
  assert.match(page, /requirePermission\(principal, "dashboard\.view"\)/);
  assert.match(layout, /Product Development Command Center/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
