// Shift handover (G-95 a, §6.16): the incoming shift reads the unread handover and says "Okudum" (who and when
// are kept); the outgoing shift writes a note on top of the automatic summary, which the service computes from the
// records (tek giriş, G-60) and stores as a snapshot — nothing in it is typed. Past handovers with who read them.
// Every part of the summary follows the reader's rights: a part the role may not see does not come at all.
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ArrowRightIcon,
  CheckCheckIcon,
  CheckIcon,
  ClockIcon,
  DoorOpenIcon,
  HistoryIcon,
  LogInIcon,
  MessageSquareTextIcon,
  MoonStarIcon,
  PenLineIcon,
  ShieldAlertIcon,
  SparklesIcon,
  WalletIcon,
  WrenchIcon
} from 'lucide-react'
import type { ProcedureOutput } from '@shared/contract'
import { localDateOf } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { shiftName, taskTitle, useErrorText, type ShiftView } from '../tasks/task-data'
import { nextShift } from './shifts'

export type HandoverView = ProcedureOutput<'shift.handovers'>[number]
export type HandoverSummary = ProcedureOutput<'shift.summary'>

const dayOf = (iso: string) => localDateOf(new Date(iso))
const SHIFT_QUERIES = ['shift.unreadHandovers', 'shift.handovers', 'shift.summary'] as const

export function ShiftChip({ shift }: { shift: ShiftView | undefined }) {
  const f = useFormat()
  if (!shift) return null
  return (
    <span className="bg-muted inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium">
      <ClockIcon className="text-muted-foreground size-3.5" aria-hidden />
      {shiftName(f, shift)}
      <span className="text-muted-foreground font-normal tabular-nums" dir="ltr">
        {shift.startTime}–{shift.endTime}
      </span>
    </span>
  )
}

function ShiftPair({ from, to }: { from: ShiftView | undefined; to: ShiftView | undefined }) {
  if (!from && !to) return null
  return (
    <span className="inline-flex flex-col items-start gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
      <ShiftChip shift={from} />
      {from && to ? (
        <ArrowRightIcon
          className="text-muted-foreground ms-2 size-3.5 rotate-90 sm:ms-0 sm:rotate-0 sm:rtl:rotate-180"
          aria-hidden
        />
      ) : null}
      <ShiftChip shift={to} />
    </span>
  )
}

/** The handover's figures at the moment it was written, as small chips (only the parts the reader may see). */
export function SnapshotChips({ summary }: { summary: HandoverSummary }) {
  const { t } = useTranslation()
  const f = useFormat()
  const items: { key: string; label: string; value: string; loud?: boolean }[] = []
  const count = (key: string, label: string, list: unknown[] | null, loud = false): void => {
    if (list) items.push({ key, label, value: f.number(list.length), loud: loud && list.length > 0 })
  }
  count('arrivals', t('shift.snapshot.arrivals'), summary.arrivalsPending)
  count('overdue', t('shift.snapshot.overdue'), summary.overdueCheckouts, true)
  count('kbs', t('shift.snapshot.kbsGaps'), summary.kbsMissing, true)
  count('unpaid', t('shift.snapshot.unpaid'), summary.unpaid)
  count('tasks', t('shift.snapshot.openTasks'), summary.openTasks)
  count('issues', t('shift.snapshot.issues'), summary.openIssues)
  if (summary.cash)
    for (const [currency, amount] of Object.entries(summary.cash.drawer))
      items.push({
        key: `cash-${currency}`,
        label: t('shift.snapshot.drawer'),
        value: f.money(amount, currency)
      })
  if (!items.length) return null
  return (
    <dl className="flex flex-wrap gap-2" data-testid="handover-snapshot">
      {items.map((item) => (
        <div
          key={item.key}
          className={cn(
            'flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-xs',
            item.loud && 'border-destructive/50 bg-destructive/5 text-destructive'
          )}
        >
          <dt className={cn(!item.loud && 'text-muted-foreground')}>{item.label}</dt>
          <dd className="font-semibold tabular-nums">
            <bdi>{item.value}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function UnreadHandover({ list, shifts }: { list: HandoverView[]; shifts: readonly ShiftView[] }) {
  const { t } = useTranslation()
  const f = useFormat()
  const errorText = useErrorText()
  const read = useApiMutation('shift.acknowledge', { invalidates: SHIFT_QUERIES })
  const handover = list[0]
  if (!handover)
    return (
      <SectionCard title={t('shift.unread.title')} icon={MessageSquareTextIcon} testId="handover-unread">
        <p className="text-muted-foreground text-sm">{t('shift.unread.none')}</p>
      </SectionCard>
    )
  const from = shifts.find((s) => s.id === handover.fromShiftId)
  const to = shifts.find((s) => s.id === handover.toShiftId)
  // "Okudum" comes after the note and the snapshot (read, then say so).
  return (
    <SectionCard
      title={t('shift.unread.title')}
      icon={MessageSquareTextIcon}
      count={list.length}
      className="border-info/60 ring-info/20 ring-1"
      testId="handover-unread"
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <ShiftPair from={from} to={to} />
          <span className="text-muted-foreground">
            {t('shift.writtenBy', {
              name: handover.writtenByName ?? '—',
              time: `${f.dayMonth(dayOf(handover.writtenAt))} ${f.time(handover.writtenAt)}`
            })}
          </span>
        </div>
        {handover.text ? (
          <blockquote
            className="border-info/60 border-s-4 ps-3 text-sm leading-relaxed break-words whitespace-pre-line"
            data-testid="handover-text"
          >
            {handover.text}
          </blockquote>
        ) : (
          <p className="text-muted-foreground text-sm">{t('shift.unread.noText')}</p>
        )}
        <div className="grid gap-1.5">
          <p className="text-muted-foreground text-xs font-medium">{t('shift.snapshot.title')}</p>
          <SnapshotChips summary={handover.summary} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {list.length > 1 ? (
            <p className="text-muted-foreground text-xs">
              {t('shift.unread.more', { count: list.length - 1 })}
            </p>
          ) : (
            <span />
          )}
          <Button
            className="max-md:w-full"
            disabled={read.isPending}
            data-testid="handover-read"
            onClick={() =>
              read.mutate(
                { id: handover.id },
                {
                  onSuccess: () => toast.success(t('shift.unread.readDone')),
                  onError: (error) => void toast.error(errorText(error))
                }
              )
            }
          >
            <CheckIcon aria-hidden />
            {t('shift.unread.markRead')}
          </Button>
        </div>
      </div>
    </SectionCard>
  )
}

function SummaryBlock({
  icon: Icon,
  title,
  count,
  loud,
  children
}: {
  icon: typeof LogInIcon
  title: string
  count?: number
  loud?: boolean
  children: ReactNode
}) {
  return (
    <section className="grid min-w-0 content-start gap-1.5" aria-label={title}>
      <h4 className="flex items-center gap-1.5 text-xs font-semibold">
        <Icon className={cn('size-3.5', loud ? 'text-destructive' : 'text-muted-foreground')} aria-hidden />
        {title}
        {count !== undefined ? (
          <Badge variant={loud && count > 0 ? 'destructive' : 'secondary'} className="tabular-nums">
            {count}
          </Badge>
        ) : null}
      </h4>
      {children}
    </section>
  )
}

function Line({
  room,
  children,
  trailing
}: {
  room?: string | null
  children: ReactNode
  trailing?: ReactNode
}) {
  return (
    <li className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      {/* No room column for lines that never have one (tasks); a general-area issue shows a dash. */}
      {room !== undefined ? (
        <span className="bg-muted grid h-6 min-w-9 shrink-0 place-items-center rounded px-1 text-xs font-semibold tabular-nums">
          {room ?? '—'}
        </span>
      ) : null}
      <span className="min-w-24 flex-1 break-words">{children}</span>
      {trailing}
    </li>
  )
}

/** The automatic part of the handover (§6.16) as the reader may see it. */
export function SummaryView({ summary }: { summary: HandoverSummary }) {
  const { t } = useTranslation()
  const f = useFormat()
  const none = (text: string) => <p className="text-muted-foreground text-sm">{text}</p>
  const kbsText = (kind: 'checkin' | 'checkout' | 'unnamed'): string =>
    kind === 'checkin'
      ? t('occupants.kbsMissingIn')
      : kind === 'checkout'
        ? t('occupants.kbsMissingOut')
        : t('shift.auto.kbsUnnamed')
  const urgent = (summary.openIssues ?? []).filter((i) => i.severity === 'urgent')
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {summary.arrivalsPending ? (
        <SummaryBlock
          icon={LogInIcon}
          title={t('shift.auto.pendingArrivals')}
          count={summary.arrivalsPending.length}
        >
          {summary.arrivalsPending.length ? (
            <ul className="grid gap-0.5">
              {summary.arrivalsPending.map((row) => (
                <Line key={row.stayId} room={row.roomNumber}>
                  {row.guestName}
                </Line>
              ))}
            </ul>
          ) : (
            none(t('shift.auto.noPending'))
          )}
        </SummaryBlock>
      ) : null}

      {summary.overdueCheckouts ? (
        <SummaryBlock
          icon={DoorOpenIcon}
          title={t('shift.auto.overdue')}
          count={summary.overdueCheckouts.length}
          loud
        >
          {summary.overdueCheckouts.length ? (
            <ul className="grid gap-0.5">
              {summary.overdueCheckouts.map((row) => (
                <Line key={row.stayId} room={row.roomNumber}>
                  {row.guestName}
                </Line>
              ))}
            </ul>
          ) : (
            none(t('shift.auto.noOverdue'))
          )}
        </SummaryBlock>
      ) : null}

      {summary.inHouse || summary.kbsMissing ? (
        <SummaryBlock icon={MoonStarIcon} title={t('shift.auto.tonight')}>
          {summary.inHouse ? (
            <p className="text-sm">
              {t('shift.auto.tonightLine', { rooms: summary.inHouse.rooms, people: summary.inHouse.people })}
            </p>
          ) : null}
          {summary.kbsMissing?.length ? (
            <ul className="grid gap-0.5" aria-label={t('shift.auto.kbsGaps')}>
              {summary.kbsMissing.map((g) => (
                <Line
                  key={`${g.reservationRoomId}-${g.occupantId ?? 'room'}-${g.kind}`}
                  room={g.roomNumber}
                  trailing={
                    <span className="text-destructive inline-flex shrink-0 items-center gap-1 text-xs font-medium">
                      <ShieldAlertIcon className="size-3.5" aria-hidden />
                      {kbsText(g.kind)}
                    </span>
                  }
                >
                  {g.fullName ?? '—'}
                </Line>
              ))}
            </ul>
          ) : summary.kbsMissing ? (
            <p className="text-success text-sm">{t('shift.auto.kbsOk')}</p>
          ) : null}
        </SummaryBlock>
      ) : null}

      {summary.unpaid ? (
        <SummaryBlock icon={WalletIcon} title={t('shift.auto.unpaid')} count={summary.unpaid.length}>
          {summary.unpaid.length ? (
            <ul className="grid gap-0.5">
              {summary.unpaid.map((row) => (
                <Line
                  key={row.reservationId}
                  room={row.roomNumbers.join(', ')}
                  trailing={
                    <span className="text-destructive shrink-0 text-xs font-semibold tabular-nums">
                      <bdi>{f.money(row.balanceMinor, row.currency)}</bdi>
                    </span>
                  }
                >
                  {row.guestName}
                </Line>
              ))}
            </ul>
          ) : (
            none(t('shift.auto.noUnpaid'))
          )}
        </SummaryBlock>
      ) : null}

      {summary.openTasks || summary.openIssues ? (
        <SummaryBlock icon={WrenchIcon} title={t('shift.auto.tasksIssues')}>
          <p className="text-sm">
            {t('shift.auto.tasksLine', {
              tasks: summary.openTasks?.length ?? 0,
              issues: summary.openIssues?.length ?? 0
            })}
          </p>
          <ul className="grid gap-0.5">
            {(summary.openTasks ?? [])
              .filter((task) => task.overdue)
              .concat((summary.openTasks ?? []).filter((task) => !task.overdue))
              .slice(0, 3)
              .map((task) => (
                <Line
                  key={task.id}
                  trailing={
                    task.overdue ? <Badge variant="destructive">{t('tasks.overdue')}</Badge> : undefined
                  }
                >
                  {taskTitle(f, task)}
                </Line>
              ))}
            {urgent.map((issue) => (
              <Line
                key={issue.id}
                room={issue.roomNumber}
                trailing={<Badge variant="destructive">{t('issues.severity.urgent')}</Badge>}
              >
                {issue.title}
              </Line>
            ))}
          </ul>
        </SummaryBlock>
      ) : null}

      {summary.cash ? (
        <SummaryBlock icon={WalletIcon} title={t('shift.auto.drawer')}>
          {Object.keys(summary.cash.drawer).length ? (
            <ul className="grid gap-0.5" data-testid="handover-drawer">
              {Object.entries(summary.cash.drawer).map(([currency, amount]) => (
                <li key={currency} className="text-lg font-semibold tabular-nums">
                  <bdi>{f.money(amount, currency)}</bdi>
                </li>
              ))}
            </ul>
          ) : (
            none(t('shift.auto.noCash'))
          )}
          {summary.cash.partial ? (
            <p className="text-muted-foreground text-xs" data-testid="handover-drawer-partial">
              {t('ledger.partial.hint')}
            </p>
          ) : null}
        </SummaryBlock>
      ) : null}
    </div>
  )
}

export function WriteHandover({
  summary,
  current,
  shifts
}: {
  summary: HandoverSummary
  current: ShiftView | undefined
  shifts: readonly ShiftView[]
}) {
  const { t } = useTranslation()
  const id = useId()
  const errorText = useErrorText()
  const [note, setNote] = useState('')
  const save = useApiMutation('shift.saveHandover', { invalidates: SHIFT_QUERIES })
  const next = current ? nextShift(shifts, current.id) : undefined
  const submit = (): void => {
    if (save.isPending) return
    save.mutate(
      { fromShiftId: current?.id ?? null, toShiftId: next?.id ?? null, text: note.trim() || null },
      {
        onSuccess: () => {
          setNote('')
          toast.success(t('shift.write.saved'))
        },
        onError: (error) => void toast.error(errorText(error))
      }
    )
  }
  return (
    <SectionCard title={t('shift.write.title')} icon={PenLineIcon} testId="handover-write">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            submit()
          }
        }}
      >
        {shifts.length ? (
          <ShiftPair from={current} to={next} />
        ) : (
          <p className="text-muted-foreground text-xs">{t('shift.write.noShift')}</p>
        )}
        <div className="bg-muted/40 grid min-w-0 gap-4 rounded-lg border p-3" data-testid="handover-auto">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <SparklesIcon className="text-info size-4" aria-hidden />
              {t('shift.auto.title')}
            </h3>
            <p className="text-muted-foreground text-xs">{t('shift.auto.hint')}</p>
          </div>
          <SummaryView summary={summary} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-note`}>{t('shift.write.note')}</Label>
          <Textarea
            id={`${id}-note`}
            rows={3}
            maxLength={5000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('shift.write.placeholder')}
          />
        </div>
        <Button
          type="submit"
          className="justify-self-end max-md:w-full"
          disabled={save.isPending}
          data-testid="handover-save"
        >
          <CheckIcon aria-hidden />
          {t('shift.write.save')}
        </Button>
      </form>
    </SectionCard>
  )
}

function ReadMark({ handover }: { handover: HandoverView }) {
  const { t } = useTranslation()
  const f = useFormat()
  return handover.acknowledgedAt ? (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      <CheckCheckIcon className="text-success size-3.5 shrink-0" aria-hidden />
      {t('shift.readBy', {
        name: handover.acknowledgedByName ?? '—',
        time: `${f.dayMonth(dayOf(handover.acknowledgedAt))} ${f.time(handover.acknowledgedAt)}`
      })}
    </span>
  ) : (
    <Badge variant="outline" className="border-info text-foreground">
      {t('shift.notRead')}
    </Badge>
  )
}

export function HandoverHistory({ list, shifts }: { list: HandoverView[]; shifts: readonly ShiftView[] }) {
  const { t } = useTranslation()
  const f = useFormat()
  // One card per handover on every screen size (a table clipped the read column in Russian).
  return (
    <SectionCard
      title={t('shift.history.title')}
      icon={HistoryIcon}
      count={list.length}
      testId="handover-history"
    >
      {!list.length ? (
        <p className="text-muted-foreground text-sm">{t('shift.history.empty')}</p>
      ) : (
        <ul className="grid gap-2" aria-label={t('shift.history.title')}>
          {list.map((h) => (
            <li
              key={h.id}
              className="grid min-w-0 gap-1.5 rounded-lg border p-3"
              data-testid={`handover-${h.id}`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                <span className="font-medium whitespace-nowrap tabular-nums">
                  {f.dayMonth(dayOf(h.writtenAt))} {f.time(h.writtenAt)}
                </span>
                <ShiftChip shift={shifts.find((s) => s.id === h.fromShiftId)} />
                <span className="text-muted-foreground">
                  {t('shift.byName', { name: h.writtenByName ?? '—' })}
                </span>
                <span className="ms-auto">
                  <ReadMark handover={h} />
                </span>
              </div>
              {h.text ? <p className="text-sm break-words whitespace-pre-line">{h.text}</p> : null}
              <SnapshotChips summary={h.summary} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
