CREATE TABLE `governance_stakeholders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`project_id` text NOT NULL,
	`display_name` text NOT NULL,
	`function` text DEFAULT '' NOT NULL,
	`organization` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_governance_stakeholder_fields" CHECK(length(trim("governance_stakeholders"."display_name")) BETWEEN 1 AND 160 AND length("governance_stakeholders"."function")<=160 AND length("governance_stakeholders"."organization")<=160)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_governance_stakeholders_project_name` ON `governance_stakeholders` (`project_id`,`display_name`);--> statement-breakpoint
CREATE INDEX `idx_governance_stakeholders_user` ON `governance_stakeholders` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_governance_stakeholders_active` ON `governance_stakeholders` (`project_id`,`active`);--> statement-breakpoint
CREATE TABLE `raci_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`matrix_id` text NOT NULL,
	`activity_key` text NOT NULL,
	`name` text NOT NULL,
	`sequence` integer DEFAULT 1 NOT NULL,
	`governed_subject_type` text,
	`governed_subject_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`matrix_id`) REFERENCES `raci_matrices`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_raci_activity_key" CHECK("raci_activities"."activity_key" GLOB '[A-Za-z0-9_-]*' AND length("raci_activities"."activity_key") BETWEEN 1 AND 64),
	CONSTRAINT "ck_raci_activity_fields" CHECK(length(trim("raci_activities"."name")) BETWEEN 1 AND 200 AND "raci_activities"."sequence">0),
	CONSTRAINT "ck_raci_activity_subject" CHECK(
    ("raci_activities"."governed_subject_type" IS NULL AND "raci_activities"."governed_subject_id" IS NULL)
    OR ("raci_activities"."governed_subject_type" IN ('DOCUMENT','REQUIREMENT','REVIEW','DELIVERY','FEASIBILITY') AND "raci_activities"."governed_subject_id" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_raci_activities_matrix_key` ON `raci_activities` (`matrix_id`,`activity_key`);--> statement-breakpoint
CREATE INDEX `idx_raci_activities_matrix_sequence` ON `raci_activities` (`matrix_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `raci_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`stakeholder_id` text NOT NULL,
	`responsibility` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`activity_id`) REFERENCES `raci_activities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`stakeholder_id`) REFERENCES `governance_stakeholders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_raci_assignment_responsibility" CHECK("raci_assignments"."responsibility" IN ('RESPONSIBLE','ACCOUNTABLE','CONSULTED','INFORMED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_raci_assignments_activity_stakeholder` ON `raci_assignments` (`activity_id`,`stakeholder_id`);--> statement-breakpoint
CREATE INDEX `idx_raci_assignments_stakeholder` ON `raci_assignments` (`stakeholder_id`);--> statement-breakpoint
CREATE TABLE `raci_matrices` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`published_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_raci_matrix_status" CHECK("raci_matrices"."status" IN ('DRAFT','PUBLISHED','SUPERSEDED')),
	CONSTRAINT "ck_raci_matrix_fields" CHECK(length(trim("raci_matrices"."business_id")) BETWEEN 1 AND 32 AND length(trim("raci_matrices"."title")) BETWEEN 1 AND 240 AND "raci_matrices"."revision">0 AND "raci_matrices"."version">0),
	CONSTRAINT "ck_raci_matrix_lock" CHECK(
    ("raci_matrices"."status"='DRAFT' AND "raci_matrices"."published_at" IS NULL)
    OR ("raci_matrices"."status" IN ('PUBLISHED','SUPERSEDED') AND "raci_matrices"."published_at" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_raci_matrices_business_id` ON `raci_matrices` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_raci_matrices_one_draft` ON `raci_matrices` (`project_id`) WHERE "raci_matrices"."status"='DRAFT';--> statement-breakpoint
CREATE INDEX `idx_raci_matrices_project_status` ON `raci_matrices` (`project_id`,`status`,`revision`);--> statement-breakpoint
CREATE TRIGGER `trg_raci_matrices_transition`
BEFORE UPDATE OF status ON `raci_matrices`
WHEN NOT (
  (OLD.status='DRAFT' AND NEW.status IN ('DRAFT','PUBLISHED'))
  OR (OLD.status='PUBLISHED' AND NEW.status IN ('PUBLISHED','SUPERSEDED'))
  OR (OLD.status='SUPERSEDED' AND NEW.status='SUPERSEDED')
)
BEGIN
  SELECT RAISE(ABORT, 'RACI_MATRIX_TRANSITION_INVALID');
END;--> statement-breakpoint
CREATE TRIGGER `trg_raci_matrices_locked_identity_update`
BEFORE UPDATE ON `raci_matrices`
WHEN OLD.status<>'DRAFT' AND (
  NEW.project_id IS NOT OLD.project_id
  OR NEW.title IS NOT OLD.title
  OR NEW.revision IS NOT OLD.revision
)
BEGIN
  SELECT RAISE(ABORT, 'RACI_MATRIX_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_raci_matrices_locked_delete`
BEFORE DELETE ON `raci_matrices`
WHEN OLD.status<>'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'RACI_MATRIX_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_raci_activities_locked_insert`
BEFORE INSERT ON `raci_activities`
WHEN (SELECT status FROM raci_matrices WHERE id=NEW.matrix_id)<>'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'RACI_MATRIX_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_raci_activities_locked_update`
BEFORE UPDATE ON `raci_activities`
WHEN (SELECT status FROM raci_matrices WHERE id=OLD.matrix_id)<>'DRAFT'
  OR (SELECT status FROM raci_matrices WHERE id=NEW.matrix_id)<>'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'RACI_MATRIX_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_raci_activities_locked_delete`
BEFORE DELETE ON `raci_activities`
WHEN (SELECT status FROM raci_matrices WHERE id=OLD.matrix_id)<>'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'RACI_MATRIX_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_raci_assignments_locked_insert`
BEFORE INSERT ON `raci_assignments`
WHEN (SELECT status FROM raci_matrices WHERE id=(SELECT matrix_id FROM raci_activities WHERE id=NEW.activity_id))<>'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'RACI_MATRIX_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_raci_assignments_locked_update`
BEFORE UPDATE ON `raci_assignments`
WHEN (SELECT status FROM raci_matrices WHERE id=(SELECT matrix_id FROM raci_activities WHERE id=OLD.activity_id))<>'DRAFT'
  OR (SELECT status FROM raci_matrices WHERE id=(SELECT matrix_id FROM raci_activities WHERE id=NEW.activity_id))<>'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'RACI_MATRIX_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_raci_assignments_locked_delete`
BEFORE DELETE ON `raci_assignments`
WHEN (SELECT status FROM raci_matrices WHERE id=(SELECT matrix_id FROM raci_activities WHERE id=OLD.activity_id))<>'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'RACI_MATRIX_LOCKED');
END;