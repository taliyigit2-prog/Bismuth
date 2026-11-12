// The guest list's room and date filter value (G-190), apart from its components (fast refresh).
import type { LocalDate } from '@shared/date'

export interface StayFilterValue {
  room: string
  from: LocalDate | null
  to: LocalDate | null
}

export const NO_STAY_FILTER: StayFilterValue = { room: '', from: null, to: null }

export const stayFilterActive = (v: StayFilterValue): boolean => !!v.room.trim() || !!v.from || !!v.to

/** The list's input: only what is set. */
export const stayFilterInput = (
  v: StayFilterValue
): { room?: string; stayFrom?: LocalDate; stayTo?: LocalDate } => ({
  ...(v.room.trim() ? { room: v.room.trim() } : {}),
  ...(v.from ? { stayFrom: v.from } : {}),
  ...(v.to ? { stayTo: v.to } : {})
})
