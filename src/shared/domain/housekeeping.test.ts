import { describe, expect, it } from 'vitest'
import { localDate } from '../date'
import {
  HK_STATES,
  blockKindOf,
  closesRoom,
  isIssueStale,
  issueAgeDays,
  stateAfterCheckout
} from './housekeeping'

const DAY = localDate('2026-10-12')

describe('oda durumu kuralları (G-90, S-14)', () => {
  it('çıkıştan sonra oda kirli olur; bakımdaki ve kullanım dışı oda olduğu gibi kalır', () => {
    expect(HK_STATES.map(stateAfterCheckout)).toEqual([
      'dirty',
      'dirty',
      'dirty',
      'maintenance',
      'out_of_order'
    ])
  })

  it('yalnız bakımda ve kullanım dışı odayı satışa kapatır; blok türü durumdan gelir', () => {
    expect(HK_STATES.filter(closesRoom)).toEqual(['maintenance', 'out_of_order'])
    expect(HK_STATES.map(blockKindOf)).toEqual([null, null, null, 'oos', 'ooo'])
  })
})

describe('arıza yaşı (G-180)', () => {
  it('7 gündür açık ya da planlı arıza kırmızıdır; 6 günlük ve çözülen değildir', () => {
    expect(issueAgeDays('2026-10-12T05:00:00.000Z', DAY)).toBe(0)
    expect(issueAgeDays('2026-10-05T09:00:00.000Z', DAY)).toBe(7)
    expect(isIssueStale({ status: 'open', reportedAt: '2026-10-06T09:00:00.000Z' }, DAY)).toBe(false)
    expect(isIssueStale({ status: 'open', reportedAt: '2026-10-05T09:00:00.000Z' }, DAY)).toBe(true)
    expect(isIssueStale({ status: 'planned', reportedAt: '2026-09-01T09:00:00.000Z' }, DAY)).toBe(true)
    expect(isIssueStale({ status: 'resolved', reportedAt: '2026-09-01T09:00:00.000Z' }, DAY)).toBe(false)
  })
})
