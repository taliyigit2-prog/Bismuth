// Room detail (G-90, G-180, G-38): change the housekeeping state with one tap (and a note), who changed it last
// and when, who is in the room and today's movement, open issues (report a new one from here) and the block.
// Maintenance and out of order close the room for sale — a block on the calendar — so they need the block right.
// Right sheet on the desktop, bottom sheet on the phone.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  BanIcon,
  BrushCleaningIcon,
  CalendarRangeIcon,
  HistoryIcon,
  InfoIcon,
  LogInIcon,
  LogOutIcon,
  PlusIcon,
  StickyNoteIcon,
  UserRoundIcon,
  WrenchIcon
} from 'lucide-react'
import type { LocalDate } from '@shared/date'
import { closesRoom } from '@shared/domain/housekeeping'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { HK_DOT } from '@/components/floor-plan'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { SeverityBadge } from '@/features/issues/issue-parts'
import { useErrorText, useWhen } from '@/features/issues/issue-utils'
import { HK_STATES, typeLabelOf, type HkState, type RoomInfo } from './room-model'
import { useSetStatus } from './use-set-status'

function Block({
  icon: Icon,
  title,
  children
}: {
  icon: typeof InfoIcon
  title: string
  children: ReactNode
}) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="text-muted-foreground size-4" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  )
}

export function HkDot({ state, className }: { state: HkState; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full', HK_DOT[state], className)}
      aria-hidden
    />
  )
}

function RoomIssues({ roomId, today }: { roomId: string; today: LocalDate }) {
  const { t } = useTranslation()
  const when = useWhen(today)
  const issues = useApiQuery('housekeeping.issues', { roomId, status: ['open', 'planned'] })
  if (issues.isPending) return <Skeleton className="h-12 w-full" aria-label={t('common.loading')} />
  if (!issues.data?.length)
    return <p className="text-muted-foreground text-sm">{t('rooms.sheet.noIssues')}</p>
  return (
    <ul className="grid gap-2" data-testid="room-issues">
      {issues.data.map((issue) => (
        <li key={issue.id} className="grid gap-0.5 rounded-lg border px-3 py-2 text-sm">
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium break-words">{issue.title}</span>
            <SeverityBadge severity={issue.severity} />
          </span>
          <span className="text-muted-foreground text-xs">
            {t('rooms.sheet.reported', {
              name: issue.reportedByName ?? t('issues.sheet.someone'),
              date: when(issue.reportedAt)
            })}
          </span>
        </li>
      ))}
    </ul>
  )
}

function NoteEditor({ info }: { info: RoomInfo }) {
  const { t } = useTranslation()
  const errorText = useErrorText()
  const [note, setNote] = useState(info.hkNote ?? '')
  const save = useApiMutation('housekeeping.setNote', { invalidates: ['housekeeping.board'] })
  const changed = note.trim() !== (info.hkNote ?? '')
  // H-42: closing the sheet with an unsaved note saves it (nothing typed is lost silently).
  const pending = useRef<string | null>(null)
  const { mutate } = save
  const saved = useRef<string | null>(null)
  useEffect(() => {
    pending.current = changed && saved.current !== note.trim() ? note.trim() : null
  })
  useEffect(
    () => () => {
      if (pending.current !== null)
        mutate(
          { roomId: info.id, note: pending.current || null },
          { onSuccess: () => toast.success(t('rooms.sheet.noteSaved')) }
        )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`hk-note-${info.id}`}>{t('rooms.sheet.note')}</Label>
      <Textarea
        id={`hk-note-${info.id}`}
        rows={2}
        maxLength={200}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('rooms.sheet.notePlaceholder')}
      />
      <p className="text-muted-foreground text-xs">{t('rooms.sheet.noteHint')}</p>
      {changed ? (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              { roomId: info.id, note: note.trim() || null },
              {
                onSuccess: () => {
                  saved.current = note.trim()
                  pending.current = null
                  toast.success(t('rooms.sheet.noteSaved'))
                },
                onError: (e) => void toast.error(errorText(e))
              }
            )
          }
        >
          <StickyNoteIcon aria-hidden />
          {t('rooms.sheet.saveNote')}
        </Button>
      ) : null}
    </div>
  )
}

export function RoomSheet({
  info,
  today,
  showIssues,
  onReport,
  onOpenChange
}: {
  info: RoomInfo | null
  today: LocalDate
  showIssues: boolean
  onReport?: (roomId: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const can = useCan()
  const when = useWhen(today)
  const setStatus = useSetStatus()
  const editable = can('rooms.status', 'edit')
  const canBlock = can('rooms.block', 'edit')
  const muted = (text: string) => <p className="text-muted-foreground text-sm">{text}</p>
  return (
    <Sheet open={!!info} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'gap-0 overflow-y-auto',
          isMobile ? 'max-h-[92dvh] rounded-t-xl' : 'w-full sm:max-w-md'
        )}
        data-testid="room-sheet"
      >
        {info ? (
          <>
            <SheetHeader className="gap-2 border-b text-start">
              <div className="flex flex-wrap items-center gap-2 pe-8">
                <SheetTitle className="text-lg">{t('rooms.sheet.title', { room: info.number })}</SheetTitle>
                <Badge variant="outline" className="gap-1.5" data-testid="room-sheet-state">
                  <HkDot state={info.hk} />
                  {t(`hk.${info.hk}`)}
                </Badge>
              </div>
              <SheetDescription>
                {typeLabelOf(info, f)} · {t('rooms.beds', { count: info.beds })}
                {info.floor ? ` · ${t('rooms.floor', { floor: info.floor })}` : ''}
              </SheetDescription>
              {info.hkAt ? (
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <HistoryIcon className="size-3.5 shrink-0" aria-hidden />
                  {t('rooms.sheet.changed', {
                    name: info.hkByName ?? t('rooms.sheet.system'),
                    when: when(info.hkAt)
                  })}
                </p>
              ) : null}
            </SheetHeader>

            <div className="grid gap-5 p-4">
              {editable ? (
                <Block icon={BrushCleaningIcon} title={t('rooms.sheet.setStatus')}>
                  <div
                    className="grid grid-cols-2 gap-2"
                    role="group"
                    aria-label={t('rooms.sheet.setStatus')}
                  >
                    {HK_STATES.map((state) => {
                      const locked =
                        state !== info.hk && (closesRoom(state) || closesRoom(info.hk)) && !canBlock
                      return (
                        <Button
                          key={state}
                          variant={info.hk === state ? 'secondary' : 'outline'}
                          aria-pressed={info.hk === state}
                          disabled={locked || setStatus.isPending}
                          className={cn(
                            'h-auto min-h-10 justify-start py-2 whitespace-normal',
                            info.hk === state && 'ring-ring ring-1'
                          )}
                          onClick={() =>
                            setStatus.mutate({ roomId: info.id, number: info.number, status: state })
                          }
                          data-testid={`hk-set-${state}`}
                        >
                          <HkDot state={state} />
                          <span className="text-start">{t(`hk.${state}`)}</span>
                        </Button>
                      )
                    })}
                  </div>
                  <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                    <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
                    {canBlock ? t('rooms.sheet.closesHint') : t('rooms.sheet.blockRight')}
                  </p>
                  <NoteEditor key={`${info.id}-${info.hkAt ?? ''}`} info={info} />
                </Block>
              ) : info.hkNote ? (
                <Block icon={StickyNoteIcon} title={t('rooms.sheet.note')}>
                  <p className="text-sm break-words">{info.hkNote}</p>
                </Block>
              ) : null}

              <Separator />

              <Block icon={UserRoundIcon} title={t('rooms.sheet.guest')}>
                {info.guest ? (
                  <p className="text-sm font-medium">{info.guest}</p>
                ) : info.occupied ? (
                  muted(t('rooms.sheet.occupied'))
                ) : (
                  muted(t('rooms.sheet.noGuest'))
                )}
              </Block>

              <Block icon={CalendarRangeIcon} title={t('rooms.sheet.today')}>
                {info.arriving || info.departing ? (
                  <ul className="grid gap-1.5 text-sm">
                    {info.departing ? (
                      <li className="flex items-center gap-2">
                        <LogOutIcon className="text-warning size-4 shrink-0" aria-hidden />
                        {t('rooms.sheet.departing')}
                      </li>
                    ) : null}
                    {info.arriving ? (
                      <li className="flex items-center gap-2">
                        <LogInIcon className="text-success size-4 shrink-0" aria-hidden />
                        {t('rooms.sheet.arriving')}
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  muted(t('rooms.sheet.noMovement'))
                )}
              </Block>

              {showIssues ? (
                <Block icon={WrenchIcon} title={t('rooms.sheet.issues')}>
                  <RoomIssues roomId={info.id} today={today} />
                  {onReport && can('room_issues', 'edit') ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-self-start"
                      onClick={() => onReport(info.id)}
                    >
                      <PlusIcon aria-hidden />
                      {t('issues.report')}
                    </Button>
                  ) : null}
                </Block>
              ) : null}

              <Block icon={BanIcon} title={t('rooms.sheet.block')}>
                {info.block ? (
                  <div
                    className={cn(
                      'grid gap-0.5 rounded-lg border px-3 py-2 text-sm',
                      info.block.active && 'border-destructive/50 bg-destructive/5'
                    )}
                    data-testid="room-block"
                  >
                    <span className="font-medium">
                      {info.block.active
                        ? t(`rooms.blockKind.${info.block.kind}`)
                        : t('rooms.sheet.upcomingBlock')}
                    </span>
                    {info.block.reason ? <span className="break-words">{info.block.reason}</span> : null}
                    <span className="text-muted-foreground text-xs">
                      {f.dayMonth(info.block.dateFrom)} – {f.dayMonth(info.block.dateTo)}
                    </span>
                  </div>
                ) : closesRoom(info.hk) ? (
                  <p className="text-warning text-sm">{t('rooms.sheet.closedNoBlock')}</p>
                ) : (
                  muted(t('rooms.sheet.noBlock'))
                )}
              </Block>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
