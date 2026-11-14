// Faz 12 rights through the router (G-23): supplies and laundry (Sahip/Müdür/Resepsiyon/Muhasebeci edit by default,
// S-09), a purchase also needs the expense right of its section (G-67), "ödendi" the expense right (G-71).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defaultPermissions } from '../../src/shared/permissions'
import { roleCtx } from '../factories/ctx'
import { PNG_BASE64, faz12Api, type Need, type Probe } from './faz12-api'

let env: Awaited<ReturnType<typeof faz12Api>>
beforeAll(async () => {
  env = await faz12Api()
})
afterAll(() => env.close())

const need = (permission: Need['permission'], level: Need['level']): Need => ({ permission, level })

describe('tedarik ve çamaşırhane yetkileri', () => {
  it('her rol × her yordam: yalnız yetkisi yetmeyen rol 403 alır', async () => {
    let n = 0
    const { ids } = env
    const purchase = () => ({
      date: '2026-10-02',
      sectionId: ids.general,
      amountMinor: 6_500,
      currency: 'TRY',
      description: 'Munzur Su Bayii',
      items: [{ productId: ids.product.id, qtyMilli: 1_000, unitPriceMinor: 6_500 }]
    })
    const probes: Probe[] = [
      { name: 'supply.categories', body: () => ({}), needs: [need('supplies', 'view')] },
      {
        name: 'supply.createCategory',
        body: () => ({ name: `Kategori ${++n}` }),
        needs: [need('supplies', 'edit')]
      },
      { name: 'supply.overview', body: () => ({ year: 2026, month: 10 }), needs: [need('supplies', 'view')] },
      { name: 'supply.products', body: () => ({}), needs: [need('supplies', 'view')] },
      {
        name: 'supply.createProduct',
        body: () => ({ name: `Ürün ${++n}`, categoryId: ids.categoryId, unit: 'kg' }),
        needs: [need('supplies', 'edit')]
      },
      {
        name: 'supply.updateProduct',
        body: () => ({ id: ids.product.id, patch: { trackStock: false } }),
        needs: [need('supplies', 'edit')]
      },
      {
        name: 'supply.priceHistory',
        body: () => ({ productId: ids.product.id }),
        needs: [need('supplies', 'view')]
      },
      {
        name: 'supply.monthSummary',
        body: () => ({ year: 2026, month: 10 }),
        needs: [need('supplies', 'view')]
      },
      {
        name: 'supply.purchases',
        body: () => ({ from: '2026-10-01', to: '2026-10-31' }),
        needs: [need('supplies', 'view'), need('expenses', 'view')]
      },
      {
        name: 'supply.recordPurchase',
        body: purchase,
        needs: [need('supplies', 'edit'), need('expenses', 'edit')]
      },
      {
        name: 'supply.voidPurchase',
        body: () => ({ id: 'yok', reason: 'yanlış' }),
        needs: [need('supplies', 'edit'), need('expenses', 'view')]
      },
      { name: 'supply.sections', body: () => ({}), needs: [need('expenses', 'view')] },
      {
        name: 'supply.addPhoto',
        body: () => ({
          entity: 'expense',
          id: ids.purchase.id,
          fileName: 'fis.png',
          mime: 'image/png',
          dataBase64: PNG_BASE64
        }),
        needs: [need('expenses', 'edit')]
      },
      {
        name: 'supply.photos',
        body: () => ({ entity: 'laundry_delivery', id: ids.delivery.id }),
        needs: [need('laundry', 'view')]
      },
      {
        name: 'laundry.prices',
        body: () => ({ contactId: ids.laundry.id }),
        needs: [need('laundry', 'view')]
      },
      {
        name: 'laundry.setPrice',
        body: () => ({
          contactId: ids.laundry.id,
          itemTypeId: ids.sheet,
          validFrom: '2026-10-01',
          unitPriceMinor: 1_500
        }),
        needs: [need('laundry', 'edit')]
      },
      { name: 'laundry.deliveries', body: () => ({}), needs: [need('laundry', 'view')] },
      {
        name: 'laundry.recordDelivery',
        body: () => ({
          date: '2026-10-02',
          direction: 'in',
          contactId: ids.laundry.id,
          items: [{ itemTypeId: ids.sheet, qty: 5 }]
        }),
        needs: [need('laundry', 'edit')]
      },
      {
        name: 'laundry.voidDelivery',
        body: () => ({ id: 'yok', reason: 'yanlış' }),
        needs: [need('laundry', 'edit')]
      },
      {
        name: 'laundry.outstanding',
        body: () => ({ contactId: ids.laundry.id }),
        needs: [need('laundry', 'view')]
      },
      {
        name: 'laundry.month',
        body: () => ({ contactId: ids.laundry.id, year: 2026, month: 10 }),
        needs: [need('laundry', 'view')]
      },
      {
        name: 'laundry.settle',
        body: () => ({ contactId: ids.laundry.id, year: 2026, month: 9, invoicedTotalMinor: 0, paid: false }),
        needs: [need('laundry', 'edit')]
      },
      {
        name: 'laundry.reopenMonth',
        body: () => ({ contactId: ids.laundry.id, year: 2026, month: 9, reason: 'fatura yanlış' }),
        needs: [need('laundry', 'edit'), need('business_day.close', 'edit')]
      },
      {
        name: 'laundry.trend',
        body: () => ({ contactId: ids.laundry.id, until: '2026-10-04' }),
        needs: [need('laundry', 'view')]
      }
    ]
    expect(await env.matrix(probes)).toEqual([])
  })

  it('"ödendi" deftere gider yazdığından gider yetkisi ister; temizlik rolü fiyat göremez', async () => {
    const { ids } = env
    const body = { contactId: ids.laundry.id, year: 2026, month: 8, invoicedTotalMinor: 5_000 }
    const housekeeping = roleCtx('housekeeping')
    expect((await env.call('laundry.settle', body, housekeeping)).status).toBe(403)
    const paid = await env.call('laundry.settle', body, roleCtx('reception'))
    expect(paid.status).toBe(200)
    expect(JSON.parse(paid.body).settled.expenseId).toBeTruthy()
  })

  it('Muhasebeci tedarik ve çamaşırhaneyi düzenler: fiyat, teslim fişi, fatura ve "Ödendi" (faz-12 madde 5, P10fix #17)', async () => {
    const { ids } = env
    const accountant = roleCtx('accountant')
    expect(defaultPermissions('accountant')).toMatchObject({ supplies: 'edit', laundry: 'edit' })
    expect(defaultPermissions('reception')).toMatchObject({ supplies: 'edit', laundry: 'edit' })
    const price = await env.call(
      'laundry.setPrice',
      { contactId: ids.laundry.id, itemTypeId: ids.sheet, validFrom: '2026-07-01', unitPriceMinor: 1_200 },
      accountant
    )
    expect(price.status).toBe(200)
    const settle = await env.call(
      'laundry.settle',
      { contactId: ids.laundry.id, year: 2026, month: 7, invoicedTotalMinor: 4_000 },
      accountant
    )
    expect(settle.status).toBe(200)
    expect(JSON.parse(settle.body).settled.expenseId).toBeTruthy()
  })

  it('alım fişinin fotoğrafı yalnız giderini görebilen role açılır', async () => {
    const { ids } = env
    const owner = roleCtx('owner')
    const added = await env.call(
      'supply.addPhoto',
      {
        entity: 'expense',
        id: ids.purchase.id,
        fileName: 'fis.png',
        mime: 'image/png',
        dataBase64: PNG_BASE64
      },
      owner
    )
    expect(added.status).toBe(200)
    const { id } = JSON.parse(added.body) as { id: string }
    const listed = await env.call(
      'supply.photos',
      { entity: 'expense', id: ids.purchase.id },
      roleCtx('reception')
    )
    expect((JSON.parse(listed.body) as { id: string }[]).map((p) => p.id)).toContain(id)
    expect((await env.call('supply.readPhoto', { id }, roleCtx('housekeeping'))).status).toBe(403)
    expect((await env.call('lostItems.readPhoto', { id }, owner)).status).toBe(404)
  })
})
