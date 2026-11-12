// Faz 4 bug hunt P4fix #7 (K-28): a laundry item type taken off the list while pieces of it are still at the
// laundry stays on the Çamaşırhane screen with its pieces out, and the return can still be written for it.
import { describe, expect, it } from 'vitest'
import { receivable, typeRows } from '../../src/renderer/features/laundry/derive'
import { makeHarness, setUp } from '../factories/desk'

describe('kapatılan çamaşır türü', () => {
  it('10 çarşaf gönderilip tür kapatılınca satır "listeden kaldırıldı" adıyla bekleyen 10 adetle kalır', async () => {
    const h = await makeHarness()
    await setUp(h)
    const ctx = h.desktop.ctxFor(7)
    const s = h.services
    const contact = s.contacts.create(ctx, { name: 'Örnek Çamaşırhane', category: 'laundry' })
    const types = s.lists.list(ctx, 'laundryItemTypes')
    const sheet = types.find((t) => t.code === 'sheet')!
    const towel = types.find((t) => t.code === 'bath_towel')!
    const pillow = types.find((t) => t.code !== 'sheet' && t.code !== 'bath_towel')!
    s.laundry.recordDelivery(ctx, {
      date: '2026-10-03',
      direction: 'out',
      contactId: contact.id,
      items: [
        { itemTypeId: sheet.id, qty: 10 },
        { itemTypeId: towel.id, qty: 4 }
      ]
    })
    s.lists.update(ctx, { kind: 'laundryItemTypes', id: sheet.id, patch: { active: false } })
    s.lists.update(ctx, { kind: 'laundryItemTypes', id: pillow.id, patch: { active: false } })
    // As the screen reads them: every type, closed ones included.
    const all = s.lists
      .list(ctx, 'laundryItemTypes', { includeInactive: true })
      .map((t) => ({ id: t.id, name: t.code ?? t.id, active: t.active }))
    const outstanding = s.laundry.outstanding(ctx, contact.id, '2026-10-05')
    const deliveries = s.laundry.listDeliveries(ctx, { contactId: contact.id })
    const rows = typeRows(all, deliveries as never, outstanding as never, [], { year: 2026, month: 10 })
    const sheetRow = rows.find((r) => r.item.id === sheet.id)
    expect(sheetRow).toBeDefined()
    expect(sheetRow!.inTransit + sheetRow!.missing).toBe(10)
    // A closed type nothing is owed of stays out of the list.
    expect(rows.some((r) => r.item.id === pillow.id)).toBe(false)
    // The return form offers the closed sheet (pieces out) but not the closed type with nothing out.
    const offered = receivable(all, rows).map((t) => t.id)
    expect(offered).toContain(sheet.id)
    expect(offered).not.toContain(pillow.id)
    expect(offered).toContain(towel.id)
  })
})
