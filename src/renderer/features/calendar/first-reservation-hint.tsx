// The calendar of a hotel that has just been set up (faz-15 madde 2): an empty grid says nothing about what to do,
// so a short card above it does — click a free cell or "Yeni rezervasyon" (N) — with the guide's page on writing a
// reservation. It goes away by itself with the first guest: every reservation has one, so "no guest card at all"
// means "no reservation yet". On the desktop a stay in the grid hides it at once (`hidden`): the grid never jumps
// later, while someone is writing. Shown only to a role that may write reservations.
import { Link } from '@tanstack/react-router'
import { BookOpenIcon, CalendarPlusIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'

export function FirstReservationHint({ hidden = false }: { hidden?: boolean }) {
  const { t } = useTranslation()
  const can = useCan()
  // The phone's day list has no cells and the phone no keyboard: only the button.
  const isMobile = useIsMobile()
  const allowed = !hidden && can('calendar', 'edit') && can('guests')
  const guests = useApiQuery(
    'guests.list',
    { filter: 'all', sort: 'recent', offset: 0, limit: 1 },
    { enabled: allowed, staleTime: 30_000 }
  )
  if (!allowed || guests.data?.total !== 0) return null
  return (
    <section
      className="bg-accent/60 flex flex-wrap items-start gap-3 rounded-xl border p-4"
      aria-labelledby="first-reservation-title"
      data-testid="first-reservation-hint"
    >
      <span className="bg-background text-primary grid size-9 shrink-0 place-items-center rounded-full border">
        <CalendarPlusIcon className="size-4" aria-hidden />
      </span>
      <div className="grid min-w-0 flex-1 basis-64 gap-1">
        <h2 id="first-reservation-title" className="text-sm font-semibold">
          {t('calendar.firstRun.title')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {isMobile ? t('calendar.firstRun.bodyPhone') : t('calendar.firstRun.body')}
        </p>
      </div>
      <Button variant="outline" size="sm" className="self-center" asChild>
        <Link to="/guide" search={{ s: 'reservations' }}>
          <BookOpenIcon aria-hidden />
          {t('calendar.firstRun.guide')}
        </Link>
      </Button>
    </section>
  )
}
