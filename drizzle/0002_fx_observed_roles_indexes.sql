ALTER TABLE `roles` ADD `tasks_own_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `fx_rate_observed_at` text;--> statement-breakpoint
ALTER TABLE `expenses` ADD `fx_rate_observed_at` text;--> statement-breakpoint
CREATE INDEX `expenses_drawer_idx` ON `expenses` (`paid_from_drawer`,`settled_at`);--> statement-breakpoint
CREATE INDEX `reservation_rooms_status_idx` ON `reservation_rooms` (`status`);--> statement-breakpoint
CREATE INDEX `stay_occupants_guest_idx` ON `stay_occupants` (`guest_id`);--> statement-breakpoint
CREATE INDEX `fx_rates_source_idx` ON `fx_rates` (`base`,`quote`,`source`,`ts`);