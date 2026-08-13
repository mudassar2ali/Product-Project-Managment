import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
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
  assert.match(html, /no fabricated portfolio statistics/i);
  assert.match(html, /Skip to content/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
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
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /button:focus-visible/);
  assert.match(page, /<CommandCenterShell \/>/);
  assert.match(layout, /Product Development Command Center/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
