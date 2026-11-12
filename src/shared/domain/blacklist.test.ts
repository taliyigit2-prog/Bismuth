import { describe, expect, it } from 'vitest'
import { matchBlacklist, type BlacklistEntryLike } from './blacklist'

const entry = (over: Partial<BlacklistEntryLike> = {}): BlacklistEntryLike => ({
  id: 'b1',
  nameNormalized: 'gadir garibov',
  idDocNumber: null,
  phoneNormalized: null,
  guestId: null,
  severity: 'warn',
  status: 'active',
  ...over
})

describe('kara liste eşleşmesi (§6.9)', () => {
  it('ad, kimlik no ya da telefon eşleşir; kaldırılmış kayıt eşleşmez', () => {
    expect(matchBlacklist({ name: 'GADİR  Garibov' }, [entry()])[0]?.reasons).toEqual(['name'])
    expect(
      matchBlacklist({ name: 'Başka', phone: '0532 111 22 33' }, [
        entry({ phoneNormalized: '905321112233' })
      ])[0]?.reasons
    ).toEqual(['phone'])
    expect(matchBlacklist({ name: 'Gadir Garibov' }, [entry({ status: 'removed' })])).toEqual([])
  })

  it('kayda bağlı misafir, adı başka yazılsa da eşleşir; birleştirilmiş eski kartın adı da aday olur', () => {
    const tied = entry({ guestId: 'g-old' })
    expect(matchBlacklist({ name: 'Gadir Gadirov', guestId: 'g-old' }, [tied])[0]?.reasons).toEqual(['guest'])
    expect(
      matchBlacklist(
        [
          { name: 'Gadir Gadirov', guestId: 'g-keep' },
          { name: 'Gadir Garibov', guestId: 'g-old' }
        ],
        [tied]
      )[0]?.reasons
    ).toEqual(['guest', 'name'])
    expect(matchBlacklist({ name: 'Gadir Gadirov', guestId: 'g-other' }, [tied])).toEqual([])
  })

  it('"engelle" önce, sonra en güçlü kanıt (bağlı kayıt, kimlik no)', () => {
    const hits = matchBlacklist({ name: 'Gadir Garibov', guestId: 'g1', idDocNumber: 'A1' }, [
      entry({ id: 'name-only' }),
      entry({ id: 'tied', guestId: 'g1' }),
      entry({ id: 'block', severity: 'block' })
    ])
    expect(hits.map((h) => h.entry.id)).toEqual(['block', 'tied', 'name-only'])
  })
})
