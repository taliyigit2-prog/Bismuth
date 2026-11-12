// Faz 12 rights through the router (G-23): phone book — everyone with `contacts` sees, Resepsiyon edits; lost and
// found — `lost_items`. Every system role × every procedure: 403 exactly when the role's default is too low.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { roleCtx } from '../factories/ctx'
import { PNG_BASE64, faz12Api, type Probe } from './faz12-api'

let env: Awaited<ReturnType<typeof faz12Api>>
beforeAll(async () => {
  env = await faz12Api()
})
afterAll(() => env.close())

const view = (permission: 'contacts' | 'lost_items') => [{ permission, level: 'view' as const }]
const edit = (permission: 'contacts' | 'lost_items') => [{ permission, level: 'edit' as const }]

describe('rehber ve kayıp eşya yetkileri', () => {
  it('her rol × her yordam: yalnız yetkisi yetmeyen rol 403 alır', async () => {
    let n = 0
    const probes: Probe[] = [
      { name: 'contacts.list', body: () => ({ q: 'su' }), needs: view('contacts') },
      { name: 'contacts.favorites', body: () => ({}), needs: view('contacts') },
      {
        name: 'contacts.create',
        body: () => ({ name: `Taksi ${++n}`, category: 'taxi' }),
        needs: edit('contacts')
      },
      {
        name: 'contacts.update',
        body: () => ({ id: env.ids.supplier.id, patch: { favorite: true } }),
        needs: edit('contacts')
      },
      {
        name: 'contacts.setActive',
        body: () => ({ id: env.ids.supplier.id, active: true }),
        needs: edit('contacts')
      },
      {
        name: 'contacts.import',
        body: () => ({ contacts: [{ name: `Usta ${++n}`, category: 'plumber' }] }),
        needs: edit('contacts')
      },
      { name: 'lostItems.list', body: () => ({}), needs: view('lost_items') },
      {
        name: 'lostItems.create',
        body: () => ({ description: `Gözlük ${++n}` }),
        needs: edit('lost_items')
      },
      {
        name: 'lostItems.update',
        body: () => ({ id: env.ids.lost.id, patch: { storageLocation: 'Kasa' } }),
        needs: edit('lost_items')
      },
      {
        name: 'lostItems.markReturned',
        body: () => ({ id: 'yok', input: { returnedTo: 'Misafir' } }),
        needs: edit('lost_items')
      },
      {
        name: 'lostItems.markDisposed',
        body: () => ({ id: 'yok', reason: 'süre doldu' }),
        needs: edit('lost_items')
      },
      { name: 'lostItems.restore', body: () => ({ id: 'yok', reason: 'yanlış' }), needs: edit('lost_items') },
      {
        name: 'lostItems.addPhoto',
        body: () => ({ id: env.ids.lost.id, fileName: 'a.png', mime: 'image/png', dataBase64: PNG_BASE64 }),
        needs: edit('lost_items')
      },
      { name: 'lostItems.photos', body: () => ({ id: env.ids.lost.id }), needs: view('lost_items') }
    ]
    expect(await env.matrix(probes)).toEqual([])
  })

  it('kayıp eşya fotoğrafı yerel klasöre yazılır ve aynı baytlarla geri okunur', async () => {
    const owner = roleCtx('owner')
    const added = await env.call(
      'lostItems.addPhoto',
      { id: env.ids.lost.id, fileName: 'şemsiye.png', mime: 'image/png', dataBase64: PNG_BASE64 },
      owner
    )
    expect(added.status).toBe(200)
    const { id } = JSON.parse(added.body) as { id: string }
    const read = await env.call('lostItems.readPhoto', { id }, owner)
    expect(JSON.parse(read.body)).toEqual({ id, mime: 'image/png', dataBase64: PNG_BASE64 })
    // A lost item's file is not readable through another module's procedure.
    expect((await env.call('supply.readPhoto', { id }, owner)).status).toBe(404)
    expect((await env.call('lostItems.readPhoto', { id }, roleCtx('accountant'))).status).toBe(403)
    const wrongType = await env.call(
      'lostItems.addPhoto',
      { id: env.ids.lost.id, fileName: 'x.png', mime: 'image/png', dataBase64: 'aGVsbG8=' },
      owner
    )
    expect(JSON.parse(wrongType.body).error.messageKey).toBe('errors.attachmentType')
  })
})
