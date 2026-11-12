// What the audit log records as an action (G-24). One list for the services that write it and the screen that
// names it: an action without a label would show its raw name.
export const AUDIT_ACTIONS = [
  'create',
  'update',
  'void',
  'cancel',
  /** A reservation moved under the calendar (G-39) and one that did not come (G-42). */
  'park',
  'no_show',
  'restore',
  'check_in',
  'check_out',
  'handover',
  'handover_revert',
  'merge',
  'close',
  'reopen',
  'acknowledge',
  /** Only configuration that nothing refers to (an unused custom status tag); records are voided instead. */
  'delete',
  /** Configuration taken out of use but kept (a removed role). */
  'archive',
  'done',
  'file_delete',
  'import',
  /** Data taken out of the program: a table export, the Bismuth key shown on screen (Faz 14). */
  'export',
  'login',
  'login_failed',
  /** A wrong current password on a signed-in account (password, PIN or recovery code change). */
  'reauth_failed',
  'logout',
  'backup'
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/**
 * Reasons the program writes itself are codes, not text (yasak 8): the screen names them in the reader's language.
 * A person's own reason is shown as written.
 */
export const AUDIT_REASON_CODES = { import: 'audit.importReason' } as const
export type AuditReasonCode = keyof typeof AUDIT_REASON_CODES
/** The reason of every write an import makes (the audit row and the closed-day guard, G-72; Faz 14). */
export const IMPORT_AUDIT_REASON: AuditReasonCode = 'import'

/** Translation key of a reason the program wrote; null for a person's own text. */
export function auditReasonKey(reason: string): (typeof AUDIT_REASON_CODES)[AuditReasonCode] | null {
  return Object.hasOwn(AUDIT_REASON_CODES, reason) ? AUDIT_REASON_CODES[reason as AuditReasonCode] : null
}
