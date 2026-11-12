// What the room status screen shows per room (G-90, G-180, G-38): the board row of `housekeeping.board` — state,
// note, who changed it and when, who is in the room, today's arrival and departure, open issues and the block.
import type { BoardRoomView } from '@shared/contract/procedures/housekeeping'
import { HK_STATES, type HkState } from '@shared/domain/housekeeping'
import type { PlanRoom } from '@/components/floor-plan'
import type { Format } from '@/hooks/use-format'

export { HK_STATES, type HkState }
export type RoomInfo = BoardRoomView

/** The room type in the screen's language ("Standart oda"). */
export const typeLabelOf = (info: RoomInfo, f: Format): string =>
  info.typeNameI18n?.[f.locale] ?? info.typeName

/** Floor text "3" → 3 (anything else sorts as the ground floor). */
export const floorNumber = (floor: string | null): number => {
  const n = Number.parseInt(floor ?? '', 10)
  return Number.isFinite(n) ? n : 0
}

export const floorOf = (info: RoomInfo): number => floorNumber(info.floor)

/**
 * The floor plan tile of a room (components/floor-plan). `occupied` stands in for the guest's name when the
 * caller may not see guests (housekeeping sees that the room is in use, not who is in it).
 */
export function planRoom(info: RoomInfo, typeLabel: string, occupied: string): PlanRoom {
  return {
    id: info.id,
    number: info.number,
    floor: floorOf(info),
    typeLabel,
    beds: info.beds,
    hk: info.hk,
    guest: info.guest ?? (info.occupied ? occupied : null),
    arriving: info.arriving,
    departing: info.departing,
    issues: info.openIssues ?? 0,
    blocked: !!info.block?.active
  }
}
