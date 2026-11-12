// Floor plan of the rooms (faz-03, Faz 9 lets the owner draw it): one band per floor, top floor first, each
// room a tile with its housekeeping state, who is in it and today's movement (arrival / departure).
import { useTranslation } from 'react-i18next'
import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  BanIcon,
  BedDoubleIcon,
  UserRoundIcon,
  WrenchIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type HkState = 'clean' | 'dirty' | 'inspected' | 'maintenance' | 'out_of_order'

export interface PlanRoom {
  id: string
  number: string
  floor: number
  typeLabel: string
  beds: number
  hk: HkState
  guest: string | null
  arriving: boolean
  departing: boolean
  issues: number
  /** Closed for sale today (a block on the calendar). */
  blocked?: boolean
}

export const HK_TILE: Record<HkState, string> = {
  clean: 'border-hk-clean',
  dirty: 'border-hk-dirty',
  inspected: 'border-hk-inspected',
  maintenance: 'border-hk-maintenance',
  out_of_order: 'border-hk-ooo'
}

export const HK_DOT: Record<HkState, string> = {
  clean: 'bg-hk-clean',
  dirty: 'bg-hk-dirty',
  inspected: 'bg-hk-inspected',
  maintenance: 'bg-hk-maintenance',
  out_of_order: 'bg-hk-ooo'
}

const LG_COLS = [
  'lg:grid-cols-1',
  'lg:grid-cols-2',
  'lg:grid-cols-3',
  'lg:grid-cols-4',
  'lg:grid-cols-5',
  'lg:grid-cols-6'
] as const

export function FloorPlan({ rooms, onSelect }: { rooms: PlanRoom[]; onSelect?: (roomId: string) => void }) {
  const { t } = useTranslation()
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => b - a)
  // As many desktop columns as the busiest floor has rooms, so tiles fill the row instead of leaving a gap.
  const widest = Math.max(1, ...floors.map((fl) => rooms.filter((r) => r.floor === fl).length))
  const lgCols = LG_COLS[Math.min(widest, 6) - 1]
  return (
    <div className="grid gap-3" data-testid="floor-plan">
      {floors.map((floor) => (
        <section
          key={floor}
          className="grid grid-cols-[3.5rem_1fr] items-stretch gap-3"
          aria-label={t('roomPicker.floor', { floor })}
        >
          <div className="bg-muted text-muted-foreground grid place-items-center rounded-lg text-xs font-semibold">
            {t('floorPlan.floorShort', { floor })}
          </div>
          <ul className={cn('grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4', lgCols)}>
            {rooms
              .filter((r) => r.floor === floor)
              .map((r) => (
                <li key={r.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelect?.(r.id)}
                    data-testid={`plan-room-${r.number}`}
                    className={cn(
                      'bg-card focus-visible:ring-ring hover:bg-accent grid h-full w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-1 overflow-hidden rounded-lg border-2 p-2.5 text-start outline-none focus-visible:ring-[3px]',
                      HK_TILE[r.hk]
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-lg font-semibold tabular-nums">{r.number}</span>
                      <span className={cn('size-2.5 shrink-0 rounded-full', HK_DOT[r.hk])} aria-hidden />
                      <span
                        className="text-muted-foreground min-w-0 truncate text-xs"
                        title={t(`hk.${r.hk}`)}
                      >
                        {t(`hk.${r.hk}`)}
                      </span>
                      {r.issues || r.blocked ? (
                        <span className="ms-auto flex shrink-0 items-center gap-1">
                          {r.issues ? (
                            <WrenchIcon
                              className="text-hk-maintenance size-4"
                              aria-label={t('floorPlan.issues', { count: r.issues })}
                            />
                          ) : null}
                          {r.blocked ? (
                            <BanIcon
                              className="text-destructive size-4"
                              aria-label={t('floorPlan.blocked')}
                            />
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
                      <BedDoubleIcon className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{r.typeLabel}</span>
                    </span>
                    <span className="flex min-h-5 min-w-0 items-center gap-1.5 text-xs">
                      {r.guest ? (
                        <>
                          <UserRoundIcon className="size-3.5 shrink-0" aria-hidden />
                          <span className="min-w-0 truncate font-medium" title={r.guest}>
                            {r.guest}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{t('floorPlan.vacant')}</span>
                      )}
                      {r.arriving ? (
                        <ArrowDownToLineIcon
                          className="text-success ms-auto size-3.5 shrink-0"
                          aria-label={t('floorPlan.arriving')}
                        />
                      ) : null}
                      {r.departing ? (
                        <ArrowUpFromLineIcon
                          className="text-warning ms-auto size-3.5 shrink-0"
                          aria-label={t('floorPlan.departing')}
                        />
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
