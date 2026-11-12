// Pure helpers of "Otelde kalanlar" (G-54): the search the screen applies while typing (the same rule as the
// service's `q`: room number, the holder's name, a person's name or descriptor note — "kızıl") and the KBS
// state of one person (G-53).
import type { InHouseOccupant, InHouseRoomDto, InHouseViewDto } from '@shared/contract/procedures/today'
import { normalizeName } from '@shared/domain/normalize'

/** 'off': not marked, but the hotel switched KBS checks off (kbs.checksEnabled) — nothing is missing. */
export type KbsMark = 'missingIn' | 'ok' | 'off'

export const kbsOf = (o: InHouseOccupant, checks = true): KbsMark =>
  o.kbsReportedAt ? 'ok' : checks ? 'missingIn' : 'off'

export function roomMatches(room: InHouseRoomDto, needle: string): boolean {
  if (!needle) return true
  return [
    room.roomNumber,
    room.guestName,
    ...room.occupants.flatMap((o) => [o.fullName, o.descriptorNote ?? ''])
  ].some((text) => normalizeName(text).includes(needle))
}

/** What the screen shows for a search and the "only KBS gaps" switch. */
export function filterView(view: InHouseViewDto, search: string, onlyGaps: boolean) {
  const needle = normalizeName(search)
  return {
    rooms: view.rooms.filter((r) => (!onlyGaps || r.kbsGaps > 0) && roomMatches(r, needle)),
    pending: view.checkoutPending.filter(
      (p) =>
        !needle || normalizeName(p.fullName).includes(needle) || normalizeName(p.roomNumber).includes(needle)
    ),
    needle
  }
}

/** Every KBS mark still to set: unmarked people in the rooms and people who left without the check-out. */
export const totalGaps = (view: InHouseViewDto): number =>
  view.rooms.reduce((n, r) => n + r.kbsGaps, 0) + view.checkoutPending.length
