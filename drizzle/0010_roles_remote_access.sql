ALTER TABLE `roles` ADD `remote_access` text DEFAULT 'anywhere' NOT NULL;--> statement-breakpoint
UPDATE `roles` SET `remote_access` = CASE WHEN `remote_allowed` = 1 THEN 'anywhere' ELSE 'off' END;
