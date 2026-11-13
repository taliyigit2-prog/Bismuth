CREATE TABLE `staff_faces` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`embedding_enc` blob NOT NULL,
	`model` text NOT NULL,
	`model_version` text,
	`enrolled_at` text NOT NULL,
	`enrolled_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enrolled_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `staff_faces_employee_idx` ON `staff_faces` (`employee_id`);