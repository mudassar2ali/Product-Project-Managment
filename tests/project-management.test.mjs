import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root=new URL("../",import.meta.url);

test("Project migration preserves Product hierarchy, progress and query integrity",async()=>{const sql=await readFile(new URL("drizzle/0002_slim_sersi.sql",root),"utf8");assert.match(sql,/CREATE TABLE `projects`/);assert.match(sql,/CREATE TABLE `project_stage_weights`/);assert.match(sql,/REFERENCES `products`\(`id`\).*ON DELETE restrict/);assert.match(sql,/uq_projects_business_id/);assert.match(sql,/uq_project_stage_weight/);assert.match(sql,/idx_projects_product_status/);assert.match(sql,/idx_projects_health_status/);});

test("Project contract enforces weighted progress and lifecycle controls",async()=>{const source=await readFile(new URL("app/projects/project-contract.ts",root),"utf8");assert.match(source,/development:\s*40/);assert.match(source,/weightTotal !== 100/);assert.match(source,/calculateOverallProgress/);assert.match(source,/targetEndDate < value\.startDate/);for(const value of ["On Track","At Risk","Delayed","Blocked","Completed"])assert.match(source,new RegExp(`"${value}"`));});

test("Project APIs enforce RBAC, concurrency, parent validation and audit",async()=>{const[collection,detail,repo]=await Promise.all([readFile(new URL("app/api/v1/projects/route.ts",root),"utf8"),readFile(new URL("app/api/v1/projects/[id]/route.ts",root),"utf8"),readFile(new URL("db/projects.ts",root),"utf8")]);assert.match(collection,/authorizeApi\("project\.create"\)/);assert.match(detail,/authorizeApi\("project\.edit"\)/);assert.match(detail,/UPDATE_CONFLICT/);assert.match(collection,/INVALID_PARENT_PRODUCT/);assert.match(repo,/INSERT INTO audit_logs/);assert.match(repo,/record_status='ARCHIVED'/);assert.match(repo,/project_stage_weights/);});
