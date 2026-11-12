// Holiday feeds for the yearly check (K-04; canli-dogrulama.md §3): Google Calendar's public "Holidays in Turkey"
// ICS (no key, has the arife and "kesin değil" notes, ~5 years ahead), Nager.Date as backup. Only the two feasts
// matter: fixed-date holidays are law, not estimates. Bridge days ("idari izin") are never taken as feast days.
import * as z from 'zod'
import { addDays, diffDays, localDate } from '@shared/date'
import type { HttpClient } from '../http'
import { SourceSchemaError } from '../fx/sources'

export type Feast = 'ramazan' | 'kurban'

export interface FeastStart {
  feast: Feast
  /** First full holiday day (the arife is the day before). */
  start: string
  /** The feed still says the dates are not final. */
  tentative: boolean
}

const FEAST_RE: Record<Feast, RegExp> = {
  ramazan: /ramazan bayram|şeker bayram|eid al[- ]fitr|ramadan feast/i,
  kurban: /kurban bayram|eid al[- ]adha|sacrifice feast/i
}
const EVE_RE = /arife|\beve\b/i
const BRIDGE_RE = /idari izin|köprü|tatil|bridge|\bholiday\b/i
const TENTATIVE_RE = /kesin değil|tentative|not confirmed|tahmini/i

interface IcsEvent {
  start: string
  summary: string
  description: string
}

/** VEVENTs of an ICS text (folded lines joined); throws when it is not a calendar. */
export function parseIcs(text: string): IcsEvent[] {
  if (!text.includes('BEGIN:VCALENDAR')) throw new SourceSchemaError('google-ics', 'not a calendar')
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const events: IcsEvent[] = []
  for (const block of unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? []) {
    const start = /DTSTART(?:;[^:\r\n]*)?:(\d{4})(\d{2})(\d{2})/.exec(block)
    const summary = /\nSUMMARY(?:;[^:\r\n]*)?:(.*)/.exec(block)?.[1]?.trim() ?? ''
    const description = /\nDESCRIPTION(?:;[^:\r\n]*)?:(.*)/.exec(block)?.[1]?.trim() ?? ''
    if (start) events.push({ start: `${start[1]}-${start[2]}-${start[3]}`, summary, description })
  }
  if (events.length === 0) throw new SourceSchemaError('google-ics', 'no events')
  return events
}

/**
 * Feast first days from calendar events: after an arife event its next day; without one, the first day of the
 * run of feast days (bridge days are never feast days).
 */
export function feastsFromEvents(events: readonly IcsEvent[]): FeastStart[] {
  const out: FeastStart[] = []
  for (const feast of ['ramazan', 'kurban'] as const) {
    const mine = events.filter((e) => FEAST_RE[feast].test(e.summary))
    const eves = mine.filter((e) => EVE_RE.test(e.summary))
    const days = mine.filter(
      (e) => !EVE_RE.test(e.summary) && !BRIDGE_RE.test(e.summary.replace(FEAST_RE[feast], ''))
    )
    const tentativeOf = (list: readonly IcsEvent[]): boolean =>
      list.some((e) => TENTATIVE_RE.test(e.summary) || TENTATIVE_RE.test(e.description))
    const seen = new Set<string>()
    for (const eve of eves) {
      const start = addDays(localDate(eve.start), 1)
      if (seen.has(start)) continue
      seen.add(start)
      const near = days.filter((d) => Math.abs(diffDays(start, localDate(d.start))) <= 4)
      out.push({ feast, start, tentative: tentativeOf([eve, ...near]) })
    }
    // Days without an arife event (some feeds leave it out): runs of consecutive days.
    const dates = [...new Set(days.map((d) => d.start))].sort()
    let runStart: string | null = null
    let prev: string | null = null
    const flush = (): void => {
      if (!runStart || !prev) return
      const covered = [...seen].some((s) => Math.abs(diffDays(localDate(s), localDate(runStart!))) <= 4)
      if (!covered) {
        const run = days.filter((d) => d.start >= runStart! && d.start <= prev!)
        out.push({ feast, start: runStart, tentative: tentativeOf(run) })
        seen.add(runStart)
      }
    }
    for (const d of dates) {
      if (prev && diffDays(localDate(prev), localDate(d)) === 1) prev = d
      else {
        flush()
        runStart = d
        prev = d
      }
    }
    flush()
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : 1))
}

export const GOOGLE_TR_HOLIDAYS =
  'https://calendar.google.com/calendar/ical/tr.turkish%23holiday%40group.v.calendar.google.com/public/basic.ics'

const nagerSchema = z.array(z.object({ date: z.string(), localName: z.string(), name: z.string() }).loose())

export type FeedResult =
  { kind: 'off' } | { kind: 'failed' } | { kind: 'ok'; source: 'google' | 'nager'; feasts: FeastStart[] }

/** Google first, Nager.Date for `years` when Google cannot be read. */
export async function fetchFeasts(http: HttpClient, years: readonly number[]): Promise<FeedResult> {
  const g = await http.get(GOOGLE_TR_HOLIDAYS, { Accept: 'text/calendar' })
  if (!g.ok && g.reason === 'off') return { kind: 'off' }
  if (g.ok && g.result.status === 200) {
    try {
      return { kind: 'ok', source: 'google', feasts: feastsFromEvents(parseIcs(g.result.text)) }
    } catch {
      // fall through to the backup
    }
  }
  const events: IcsEvent[] = []
  for (const year of years) {
    const n = await http.get(`https://date.nager.at/api/v3/PublicHolidays/${year}/TR`, {
      Accept: 'application/json'
    })
    if (!n.ok || n.result.status !== 200) return { kind: 'failed' }
    try {
      const list = nagerSchema.parse(JSON.parse(n.result.text))
      for (const h of list)
        events.push({ start: h.date, summary: `${h.localName} · ${h.name}`, description: '' })
    } catch {
      return { kind: 'failed' }
    }
  }
  return { kind: 'ok', source: 'nager', feasts: feastsFromEvents(events) }
}
