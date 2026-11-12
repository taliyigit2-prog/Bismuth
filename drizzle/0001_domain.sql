CREATE TABLE `recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recovery_codes_user_idx` ON `recovery_codes` (`user_id`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`path` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`width` integer,
	`height` integer,
	`created_by` text,
	`deleted_at` text,
	`deleted_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attachments_entity_idx` ON `attachments` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `room_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`date_from` text NOT NULL,
	`date_to` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`room_issue_id` text,
	`task_id` text,
	`cancelled_at` text,
	`cancelled_by` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `room_blocks_room_idx` ON `room_blocks` (`room_id`,`date_from`,`date_to`);--> statement-breakpoint
CREATE TABLE `room_capacity_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`valid_from` text NOT NULL,
	`active` integer NOT NULL,
	`sellable` integer NOT NULL,
	`beds` integer NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `room_capacity_changes_room_idx` ON `room_capacity_changes` (`room_id`,`valid_from`);--> statement-breakpoint
CREATE TABLE `room_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text,
	`title` text NOT NULL,
	`description` text,
	`severity` text NOT NULL,
	`status` text NOT NULL,
	`reported_by` text,
	`reported_at` text NOT NULL,
	`assigned_to` text,
	`planned_date` text,
	`resolved_at` text,
	`resolved_by` text,
	`resolution_note` text,
	`blocks_room` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `room_issues_room_idx` ON `room_issues` (`room_id`);--> statement-breakpoint
CREATE INDEX `room_issues_status_idx` ON `room_issues` (`status`);--> statement-breakpoint
CREATE INDEX `room_issues_reported_idx` ON `room_issues` (`reported_at`);--> statement-breakpoint
CREATE TABLE `room_types` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`name_i18n_json` text,
	`group` text NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`max_adults` integer,
	`max_children` integer,
	`bed_config_json` text,
	`size_m2` integer,
	`base_price_minor` integer,
	`weekend_price_minor` integer,
	`base_currency` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_types_code_unique` ON `room_types` (`code`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`floor` text,
	`room_type_id` text NOT NULL,
	`beds` integer DEFAULT 1 NOT NULL,
	`sellable` integer DEFAULT true NOT NULL,
	`notes` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`hk_status` text DEFAULT 'clean' NOT NULL,
	`hk_status_at` text,
	`hk_status_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_number_unique` ON `rooms` (`number`);--> statement-breakpoint
CREATE TABLE `blacklist` (
	`id` text PRIMARY KEY NOT NULL,
	`guest_id` text,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`id_doc_number` text,
	`phone_normalized` text,
	`severity` text NOT NULL,
	`reason_code` text NOT NULL,
	`reason_text` text NOT NULL,
	`incident_date` text,
	`added_by` text,
	`approved_by` text,
	`status` text DEFAULT 'active' NOT NULL,
	`removed_at` text,
	`removed_by` text,
	`removed_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `blacklist_name_idx` ON `blacklist` (`name_normalized`);--> statement-breakpoint
CREATE INDEX `blacklist_doc_idx` ON `blacklist` (`id_doc_number`);--> statement-breakpoint
CREATE INDEX `blacklist_phone_idx` ON `blacklist` (`phone_normalized`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`name_normalized` text NOT NULL,
	`address` text,
	`city` text,
	`tax_office` text,
	`tax_number` text,
	`phone` text,
	`email` text,
	`iban` text,
	`contact_person` text,
	`note` text,
	`favorite` integer DEFAULT false NOT NULL,
	`last_used_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `companies_name_idx` ON `companies` (`name_normalized`);--> statement-breakpoint
CREATE TABLE `guests` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`phone` text,
	`phone_normalized` text,
	`email` text,
	`nationality` text,
	`id_doc_type` text,
	`id_doc_number` text,
	`language` text,
	`vip` integer DEFAULT false NOT NULL,
	`standing_note` text,
	`standing_note_level` text DEFAULT 'info' NOT NULL,
	`notes` text,
	`company_id` text,
	`merged_into_id` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `guests_name_idx` ON `guests` (`name_normalized`);--> statement-breakpoint
CREATE INDEX `guests_phone_idx` ON `guests` (`phone_normalized`);--> statement-breakpoint
CREATE INDEX `guests_doc_idx` ON `guests` (`id_doc_number`);--> statement-breakpoint
CREATE TABLE `reservation_tags` (
	`reservation_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`reservation_id`, `tag_id`),
	FOREIGN KEY (`tag_id`) REFERENCES `status_tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `status_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`name` text,
	`name_i18n_json` text,
	`color` text,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`priority_over_auto` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `status_tags_code_unique` ON `status_tags` (`code`);--> statement-breakpoint
CREATE TABLE `charges` (
	`id` text PRIMARY KEY NOT NULL,
	`folio_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`room_night_id` text,
	`extra_service_id` text,
	`description` text NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`unit_minor` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`voided_at` text,
	`void_reason` text,
	`reversal_of_id` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`folio_id`) REFERENCES `folios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`extra_service_id`) REFERENCES `extra_services`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `charges_folio_idx` ON `charges` (`folio_id`);--> statement-breakpoint
CREATE INDEX `charges_date_idx` ON `charges` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `charges_room_night_unique` ON `charges` (`room_night_id`);--> statement-breakpoint
CREATE TABLE `extra_services` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`name_i18n_json` text,
	`default_price_minor` integer,
	`default_currency` text,
	`unit` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `extra_services_code_unique` ON `extra_services` (`code`);--> statement-breakpoint
CREATE TABLE `folios` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`reservation_id` text,
	`title` text,
	`currency` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folios_reservation_unique` ON `folios` (`reservation_id`);--> statement-breakpoint
CREATE TABLE `payment_methods` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`name_i18n_json` text,
	`group` text NOT NULL,
	`is_cash` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_methods_code_unique` ON `payment_methods` (`code`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`folio_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`method_id` text NOT NULL,
	`channel_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`amount_folio_minor` integer NOT NULL,
	`fx_rate_to_base` integer,
	`fx_rate_at` text,
	`fx_source` text,
	`amount_base_minor` integer,
	`reference` text,
	`note` text,
	`collected_at` text,
	`collected_by` text,
	`handover_id` text,
	`voided_at` text,
	`void_reason` text,
	`reversal_of_id` text,
	`created_by` text,
	`sold_by_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`folio_id`) REFERENCES `folios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`method_id`) REFERENCES `payment_methods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `sales_channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_folio_idx` ON `payments` (`folio_id`);--> statement-breakpoint
CREATE INDEX `payments_date_idx` ON `payments` (`date`);--> statement-breakpoint
CREATE INDEX `payments_collected_idx` ON `payments` (`collected_at`);--> statement-breakpoint
CREATE INDEX `payments_handover_idx` ON `payments` (`handover_id`);--> statement-breakpoint
CREATE TABLE `reservation_code_sequences` (
	`year` integer PRIMARY KEY NOT NULL,
	`last_number` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reservation_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`date` text,
	`text` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reservation_notes_reservation_idx` ON `reservation_notes` (`reservation_id`);--> statement-breakpoint
CREATE TABLE `reservation_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`room_id` text NOT NULL,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`checked_in_at` text,
	`checked_out_at` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reservation_rooms_reservation_idx` ON `reservation_rooms` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `reservation_rooms_room_idx` ON `reservation_rooms` (`room_id`,`check_in`,`check_out`);--> statement-breakpoint
CREATE INDEX `reservation_rooms_dates_idx` ON `reservation_rooms` (`check_in`,`check_out`);--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`primary_guest_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_ref` text,
	`status` text NOT NULL,
	`kind` text NOT NULL,
	`parked_reason` text,
	`parked_note` text,
	`adults` integer,
	`children` integer,
	`notes` text,
	`created_by` text,
	`cancelled_at` text,
	`cancel_reason` text,
	`sold_by_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`primary_guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `sales_channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_code_unique` ON `reservations` (`code`);--> statement-breakpoint
CREATE INDEX `reservations_guest_idx` ON `reservations` (`primary_guest_id`);--> statement-breakpoint
CREATE INDEX `reservations_status_idx` ON `reservations` (`status`);--> statement-breakpoint
CREATE TABLE `room_nights` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_room_id` text NOT NULL,
	`room_id` text NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`price_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`reservation_room_id`) REFERENCES `reservation_rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_nights_room_date_slot_unique` ON `room_nights` (`room_id`,`date`,`slot`);--> statement-breakpoint
CREATE INDEX `room_nights_stay_idx` ON `room_nights` (`reservation_room_id`);--> statement-breakpoint
CREATE INDEX `room_nights_date_idx` ON `room_nights` (`date`);--> statement-breakpoint
CREATE TABLE `sales_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`name_i18n_json` text,
	`kind` text NOT NULL,
	`default_collected_by` text DEFAULT 'hotel' NOT NULL,
	`commission_bp` integer,
	`active` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_channels_code_unique` ON `sales_channels` (`code`);--> statement-breakpoint
CREATE TABLE `stay_occupants` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_room_id` text NOT NULL,
	`guest_id` text,
	`full_name` text NOT NULL,
	`descriptor_note` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`arrived_at` text,
	`left_at` text,
	`kbs_reported_at` text,
	`kbs_reported_by` text,
	`kbs_checkout_at` text,
	`kbs_checkout_by` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`reservation_room_id`) REFERENCES `reservation_rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stay_occupants_stay_idx` ON `stay_occupants` (`reservation_room_id`);--> statement-breakpoint
CREATE TABLE `business_days` (
	`date` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_at` text,
	`closed_by` text,
	`note` text,
	`sort_pref` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cash_handovers` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`by_user` text,
	`note` text,
	`totals_json` text NOT NULL,
	`reverted_at` text,
	`reverted_by` text,
	`revert_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cash_handovers_at_idx` ON `cash_handovers` (`at`);--> statement-breakpoint
CREATE TABLE `expense_items` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`product_id` text NOT NULL,
	`qty_milli` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `expense_items_expense_idx` ON `expense_items` (`expense_id`);--> statement-breakpoint
CREATE INDEX `expense_items_product_idx` ON `expense_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `expense_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text,
	`name_i18n_json` text,
	`visibility_permission` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_sections_code_unique` ON `expense_sections` (`code`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`section_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`fx_rate_to_base` integer,
	`fx_rate_at` text,
	`fx_source` text,
	`amount_base_minor` integer,
	`description` text NOT NULL,
	`description_key` text NOT NULL,
	`vendor_contact_id` text,
	`kind` text DEFAULT 'manual' NOT NULL,
	`paid_from_drawer` integer DEFAULT false NOT NULL,
	`method_id` text,
	`settled_at` text,
	`handover_id` text,
	`employee_id` text,
	`staff_txn_id` text,
	`laundry_settlement_id` text,
	`voided_at` text,
	`void_reason` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`section_id`) REFERENCES `expense_sections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`method_id`) REFERENCES `payment_methods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`date`);--> statement-breakpoint
CREATE INDEX `expenses_key_idx` ON `expenses` (`description_key`);--> statement-breakpoint
CREATE INDEX `expenses_section_idx` ON `expenses` (`section_id`);--> statement-breakpoint
CREATE TABLE `employee_salaries` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`valid_from` text NOT NULL,
	`monthly_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `employee_salaries_employee_idx` ON `employee_salaries` (`employee_id`,`valid_from`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`position` text,
	`phone` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `employees_user_idx` ON `employees` (`user_id`);--> statement-breakpoint
CREATE TABLE `leave_records` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`note` text,
	`voided_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `leave_records_employee_idx` ON `leave_records` (`employee_id`,`date`);--> statement-breakpoint
CREATE TABLE `pay_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`employee_id` text,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pay_policies_lookup_idx` ON `pay_policies` (`scope`,`employee_id`,`key`);--> statement-breakpoint
CREATE TABLE `salary_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`locked_at` text,
	`locked_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `salary_periods_employee_month_unique` ON `salary_periods` (`employee_id`,`year`,`month`);--> statement-breakpoint
CREATE TABLE `staff_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`period_year` integer NOT NULL,
	`period_month` integer NOT NULL,
	`expense_id` text,
	`note` text,
	`voided_at` text,
	`void_reason` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `staff_transactions_period_idx` ON `staff_transactions` (`employee_id`,`period_year`,`period_month`);--> statement-breakpoint
CREATE TABLE `work_records` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`minutes_worked` integer DEFAULT 0 NOT NULL,
	`overtime_minutes` integer DEFAULT 0 NOT NULL,
	`kind` text DEFAULT 'normal' NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `work_records_employee_idx` ON `work_records` (`employee_id`,`date`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`category` text NOT NULL,
	`custom_category` text,
	`phones_json` text NOT NULL,
	`address` text,
	`email` text,
	`note` text,
	`favorite` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contacts_name_idx` ON `contacts` (`name_normalized`);--> statement-breakpoint
CREATE TABLE `laundry_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`direction` text NOT NULL,
	`laundry_contact_id` text NOT NULL,
	`slip_no` text,
	`note` text,
	`voided_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`laundry_contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `laundry_deliveries_date_idx` ON `laundry_deliveries` (`laundry_contact_id`,`date`);--> statement-breakpoint
CREATE TABLE `laundry_delivery_items` (
	`delivery_id` text NOT NULL,
	`item_type_id` text NOT NULL,
	`qty` integer NOT NULL,
	`stained_qty` integer DEFAULT 0 NOT NULL,
	`slip_unit_price_minor` integer,
	`amount_minor` integer,
	PRIMARY KEY(`delivery_id`, `item_type_id`),
	FOREIGN KEY (`delivery_id`) REFERENCES `laundry_deliveries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_type_id`) REFERENCES `laundry_item_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `laundry_item_types` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`name` text,
	`name_i18n_json` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `laundry_item_types_code_unique` ON `laundry_item_types` (`code`);--> statement-breakpoint
CREATE TABLE `laundry_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`laundry_contact_id` text NOT NULL,
	`item_type_id` text NOT NULL,
	`valid_from` text NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`laundry_contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_type_id`) REFERENCES `laundry_item_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `laundry_prices_lookup_idx` ON `laundry_prices` (`laundry_contact_id`,`item_type_id`,`valid_from`);--> statement-breakpoint
CREATE TABLE `laundry_settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`laundry_contact_id` text NOT NULL,
	`period_year` integer NOT NULL,
	`period_month` integer NOT NULL,
	`computed_qty_json` text NOT NULL,
	`computed_total_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`invoiced_total_minor` integer,
	`difference_minor` integer,
	`note` text,
	`expense_id` text,
	`settled_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`laundry_contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `laundry_settlements_period_unique` ON `laundry_settlements` (`laundry_contact_id`,`period_year`,`period_month`);--> statement-breakpoint
CREATE TABLE `product_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`name` text,
	`name_i18n_json` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_categories_code_unique` ON `product_categories` (`code`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`category_id` text NOT NULL,
	`supplier_contact_id` text,
	`unit` text NOT NULL,
	`track_stock` integer DEFAULT false NOT NULL,
	`stock_qty_milli` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `product_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name_normalized`);--> statement-breakpoint
CREATE TABLE `calendar_days` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`title` text,
	`title_i18n_json` text,
	`note` text,
	`color` text,
	`source` text NOT NULL,
	`estimated` integer DEFAULT false NOT NULL,
	`generator` text,
	`group_key` text,
	`recurring_yearly` integer DEFAULT false NOT NULL,
	`generated_year` integer,
	`cancelled_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `calendar_days_date_idx` ON `calendar_days` (`date`);--> statement-breakpoint
CREATE INDEX `calendar_days_group_idx` ON `calendar_days` (`group_key`);--> statement-breakpoint
CREATE TABLE `calendar_generation` (
	`year` integer PRIMARY KEY NOT NULL,
	`generated_at` text NOT NULL,
	`verified_at` text,
	`source_version` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lost_items` (
	`id` text PRIMARY KEY NOT NULL,
	`found_at` text NOT NULL,
	`room_id` text,
	`location_text` text,
	`found_by` text,
	`description` text NOT NULL,
	`storage_location` text,
	`status` text DEFAULT 'stored' NOT NULL,
	`returned_to` text,
	`returned_at` text,
	`note` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lost_items_found_idx` ON `lost_items` (`found_at`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`owner_user_id` text,
	`text` text NOT NULL,
	`remind_at` text,
	`pinned` integer DEFAULT false NOT NULL,
	`done_at` text,
	`archived_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notes_owner_idx` ON `notes` (`kind`,`owner_user_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text,
	`user_id` text,
	`title` text NOT NULL,
	`body` text,
	`due_at` text NOT NULL,
	`read_at` text,
	`dismissed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_due_idx` ON `notifications` (`due_at`);--> statement-breakpoint
CREATE TABLE `shift_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`name` text,
	`name_i18n_json` text,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shift_handovers` (
	`id` text PRIMARY KEY NOT NULL,
	`business_date` text NOT NULL,
	`from_shift_id` text,
	`to_shift_id` text,
	`written_by` text,
	`written_at` text NOT NULL,
	`text` text,
	`summary_json` text NOT NULL,
	`acknowledged_by` text,
	`acknowledged_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_handovers_date_idx` ON `shift_handovers` (`business_date`);--> statement-breakpoint
CREATE TABLE `task_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`title` text,
	`title_i18n_json` text,
	`description` text,
	`kind` text NOT NULL,
	`assignee_user_id` text,
	`assignee_role_id` text,
	`assignee_shift_id` text,
	`room_id` text,
	`recurrence_json` text NOT NULL,
	`first_due_at` text,
	`remind_minutes_before` integer,
	`suggested` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_done_at` text,
	`materialized_until` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_templates_code_unique` ON `task_templates` (`code`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text,
	`title` text NOT NULL,
	`description` text,
	`assignee_user_id` text,
	`assignee_role_id` text,
	`assignee_shift_id` text,
	`room_id` text,
	`due_at` text,
	`status` text DEFAULT 'open' NOT NULL,
	`done_at` text,
	`done_by` text,
	`cancel_reason` text,
	`note` text,
	`overdue_notified_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_template_due_unique` ON `tasks` (`template_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_status_due_idx` ON `tasks` (`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`kind` text NOT NULL,
	`location` text DEFAULT 'local' NOT NULL,
	`encrypted` integer DEFAULT false NOT NULL,
	`chunks` integer,
	`note` text,
	`restored_at` text,
	`db_day` text
);
--> statement-breakpoint
CREATE INDEX `backups_created_idx` ON `backups` (`created_at`);--> statement-breakpoint
CREATE TABLE `country_map` (
	`key_normalized` text PRIMARY KEY NOT NULL,
	`raw_example` text NOT NULL,
	`iso2` text,
	`ministry_name_tr` text,
	`source` text NOT NULL,
	`confirmed_by` text,
	`confirmed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text NOT NULL,
	`base` text NOT NULL,
	`quote` text NOT NULL,
	`mid_rate_micro` integer NOT NULL,
	`source` text NOT NULL,
	`provider` text,
	`is_manual` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fx_rates_unique` ON `fx_rates` (`ts`,`base`,`quote`,`source`);--> statement-breakpoint
CREATE INDEX `fx_rates_pair_idx` ON `fx_rates` (`base`,`quote`,`ts`);--> statement-breakpoint
CREATE TABLE `kbs_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`period_year` integer NOT NULL,
	`period_month` integer NOT NULL,
	`file_name` text NOT NULL,
	`imported_at` text NOT NULL,
	`row_count` integer NOT NULL,
	`same_day_count` integer NOT NULL,
	`active_count` integer NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kbs_stay_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`arrival_at` text NOT NULL,
	`departure_at` text,
	`room_no` text NOT NULL,
	`gender` text,
	`nationality_raw` text NOT NULL,
	`nationality_iso` text,
	`status_raw` text,
	`nights_computed` integer NOT NULL,
	`nights_basis` text NOT NULL,
	`counted_until` text,
	`in_period` integer NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `kbs_imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `kbs_stay_rows_import_idx` ON `kbs_stay_rows` (`import_id`);--> statement-breakpoint
ALTER TABLE `roles` ADD `code` text;--> statement-breakpoint
ALTER TABLE `roles` ADD `name_i18n_json` text;--> statement-breakpoint
CREATE UNIQUE INDEX `roles_code_unique` ON `roles` (`code`);