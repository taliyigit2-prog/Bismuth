import { describe, expect, it } from 'vitest'
import { dayNoteSchema } from './ledger'
import { expenseCreateSchema } from './expenses'
import { blacklistInputSchema, companyInputSchema, guestCandidateSchema, guestInputSchema } from './guests'
import { handoverInputSchema, noteInputSchema } from './operations'
import { paymentCreateSchema, newGuestSchema } from './reservations'
import { employeeCreateSchema } from './staff'
import { contactInputSchema } from './supply'
import { fieldLimits } from './limits'
import { TEXT_MAX } from './text'

const ok = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success
const text = (n: number) => 'a'.repeat(n)

describe('serbest metin üst sınırları sözleşmede (H-19, H-25)', () => {
  it('ödeme notu 500, gider açıklaması 200, gün notu 1000, devir notu ve kendime not 2000 karakteri geçemez', () => {
    const payment = (note: string) => ({
      reservationId: '01J0000000000000000000000A',
      date: '2026-10-02',
      methodId: '01J0000000000000000000000B',
      amountMinor: 1000,
      currency: 'TRY',
      note
    })
    expect([
      ok(paymentCreateSchema, payment(text(500))),
      ok(paymentCreateSchema, payment(text(5000)))
    ]).toEqual([true, false])
    const expense = (description: string) => ({
      date: '2026-10-02',
      sectionId: '01J0000000000000000000000C',
      amountMinor: 1000,
      currency: 'TRY',
      description
    })
    expect([
      ok(expenseCreateSchema, expense(text(200))),
      ok(expenseCreateSchema, expense(text(3000)))
    ]).toEqual([true, false])
    expect([
      ok(dayNoteSchema, { date: '2026-10-02', note: text(1000) }),
      ok(dayNoteSchema, { date: '2026-10-02', note: text(6000) })
    ]).toEqual([true, false])
    expect([
      ok(handoverInputSchema, { text: text(TEXT_MAX.long) }),
      ok(handoverInputSchema, { text: text(6000) })
    ]).toEqual([true, false])
    expect([
      ok(noteInputSchema, { kind: 'personal', text: text(TEXT_MAX.long) }),
      ok(noteInputSchema, { kind: 'personal', text: text(3000) })
    ]).toEqual([true, false])
  })

  it('rehber: ad 120 karakter; firma ünvanı 200; misafir adı 80', () => {
    const contact = (name: string) => ({ name, category: 'other' })
    expect([ok(contactInputSchema, contact(text(120))), ok(contactInputSchema, contact(text(400)))]).toEqual([
      true,
      false
    ])
    expect(fieldLimits(companyInputSchema.shape.title).maxLength).toBe(200)
    expect(fieldLimits(newGuestSchema.shape.firstName).maxLength).toBe(80)
    expect(ok(guestInputSchema, { firstName: text(300) })).toBe(false)
    // The checks take a name up to 160 characters (first + last name), nothing more.
    expect(ok(guestCandidateSchema, { name: text(300) })).toBe(false)
  })
})

describe('telefon metni her kayıtta aynı denetimden geçer (H-05, H-21, H-25)', () => {
  const good = ['+90 532 123 45 67', '0532 123 45 67', '(0212) 555 00 00', '+44 20 7946 0958']
  const bad = ['telefon', '12', '1'.repeat(40), '5'.repeat(18), 'abc 532 123 45 67']

  it('misafir, firma, çalışan, kara liste, yeni misafir ve rehber aynı kuralı uygular', () => {
    const forms: Record<string, (phone: string) => unknown> = {
      guest: (phone) => ({ firstName: 'Elif', phone }),
      newGuest: (phone) => ({ firstName: 'Elif', phone }),
      company: (phone) => ({ title: 'Alfa Ltd.', phone }),
      blacklist: (phone) => ({
        name: 'Elif Kaya',
        phone,
        severity: 'warn',
        reasonCode: 'damage',
        reasonText: 'Hasar'
      }),
      employee: (phone) => ({
        firstName: 'Elif',
        lastName: 'Kaya',
        phone,
        startDate: '2026-01-01'
      }),
      contact: (phone) => ({ name: 'Usta', category: 'plumber', phones: [{ label: 'cep', number: phone }] })
    }
    const schemas = {
      guest: guestInputSchema,
      newGuest: newGuestSchema,
      company: companyInputSchema,
      blacklist: blacklistInputSchema,
      employee: employeeCreateSchema,
      contact: contactInputSchema
    }
    for (const [name, build] of Object.entries(forms)) {
      const schema = schemas[name as keyof typeof schemas]
      expect(
        good.map((p) => ok(schema, build(p))),
        `${name}: geçerli`
      ).toEqual(good.map(() => true))
      expect(
        bad.map((p) => ok(schema, build(p))),
        `${name}: geçersiz`
      ).toEqual(bad.map(() => false))
    }
  })

  it('boş telefon hâlâ serbest (isteğe bağlı alan)', () => {
    expect(ok(guestInputSchema, { firstName: 'Elif', phone: '' })).toBe(true)
    expect(ok(guestInputSchema, { firstName: 'Elif' })).toBe(true)
  })
})
