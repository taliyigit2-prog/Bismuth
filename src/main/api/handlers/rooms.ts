// Handlers of procedures/rooms.ts (capacity history, P4fix): contract procedure → service call.
import type { roomsProcedures } from '@shared/contract/procedures/rooms'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'

export const roomsHandlers = (services: Services): HandlersFor<keyof typeof roomsProcedures> => ({
  'rooms.capacityHistory': (ctx, { roomId }) => services.rooms.capacityHistory(ctx, roomId),
  'rooms.cancelCapacityChange': (ctx, { id }) => services.rooms.cancelCapacityChange(ctx, id)
})
