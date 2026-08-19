CREATE TABLE `feasibility_requirement_links` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`requirement_id` text NOT NULL,
	`coverage_note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`assessment_id`) REFERENCES `technical_feasibility_assessments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_feasibility_requirement_link_fields" CHECK(length("feasibility_requirement_links"."coverage_note")<=2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_feasibility_requirement_links_edge` ON `feasibility_requirement_links` (`assessment_id`,`requirement_id`);--> statement-breakpoint
CREATE INDEX `idx_feasibility_requirement_links_requirement` ON `feasibility_requirement_links` (`requirement_id`);--> statement-breakpoint
CREATE TABLE `technical_feasibility_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`project_id` text NOT NULL,
	`backlog_feature_id` text,
	`owner_user_id` text,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`backlog_feature_id`) REFERENCES `backlog_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_technical_feasibility_assessment_status" CHECK("technical_feasibility_assessments"."record_status" IN ('ACTIVE','ARCHIVED')),
	CONSTRAINT "ck_technical_feasibility_assessment_fields" CHECK(length(trim("technical_feasibility_assessments"."business_id")) BETWEEN 1 AND 32 AND "technical_feasibility_assessments"."version">0),
	CONSTRAINT "ck_technical_feasibility_assessment_archive" CHECK(("technical_feasibility_assessments"."record_status"='ACTIVE' AND "technical_feasibility_assessments"."archived_at" IS NULL) OR ("technical_feasibility_assessments"."record_status"='ARCHIVED' AND "technical_feasibility_assessments"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_technical_feasibility_assessments_business_id` ON `technical_feasibility_assessments` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_technical_feasibility_assessments_project_status` ON `technical_feasibility_assessments` (`project_id`,`record_status`);--> statement-breakpoint
CREATE INDEX `idx_technical_feasibility_assessments_feature` ON `technical_feasibility_assessments` (`backlog_feature_id`);--> statement-breakpoint
CREATE INDEX `idx_technical_feasibility_assessments_owner_status` ON `technical_feasibility_assessments` (`owner_user_id`,`record_status`);--> statement-breakpoint
CREATE TABLE `technical_feasibility_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`revision_number` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`technical_spike` text DEFAULT '' NOT NULL,
	`architecture_review` text DEFAULT '' NOT NULL,
	`feasibility_summary` text DEFAULT '' NOT NULL,
	`integration_requirements` text DEFAULT '' NOT NULL,
	`security_review` text DEFAULT '' NOT NULL,
	`technical_constraints` text DEFAULT '' NOT NULL,
	`technical_debt_risk` text DEFAULT '' NOT NULL,
	`engineering_estimate` integer,
	`estimate_unit` text,
	`recommendation` text DEFAULT '' NOT NULL,
	`content_hash` text,
	`submitted_at` text,
	`approved_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`assessment_id`) REFERENCES `technical_feasibility_assessments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_technical_feasibility_revision_status" CHECK("technical_feasibility_revisions"."status" IN ('DRAFT','IN_REVIEW','FEASIBLE','FEASIBLE_WITH_CONDITIONS','NOT_FEASIBLE','SUPERSEDED')),
	CONSTRAINT "ck_technical_feasibility_revision_numbers" CHECK("technical_feasibility_revisions"."revision_number">0 AND "technical_feasibility_revisions"."version">0),
	CONSTRAINT "ck_technical_feasibility_revision_estimate_unit" CHECK("technical_feasibility_revisions"."estimate_unit" IS NULL OR "technical_feasibility_revisions"."estimate_unit" IN ('HOURS','DAYS','STORY_POINTS')),
	CONSTRAINT "ck_technical_feasibility_revision_estimate" CHECK(
    ("technical_feasibility_revisions"."engineering_estimate" IS NULL AND "technical_feasibility_revisions"."estimate_unit" IS NULL)
    OR ("technical_feasibility_revisions"."engineering_estimate" IS NOT NULL AND "technical_feasibility_revisions"."engineering_estimate">=0 AND "technical_feasibility_revisions"."estimate_unit" IS NOT NULL)
  ),
	CONSTRAINT "ck_technical_feasibility_revision_fields" CHECK(
    length("technical_feasibility_revisions"."technical_spike")<=20000 AND length("technical_feasibility_revisions"."architecture_review")<=20000 AND length("technical_feasibility_revisions"."feasibility_summary")<=20000
    AND length("technical_feasibility_revisions"."integration_requirements")<=20000 AND length("technical_feasibility_revisions"."security_review")<=20000 AND length("technical_feasibility_revisions"."technical_constraints")<=20000
    AND length("technical_feasibility_revisions"."technical_debt_risk")<=20000 AND length("technical_feasibility_revisions"."recommendation")<=20000
  ),
	CONSTRAINT "ck_technical_feasibility_revision_hash" CHECK("technical_feasibility_revisions"."content_hash" IS NULL OR (length("technical_feasibility_revisions"."content_hash")=64 AND lower("technical_feasibility_revisions"."content_hash") NOT GLOB '*[^0-9a-f]*')),
	CONSTRAINT "ck_technical_feasibility_revision_lock" CHECK(
    ("technical_feasibility_revisions"."status"='DRAFT' AND "technical_feasibility_revisions"."content_hash" IS NULL AND "technical_feasibility_revisions"."submitted_at" IS NULL AND "technical_feasibility_revisions"."approved_at" IS NULL)
    OR ("technical_feasibility_revisions"."status"='IN_REVIEW' AND "technical_feasibility_revisions"."content_hash" IS NOT NULL AND "technical_feasibility_revisions"."submitted_at" IS NOT NULL AND "technical_feasibility_revisions"."approved_at" IS NULL)
    OR ("technical_feasibility_revisions"."status" IN ('FEASIBLE','FEASIBLE_WITH_CONDITIONS','SUPERSEDED') AND "technical_feasibility_revisions"."content_hash" IS NOT NULL AND "technical_feasibility_revisions"."submitted_at" IS NOT NULL AND "technical_feasibility_revisions"."approved_at" IS NOT NULL)
    OR ("technical_feasibility_revisions"."status"='NOT_FEASIBLE' AND "technical_feasibility_revisions"."content_hash" IS NOT NULL AND "technical_feasibility_revisions"."submitted_at" IS NOT NULL AND "technical_feasibility_revisions"."approved_at" IS NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_technical_feasibility_revisions_number` ON `technical_feasibility_revisions` (`assessment_id`,`revision_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_technical_feasibility_revisions_one_draft` ON `technical_feasibility_revisions` (`assessment_id`) WHERE "technical_feasibility_revisions"."status"='DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX `uq_technical_feasibility_revisions_one_current` ON `technical_feasibility_revisions` (`assessment_id`) WHERE "technical_feasibility_revisions"."status" IN ('FEASIBLE','FEASIBLE_WITH_CONDITIONS','NOT_FEASIBLE');--> statement-breakpoint
CREATE INDEX `idx_technical_feasibility_revisions_assessment_status` ON `technical_feasibility_revisions` (`assessment_id`,`status`,`revision_number`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_signoff_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`document_version_id` text,
	`requirement_revision_id` text,
	`feasibility_revision_id` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`document_version_id`) REFERENCES `governance_document_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requirement_revision_id`) REFERENCES `requirement_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`feasibility_revision_id`) REFERENCES `technical_feasibility_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_signoff_request_status" CHECK("__new_signoff_requests"."status" IN ('PENDING','UNDER_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED')),
	CONSTRAINT "ck_signoff_request_subject" CHECK(
    ("__new_signoff_requests"."document_version_id" IS NOT NULL AND "__new_signoff_requests"."requirement_revision_id" IS NULL AND "__new_signoff_requests"."feasibility_revision_id" IS NULL)
    OR ("__new_signoff_requests"."document_version_id" IS NULL AND "__new_signoff_requests"."requirement_revision_id" IS NOT NULL AND "__new_signoff_requests"."feasibility_revision_id" IS NULL)
    OR ("__new_signoff_requests"."document_version_id" IS NULL AND "__new_signoff_requests"."requirement_revision_id" IS NULL AND "__new_signoff_requests"."feasibility_revision_id" IS NOT NULL)
  ),
	CONSTRAINT "ck_signoff_request_completion" CHECK(
    ("__new_signoff_requests"."status" IN ('PENDING','UNDER_REVIEW') AND "__new_signoff_requests"."completed_at" IS NULL)
    OR ("__new_signoff_requests"."status" IN ('APPROVED','APPROVED_WITH_CONDITIONS','REJECTED') AND "__new_signoff_requests"."completed_at" IS NOT NULL)
  ),
	CONSTRAINT "ck_signoff_request_numbers" CHECK("__new_signoff_requests"."version">0)
);
--> statement-breakpoint
INSERT INTO `__new_signoff_requests`("id", "document_version_id", "requirement_revision_id", "feasibility_revision_id", "status", "requested_by", "requested_at", "completed_at", "version", "created_at", "created_by", "updated_at", "updated_by") SELECT "id", "document_version_id", "requirement_revision_id", NULL, "status", "requested_by", "requested_at", "completed_at", "version", "created_at", "created_by", "updated_at", "updated_by" FROM `signoff_requests`;--> statement-breakpoint
DROP TABLE `signoff_requests`;--> statement-breakpoint
ALTER TABLE `__new_signoff_requests` RENAME TO `signoff_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_signoff_requests_active_document_version` ON `signoff_requests` (`document_version_id`) WHERE "signoff_requests"."status" IN ('PENDING','UNDER_REVIEW') AND "signoff_requests"."document_version_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_signoff_requests_active_requirement_revision` ON `signoff_requests` (`requirement_revision_id`) WHERE "signoff_requests"."status" IN ('PENDING','UNDER_REVIEW') AND "signoff_requests"."requirement_revision_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_signoff_requests_active_feasibility_revision` ON `signoff_requests` (`feasibility_revision_id`) WHERE "signoff_requests"."status" IN ('PENDING','UNDER_REVIEW') AND "signoff_requests"."feasibility_revision_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_signoff_requests_document_version` ON `signoff_requests` (`document_version_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_signoff_requests_requirement_revision` ON `signoff_requests` (`requirement_revision_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_signoff_requests_feasibility_revision` ON `signoff_requests` (`feasibility_revision_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_signoff_requests_status` ON `signoff_requests` (`status`,`requested_at`);--> statement-breakpoint
CREATE TRIGGER `trg_signoff_requests_transition`
BEFORE UPDATE OF status ON `signoff_requests`
WHEN NOT (
  (OLD.status='PENDING' AND NEW.status IN ('PENDING','UNDER_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED'))
  OR (OLD.status='UNDER_REVIEW' AND NEW.status IN ('UNDER_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED'))
  OR (OLD.status='APPROVED' AND NEW.status='APPROVED')
  OR (OLD.status='APPROVED_WITH_CONDITIONS' AND NEW.status='APPROVED_WITH_CONDITIONS')
  OR (OLD.status='REJECTED' AND NEW.status='REJECTED')
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNOFF_REQUEST_TRANSITION_INVALID');
END;--> statement-breakpoint
CREATE TRIGGER `trg_signoff_requests_locked_identity_update`
BEFORE UPDATE ON `signoff_requests`
WHEN NEW.document_version_id IS NOT OLD.document_version_id
  OR NEW.requirement_revision_id IS NOT OLD.requirement_revision_id
  OR NEW.feasibility_revision_id IS NOT OLD.feasibility_revision_id
  OR NEW.requested_by IS NOT OLD.requested_by
  OR NEW.requested_at IS NOT OLD.requested_at
BEGIN
  SELECT RAISE(ABORT, 'SIGNOFF_REQUEST_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_signoff_requests_locked_delete`
BEFORE DELETE ON `signoff_requests`
WHEN OLD.status<>'PENDING'
BEGIN
  SELECT RAISE(ABORT, 'SIGNOFF_REQUEST_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_technical_feasibility_revisions_transition`
BEFORE UPDATE OF status ON `technical_feasibility_revisions`
WHEN NOT (
  (OLD.status='DRAFT' AND NEW.status IN ('DRAFT','IN_REVIEW'))
  OR (OLD.status='IN_REVIEW' AND NEW.status IN ('IN_REVIEW','FEASIBLE','FEASIBLE_WITH_CONDITIONS','NOT_FEASIBLE'))
  OR (OLD.status='FEASIBLE' AND NEW.status IN ('FEASIBLE','SUPERSEDED'))
  OR (OLD.status='FEASIBLE_WITH_CONDITIONS' AND NEW.status IN ('FEASIBLE_WITH_CONDITIONS','SUPERSEDED'))
  OR (OLD.status='NOT_FEASIBLE' AND NEW.status='NOT_FEASIBLE')
  OR (OLD.status='SUPERSEDED' AND NEW.status='SUPERSEDED')
)
BEGIN
  SELECT RAISE(ABORT, 'FEASIBILITY_REVISION_TRANSITION_INVALID');
END;--> statement-breakpoint
CREATE TRIGGER `trg_technical_feasibility_revisions_locked_identity_update`
BEFORE UPDATE ON `technical_feasibility_revisions`
WHEN OLD.status<>'DRAFT' AND (
  NEW.assessment_id IS NOT OLD.assessment_id
  OR NEW.revision_number IS NOT OLD.revision_number
  OR NEW.technical_spike IS NOT OLD.technical_spike
  OR NEW.architecture_review IS NOT OLD.architecture_review
  OR NEW.feasibility_summary IS NOT OLD.feasibility_summary
  OR NEW.integration_requirements IS NOT OLD.integration_requirements
  OR NEW.security_review IS NOT OLD.security_review
  OR NEW.technical_constraints IS NOT OLD.technical_constraints
  OR NEW.technical_debt_risk IS NOT OLD.technical_debt_risk
  OR NEW.engineering_estimate IS NOT OLD.engineering_estimate
  OR NEW.estimate_unit IS NOT OLD.estimate_unit
  OR NEW.recommendation IS NOT OLD.recommendation
  OR NEW.content_hash IS NOT OLD.content_hash
)
BEGIN
  SELECT RAISE(ABORT, 'FEASIBILITY_REVISION_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_technical_feasibility_revisions_locked_delete`
BEFORE DELETE ON `technical_feasibility_revisions`
WHEN OLD.status<>'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'FEASIBILITY_REVISION_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_technical_feasibility_assessments_locked_delete`
BEFORE DELETE ON `technical_feasibility_assessments`
WHEN EXISTS(SELECT 1 FROM technical_feasibility_revisions WHERE assessment_id=OLD.id AND status<>'DRAFT')
BEGIN
  SELECT RAISE(ABORT, 'FEASIBILITY_REVISION_LOCKED');
END;
