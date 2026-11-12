CREATE TABLE `employment_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `employment_periods_employee_idx` ON `employment_periods` (`employee_id`,`start_date`);--> statement-breakpoint
-- Existing cards: one period each, from the card's own start/end dates (P7fix B6).
INSERT INTO `employment_periods` (`id`, `employee_id`, `start_date`, `end_date`, `created_at`, `updated_at`)
SELECT 'ep-' || `id`, `id`, `start_date`, `end_date`, `created_at`, `updated_at` FROM `employees`;
