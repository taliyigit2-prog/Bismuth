// Final wave G4 (system): the setup wizard keeps no secret in its draft, and a failed finish does not leave the
// new time zone behind.
import { describe, expect, it } from 'vitest'
import { getHotelTimeZone } from '../../src/shared/date'
import { withoutSecrets } from '../../src/main/services/setup-service'
import { draftFrom, makeHarness } from '../factories/desk'

describe('kurulum sihirbazı (G4)', () => {
  it('kaydedilen taslakta şifre tekrarı ve onayı da süzülür', () => {
    const kept = withoutSecrets({
      owner: { name: 'Ada', password: 'Gizli123!', pin: '1234', repeat: 'Gizli123!', confirm: 'Gizli123!' }
    })
    expect(JSON.stringify(kept)).not.toContain('Gizli123')
    expect(kept).toEqual({ owner: { name: 'Ada' } })
  })

  it('bitirme başarısız olup geri alınınca saat dilimi eski değerine döner', async () => {
    const h = await makeHarness()
    const options = await h.call<Parameters<typeof draftFrom>[0]>('setup.options')
    const draft = draftFrom(options.body)
    const before = getHotelTimeZone()
    draft.hotel.timezone = 'Pacific/Auckland'
    // No cash method left: the finish rolls back.
    draft.lists.paymentMethods = []
    const res = await h.call('setup.finish', draft)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(getHotelTimeZone()).not.toBe('Pacific/Auckland')
    expect(getHotelTimeZone()).toBe(before)
  })
})
