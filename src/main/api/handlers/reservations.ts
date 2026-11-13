// Handlers of procedures/reservations.ts (Faz 5): contract procedure → service call.
import type { reservationsProcedures } from '@shared/contract/procedures/reservations'
import type { Services } from '../../services'
import { gridBlockOf } from '../../services/calendar/grid'
import type { HandlersFor } from '../app'

export const reservationsHandlers = (
  services: Services
): HandlersFor<keyof typeof reservationsProcedures> => ({
  'reservations.grid': (ctx, input) => services.calendar.grid(ctx, input),
  'reservations.findStays': (ctx, input) => services.calendar.findStays(ctx, input),
  'calendar.bounds': (ctx) => services.calendar.bounds(ctx),
  'reservations.recentEnded': (ctx, input) => services.calendar.recentEnded(ctx, input),
  'reservations.freeRooms': (ctx, input) => ({ roomIds: services.calendar.freeRooms(ctx, input) }),
  'calendar.addNote': (ctx, input) => ({ count: services.calendar.addNote(ctx, input).length }),
  'reservations.createBlock': (ctx, input) => gridBlockOf(services.rooms.createBlock(ctx, input)),
  'reservations.cancelBlock': (ctx, input) =>
    gridBlockOf(services.rooms.cancelBlock(ctx, input.id, input.reason ?? undefined))
})
