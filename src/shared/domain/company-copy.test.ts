import { describe, expect, it } from 'vitest'
import { COPY_FIELD_KEYS, companyCopyFields, formatCopyText, formatIban } from './company-copy'

const LABELS = {
  title: 'Unvan',
  address: 'Adres',
  tax: 'Vergi dairesi / No',
  phone: 'Telefon',
  email: 'E-posta',
  iban: 'IBAN',
  contact: 'Yetkili'
} as const

const empty = {
  title: 'Alfa Ltd.',
  address: null,
  city: null,
  taxOffice: null,
  taxNumber: null,
  phone: null,
  email: null,
  iban: null,
  contactPerson: null
}

describe('firma fatura bilgisi panoya (G-191; fatura kesilmez, G-06)', () => {
  it('IBAN dörder hane gruplanır', () => {
    expect(formatIban('TR830006200000000012345678')).toBe('TR83 0006 2000 0000 0012 3456 78')
  })

  it('dolu alanlar baskı sırasıyla; boşlar atlanır', () => {
    const fields = companyCopyFields({
      title: 'Zeta Turizm A.Ş.',
      address: 'Atatürk Cd. No: 1',
      city: 'İstanbul',
      taxOffice: 'Kadıköy',
      taxNumber: '1234567890',
      phone: '+90 212 000 00 00',
      email: 'muhasebe@zeta.example',
      iban: 'TR830006200000000012345678',
      contactPerson: 'Ayşe Yılmaz'
    })
    expect(fields.map((f) => f.key)).toEqual([...COPY_FIELD_KEYS])
    expect(fields.find((f) => f.key === 'address')?.value).toBe('Atatürk Cd. No: 1, İstanbul')
    expect(companyCopyFields(empty)).toEqual([{ key: 'title', value: 'Alfa Ltd.' }])
    expect(companyCopyFields({ ...empty, taxNumber: '1234567890', city: 'İzmir' })).toEqual([
      { key: 'title', value: 'Alfa Ltd.' },
      { key: 'address', value: 'İzmir' },
      { key: 'tax', value: '1234567890' }
    ])
  })

  it('alt alta (varsayılan) ya da tek satırda', () => {
    const fields = companyCopyFields({ ...empty, taxOffice: 'Kadıköy', taxNumber: '1234567890' })
    expect(formatCopyText(fields, LABELS)).toBe('Unvan: Alfa Ltd.\nVergi dairesi / No: Kadıköy / 1234567890')
    expect(formatCopyText(fields, LABELS, 'single')).toBe(
      'Unvan: Alfa Ltd. · Vergi dairesi / No: Kadıköy / 1234567890'
    )
  })
})
