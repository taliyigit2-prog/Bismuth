// Automatic calendar cell status and how it combines with custom tags (03-mimari.md §6.3, §6.14; G-32, G-33,
// K-21). Colours are not decided here: the renderer maps the result to `--status-*` / tag colours.
import type { StatusKey } from '../contract/settings'
import type { NightPayStatus } from './payment-allocation'

export interface CellInput {
  /** Payment status of the night in this cell, null when no stay occupies it. */
  pay: NightPayStatus | null
  dayUse: boolean
  blocked: boolean
  /** The cell's date is before today. */
  past: boolean
}

/** The raw automatic status, before the hotel's enabled/disabled choices. */
export function autoStatus(cell: CellInput): StatusKey {
  if (cell.pay === null) return cell.blocked ? 'blocked' : cell.past ? 'pastEmpty' : 'empty'
  if (cell.dayUse) return 'dayuse'
  return cell.pay
}

export interface CustomTagLike {
  id: string
  enabled: boolean
  priorityOverAuto: boolean
}

export interface CellStyle {
  /** Automatic status shown after fallbacks; null = the hotel switched it off and nothing replaces it. */
  auto: StatusKey | null
  fill: { kind: 'auto'; code: StatusKey } | { kind: 'custom'; tagId: string } | null
  border: { kind: 'auto'; code: StatusKey } | { kind: 'custom'; tagId: string } | null
  /** Partly paid shown as unpaid because "kısmen" is off: a small deposit icon keeps the information. */
  depositIcon: boolean
}

/**
 * Fallbacks when an automatic tag is switched off: partial → unpaid (+ deposit icon), day-use → its payment
 * status, past-empty → empty; any other switched-off status shows no colour.
 */
export function resolveAuto(
  cell: CellInput,
  enabled: ReadonlySet<StatusKey>
): { code: StatusKey | null; depositIcon: boolean } {
  let code: StatusKey = autoStatus(cell)
  let depositIcon = false
  if (code === 'dayuse' && !enabled.has('dayuse')) code = cell.pay ?? 'empty'
  if (code === 'partial' && !enabled.has('partial')) {
    code = 'unpaid'
    depositIcon = true
  }
  if (code === 'pastEmpty' && !enabled.has('pastEmpty')) code = 'empty'
  return { code: enabled.has(code) ? code : null, depositIcon }
}

/**
 * §6.14: the automatic status fills the cell; a custom tag with `priorityOverAuto` takes the fill and pushes
 * the automatic status to the border, otherwise the first custom tag draws the border. Both stay visible.
 */
export function cellStyle(
  cell: CellInput,
  enabled: ReadonlySet<StatusKey>,
  customTags: readonly CustomTagLike[] = []
): CellStyle {
  const { code, depositIcon } = resolveAuto(cell, enabled)
  const auto = code ? ({ kind: 'auto', code } as const) : null
  const tags = cell.pay === null ? [] : customTags.filter((t) => t.enabled)
  const top = tags.find((t) => t.priorityOverAuto)
  if (top) return { auto: code, fill: { kind: 'custom', tagId: top.id }, border: auto, depositIcon }
  const first = tags[0]
  return {
    auto: code,
    fill: auto,
    border: first ? { kind: 'custom', tagId: first.id } : null,
    depositIcon
  }
}

export interface StandingNoteLike {
  standingNote?: string | null
  standingNoteLevel?: 'info' | 'warn' | null
}

/** §6.14, G-192: a guest's standing request shows when a reservation is written; "warn" needs a confirmation. */
export function standingNoteAlert(
  guest: StandingNoteLike
): { text: string; level: 'info' | 'warn'; requiresConfirm: boolean } | null {
  const text = guest.standingNote?.trim()
  if (!text) return null
  const level = guest.standingNoteLevel === 'warn' ? 'warn' : 'info'
  return { text, level, requiresConfirm: level === 'warn' }
}
