// The calendar on a phone (faz-13 madde 6, G-143): the day list (arrivals, departures, staying, free rooms) or the
// seven-day view, switched at the top; the last choice is remembered on this phone.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DayList } from '@/features/calendar/day-list'
import { WeekList } from './week-list'

type View = 'day' | 'week'
const KEY = 'bismuth.mobileCalendarView'

function savedView(): View {
  try {
    return window.localStorage.getItem(KEY) === 'week' ? 'week' : 'day'
  } catch {
    return 'day'
  }
}

export function MobileCalendar({ onOpen }: { onOpen: (reservationId: string) => void }) {
  const { t } = useTranslation()
  const [view, setView] = useState<View>(savedView)
  const pick = (next: string): void => {
    const value: View = next === 'week' ? 'week' : 'day'
    setView(value)
    try {
      window.localStorage.setItem(KEY, value)
    } catch {
      // A private window: the choice lasts until the page closes.
    }
  }
  return (
    <div className="grid gap-4">
      <Tabs value={view} onValueChange={pick}>
        <TabsList className="grid w-full grid-cols-2" aria-label={t('calendar.week.viewLabel')}>
          <TabsTrigger value="day" className="min-h-11" data-testid="calendar-view-day">
            {t('calendar.week.dayView')}
          </TabsTrigger>
          <TabsTrigger value="week" className="min-h-11" data-testid="calendar-view-week">
            {t('calendar.week.weekView')}
          </TabsTrigger>
        </TabsList>
        {/* Each tab names its panel (aria-controls): a tab without one was an axe "critical" (faz-15 madde 5). */}
        <TabsContent value="day" className="mt-2">
          <DayList onOpen={onOpen} />
        </TabsContent>
        <TabsContent value="week" className="mt-2">
          <WeekList onOpen={onOpen} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
