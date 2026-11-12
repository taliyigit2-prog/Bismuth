// Faz 7 rights through the router (G-23): every ledger procedure × every system role is refused with 403 exactly
// when the role's default level is below what it needs (S-30: the "x" only for Sahip + Müdür; G-67: the owner's
// section only for the owner). Allowed calls may still fail for other reasons (unknown id, day closing off).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { expenseSections, paymentMethods } from '../../src/main/db/schema'
import { roleCtx } from '../factories/ctx'
import { faz12Api, type Need, type Probe } from './faz12-api'

let env: Awaited<ReturnType<typeof faz12Api>>
beforeAll(async () => {
  env = await faz12Api()
})
afterAll(() => env.close())

const need = (permission: Need['permission'], level: Need['level']): Need => ({ permission, level })

describe('defter ve kasa yetkileri', () => {
  it('her rol × her yordam: yalnız yetkisi yetmeyen rol 403 alır', async () => {
    const { ids, handle } = env
    const cash = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
    let n = 0
    const probes: Probe[] = [
      { name: 'ledger.options', body: () => ({}), needs: [need('ledger', 'view')] },
      { name: 'ledger.day', body: () => ({ date: '2026-10-01' }), needs: [need('ledger', 'view')] },
      { name: 'ledger.month', body: () => ({ year: 2026, month: 10 }), needs: [need('ledger', 'view')] },
      { name: 'ledger.setSort', body: () => ({ sort: 'time' }), needs: [need('ledger', 'view')] },
      {
        name: 'ledger.setDayNote',
        body: () => ({ date: '2026-10-01', note: `Not ${++n}` }),
        needs: [need('ledger', 'edit')]
      },
      {
        name: 'ledger.closeDay',
        body: () => ({ date: '2026-10-01' }),
        needs: [need('business_day.close', 'edit')]
      },
      {
        name: 'ledger.reopenDay',
        body: () => ({ date: '2026-10-01', reason: 'yanlış kapandı' }),
        needs: [need('business_day.close', 'edit')]
      },
      { name: 'ledger.cashPanel', body: () => ({}), needs: [need('cash', 'view')] },
      { name: 'ledger.drawerSummary', body: () => ({}), needs: [need('cash', 'view')] },
      { name: 'ledger.handovers', body: () => ({}), needs: [need('cash', 'view')] },
      {
        name: 'ledger.handover',
        body: () => ({ paymentIds: ['yok'] }),
        needs: [need('payments.handover', 'edit')]
      },
      {
        name: 'ledger.revertHandover',
        body: () => ({ id: 'yok', reason: 'yanlış' }),
        needs: [need('payments.handover', 'edit')]
      },
      {
        name: 'ledger.searchReservations',
        body: () => ({ date: '2026-10-01' }),
        needs: [need('payments', 'view')]
      },
      {
        name: 'ledger.addPayment',
        body: () => ({
          reservationId: 'yok',
          date: '2026-10-01',
          methodId: cash,
          amountMinor: 100,
          currency: 'TRY'
        }),
        needs: [need('payments', 'edit')]
      },
      {
        name: 'ledger.updatePayment',
        body: () => ({ id: 'yok', patch: { note: 'x' } }),
        needs: [need('payments', 'edit')]
      },
      {
        name: 'ledger.voidPayment',
        body: () => ({ id: 'yok', reason: 'yanlış' }),
        needs: [need('payments.void', 'edit')]
      },
      {
        name: 'ledger.sellExtra',
        body: () => ({ extraServiceId: 'yok', date: '2026-10-01', unitMinor: 100, currency: 'TRY' }),
        needs: [need('extras', 'edit')]
      },
      { name: 'ledger.expense', body: () => ({ id: ids.purchase.id }), needs: [need('expenses', 'view')] },
      {
        name: 'ledger.addExpense',
        body: () => ({
          date: '2026-10-01',
          sectionId: ids.general,
          amountMinor: 1_000,
          currency: 'TRY',
          description: `Market ${++n}`
        }),
        needs: [need('expenses', 'edit')]
      },
      {
        name: 'ledger.updateExpense',
        body: () => ({ id: 'yok', patch: { description: 'x' } }),
        needs: [need('expenses', 'edit')]
      },
      {
        name: 'ledger.voidExpense',
        body: () => ({ id: 'yok', reason: 'yanlış' }),
        needs: [need('expenses', 'edit')]
      },
      {
        name: 'ledger.suggestDescriptions',
        body: () => ({ prefix: 'ma' }),
        needs: [need('expenses', 'view')]
      },
      { name: 'ledger.descriptionGroups', body: () => ({}), needs: [need('expenses', 'view')] },
      {
        name: 'ledger.renameDescription',
        body: () => ({ key: 'yok', description: 'Market' }),
        needs: [need('expenses', 'edit')]
      },
      // K-43: payments or expenses view (same columns in every system role).
      {
        name: 'ledger.knownRates',
        body: () => ({ currencies: ['EUR'] }),
        needs: [need('payments', 'view')]
      }
    ]
    expect(await env.matrix(probes)).toEqual([])
  })

  it('Resepsiyon yönetici giderini API üzerinden de göremez ve yazamaz; toplam kısmi işaretlenir', async () => {
    const { handle, call } = env
    const ownerSection = handle.db
      .select()
      .from(expenseSections)
      .where(eq(expenseSections.code, 'owner'))
      .get()!.id
    const written = await call(
      'ledger.addExpense',
      {
        date: '2026-10-02',
        sectionId: ownerSection,
        amountMinor: 900_000,
        currency: 'TRY',
        description: 'Sahibin özel harcaması'
      },
      roleCtx('owner')
    )
    expect(written.status).toBe(200)
    const { id } = JSON.parse(written.body) as { id: string }
    const day = await call('ledger.day', { date: '2026-10-02' }, roleCtx('reception'))
    expect(day.status).toBe(200)
    expect(day.body).not.toContain('Sahibin özel harcaması')
    expect(JSON.parse(day.body)).toMatchObject({ partial: true, totals: { expensesBaseMinor: 0 } })
    expect((await call('ledger.expense', { id }, roleCtx('reception'))).status).toBe(403)
    expect(
      (
        await call(
          'ledger.addExpense',
          { date: '2026-10-02', sectionId: ownerSection, amountMinor: 1, currency: 'TRY', description: 'x' },
          roleCtx('reception')
        )
      ).status
    ).toBe(403)
    expect(
      (await call('ledger.updateExpense', { id, patch: { amountMinor: 1 } }, roleCtx('manager'))).status
    ).toBe(403)
    const ownersDay = JSON.parse((await call('ledger.day', { date: '2026-10-02' }, roleCtx('owner'))).body)
    expect(ownersDay).toMatchObject({ partial: false, totals: { expensesBaseMinor: 900_000 } })
  })
})
