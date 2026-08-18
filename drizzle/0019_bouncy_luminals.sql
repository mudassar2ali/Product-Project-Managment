CREATE TABLE `requirement_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`requirement_id` text NOT NULL,
	`revision_number` integer DEFAULT 1 NOT NULL,
	`document_version_id` text,
	`title` text NOT NULL,
	`statement` text DEFAULT '' NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`verification_method` text DEFAULT '' NOT NULL,
	`governance_status` text DEFAULT 'DRAFT' NOT NULL,
	`content_hash` text,
	`submitted_at` text,
	`approved_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`document_version_id`) REFERENCES `governance_document_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_requirement_revision_status" CHECK("requirement_revisions"."governance_status" IN ('DRAFT','IN_REVIEW','APPROVED','REJECTED','SUPERSEDED','RETIRED')),
	CONSTRAINT "ck_requirement_revision_priority" CHECK("requirement_revisions"."priority" IN ('LOW','MEDIUM','HIGH','CRITICAL')),
	CONSTRAINT "ck_requirement_revision_numbers" CHECK("requirement_revisions"."revision_number">0 AND "requirement_revisions"."version">0),
	CONSTRAINT "ck_requirement_revision_fields" CHECK(length(trim("requirement_revisions"."title")) BETWEEN 1 AND 240 AND length("requirement_revisions"."statement")<=20000 AND length("requirement_revisions"."rationale")<=20000 AND length("requirement_revisions"."verification_method")<=4000),
	CONSTRAINT "ck_requirement_revision_hash" CHECK("requirement_revisions"."content_hash" IS NULL OR (length("requirement_revisions"."content_hash")=64 AND lower("requirement_revisions"."content_hash") NOT GLOB '*[^0-9a-f]*')),
	CONSTRAINT "ck_requirement_revision_lock" CHECK(
    ("requirement_revisions"."governance_status"='DRAFT' AND "requirement_revisions"."content_hash" IS NULL AND "requirement_revisions"."submitted_at" IS NULL AND "requirement_revisions"."approved_at" IS NULL)
    OR ("requirement_revisions"."governance_status"='IN_REVIEW' AND "requirement_revisions"."content_hash" IS NOT NULL AND "requirement_revisions"."submitted_at" IS NOT NULL AND "requirement_revisions"."approved_at" IS NULL)
    OR ("requirement_revisions"."governance_status" IN ('APPROVED','SUPERSEDED','RETIRED') AND "requirement_revisions"."content_hash" IS NOT NULL AND "requirement_revisions"."submitted_at" IS NOT NULL AND "requirement_revisions"."approved_at" IS NOT NULL)
    OR ("requirement_revisions"."governance_status"='REJECTED' AND "requirement_revisions"."content_hash" IS NOT NULL AND "requirement_revisions"."submitted_at" IS NOT NULL AND "requirement_revisions"."approved_at" IS NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_revisions_number` ON `requirement_revisions` (`requirement_id`,`revision_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_revisions_one_draft` ON `requirement_revisions` (`requirement_id`) WHERE "requirement_revisions"."governance_status"='DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_revisions_one_current_approved` ON `requirement_revisions` (`requirement_id`) WHERE "requirement_revisions"."governance_status"='APPROVED';--> statement-breakpoint
CREATE INDEX `idx_requirement_revisions_requirement_status` ON `requirement_revisions` (`requirement_id`,`governance_status`,`revision_number`);--> statement-breakpoint
CREATE INDEX `idx_requirement_revisions_document_version` ON `requirement_revisions` (`document_version_id`);--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`requirement_type` text NOT NULL,
	`product_id` text NOT NULL,
	`project_id` text,
	`document_id` text,
	`owner_user_id` text,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`document_id`) REFERENCES `governance_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_requirement_type" CHECK("requirements"."requirement_type" IN ('BUSINESS','PRODUCT','FUNCTIONAL','NON_FUNCTIONAL','COMPLIANCE','BUSINESS_RULE','UX','ANALYTICS','UAT')),
	CONSTRAINT "ck_requirement_status" CHECK("requirements"."record_status" IN ('ACTIVE','ARCHIVED')),
	CONSTRAINT "ck_requirement_fields" CHECK(length(trim("requirements"."business_id")) BETWEEN 1 AND 32 AND "requirements"."version">0),
	CONSTRAINT "ck_requirement_archive" CHECK(("requirements"."record_status"='ACTIVE' AND "requirements"."archived_at" IS NULL) OR ("requirements"."record_status"='ARCHIVED' AND "requirements"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirements_business_id` ON `requirements` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_requirements_product_type_status` ON `requirements` (`product_id`,`requirement_type`,`record_status`);--> statement-breakpoint
CREATE INDEX `idx_requirements_project_type_status` ON `requirements` (`project_id`,`requirement_type`,`record_status`);--> statement-breakpoint
CREATE INDEX `idx_requirements_document` ON `requirements` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_requirements_owner_status` ON `requirements` (`owner_user_id`,`record_status`);--> statement-breakpoint
CREATE TRIGGER `trg_requirement_revisions_transition`
BEFORE UPDATE OF governance_status ON `requirement_revisions`
WHEN NOT (
  (OLD.governance_status='DRAFT' AND NEW.governance_status IN ('DRAFT','IN_REVIEW'))
  OR (OLD.governance_status='IN_REVIEW' AND NEW.governance_status IN ('IN_REVIEW','APPROVED','REJECTED'))
  OR (OLD.governance_status='APPROVED' AND NEW.governance_status IN ('APPROVED','SUPERSEDED','RETIRED'))
  OR (OLD.governance_status='REJECTED' AND NEW.governance_status='REJECTED')
  OR (OLD.governance_status='SUPERSEDED' AND NEW.governance_status='SUPERSEDED')
  OR (OLD.governance_status='RETIRED' AND NEW.governance_status='RETIRED')
)
BEGIN
  SELECT RAISE(ABORT, 'REQUIREMENT_REVISION_TRANSITION_INVALID');
END;--> statement-breakpoint
CREATE TRIGGER `trg_requirement_revisions_locked_identity_update`
BEFORE UPDATE ON `requirement_revisions`
WHEN OLD.governance_status<>'DRAFT' AND (
  NEW.requirement_id IS NOT OLD.requirement_id
  OR NEW.revision_number IS NOT OLD.revision_number
  OR NEW.document_version_id IS NOT OLD.document_version_id
  OR NEW.title IS NOT OLD.title
  OR NEW.statement IS NOT OLD.statement
  OR NEW.rationale IS NOT OLD.rationale
  OR NEW.priority IS NOT OLD.priority
  OR NEW.verification_method IS NOT OLD.verification_method
  OR NEW.content_hash IS NOT OLD.content_hash
)
BEGIN
  SELECT RAISE(ABORT, 'REQUIREMENT_REVISION_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_requirement_revisions_locked_delete`
BEFORE DELETE ON `requirement_revisions`
WHEN OLD.governance_status<>'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'REQUIREMENT_REVISION_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_requirements_locked_delete`
BEFORE DELETE ON `requirements`
WHEN EXISTS(SELECT 1 FROM requirement_revisions WHERE requirement_id=OLD.id AND governance_status<>'DRAFT')
BEGIN
  SELECT RAISE(ABORT, 'REQUIREMENT_REVISION_LOCKED');
END;