CREATE TRIGGER `trg_dependency_ready_update`
BEFORE UPDATE OF `status` ON `backlog_items`
WHEN NEW.`status` = 'READY' AND EXISTS (
  SELECT 1 FROM `backlog_dependencies` d
  JOIN `backlog_items` p ON p.`id` = d.`predecessor_item_id`
  WHERE d.`successor_item_id` = NEW.`id`
    AND d.`dependency_type` IN ('BLOCKS','REQUIRES')
    AND p.`status` <> 'DONE'
)
BEGIN
  SELECT RAISE(ABORT, 'UNRESOLVED_DEPENDENCY');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_dependency_predecessor_regression`
BEFORE UPDATE OF `status` ON `backlog_items`
WHEN OLD.`status` = 'DONE' AND NEW.`status` <> 'DONE' AND EXISTS (
  SELECT 1 FROM `backlog_dependencies` d
  JOIN `backlog_items` s ON s.`id` = d.`successor_item_id`
  WHERE d.`predecessor_item_id` = NEW.`id`
    AND d.`dependency_type` IN ('BLOCKS','REQUIRES')
    AND s.`status` = 'READY'
)
BEGIN
  SELECT RAISE(ABORT, 'READY_SUCCESSOR_DEPENDS_ON_ITEM');
END;
