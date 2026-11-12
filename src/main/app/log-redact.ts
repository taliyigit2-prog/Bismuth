// The error log (userData/logs/main.log, Faz 16 madde 2) holds no personal data: a guest's name, identity or
// passport number, phone, e-mail, IBAN or a note never reaches the file. Everything written through electron-log
// passes `redactLogData` (a hook in app/crash-wiring.ts): objects lose the values of personal fields whatever their
// shape, free text loses anything that looks like a phone, document or account number or an e-mail address. Names
// inside free text cannot be recognised, so callers log ids and codes, never a record's text (and the API logs the
// procedure name, never its input). No Electron import: tested with plain Node (electron-log/node).
import { join } from 'node:path'
import type { NodeLogger } from 'electron-log'

const HIDDEN = '[gizli]'

/**
 * Field names whose values are personal or free text (any case, any prefix: `guestName`, `before_json`, `phone2`).
 * Ids, codes, dates, statuses and amounts stay readable — they are what a developer needs to follow a fault.
 */
const PERSONAL_KEY =
  /name|phone|e-?mail|mail|note|text|address|descriptor|description|doc|passport|identity|kimlik|tckn|iban|tax|guest|occupant|person|comment|reason|body|title|json|secret|password|pin|token|cookie|code_?text|recovery|query|search|returned|^q$|key$/i

/** Keys that look personal by the pattern above but carry no personal data. */
const SAFE_KEYS = new Set(['messageKey'])

/** Separators people and copy-paste put inside numbers: space, no-break spaces, the non-breaking hyphen. */
const SEP = ' \\u00a0\\u202f\\u2007\\u2011'
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu
/** Any case, blocks split by spaces or hyphens ("tr33-0006-…"). */
const IBAN = new RegExp(
  `\\b[A-Z]{2}\\d{2}(?:[${SEP}-]?[A-Z0-9]{4}){3,7}(?:[${SEP}-]?[A-Z0-9]{1,4})?\\b`,
  'gi'
)
/** A passport or document number: one to three letters (any case) and six to nine digits. */
const DOCUMENT = /(?<![\p{L}\p{N}_])[A-Z]{1,3}\d{6,9}(?![\p{L}\p{N}_])/giu
/** ISO dates and times stay: they are when something happened, not who. Tried first at each position. */
const DATE_TIME = /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?/u
/**
 * Digits with the usual phone separators; masked when seven or more digits (phones, T.C. numbers, card numbers) —
 * also right after a label ("Tel:0532…", "T.C.1234…", "kimlik-1234…").
 */
const NUMBERISH = new RegExp(`(?<![\\p{L}\\p{N}_])\\+?\\d[\\d${SEP}().-]{5,}\\d(?![\\p{L}\\p{N}_])`, 'u')
const DATE_OR_NUMBER = new RegExp(`(${DATE_TIME.source})|${NUMBERISH.source}`, 'gu')

export function redactText(text: string): string {
  return text
    .replace(EMAIL, '[e-posta]')
    .replace(IBAN, '[iban]')
    .replace(DOCUMENT, '[belge]')
    .replace(DATE_OR_NUMBER, (match, date: string | undefined) =>
      date || match.replace(/\D/g, '').length < 7 ? match : '[numara]'
    )
}

const MAX_DEPTH = 6

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactText(value)
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'
  if (depth > MAX_DEPTH) return '[…]'
  seen.add(value)
  if (value instanceof Error) {
    // A copy with the same name, so the file still reads "SqliteError: …" with its stack.
    const copy = new Error(redactText(value.message))
    copy.name = value.name
    copy.stack = value.stack ? redactText(value.stack) : undefined
    const code = (value as { code?: unknown }).code
    if (typeof code === 'string' || typeof code === 'number') Object.assign(copy, { code })
    if (value.cause !== undefined) copy.cause = redactValue(value.cause, depth + 1, seen)
    return copy
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1, seen))
  if (value instanceof Date) return value
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    out[key] =
      !SAFE_KEYS.has(key) && PERSONAL_KEY.test(key) && v !== null && v !== undefined && typeof v !== 'boolean'
        ? HIDDEN
        : redactValue(v, depth + 1, seen)
  }
  return out
}

/** The arguments of one log call, cleaned (the originals are not changed). */
export function redactLogData(data: readonly unknown[]): unknown[] {
  const seen = new WeakSet<object>()
  return data.map((item) => redactValue(item, 0, seen))
}

/** The file part of electron-log the program sets (main process and electron-log/node share it). */
type FileLogger = Pick<NodeLogger, 'hooks'> & {
  transports: { file: Pick<NodeLogger['transports']['file'], 'resolvePathFn' | 'maxSize'> }
}

/** `<logsDir>/main.log`, at most 2 MB (one older file kept by electron-log); every line passes `redactLogData`. */
export function setUpErrorLog(log: FileLogger, logsDir: string): void {
  log.transports.file.resolvePathFn = () => join(logsDir, 'main.log')
  log.transports.file.maxSize = 2 * 1024 * 1024
  log.hooks.push((message) => ({ ...message, data: redactLogData(message.data) }))
}
