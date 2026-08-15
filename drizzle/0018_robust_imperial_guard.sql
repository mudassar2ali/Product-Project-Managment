CREATE TABLE `governance_document_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`document_version_id` text NOT NULL,
	`section_key` text NOT NULL,
	`heading` text NOT NULL,
	`sequence` integer NOT NULL,
	`content_text` text DEFAULT '' NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`completion_status` text DEFAULT 'EMPTY' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`document_version_id`) REFERENCES `governance_document_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_governance_section_key" CHECK("governance_document_sections"."section_key" IN ('DOCUMENT_INFORMATION','EXECUTIVE_SUMMARY','BUSINESS_CONTEXT','PROBLEM_STATEMENT','BUSINESS_OBJECTIVES','BUSINESS_REQUIREMENTS','SCOPE','OUT_OF_SCOPE','STAKEHOLDERS','CURRENT_STATE','FUTURE_STATE','BUSINESS_PROCESSES','FUNCTIONAL_REQUIREMENTS','NON_FUNCTIONAL_REQUIREMENTS','BUSINESS_RULES','DEPENDENCIES','ASSUMPTIONS','RISKS','COMPLIANCE_REQUIREMENTS','KPIS','SUCCESS_METRICS','USER_STORIES','ACCEPTANCE_CRITERIA','UAT_CRITERIA','SIGN_OFF','PRODUCT_OVERVIEW','PROBLEM','OPPORTUNITY','TARGET_USERS','PERSONAS','USE_CASES','OBJECTIVES','FEATURES','UX_REQUIREMENTS','ANALYTICS_REQUIREMENTS','RELEASE_STRATEGY')),
	CONSTRAINT "ck_governance_section_fields" CHECK(length(trim("governance_document_sections"."heading")) BETWEEN 1 AND 160 AND "governance_document_sections"."sequence">0 AND length("governance_document_sections"."content_text")<=100000 AND "governance_document_sections"."version">0),
	CONSTRAINT "ck_governance_section_completion" CHECK("governance_document_sections"."completion_status" IN ('EMPTY','IN_PROGRESS','COMPLETE') AND ("governance_document_sections"."completion_status"<>'COMPLETE' OR length(trim("governance_document_sections"."content_text"))>0) AND ("governance_document_sections"."completion_status"<>'EMPTY' OR length(trim("governance_document_sections"."content_text"))=0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_governance_sections_key` ON `governance_document_sections` (`document_version_id`,`section_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_governance_sections_sequence` ON `governance_document_sections` (`document_version_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_governance_sections_version_completion` ON `governance_document_sections` (`document_version_id`,`completion_status`,`required`);--> statement-breakpoint
CREATE TABLE `governance_document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version_label` text NOT NULL,
	`major_version` integer DEFAULT 0 NOT NULL,
	`minor_version` integer DEFAULT 1 NOT NULL,
	`lifecycle_status` text DEFAULT 'DRAFT' NOT NULL,
	`supersedes_version_id` text,
	`content_hash` text,
	`change_summary` text DEFAULT '' NOT NULL,
	`submitted_at` text,
	`approved_at` text,
	`locked_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`document_id`) REFERENCES `governance_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supersedes_version_id`) REFERENCES `governance_document_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_governance_version_status" CHECK("governance_document_versions"."lifecycle_status" IN ('DRAFT','IN_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED','SUPERSEDED','RETIRED')),
	CONSTRAINT "ck_governance_version_numbers" CHECK("governance_document_versions"."major_version">=0 AND "governance_document_versions"."minor_version">=0 AND "governance_document_versions"."version">0),
	CONSTRAINT "ck_governance_version_label" CHECK(length(trim("governance_document_versions"."version_label")) BETWEEN 1 AND 32),
	CONSTRAINT "ck_governance_version_summary" CHECK(length("governance_document_versions"."change_summary")<=2000),
	CONSTRAINT "ck_governance_version_hash" CHECK("governance_document_versions"."content_hash" IS NULL OR (length("governance_document_versions"."content_hash")=64 AND lower("governance_document_versions"."content_hash") NOT GLOB '*[^0-9a-f]*')),
	CONSTRAINT "ck_governance_version_lock" CHECK(
    ("governance_document_versions"."lifecycle_status"='DRAFT' AND "governance_document_versions"."content_hash" IS NULL AND "governance_document_versions"."submitted_at" IS NULL AND "governance_document_versions"."approved_at" IS NULL AND "governance_document_versions"."locked_at" IS NULL)
    OR ("governance_document_versions"."lifecycle_status"='IN_REVIEW' AND "governance_document_versions"."content_hash" IS NOT NULL AND "governance_document_versions"."submitted_at" IS NOT NULL AND "governance_document_versions"."approved_at" IS NULL AND "governance_document_versions"."locked_at" IS NOT NULL)
    OR ("governance_document_versions"."lifecycle_status" IN ('APPROVED','APPROVED_WITH_CONDITIONS','SUPERSEDED','RETIRED') AND "governance_document_versions"."content_hash" IS NOT NULL AND "governance_document_versions"."submitted_at" IS NOT NULL AND "governance_document_versions"."approved_at" IS NOT NULL AND "governance_document_versions"."locked_at" IS NOT NULL)
    OR ("governance_document_versions"."lifecycle_status"='REJECTED' AND "governance_document_versions"."content_hash" IS NOT NULL AND "governance_document_versions"."submitted_at" IS NOT NULL AND "governance_document_versions"."approved_at" IS NULL AND "governance_document_versions"."locked_at" IS NOT NULL)
  ),
	CONSTRAINT "ck_governance_version_not_self" CHECK("governance_document_versions"."supersedes_version_id" IS NULL OR "governance_document_versions"."supersedes_version_id"<>"governance_document_versions"."id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_governance_versions_label` ON `governance_document_versions` (`document_id`,`version_label`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_governance_versions_one_draft` ON `governance_document_versions` (`document_id`) WHERE "governance_document_versions"."lifecycle_status"='DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX `uq_governance_versions_one_current_approved` ON `governance_document_versions` (`document_id`) WHERE "governance_document_versions"."lifecycle_status" IN ('APPROVED','APPROVED_WITH_CONDITIONS');--> statement-breakpoint
CREATE INDEX `idx_governance_versions_document_status` ON `governance_document_versions` (`document_id`,`lifecycle_status`,`major_version`,`minor_version`);--> statement-breakpoint
CREATE INDEX `idx_governance_versions_submitted_status` ON `governance_document_versions` (`submitted_at`,`lifecycle_status`);--> statement-breakpoint
CREATE INDEX `idx_governance_versions_supersedes` ON `governance_document_versions` (`supersedes_version_id`);--> statement-breakpoint
CREATE TABLE `governance_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`document_type` text NOT NULL,
	`product_id` text NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`owner_user_id` text,
	`purpose` text DEFAULT '' NOT NULL,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_governance_document_type" CHECK("governance_documents"."document_type" IN ('BRD','PRD')),
	CONSTRAINT "ck_governance_document_status" CHECK("governance_documents"."record_status" IN ('ACTIVE','ARCHIVED')),
	CONSTRAINT "ck_governance_document_fields" CHECK(length(trim("governance_documents"."business_id")) BETWEEN 1 AND 32 AND length(trim("governance_documents"."title")) BETWEEN 1 AND 240 AND length("governance_documents"."purpose")<=2000 AND "governance_documents"."version">0),
	CONSTRAINT "ck_governance_document_archive" CHECK(("governance_documents"."record_status"='ACTIVE' AND "governance_documents"."archived_at" IS NULL) OR ("governance_documents"."record_status"='ARCHIVED' AND "governance_documents"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_governance_documents_business_id` ON `governance_documents` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_governance_documents_product_type` ON `governance_documents` (`product_id`,`document_type`,`record_status`);--> statement-breakpoint
CREATE INDEX `idx_governance_documents_project_type` ON `governance_documents` (`project_id`,`document_type`,`record_status`);--> statement-breakpoint
CREATE INDEX `idx_governance_documents_owner_status` ON `governance_documents` (`owner_user_id`,`record_status`);--> statement-breakpoint
CREATE TRIGGER `trg_governance_versions_transition`
BEFORE UPDATE OF lifecycle_status ON `governance_document_versions`
WHEN NOT (
  (OLD.lifecycle_status='DRAFT' AND NEW.lifecycle_status IN ('DRAFT','IN_REVIEW'))
  OR (OLD.lifecycle_status='IN_REVIEW' AND NEW.lifecycle_status IN ('IN_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED'))
  OR (OLD.lifecycle_status='APPROVED_WITH_CONDITIONS' AND NEW.lifecycle_status IN ('APPROVED_WITH_CONDITIONS','APPROVED','SUPERSEDED','RETIRED'))
  OR (OLD.lifecycle_status='APPROVED' AND NEW.lifecycle_status IN ('APPROVED','SUPERSEDED','RETIRED'))
  OR (OLD.lifecycle_status='REJECTED' AND NEW.lifecycle_status='REJECTED')
  OR (OLD.lifecycle_status='SUPERSEDED' AND NEW.lifecycle_status='SUPERSEDED')
  OR (OLD.lifecycle_status='RETIRED' AND NEW.lifecycle_status='RETIRED')
)
BEGIN
  SELECT RAISE(ABORT, 'GOVERNANCE_VERSION_TRANSITION_INVALID');
END;--> statement-breakpoint
CREATE TRIGGER `trg_governance_versions_locked_identity_update`
BEFORE UPDATE ON `governance_document_versions`
WHEN OLD.lifecycle_status<>'DRAFT' AND (
  NEW.document_id IS NOT OLD.document_id
  OR NEW.version_label IS NOT OLD.version_label
  OR NEW.major_version IS NOT OLD.major_version
  OR NEW.minor_version IS NOT OLD.minor_version
  OR NEW.supersedes_version_id IS NOT OLD.supersedes_version_id
  OR NEW.content_hash IS NOT OLD.content_hash
  OR NEW.change_summary IS NOT OLD.change_summary
)
BEGIN
  SELECT RAISE(ABORT, 'GOVERNANCE_VERSION_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_governance_versions_locked_delete`
BEFORE DELETE ON `governance_document_versions`
WHEN OLD.lifecycle_status<>'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'GOVERNANCE_VERSION_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_governance_sections_locked_insert`
BEFORE INSERT ON `governance_document_sections`
WHEN (SELECT lifecycle_status FROM governance_document_versions WHERE id=NEW.document_version_id)<>'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'GOVERNANCE_VERSION_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_governance_sections_locked_update`
BEFORE UPDATE ON `governance_document_sections`
WHEN (SELECT lifecycle_status FROM governance_document_versions WHERE id=OLD.document_version_id)<>'DRAFT'
  OR (SELECT lifecycle_status FROM governance_document_versions WHERE id=NEW.document_version_id)<>'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'GOVERNANCE_VERSION_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_governance_sections_locked_delete`
BEFORE DELETE ON `governance_document_sections`
WHEN (SELECT lifecycle_status FROM governance_document_versions WHERE id=OLD.document_version_id)<>'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'GOVERNANCE_VERSION_LOCKED');
END;
