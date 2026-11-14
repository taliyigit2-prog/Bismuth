// Handlers of procedures/today.ts (Faz 9): contract procedure → service calls. The Today summary gathers the
// reads of several services; each part is fetched only for a role that may see it (the services check again,
// G-23) and is null otherwise, so the screen hides that card instead of showing "nothing".
import type { todayProcedures, TodaySummaryDto } from '@shared/contract/procedures/today'
import { addDays } from '@shared/date'
import { TOURISM_TEMPLATE_CODE, previousPeriod, tourismReminder, tourismStartDay } from '@shared/domain/today'
import type { Services } from '../../services'
import type { Ctx } from '../../services/context'
import type { CalendarEntry } from '../../services/calendar-service'
import type { HandlersFor } from '../app'

const ok = { ok: true } as const

const entryView = (e: CalendarEntry) => ({
  id: e.id,
  date: e.date,
  occurrenceDate: e.occurrenceDate,
  kind: e.kind,
  title: e.title,
  titleI18n: e.titleI18n ?? null,
  note: e.note,
  color: e.color,
  source: e.source,
  estimated: e.estimated,
  groupKey: e.groupKey,
  recurringYearly: e.recurringYearly,
  repeated: e.repeated,
  generatedYear: e.generatedYear
})

function todaySummary(services: Services, ctx: Ctx): TodaySummaryDto {
  // Gate first: the Today screen itself (and today's arrivals and departures).
  const day = services.occupants.dayLists(ctx)
  const tomorrow = addDays(day.today, 1)
  const roomNumbers = new Map(
    services.rooms.listRooms(ctx, { includeInactive: true }).map((r) => [r.id, r.number])
  )

  let inHouse: TodaySummaryDto['inHouse'] = null
  let kbs: TodaySummaryDto['kbsMissing'] = null
  if (ctx.can('in_house', 'view')) {
    const rooms = services.occupants.inHouse(ctx)
    inHouse = { rooms: rooms.length, people: rooms.reduce((n, r) => n + r.people, 0) }
    kbs = services.occupants.kbsMissing(ctx).map((k) => ({
      occupantId: k.occupantId,
      stayId: k.reservationRoomId,
      roomNumber: roomNumbers.get(k.roomId) ?? '',
      fullName: k.fullName,
      kind: k.kind
    }))
  }

  const dirtyRooms = ctx.can('rooms.status', 'view')
    ? services.housekeeping
        .board(ctx)
        .rooms.filter((r) => r.hk === 'dirty')
        .map((r) => ({ id: r.id, number: r.number }))
    : null

  const templates = ctx.can('tasks', 'view')
    ? services.tasks.listTemplates(ctx, { includeInactive: true })
    : null
  const templateCodes = new Map((templates ?? []).map((t) => [t.id, t.code]))
  // Due today or earlier, and the undated ones (a room's deep clean): the same list as the handover and Görevler.
  const tasks = ctx.can('tasks', 'view')
    ? services.tasks.listTasks(ctx, { status: ['open'], dueTo: tomorrow }).map((t) => ({
        id: t.id,
        title: t.title,
        titleI18n: t.titleI18n ?? null,
        dueAt: t.dueAt,
        overdue: t.overdue,
        roomNumber: t.roomId ? (roomNumbers.get(t.roomId) ?? null) : null,
        templateCode: t.templateId ? (templateCodes.get(t.templateId) ?? null) : null
      }))
    : null

  let handovers: TodaySummaryDto['handovers'] = null
  if (ctx.can('shift_notes', 'view')) {
    const unread = services.shifts.unreadHandovers(ctx)
    const latest = unread[0]
    handovers = {
      count: unread.length,
      latest: latest ? { id: latest.id, writtenAt: latest.writtenAt, text: latest.text } : null
    }
  }

  const drawer = ctx.can('cash', 'view')
    ? Object.entries(services.ledger.cashPanel(ctx).drawer)
        .filter(([, amount]) => amount !== 0)
        .map(([currency, amountMinor]) => ({ currency, amountMinor }))
    : null

  const specialDays = services.calendar.listRange(ctx, day.today, tomorrow).map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    titleI18n: e.titleI18n ?? null,
    note: e.note,
    color: e.color,
    estimated: e.estimated
  }))

  const reminders: TodaySummaryDto['reminders'] = []
  if (ctx.can('tourism_stats', 'view')) {
    // Without the tasks right the template cannot be read: the seed (on, from the 1st) applies.
    const template = templates?.find((t) => t.code === TOURISM_TEMPLATE_CODE)
    const active = templates ? !!template?.active : true
    // Tek giriş: ticking the reminder task counts as reported too (it also marks the table when there is one).
    const taskDone =
      !!template &&
      ctx.can('tasks', 'view') &&
      services.tasks.listTasks(ctx, {
        status: ['done'],
        templateId: template.id,
        dueFrom: `${day.today.slice(0, 7)}-01`
      }).length > 0
    const reported =
      taskDone ||
      services.tourism.listImports(ctx, previousPeriod(day.today)).some((i) => i.reportedAt !== null)
    const reminder = tourismReminder(day.today, {
      active,
      startDay: template ? tourismStartDay(template.recurrence, template.remindMinutesBefore) : 1,
      reported
    })
    if (reminder) reminders.push(reminder)
  }

  const camera = ctx.can('camera', 'view') ? services.camera.todayNotice(ctx) : null

  return {
    ...day,
    camera,
    inHouse,
    kbsMissing: kbs,
    dirtyRooms,
    tasks,
    handovers,
    drawer,
    specialDays,
    reminders
  }
}

export const todayHandlers = (services: Services): HandlersFor<keyof typeof todayProcedures> => ({
  'inHouse.list': (ctx, input) => services.occupants.inHouseView(ctx, input.q),
  'inHouse.addPerson': (ctx, input) => {
    const row = services.occupants.add(
      ctx,
      input.stayId,
      { fullName: input.fullName, descriptorNote: input.descriptorNote ?? null },
      { blacklistConfirmed: input.blacklistConfirmed }
    )
    if (input.kbsReported) services.occupants.markKbsReported(ctx, row.id)
    return ok
  },
  'inHouse.markKbs': (ctx, input) => {
    const o = services.occupants
    if (input.mark === 'reported') o.markKbsReported(ctx, input.occupantId)
    else if (input.mark === 'checkout') o.markKbsCheckout(ctx, input.occupantId)
    else o.clearKbsReported(ctx, input.occupantId)
    return ok
  },

  'today.summary': (ctx) => todaySummary(services, ctx),
  'today.completeTask': (ctx, input) => {
    services.tasks.done(ctx, input.id)
    return ok
  },

  'calendarNotes.list': (ctx, input) => ({
    highlightWeekdays: services.calendar.highlightWeekdays(ctx),
    days: services.calendar.listRange(ctx, input.from, input.to).map(entryView)
  }),
  'calendarNotes.add': (ctx, input) => ({ count: services.calendar.addNote(ctx, input).length }),
  'calendarNotes.edit': (ctx, input) => {
    const row = services.calendar.editDay(ctx, input.id, input.patch)
    return entryView({ ...row, occurrenceDate: row.date, repeated: false })
  },
  'calendarNotes.cancel': (ctx, input) => {
    services.calendar.cancelDay(ctx, input.id, input.reason)
    return ok
  },
  'calendarNotes.cancelGroup': (ctx, input) => ({
    count: services.calendar.cancelGroup(ctx, input.groupKey, input.reason)
  })
})
