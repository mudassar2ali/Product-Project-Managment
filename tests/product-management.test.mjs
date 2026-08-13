import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Product migration enforces identifiers, ownership links and portfolio indexes", async () => {
  const migration = await readFile(new URL("drizzle/0001_gray_wallflower.sql", root), "utf8");
  assert.match(migration, /CREATE TABLE `products`/);
  assert.match(migration, /uq_products_business_id/);
  assert.match(migration, /uq_products_code/);
  assert.match(migration, /idx_products_status_stage/);
  assert.match(migration, /idx_products_target_launch/);
  assert.match(migration, /REFERENCES `users`\(`id`\).*ON DELETE set null/);
});

test("Product contracts cover required lifecycle values and authoritative validation", async () => {
  const contract = await readFile(new URL("app/products/product-contract.ts", root), "utf8");
  for (const stage of ["Idea", "Business Case", "Development", "UAT", "Production", "Sunset"]) assert.match(contract, new RegExp(`"${stage}"`));
  assert.match(contract, /progress < 0 \|\| value\.progress > 100/);
  assert.match(contract, /targetLaunchDate < value\.startDate/);
  assert.match(contract, /\^\[A-Z\]/);
});

test("Product APIs apply authentication, authorization, validation, concurrency and audit controls", async () => {
  const [collection, detail, repository] = await Promise.all([
    readFile(new URL("app/api/v1/products/route.ts", root), "utf8"),
    readFile(new URL("app/api/v1/products/[id]/route.ts", root), "utf8"),
    readFile(new URL("db/products.ts", root), "utf8"),
  ]);
  assert.match(collection, /authorizeApi\("product\.view"\)/);
  assert.match(collection, /authorizeApi\("product\.create"\)/);
  assert.match(detail, /authorizeApi\("product\.edit"\)/);
  assert.match(detail, /authorizeApi\("product\.archive"\)/);
  assert.match(detail, /UPDATE_CONFLICT/);
  assert.match(repository, /INSERT INTO audit_logs/);
  assert.match(repository, /record_status='ARCHIVED'/);
  assert.match(repository, /ON CONFLICT\(entity_type\)/);
});
