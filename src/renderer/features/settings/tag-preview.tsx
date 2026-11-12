// Live calendar preview of the status tags (faz-03 madde 2, G-33): a small tape chart painted with the real
// §6.14 rule from the tags as they are being edited, plus the legend. Sample guests come from the demo hotel.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { STATUS_KEYS, type StatusKey } from '@shared/contract'
import { addDays, today as todayDate, type LocalDate } from '@shared/date'
import { cellStyle } from '@shared/domain/cell-status'
import type { NightPayStatus } from '@shared/domain/payment-allocation'
import { Legend, type LegendItem } from '@/components/legend'
import type { CellPaint, TapeBlock, TapeDay, TapeRoom, TapeStay } from '@/components/tape-chart/tape-chart'
import { TapeChart } from '@/components/tape-chart/tape-chart'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useTagStyles } from '@/lib/status-style'
import { cn } from '@/lib/utils'
import { demoHotel } from '@/mocks/demo-source'
import { tagLabel, type StatusTag } from './use-status-tags'

const DAYS = 6
const noop = (): void => {}

/**
 * The six days share the card's width (no empty strip after the last day); on the phone the room column is
 * narrow (number only) so all six fit. `@container` makes `100cqw` the preview's own width; the 6 is DAYS and the
 * 4px the chart's borders.
 */
const FIT_DAYS =
  '@container max-md:[--tape-room:4.5rem] [--tape-day:max(2.25rem,calc((100cqw_-_var(--tape-room)_-_4px)_/_6))]'

interface Sample {
  room: number
  from: number
  pays: NightPayStatus[]
  dayUse?: boolean
  tag?: 'priority' | 'border'
}

/** Every automatic status and both ways a custom tag can show (fill or border) in six days. */
const SAMPLES: Sample[] = [
  { room: 0, from: 0, pays: ['paid', 'paid'] },
  { room: 0, from: 3, pays: ['paid', 'partial', 'unpaid', 'unpaid'] },
  { room: 1, from: 1, pays: ['paid'], dayUse: true },
  { room: 1, from: 3, pays: ['unpaid', 'unpaid', 'unpaid'] },
  { room: 3, from: 0, pays: ['paid', 'partial', 'unpaid'], tag: 'priority' },
  { room: 3, from: 4, pays: ['partial', 'unpaid', 'unpaid'], tag: 'border' }
]

export function TagPreview({ tags }: { tags: StatusTag[] }) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const today = todayDate()
  const custom = tags.filter((tag) => tag.kind === 'custom')
  useTagStyles(custom)
  const enabled = useMemo(
    () =>
      new Set(
        tags
          .filter((tag) => tag.kind === 'auto' && tag.enabled)
          .map((tag) => tag.code)
          .filter((code): code is StatusKey => (STATUS_KEYS as readonly string[]).includes(code))
      ),
    [tags]
  )
  const from = addDays(today, -2)
  const guests = demoHotel(today).guests
  const rooms: TapeRoom[] = ['101', '102', '103', '104'].map((number, i) => ({
    id: `preview-${i}`,
    number,
    // The phone's narrow room column shows the number only.
    typeLabel: isMobile ? '' : t('settings.tags.sampleRoom'),
    beds: 2,
    hk: 'clean'
  }))
  const days: TapeDay[] = Array.from({ length: DAYS }, (_, i) => ({
    date: addDays(from, i),
    highlighted: false,
    special: null
  }))
  const firstOn = (priority: boolean) =>
    custom.find((tag) => tag.enabled && tag.priorityOverAuto === priority)
  const stays: TapeStay[] = SAMPLES.map((s, i) => {
    const tag = s.tag ? firstOn(s.tag === 'priority') : undefined
    const checkIn = addDays(from, s.from)
    const nights = s.pays.map((pay, n) => {
      const date = addDays(checkIn, n) as LocalDate
      return {
        date,
        style: cellStyle(
          { pay, dayUse: !!s.dayUse, blocked: false, past: date < today },
          enabled,
          tag ? [tag] : []
        )
      }
    })
    const g = guests[i]
    return {
      id: `preview-stay-${i}`,
      reservationId: `preview-res-${i}`,
      roomId: rooms[s.room]!.id,
      checkIn,
      checkOut: s.dayUse ? checkIn : addDays(checkIn, s.pays.length),
      dayUse: !!s.dayUse,
      guest: g ? `${g.firstName.slice(0, 1)}. ${g.lastName}` : '—',
      price: f.money(280_000),
      nights: nights.map((n) => ({ date: n.date, fill: n.style.fill as CellPaint })),
      border: (nights[0]?.style.border ?? null) as CellPaint,
      depositIcon: nights.some((n) => n.style.depositIcon),
      icons: nights.some((n) => n.style.depositIcon) ? ['deposit'] : [],
      inHouse: checkIn <= today
    }
  })
  const blocks: TapeBlock[] = [
    {
      id: 'preview-block',
      roomId: rooms[2]!.id,
      dateFrom: addDays(from, 3),
      dateTo: addDays(from, 6),
      kind: 'ooo',
      reason: t('settings.tags.sampleBlock')
    }
  ]
  const legend: LegendItem[] = [
    ...tags
      .filter((tag) => tag.kind === 'auto' && enabled.has(tag.code as StatusKey))
      .map((tag) => ({
        id: tag.id,
        subject: { kind: 'auto' as const, code: tag.code as StatusKey },
        label: tagLabel(tag, t),
        description: tag.description
      })),
    ...custom
      .filter((tag) => tag.enabled)
      .map((tag) => ({
        id: tag.id,
        subject: { kind: 'custom' as const, tagId: tag.id },
        label: tagLabel(tag, t),
        description: tag.description,
        asBorder: !tag.priorityOverAuto
      }))
  ]
  return (
    <div className={cn('grid min-w-0 gap-3', FIT_DAYS)} data-testid="tag-preview">
      <TapeChart
        rooms={rooms}
        days={days}
        today={today}
        stays={stays}
        blocks={blocks}
        pastEmptyOn={enabled.has('pastEmpty')}
        onOpenStay={noop}
        onOpenCell={noop}
        readOnly
        legend={legend}
      />
      <Legend items={legend} />
    </div>
  )
}
