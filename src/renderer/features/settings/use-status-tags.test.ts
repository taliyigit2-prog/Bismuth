import { describe, expect, it } from 'vitest'
import { autoMeaningPatch, autoNamePatch, ownWording } from './use-status-tags'

// The program's name of "paid" in the interface language first, then in every language.
const PAID = ['Ödendi', 'Ödendi', 'Paid', 'Оплачено']

describe('otomatik durumun adı: varsayılana eşit ya da boşsa null saklanır', () => {
  it('boş alan ve yalnızca boşluk null olur (ad arayüz diliyle değişmeye devam eder)', () => {
    expect(ownWording('', PAID)).toBeNull()
    expect(ownWording('   ', PAID)).toBeNull()
  })

  it('programın adı hangi dilde yazılırsa yazılsın null olur', () => {
    expect(ownWording('Ödendi', PAID)).toBeNull()
    expect(ownWording(' Paid ', PAID)).toBeNull()
    expect(ownWording('Оплачено', PAID)).toBeNull()
  })

  it('otelin kendi adı kırpılıp olduğu gibi saklanır', () => {
    expect(ownWording('  Tam ödendi ', PAID)).toBe('Tam ödendi')
    expect(ownWording('ödendi', PAID)).toBe('ödendi')
  })

  it('kendi ad yazılınca kaydedilir; aynı ad yeniden yazılınca kayıt yapılmaz', () => {
    expect(autoNamePatch({ name: null }, 'Tam ödendi', PAID)).toEqual({ name: 'Tam ödendi' })
    expect(autoNamePatch({ name: 'Tam ödendi' }, 'Tam ödendi ', PAID)).toBeUndefined()
  })

  it('ad hiç değişmemişse varsayılanı yazmak ya da alanı boşaltmak kayıt yapmaz', () => {
    expect(autoNamePatch({ name: null }, 'Ödendi', PAID)).toBeUndefined()
    expect(autoNamePatch({ name: null }, '', PAID)).toBeUndefined()
  })

  it('değiştirilmiş ad boşaltılınca null saklanır, varsayılan ada döner', () => {
    expect(autoNamePatch({ name: 'Tam ödendi' }, '', PAID)).toEqual({ name: null })
    expect(autoNamePatch({ name: 'Tam ödendi' }, 'Paid', PAID)).toEqual({ name: null })
  })

  it('anlam da aynı kuralla saklanır: varsayılan ya da boş anlam null olur', () => {
    const meanings = ['Gecenin parası tamamen alındı.', 'The night is fully paid.']
    expect(
      autoMeaningPatch({ description: null }, 'Gecenin parası tamamen alındı.', meanings)
    ).toBeUndefined()
    expect(autoMeaningPatch({ description: 'Kendi notumuz' }, '', meanings)).toEqual({ description: null })
    expect(autoMeaningPatch({ description: null }, 'Kendi notumuz', meanings)).toEqual({
      description: 'Kendi notumuz'
    })
  })
})
