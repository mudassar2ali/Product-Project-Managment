CREATE TABLE `requirement_evidence_references` (
	`id` text PRIMARY KEY NOT NULL,
	`requirement_id` text NOT NULL,
	`evidence_type` text NOT NULL,
	`source_system` text NOT NULL,
	`external_reference` text NOT NULL,
	`source_url` text,
	`evidence_status` text DEFAULT 'NOT_AVAILABLE' NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`observed_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_requirement_evidence_type" CHECK("requirement_evidence_references"."evidence_type" IN ('QA','UAT','RELEASE')),
	CONSTRAINT "ck_requirement_evidence_status" CHECK("requirement_evidence_references"."evidence_status" IN ('NOT_AVAILABLE','PENDING','PASSED','FAILED','CONDITIONAL','STALE')),
	CONSTRAINT "ck_requirement_evidence_fields" CHECK(length(trim("requirement_evidence_references"."source_system")) BETWEEN 1 AND 120 AND length(trim("requirement_evidence_references"."external_reference")) BETWEEN 1 AND 160 AND length("requirement_evidence_references"."result")<=2000 AND "requirement_evidence_references"."version">0),
	CONSTRAINT "ck_requirement_evidence_url" CHECK("requirement_evidence_references"."source_url" IS NULL OR (length("requirement_evidence_references"."source_url")<=500 AND ("requirement_evidence_references"."source_url" LIKE 'https://%' OR "requirement_evidence_references"."source_url" LIKE 'http://%'))),
	CONSTRAINT "ck_requirement_evidence_observed_consistency" CHECK(
    ("requirement_evidence_references"."evidence_status" IN ('NOT_AVAILABLE','PENDING') AND "requirement_evidence_references"."observed_at" IS NULL)
    OR ("requirement_evidence_references"."evidence_status" IN ('PASSED','FAILED','CONDITIONAL','STALE') AND "requirement_evidence_references"."observed_at" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_evidence_reference` ON `requirement_evidence_references` (`requirement_id`,`evidence_type`,`external_reference`);--> statement-breakpoint
CREATE INDEX `idx_requirement_evidence_requirement_type` ON `requirement_evidence_references` (`requirement_id`,`evidence_type`,`evidence_status`);--> statement-breakpoint
CREATE INDEX `idx_requirement_evidence_observed` ON `requirement_evidence_references` (`observed_at`);