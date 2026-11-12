ALTER TABLE `room_capacity_changes` ADD `cancelled_at` text;--> statement-breakpoint
ALTER TABLE `room_capacity_changes` ADD `cancelled_by` text;--> statement-breakpoint
ALTER TABLE `calendar_generation` ADD `country` text;