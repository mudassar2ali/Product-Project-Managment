CREATE TABLE `requirement_backlog_links` (
	`id` text PRIMARY KEY NOT NULL,
	`requirement_id` text NOT NULL,
	`backlog_item_id` text NOT NULL,
	`link_type` text NOT NULL,
	`coverage_percentage` integer,
	`rationale` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`backlog_item_id`) REFERENCES `backlog_items`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_requirement_backlog_link_type" CHECK("requirement_backlog_links"."link_type" IN ('IMPLEMENTS','PARTIALLY_IMPLEMENTS','VALIDATES')),
	CONSTRAINT "ck_requirement_backlog_link_fields" CHECK(length("requirement_backlog_links"."rationale")<=2000),
	CONSTRAINT "ck_requirement_backlog_link_coverage" CHECK(
    ("requirement_backlog_links"."link_type"='PARTIALLY_IMPLEMENTS' AND "requirement_backlog_links"."coverage_percentage" IS NOT NULL AND "requirement_backlog_links"."coverage_percentage" BETWEEN 1 AND 99 AND length(trim("requirement_backlog_links"."rationale"))>0)
    OR ("requirement_backlog_links"."link_type"<>'PARTIALLY_IMPLEMENTS' AND "requirement_backlog_links"."coverage_percentage" IS NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_backlog_links_edge` ON `requirement_backlog_links` (`requirement_id`,`backlog_item_id`,`link_type`);--> statement-breakpoint
CREATE INDEX `idx_requirement_backlog_links_requirement` ON `requirement_backlog_links` (`requirement_id`,`link_type`);--> statement-breakpoint
CREATE INDEX `idx_requirement_backlog_links_backlog_item` ON `requirement_backlog_links` (`backlog_item_id`);--> statement-breakpoint
CREATE TABLE `requirement_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`source_requirement_id` text NOT NULL,
	`target_requirement_id` text NOT NULL,
	`relationship_type` text NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`source_requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`target_requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_requirement_relationship_type" CHECK("requirement_relationships"."relationship_type" IN ('DERIVES_FROM','DEPENDS_ON','CONFLICTS_WITH','DUPLICATES')),
	CONSTRAINT "ck_requirement_relationship_not_self" CHECK("requirement_relationships"."source_requirement_id"<>"requirement_relationships"."target_requirement_id"),
	CONSTRAINT "ck_requirement_relationship_fields" CHECK(length("requirement_relationships"."rationale")<=2000 AND "requirement_relationships"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_relationships_edge` ON `requirement_relationships` (`source_requirement_id`,`target_requirement_id`,`relationship_type`);--> statement-breakpoint
CREATE INDEX `idx_requirement_relationships_source` ON `requirement_relationships` (`source_requirement_id`,`relationship_type`);--> statement-breakpoint
CREATE INDEX `idx_requirement_relationships_target` ON `requirement_relationships` (`target_requirement_id`,`relationship_type`);