// Guest tags (G-50, K-46 (2)): the hotel's list in Ayarlar → Listeler (switched off, never deleted), giving and
// taking a tag on the card (audited), the guest list's tag filter, the merge moving tags to the card that stays,
// and the rights (list = settings.lists, card = guests edit).
import { afterEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { auditLog, guestTagLinks, guestTags } from '../db/schema'
import { createGuestsService } from './guests-service'
import { createListsService } from './lists-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const housekeeping = roleCtx('housekeeping')
const accountant = roleCtx('accountant')

let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const deps = depsOf(handle, testClock())
  const guestsSvc = createGuestsService(deps)
  const lists = createListsService(deps)
  const tag = (name: string) => lists.create(owner, { kind: 'guestTags', name }).id
  const regular = tag('Düzenli')
  const firm = tag('Firma misafiri')
  const quiet = tag('Sessiz oda ister')
  const ayse = guestsSvc.create(owner, { firstName: 'Ayşe', lastName: 'Örnek' }).id
  const ali = guestsSvc.create(owner, { firstName: 'Ali', lastName: 'Deneme' }).id
  return { guestsSvc, lists, ids: { regular, firm, quiet, ayse, ali } }
}

const auditOf = (guestId: string) =>
  handle.db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, 'guest'), eq(auditLog.entityId, guestId), eq(auditLog.action, 'update')))
    .all()

describe('misafir etiketleri listesi (Ayarlar → Listeler)', () => {
  it('etiket eklenir, sıralanır ve kapatılır; silinmez, denetim kaydında görünür', async () => {
    const { lists, ids } = await setup()
    expect(lists.list(owner, 'guestTags').map((t) => t.name)).toEqual([
      'Düzenli',
      'Firma misafiri',
      'Sessiz oda ister'
    ])
    lists.update(owner, { kind: 'guestTags', id: ids.quiet, patch: { active: false } })
    expect(lists.list(reception, 'guestTags').map((t) => t.id)).toEqual([ids.regular, ids.firm])
    expect(lists.list(reception, 'guestTags', { includeInactive: true })).toHaveLength(3)
    expect(handle.db.select().from(guestTags).all()).toHaveLength(3)
    const rows = handle.db.select().from(auditLog).where(eq(auditLog.entity, 'guest_tag')).all()
    expect(rows.map((r) => r.action)).toEqual(['create', 'create', 'create', 'update'])
  })

  it('etiket listesini yalnız liste ayarı yetkisi olan değiştirir (Resepsiyon → PermissionDenied)', async () => {
    const { lists, ids } = await setup()
    expect(() => lists.create(reception, { kind: 'guestTags', name: 'Yeni' })).toThrow(
      expect.objectContaining({ code: 'PERMISSION_DENIED' })
    )
    expect(() =>
      lists.update(reception, { kind: 'guestTags', id: ids.regular, patch: { active: false } })
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
    expect(lists.create(owner, { kind: 'guestTags', name: 'Uzun kalış' }).seeded).toBe(false)
  })
})

describe('misafire etiket vermek (G-50)', () => {
  it('karttan etiket eklenir ve çıkarılır; her değişiklik önceki ve sonraki takımla denetime yazılır', async () => {
    const { guestsSvc, ids } = await setup()
    expect(guestsSvc.setTags(reception, { id: ids.ayse, tagIds: [ids.firm, ids.regular] })).toEqual({
      tagIds: [ids.regular, ids.firm]
    })
    expect(guestsSvc.card(owner, ids.ayse).tagIds).toEqual([ids.regular, ids.firm])
    expect(guestsSvc.setTags(reception, { id: ids.ayse, tagIds: [ids.firm] }).tagIds).toEqual([ids.firm])
    const rows = auditOf(ids.ayse)
    expect(rows.map((r) => [JSON.parse(r.beforeJson ?? '{}'), JSON.parse(r.afterJson ?? '{}')])).toEqual([
      [{ tagIds: [] }, { tagIds: [ids.regular, ids.firm] }],
      [{ tagIds: [ids.regular, ids.firm] }, { tagIds: [ids.firm] }]
    ])
    // The same set again writes nothing.
    guestsSvc.setTags(reception, { id: ids.ayse, tagIds: [ids.firm] })
    expect(auditOf(ids.ayse)).toHaveLength(2)
  })

  it('kapalı etiket kartta kalır ama yeniden verilemez; çıkarılabilir', async () => {
    const { guestsSvc, lists, ids } = await setup()
    guestsSvc.setTags(owner, { id: ids.ayse, tagIds: [ids.quiet] })
    lists.update(owner, { kind: 'guestTags', id: ids.quiet, patch: { active: false } })
    expect(guestsSvc.card(owner, ids.ayse).tagIds).toEqual([ids.quiet])
    // Keeping it while adding another is fine.
    expect(guestsSvc.setTags(owner, { id: ids.ayse, tagIds: [ids.quiet, ids.regular] }).tagIds).toEqual([
      ids.regular,
      ids.quiet
    ])
    expect(() => guestsSvc.setTags(owner, { id: ids.ali, tagIds: [ids.quiet] })).toThrow(
      expect.objectContaining({ code: 'CONFLICT', messageKey: 'errors.guestTagClosed' })
    )
    expect(guestsSvc.setTags(owner, { id: ids.ayse, tagIds: [ids.regular] }).tagIds).toEqual([ids.regular])
  })

  it('olmayan etiket ya da birleştirilmiş kart reddedilir', async () => {
    const { guestsSvc, ids } = await setup()
    expect(() => guestsSvc.setTags(owner, { id: ids.ayse, tagIds: ['01J0000000000000000000NOPE'] })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' })
    )
    guestsSvc.merge(owner, ids.ali, ids.ayse)
    expect(() => guestsSvc.setTags(owner, { id: ids.ayse, tagIds: [] })).toThrow(
      expect.objectContaining({ messageKey: 'errors.guestMerged' })
    )
  })

  it('etiket vermek misafir düzenleme yetkisi ister (Temizlik, Muhasebe → PermissionDenied)', async () => {
    const { guestsSvc, ids } = await setup()
    for (const ctx of [housekeeping, accountant])
      expect(() => guestsSvc.setTags(ctx, { id: ids.ayse, tagIds: [ids.regular] })).toThrow(
        expect.objectContaining({ code: 'PERMISSION_DENIED' })
      )
    expect(handle.db.select().from(guestTagLinks).all()).toEqual([])
  })
})

describe('misafir listesinde etiket süzgeci', () => {
  it('yalnız o etiketi taşıyanlar listelenir; satırlar etiketleri taşır; sayaçlar süzgece uyar', async () => {
    const { guestsSvc, ids } = await setup()
    guestsSvc.update(owner, ids.ali, { vip: true })
    guestsSvc.setTags(owner, { id: ids.ayse, tagIds: [ids.regular, ids.firm] })
    guestsSvc.setTags(owner, { id: ids.ali, tagIds: [ids.firm] })
    const all = guestsSvc.list(owner, {})
    expect(all.rows.find((r) => r.id === ids.ayse)?.tagIds).toEqual([ids.regular, ids.firm])
    const regular = guestsSvc.list(owner, { tagId: ids.regular })
    expect(regular.rows.map((r) => r.id)).toEqual([ids.ayse])
    expect(regular.counts.vip).toBe(0)
    const firm = guestsSvc.list(owner, { tagId: ids.firm, filter: 'vip' })
    expect(firm.rows.map((r) => r.id)).toEqual([ids.ali])
    expect(guestsSvc.list(owner, { tagId: ids.quiet }).total).toBe(0)
    expect(guestsSvc.list(owner, { q: 'ayşe', tagId: ids.firm }).rows.map((r) => r.id)).toEqual([ids.ayse])
  })
})

describe('birleştirmede etiketler', () => {
  it('birleştirilen kartın etiketleri kalan karta taşınır, ortak olanlar bir kez kalır', async () => {
    const { guestsSvc, ids } = await setup()
    guestsSvc.setTags(owner, { id: ids.ayse, tagIds: [ids.regular, ids.quiet] })
    guestsSvc.setTags(owner, { id: ids.ali, tagIds: [ids.regular] })
    const result = guestsSvc.merge(owner, ids.ali, ids.ayse)
    expect(result.moved.tags).toBe(1)
    expect(guestsSvc.card(owner, ids.ali).tagIds).toEqual([ids.regular, ids.quiet])
    // The merged card opens the kept one, tags included; its own rows are gone (moved).
    expect(guestsSvc.card(owner, ids.ayse).tagIds).toEqual([ids.regular, ids.quiet])
    expect(guestsSvc.tagIdsOf(owner, ids.ayse)).toEqual([ids.regular, ids.quiet])
    expect(handle.db.select().from(guestTagLinks).where(eq(guestTagLinks.guestId, ids.ayse)).all()).toEqual(
      []
    )
    const merge = handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, ids.ali), eq(auditLog.action, 'merge')))
      .get()!
    expect(JSON.parse(merge.afterJson ?? '{}').tagIds).toEqual([ids.regular, ids.quiet])
  })
})
