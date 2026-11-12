import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { fieldStepLabel } from './audit-labels'
import { currencyOf, diffOf, isIsoTime } from './audit-values'

describe('denetim kaydı değerleri', () => {
  it('iç içe kayıt yol olarak açılır; yalnız değişen yaprak "değişti" sayılır', () => {
    const diff = diffOf(
      {
        name: 'Resepsiyon',
        permissions: { staff: 'none', ledger: 'view' },
        updatedAt: '2026-10-01T08:00:00Z'
      },
      {
        name: 'Resepsiyon',
        permissions: { staff: 'view', ledger: 'view' },
        updatedAt: '2026-10-04T08:00:00Z'
      }
    )
    expect(diff.kind).toBe('fields')
    if (diff.kind !== 'fields') return
    expect(diff.rows.map((r) => r.path.join('.'))).toEqual([
      'name',
      'permissions.staff',
      'permissions.ledger',
      'updatedAt'
    ])
    expect(diff.rows.filter((r) => r.changed).map((r) => r.path.join('.'))).toEqual(['permissions.staff'])
  })

  it('eklenen kaydın yalnız "sonra"sı, kaldırılanın yalnız "önce"si vardır', () => {
    const added = diffOf(null, { name: 'Bahçe odası' })
    expect(added).toMatchObject({ kind: 'fields', hasBefore: false, hasAfter: true, compared: false })
    if (added.kind === 'fields') expect(added.rows.every((r) => !r.changed)).toBe(true)
    expect(diffOf({ name: 'Eski' }, null)).toMatchObject({ hasBefore: true, hasAfter: false })
    expect(diffOf('Bismuth', 'Örnek Otel')).toMatchObject({ kind: 'value', hasBefore: true, hasAfter: true })
    expect(diffOf({ hidden: true }, null)).toEqual({ kind: 'hidden' })
    expect(diffOf(null, undefined)).toEqual({ kind: 'empty' })
  })

  it('tutarın para birimi: kendi alanı, kaydınki, yoksa otelin ana para birimi', () => {
    expect(currencyOf('basePriceMinor', { baseCurrency: 'EUR' }, 'TRY')).toBe('EUR')
    expect(currencyOf('defaultPriceMinor', { defaultCurrency: 'USD', currency: 'EUR' }, 'TRY')).toBe('USD')
    expect(currencyOf('amountMinor', { currency: 'GBP' }, 'TRY')).toBe('GBP')
    expect(currencyOf('commissionFixedMinor', {}, 'TRY')).toBe('TRY')
  })

  it('ISO zaman damgası tanınır; gün ve saat yazısı tanınmaz', () => {
    expect(isIsoTime('2026-10-04T12:59:00.000Z')).toBe(true)
    expect(isIsoTime('2026-10-04')).toBe(false)
    expect(isIsoTime('09:00')).toBe(false)
  })

  it('alan adı: bilinen alan ve yetki anahtarı çevrilir, bilinmeyen alanın adı yoktur', () => {
    const t = ((key: string) => `«${key}»`) as unknown as TFunction
    expect(fieldStepLabel(t, ['permissions', 'staff.salary'], 0)).toBe('«audit.fieldName.permissions»')
    expect(fieldStepLabel(t, ['permissions', 'staff.salary'], 1)).toBe('«permissions.key.staff_salary»')
    expect(fieldStepLabel(t, ['legacyFlag'], 0)).toBeNull()
    expect(fieldStepLabel(t, ['nameI18n', 'tr'], 1)).toBeNull()
  })
})
