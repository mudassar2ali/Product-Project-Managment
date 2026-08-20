PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_signoff_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`document_version_id` text,
	`requirement_revision_id` text,
	`feasibility_revision_id` text,
	`release_id` text,
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
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_signoff_request_status" CHECK("__new_signoff_requests"."status" IN ('PENDING','UNDER_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED')),
	CONSTRAINT "ck_signoff_request_subject" CHECK(
    ("__new_signoff_requests"."document_version_id" IS NOT NULL AND "__new_signoff_requests"."requirement_revision_id" IS NULL AND "__new_signoff_requests"."feasibility_revision_id" IS NULL AND "__new_signoff_requests"."release_id" IS NULL)
    OR ("__new_signoff_requests"."document_version_id" IS NULL AND "__new_signoff_requests"."requirement_revision_id" IS NOT NULL AND "__new_signoff_requests"."feasibility_revision_id" IS NULL AND "__new_signoff_requests"."release_id" IS NULL)
    OR ("__new_signoff_requests"."document_version_id" IS NULL AND "__new_signoff_requests"."requirement_revision_id" IS NULL AND "__new_signoff_requests"."feasibility_revision_id" IS NOT NULL AND "__new_signoff_requests"."release_id" IS NULL)
    OR ("__new_signoff_requests"."document_version_id" IS NULL AND "__new_signoff_requests"."requirement_revision_id" IS NULL AND "__new_signoff_requests"."feasibility_revision_id" IS NULL AND "__new_signoff_requests"."release_id" IS NOT NULL)
  ),
	CONSTRAINT "ck_signoff_request_completion" CHECK(
    ("__new_signoff_requests"."status" IN ('PENDING','UNDER_REVIEW') AND "__new_signoff_requests"."completed_at" IS NULL)
    OR ("__new_signoff_requests"."status" IN ('APPROVED','APPROVED_WITH_CONDITIONS','REJECTED') AND "__new_signoff_requests"."completed_at" IS NOT NULL)
  ),
	CONSTRAINT "ck_signoff_request_numbers" CHECK("__new_signoff_requests"."version">0)
);
--> statement-breakpoint
INSERT INTO `__new_signoff_requests`("id", "document_version_id", "requirement_revision_id", "feasibility_revision_id", "release_id", "status", "requested_by", "requested_at", "completed_at", "version", "created_at", "created_by", "updated_at", "updated_by") SELECT "id", "document_version_id", "requirement_revision_id", "feasibility_revision_id", NULL, "status", "requested_by", "requested_at", "completed_at", "version", "created_at", "created_by", "updated_at", "updated_by" FROM `signoff_requests`;--> statement-breakpoint
DROP TABLE `signoff_requests`;--> statement-breakpoint
ALTER TABLE `__new_signoff_requests` RENAME TO `signoff_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_signoff_requests_active_document_version` ON `signoff_requests` (`document_version_id`) WHERE "signoff_requests"."status" IN ('PENDING','UNDER_REVIEW') AND "signoff_requests"."document_version_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_signoff_requests_active_requirement_revision` ON `signoff_requests` (`requirement_revision_id`) WHERE "signoff_requests"."status" IN ('PENDING','UNDER_REVIEW') AND "signoff_requests"."requirement_revision_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_signoff_requests_active_feasibility_revision` ON `signoff_requests` (`feasibility_revision_id`) WHERE "signoff_requests"."status" IN ('PENDING','UNDER_REVIEW') AND "signoff_requests"."feasibility_revision_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_signoff_requests_active_release` ON `signoff_requests` (`release_id`) WHERE "signoff_requests"."status" IN ('PENDING','UNDER_REVIEW') AND "signoff_requests"."release_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_signoff_requests_document_version` ON `signoff_requests` (`document_version_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_signoff_requests_requirement_revision` ON `signoff_requests` (`requirement_revision_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_signoff_requests_feasibility_revision` ON `signoff_requests` (`feasibility_revision_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_signoff_requests_release` ON `signoff_requests` (`release_id`,`status`);--> statement-breakpoint
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
  OR NEW.release_id IS NOT OLD.release_id
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
END;