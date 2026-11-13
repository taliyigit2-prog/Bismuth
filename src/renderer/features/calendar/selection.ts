// Multi-select on the calendar (P17c, G-195): Ctrl/⌘-click adds or removes a bar, Shift-click takes every stay of
// that room between the last one picked and this one. The set holds stay ids (reservation_rooms.id); what a bulk
// action does with them is in selection-bar.tsx.
import type { GridStayView } from './grid-model'

export type SelectMode = 'toggle' | 'range'

/** The next selection after a click on `clicked`; `anchor` is the stay picked last (null = none). */
export function nextSelection(
  selected: ReadonlySet<string>,
  stays: readonly GridStayView[],
  anchor: GridStayView | null,
  clicked: GridStayView,
  mode: SelectMode
): Set<string> {
  const next = new Set(selected)
  if (mode === 'range' && anchor && anchor.roomId === clicked.roomId) {
    const row = stays
      .filter((s) => s.roomId === clicked.roomId)
      .sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0))
    const from = row.findIndex((s) => s.id === anchor.id)
    const to = row.findIndex((s) => s.id === clicked.id)
    if (from >= 0 && to >= 0) {
      for (const s of row.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(s.id)
      return next
    }
  }
  if (mode === 'toggle' && next.has(clicked.id)) next.delete(clicked.id)
  else next.add(clicked.id)
  return next
}

/** The selected stays that are still on screen, in room and date order (what the bulk actions work on). */
export function pickedStays(selected: ReadonlySet<string>, stays: readonly GridStayView[]): GridStayView[] {
  return stays.filter((s) => selected.has(s.id))
}

/** One entry per reservation (several selected rooms of one reservation are one payment, one note). */
export function uniqueReservations(picked: readonly GridStayView[]): string[] {
  return [...new Set(picked.map((s) => s.reservationId))]
}
