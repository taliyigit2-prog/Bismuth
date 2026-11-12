// The hourly PDF summary in Drive (faz-13 madde 8; G-145, S-62): when the hotel's computer is off, the owner opens
// `Drive'ım/Bismuth/ozet.pdf` with the Drive app on the phone and sees today and the month at a glance.
// No personal data at all — no guest names, no descriptor notes, no identity numbers, no staff names: the data
// gathered here is numbers only (the type has no field that could carry a name; a test checks the page too).
// This file gathers the numbers and builds the page; src/main/relay/summary-pdf.ts prints it (Electron).
import { addDays, localDateOf, type LocalDate } from '@shared/date'
import { formatDate, formatMoney, formatNumber, LOCALE_TAG, type AppLocale } from '@shared/format'
import type { Services } from '../services'
import { systemCtx } from '../services/context'

export interface SummaryData {
  hotelName: string
  generatedAt: string
  today: LocalDate
  baseCurrency: string
  day: {
    sellableRooms: number
    soldTonight: number
    arrivals: number | null
    departures: number | null
    inHouseRooms: number | null
    inHousePeople: number | null
    dirtyRooms: number | null
    openIssues: number | null
    /** Cash that should be in the drawer, per currency (minor units). */
    drawer: Record<string, number> | null
  }
  month: {
    from: LocalDate
    to: LocalDate
    occupancyBp: number
    soldNights: number
    sellableNights: number
    revenueMinor: number | null
    expensesMinor: number | null
    profitMinor: number | null
    adrMinor: number | null
  } | null
}

const attempt = <T>(fn: () => T): T | null => {
  try {
    return fn()
  } catch {
    return null
  }
}

/** The numbers of today and of the month so far, read as the program itself. */
export function collectSummary(services: Services, now: Date): SummaryData {
  const ctx = systemCtx()
  const settings = services.settings.get(ctx)
  const today = localDateOf(now)
  const lists = services.occupants.dayLists(ctx)
  const inHouse = attempt(() => services.occupants.inHouse(ctx))
  const board = attempt(() => services.housekeeping.board(ctx))
  const issues = attempt(() => services.roomIssues.list(ctx, {}))
  const drawer = attempt(() => services.ledger.drawerSummary(ctx).drawer as Record<string, number>)
  const first = `${today.slice(0, 8)}01` as LocalDate
  const month = attempt(() => services.reports.summary(ctx, { from: first, to: addDays(today, 1) }))
  return {
    hotelName: settings['hotel.name'],
    generatedAt: now.toISOString(),
    today,
    baseCurrency: settings['hotel.baseCurrency'],
    day: {
      sellableRooms: lists.sellableRooms,
      soldTonight: lists.soldTonight,
      arrivals: lists.arrivals?.length ?? null,
      departures: lists.departures?.length ?? null,
      inHouseRooms: inHouse?.length ?? null,
      inHousePeople: inHouse ? inHouse.reduce((n, r) => n + r.people, 0) : null,
      dirtyRooms: board ? board.rooms.filter((r) => r.hk === 'dirty').length : null,
      openIssues: issues ? issues.filter((i) => i.status !== 'resolved').length : null,
      drawer
    },
    month: month
      ? {
          from: first,
          to: today,
          occupancyBp: month.occupancy.occupancyBp,
          soldNights: month.occupancy.soldNights,
          sellableNights: month.occupancy.sellableNights,
          revenueMinor: month.finance?.revenueMinor ?? null,
          expensesMinor: month.finance?.expensesMinor ?? null,
          profitMinor: month.finance?.profitMinor ?? null,
          adrMinor: month.finance?.adrMinor ?? null
        }
      : null
  }
}

const esc = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )

export type Translate = (key: string, vars?: Record<string, string>) => string

/** The printable page (A4, plain HTML, no script, no outside resource). */
export function summaryHtml(data: SummaryData, locale: AppLocale, t: Translate): string {
  const n = (v: number | null): string => (v === null ? '—' : formatNumber(v, locale))
  const money = (minor: number | null, currency = data.baseCurrency): string =>
    minor === null ? '—' : formatMoney({ amountMinor: minor, currency }, locale)
  const pct = (bp: number): string =>
    new Intl.NumberFormat(LOCALE_TAG[locale], {
      style: 'percent',
      maximumFractionDigits: 1,
      numberingSystem: 'latn'
    }).format(bp / 10_000)
  const time = new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    numberingSystem: 'latn'
  }).format(new Date(data.generatedAt))
  const row = (label: string, value: string): string =>
    `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`
  const d = data.day
  const drawerText = d.drawer
    ? Object.entries(d.drawer)
        .filter(([, v]) => v !== 0)
        .map(([c, v]) => money(v, c))
        .join(' · ') || money(0)
    : '—'
  const dayRows = [
    row(t('summaryPdf.occupied'), `${n(d.soldTonight)} / ${n(d.sellableRooms)}`),
    row(t('summaryPdf.arrivals'), n(d.arrivals)),
    row(t('summaryPdf.departures'), n(d.departures)),
    row(
      t('summaryPdf.inHouse'),
      d.inHouseRooms === null
        ? '—'
        : t('summaryPdf.inHouseValue', { rooms: n(d.inHouseRooms), people: n(d.inHousePeople) })
    ),
    row(t('summaryPdf.dirty'), n(d.dirtyRooms)),
    row(t('summaryPdf.issues'), n(d.openIssues)),
    row(t('summaryPdf.drawer'), drawerText)
  ].join('')
  const m = data.month
  const monthRows = m
    ? [
        row(t('summaryPdf.occupancy'), `${pct(m.occupancyBp)} (${n(m.soldNights)} / ${n(m.sellableNights)})`),
        row(t('summaryPdf.revenue'), money(m.revenueMinor)),
        row(t('summaryPdf.expenses'), money(m.expensesMinor)),
        row(t('summaryPdf.profit'), money(m.profitMinor)),
        row(t('summaryPdf.adr'), money(m.adrMinor))
      ].join('')
    : row(t('summaryPdf.occupancy'), '—')
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${esc(t('summaryPdf.title'))}</title>
<style>
@page { size: A4; margin: 16mm; }
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: black; font-size: 12pt; }
h1 { font-size: 18pt; margin: 0 0 2mm; }
h2 { font-size: 13pt; margin: 8mm 0 2mm; }
p { margin: 0; color: dimgray; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 2mm 0; border-bottom: 0.3mm solid lightgray; text-align: start; }
td { text-align: end; font-variant-numeric: tabular-nums; }
.note { margin-top: 8mm; }
</style></head><body>
<h1>${esc(data.hotelName)}</h1>
<p>${esc(t('summaryPdf.updated', { date: formatDate(data.today, locale), time }))}</p>
<h2>${esc(t('summaryPdf.today'))}</h2>
<table>${dayRows}</table>
<h2>${esc(m ? t('summaryPdf.month', { from: formatDate(m.from, locale), to: formatDate(m.to, locale) }) : t('summaryPdf.monthTitle'))}</h2>
<table>${monthRows}</table>
<p class="note">${esc(t('summaryPdf.note'))}</p>
</body></html>`
}
