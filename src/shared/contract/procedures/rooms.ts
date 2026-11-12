// Ayarlar → Odalar: a room's capacity history and withdrawing a planned change (K-27; Faz 4 bug hunt P4fix).
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/rooms.ts.
import * as z from 'zod'
import { capacityChangeViewSchema } from '../admin'
import { byId, proc, type Procedure } from '../proc'
import { idSchema } from '../rooms'

export const roomsProcedures = {
  'rooms.capacityHistory': proc(z.object({ roomId: idSchema }).strict(), z.array(capacityChangeViewSchema)),
  'rooms.cancelCapacityChange': proc(byId, capacityChangeViewSchema)
} as const satisfies Record<string, Procedure>
