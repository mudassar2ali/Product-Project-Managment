CREATE TRIGGER `trg_story_ready_insert`
BEFORE INSERT ON `backlog_items`
WHEN NEW.`item_type` = 'STORY' AND NEW.`status` = 'READY'
BEGIN
  SELECT RAISE(ABORT, 'STORY_NOT_READY');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_story_ready_update`
BEFORE UPDATE OF `status`, `story_actor`, `story_capability`, `business_value` ON `backlog_items`
WHEN NEW.`item_type` = 'STORY' AND NEW.`status` = 'READY' AND (
  length(trim(COALESCE(NEW.`story_actor`, ''))) = 0 OR
  length(trim(COALESCE(NEW.`story_capability`, ''))) = 0 OR
  length(trim(COALESCE(NEW.`business_value`, ''))) = 0 OR
  NOT EXISTS (SELECT 1 FROM `acceptance_criteria` WHERE `backlog_item_id` = NEW.`id`)
)
BEGIN
  SELECT RAISE(ABORT, 'STORY_NOT_READY');
END;
