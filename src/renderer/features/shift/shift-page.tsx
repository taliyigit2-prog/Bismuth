// Vardiya devri ve notlar (G-95, akislar.md 09:00 and 21:00): the incoming shift reads the latest handover and
// says "Okudum"; the outgoing one writes its note on top of the automatic summary (§6.16); past handovers; notes to
// self and the board. The shift layout is the hotel's setting (shift_definitions). Desktop: handover column +
// notes column; phone: three tabs (G-143). `shift.unreadHandovers` also feeds the Today badge.
import { useTranslation } from 'react-i18next'
import { addDays } from '@shared/date'
import { datePart, localDateTimeOf, timePart } from '@shared/domain/local-datetime'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { combine, type ShiftView } from '../tasks/task-data'
import {
  HandoverHistory,
  UnreadHandover,
  WriteHandover,
  type HandoverSummary,
  type HandoverView
} from './handover-section'
import { BoardNotes, PersonalNotes, type NoteView } from './notes-section'
import { shiftAt } from './shifts'

const PHONE_TABS = ['handover', 'personal', 'board'] as const
/** Past handovers shown (days back from today). */
const HISTORY_DAYS = 14

function ShiftContent({
  shifts,
  unread,
  summary,
  history,
  notes
}: {
  shifts: ShiftView[]
  unread: HandoverView[]
  summary: HandoverSummary
  history: HandoverView[]
  notes: NoteView[]
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const can = useCan()
  const current = shiftAt(shifts, timePart(localDateTimeOf(new Date())))
  const canWrite = can('shift_notes', 'edit')
  const handover = (
    <div className="grid min-w-0 gap-4">
      <UnreadHandover list={unread} shifts={shifts} />
      {canWrite ? <WriteHandover summary={summary} current={current} shifts={shifts} /> : null}
      <HandoverHistory list={history} shifts={shifts} />
    </div>
  )
  if (isMobile)
    return (
      <Tabs defaultValue="handover" className="gap-4">
        <TabsList className="w-full">
          {PHONE_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="max-md:min-h-11">
              {t(`shift.tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="handover">{handover}</TabsContent>
        <TabsContent value="personal">
          <PersonalNotes notes={notes} />
        </TabsContent>
        <TabsContent value="board">
          <BoardNotes notes={notes} canEdit={canWrite} />
        </TabsContent>
      </Tabs>
    )
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      {handover}
      <div className="grid gap-4">
        <PersonalNotes notes={notes} />
        <BoardNotes notes={notes} canEdit={canWrite} />
      </div>
    </div>
  )
}

function ShiftSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="grid gap-4" aria-hidden>
        <Skeleton className="h-44" />
        <Skeleton className="h-80" />
      </div>
      <div className="grid gap-4" aria-hidden>
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    </div>
  )
}

export function ShiftPage() {
  const { t } = useTranslation()
  const today = datePart(localDateTimeOf(new Date()))
  const shifts = useApiQuery('shifts.list', {})
  const unread = useApiQuery('shift.unreadHandovers', {}, { refetchInterval: 60_000 })
  const summary = useApiQuery('shift.summary', {}, { refetchInterval: 60_000 })
  const history = useApiQuery('shift.handovers', { from: addDays(today, -HISTORY_DAYS), to: today })
  const notes = useApiQuery('notes.list', {}, { refetchInterval: 60_000 })
  const query = combine([shifts, unread, summary, history, notes] as const)
  return (
    <Page title={t('nav.shift')} description={t('shift.description')}>
      <QueryView query={query} loading={<ShiftSkeleton />}>
        {([shiftList, unreadList, sum, past, noteList]) => (
          <ShiftContent
            shifts={shiftList}
            unread={unreadList}
            summary={sum}
            history={past}
            notes={noteList}
          />
        )}
      </QueryView>
    </Page>
  )
}
