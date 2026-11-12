// Blacklist matching (03-mimari.md §6.9; G-45, G-52): a candidate guest matches an active entry by the guest
// record the entry is tied to, or by normalised name OR identity number OR phone. A guest card brings its earlier
// spellings too (cards merged into it): one rule for the guest list, the card, a reservation and a person added
// to a room. Returned reasons let the UI say why it warned.
import { normalizeDocNumber, normalizeName, normalizePhone } from './normalize'

export interface BlacklistCandidate {
  name: string
  idDocNumber?: string | null
  phone?: string | null
  /** The guest record of the person (an entry added from that card matches it whatever the spelling). */
  guestId?: string | null
}

export interface BlacklistEntryLike {
  id: string
  nameNormalized: string
  idDocNumber?: string | null
  phoneNormalized?: string | null
  guestId?: string | null
  severity: 'warn' | 'block'
  status: 'active' | 'removed'
}

export type MatchReason = 'guest' | 'name' | 'id' | 'phone'

const REASON_ORDER: readonly MatchReason[] = ['guest', 'name', 'id', 'phone']

export interface BlacklistHit<E extends BlacklistEntryLike> {
  entry: E
  reasons: MatchReason[]
}

/** `candidate` may be several records of one person (a guest card and the cards merged into it). */
export function matchBlacklist<E extends BlacklistEntryLike>(
  candidate: BlacklistCandidate | readonly BlacklistCandidate[],
  entries: readonly E[]
): BlacklistHit<E>[] {
  const all = Array.isArray(candidate) ? candidate : [candidate as BlacklistCandidate]
  const names = new Set(all.map((c) => normalizeName(c.name)).filter(Boolean))
  const docs = new Set(
    all.map((c) => (c.idDocNumber ? normalizeDocNumber(c.idDocNumber) : '')).filter(Boolean)
  )
  const phones = new Set(all.map((c) => (c.phone ? normalizePhone(c.phone) : '')).filter(Boolean))
  const guestIds = new Set(all.map((c) => c.guestId ?? '').filter(Boolean))
  const hits: BlacklistHit<E>[] = []
  for (const entry of entries) {
    if (entry.status !== 'active') continue
    const reasons = new Set<MatchReason>()
    if (entry.guestId && guestIds.has(entry.guestId)) reasons.add('guest')
    if (entry.nameNormalized && names.has(entry.nameNormalized)) reasons.add('name')
    if (entry.idDocNumber && docs.has(normalizeDocNumber(entry.idDocNumber))) reasons.add('id')
    if (entry.phoneNormalized && phones.has(entry.phoneNormalized)) reasons.add('phone')
    if (reasons.size) hits.push({ entry, reasons: REASON_ORDER.filter((r) => reasons.has(r)) })
  }
  // "block" before "warn", then the strongest evidence (the guest record, the identity number) first.
  const strength = (h: BlacklistHit<E>): number =>
    Number(h.reasons.includes('guest')) * 2 + Number(h.reasons.includes('id'))
  return hits.sort(
    (a, b) =>
      (a.entry.severity === 'block' ? 0 : 1) - (b.entry.severity === 'block' ? 0 : 1) ||
      strength(b) - strength(a)
  )
}
