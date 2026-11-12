// Room status rules (G-90, S-14, G-38, G-180): what a check-out does to a room's state, which states close the
// room for sale (a block on the calendar), and when an open issue counts as forgotten. Pure: used by the services
// and the screens alike.
import { diffDays, localDateOf, type LocalDate } from '../date'

export const HK_STATES = ['clean', 'dirty', 'inspected', 'maintenance', 'out_of_order'] as const
export type HkState = (typeof HK_STATES)[number]

/** States that take the room off sale: setting one opens a block on the calendar, leaving it ends the block. */
export const CLOSING_STATES: readonly HkState[] = ['maintenance', 'out_of_order']

export const closesRoom = (state: HkState): boolean => CLOSING_STATES.includes(state)

/** The calendar block kind of a closing state: maintenance = out of service, out of order = out of order. */
export const blockKindOf = (state: HkState): 'oos' | 'ooo' | null =>
  state === 'maintenance' ? 'oos' : state === 'out_of_order' ? 'ooo' : null

/**
 * State after a guest leaves the room (check-out, also a same-day stay's check-out and the old room of a room
 * move; S-14): the room needs cleaning. A room under maintenance or out of order keeps that state — it is
 * closed for sale until someone ends it, and the guest leaving does not reopen it.
 */
export const stateAfterCheckout = (current: HkState): HkState => (closesRoom(current) ? current : 'dirty')

/** An issue open this many days or more is shown red ("7 gündür açık"; G-180). */
export const ISSUE_STALE_DAYS = 7

/** Whole days an issue has been open on `today` (reported today = 0). */
export const issueAgeDays = (reportedAt: string, today: LocalDate): number =>
  Math.max(0, diffDays(localDateOf(new Date(reportedAt)), today))

/** Open or planned for ISSUE_STALE_DAYS days or more ("7 gündür açık"). */
export const isIssueStale = (
  issue: { status: 'open' | 'planned' | 'resolved'; reportedAt: string },
  today: LocalDate
): boolean => issue.status !== 'resolved' && issueAgeDays(issue.reportedAt, today) >= ISSUE_STALE_DAYS

export const ISSUE_SEVERITY_RANK = { urgent: 0, medium: 1, low: 2 } as const
