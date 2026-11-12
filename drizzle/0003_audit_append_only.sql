-- audit_log is append-only (G-24): each row is written in the transaction of the change it describes and is
-- never changed or removed afterwards (a restore swaps the whole database file, it does not touch rows).
CREATE TRIGGER `audit_log_no_update` BEFORE UPDATE ON `audit_log`
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_log_no_delete` BEFORE DELETE ON `audit_log`
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
--> statement-breakpoint
-- K-38 defaults for the new per-role flag of 0002: Temizlik and Çalışan see only their own tasks.
UPDATE `roles` SET `tasks_own_only` = 1 WHERE `code` IN ('housekeeping', 'employee');
