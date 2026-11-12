-- 0003 closed UPDATE and DELETE on audit_log; INSERT OR REPLACE with an existing id would still rewrite a row
-- (REPLACE removes the old row without firing a DELETE trigger). A new row with a taken id is refused too.
CREATE TRIGGER `audit_log_no_replace` BEFORE INSERT ON `audit_log`
WHEN EXISTS (SELECT 1 FROM `audit_log` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
