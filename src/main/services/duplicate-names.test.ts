// QA3c2 #3–#6: a name another row already has is refused whatever the letter case (Turkish rules), in the lists,
// room types, roles and usernames; the row's own name stays free to change.
import { afterEach, describe, expect, it } from 'vitest'
import { roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { createServices } from '.'

const owner = roleCtx('owner')
const runtime = {
  name: 'Bismuth',
  version: 'test',
  packaged: false,
  dataDir: '',
  electron: null,
  chrome: null
}

let handle: DatabaseHandle
afterEach(() => handle?.close())

async function services() {
  handle = await seededDatabase()
  return createServices(handle, runtime, { clock: testClock('2026-10-01T09:00:00.000Z') })
}

describe('yinelenen ad reddedilir', () => {
  it('liste satırı: büyük/küçük harf ve İ/ı farkı yok sayılır; yeniden adlandırma da denetlenir; kendi adı serbest', async () => {
    const s = await services()
    const first = s.lists.create(owner, { kind: 'guestTags', name: 'Kırık İniş' })
    expect(() => s.lists.create(owner, { kind: 'guestTags', name: 'kırık iniş' })).toThrow(/errors.nameTaken/)
    expect(() => s.lists.create(owner, { kind: 'guestTags', name: ' KIRIK İNİŞ ' })).toThrow(
      /errors.nameTaken/
    )
    expect(() => s.lists.create(owner, { kind: 'guestTags', name: 'KIRIK INIŞ' })).toThrow(/errors.nameTaken/)
    const other = s.lists.create(owner, { kind: 'guestTags', name: 'Başka' })
    expect(() =>
      s.lists.update(owner, { kind: 'guestTags', id: other.id, patch: { name: 'kırık iniş' } })
    ).toThrow(/errors.nameTaken/)
    expect(
      s.lists.update(owner, { kind: 'guestTags', id: first.id, patch: { name: 'KIRIK İNİŞ' } }).name
    ).toBe('KIRIK İNİŞ')
    // Another list may use the same word.
    expect(() => s.lists.create(owner, { kind: 'productCategories', name: 'Kırık İniş' })).not.toThrow()
  })

  it('oda tipi: kapalı olan dahil aynı ad ikinci kez açılamaz', async () => {
    const s = await services()
    const type = s.rooms.createRoomType(owner, { name: 'Tek kişilik özel', group: 'custom' })
    expect(() => s.rooms.createRoomType(owner, { name: 'TEK KİŞİLİK ÖZEL', group: 'custom' })).toThrow(
      /errors.nameTaken/
    )
    s.rooms.updateRoomType(owner, type.id, { active: false })
    expect(() => s.rooms.createRoomType(owner, { name: 'tek kişilik özel', group: 'custom' })).toThrow(
      /errors.nameTaken/
    )
    const another = s.rooms.createRoomType(owner, { name: 'Aile odası özel', group: 'custom' })
    expect(() => s.rooms.updateRoomType(owner, another.id, { name: 'TEK KİŞİLİK ÖZEL' })).toThrow(
      /errors.nameTaken/
    )
  })

  it('rol adı: mevcut rolün adı dolu sayılır', async () => {
    const s = await services()
    const reception = s.users.listRoles(owner).find((r) => r.code === 'reception')!
    expect(() => s.users.createRole(owner, { name: reception.name.toLocaleUpperCase('tr') })).toThrow(
      /errors.nameTaken/
    )
    const mine = s.users.createRole(owner, { name: 'Gece resepsiyonu' })
    expect(() => s.users.createRole(owner, { name: 'GECE RESEPSİYONU' })).toThrow(/errors.nameTaken/)
    expect(() => s.users.updateRole(owner, mine.id, { name: reception.name })).toThrow(/errors.nameTaken/)
  })

  it('kullanıcı adı: SAHIP ile sahip (noktasız ı) aynı hesap sayılır', async () => {
    const s = await services()
    const role = s.users.listRoles(owner).find((r) => r.code === 'reception')!
    s.users.createUser(owner, {
      username: 'sahip',
      displayName: 'Örnek Sahip',
      roleId: role.id,
      password: 'ornek-sifre-1'
    })
    expect(() =>
      s.users.createUser(owner, {
        username: 'SAHIP',
        displayName: 'Başka',
        roleId: role.id,
        password: 'ornek-sifre-1'
      })
    ).toThrow(/errors.usernameTaken/)
  })
})
