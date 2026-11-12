// The read-only copy answering the screens (faz-13 madde 3, G-141): every procedure goes through the same router and
// services on a read-only connection, as the person the copy was made for, with every edit right off. A screen's
// read answers (203), a change is refused with "read-only copy" (never a crash, never a write).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contract } from '@shared/contract'
import { MIGRATIONS, SCHEMA_VERSION } from '../../../tests/factories/db'
import { hostHarness, type HostHarness } from '../../../tests/unit/host-harness'
import { systemCtx } from '../services/context'
import { readState, applySnapshot } from './apply'
import { snapshotMeta, snapshotRows, tableDigests } from './feed'
import { createReplicaStore, type ReplicaStore } from './store'

let h: HostHarness
let dir: string
let store: ReplicaStore
let owner: string

beforeEach(async () => {
  h = await hostHarness()
  owner = h.user('sahip', 'owner')
  dir = mkdtempSync(join(tmpdir(), 'bismuth-store-'))
  store = createReplicaStore({ root: dir, migrationsFolder: MIGRATIONS, version: '0.1.0' })
  const meta = snapshotMeta(h.handle.sqlite, SCHEMA_VERSION, new Date())
  applySnapshot(store.writer(), meta, snapshotRows(h.handle.sqlite, { identity: true }), {
    identity: true,
    source: 'live',
    asOf: meta.at
  })
})
afterEach(() => {
  store.close()
  h.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('yedek kopyadan okuma', () => {
  it('kopya kaynağın aynısıdır ve sahibin gözüyle okunur', async () => {
    expect(store.usable()).toBe(true)
    expect(readState(store.writer()).epoch).toBe(1)
    expect(tableDigests(store.writer(), { identity: true })).toEqual(
      tableDigests(h.handle.sqlite, { identity: true })
    )
    const state = await store.call('auth.state', '{}', owner)
    expect(state.status).toBe(203)
    expect(JSON.parse(state.body)).toMatchObject({ setup: 'done', session: { user: { username: 'sahip' } } })
    const rooms = await store.call('rooms.listTypes', '{}', owner)
    expect(rooms.status).toBe(203)
  })

  it('hiçbir yordam kopyada çökmez; okumalar 203, değişiklikler "yalnız okunur" ile reddedilir', async () => {
    const crashed: string[] = []
    const wrote: string[] = []
    const before = tableDigests(store.writer(), { identity: true })
    for (const name of Object.keys(contract)) {
      if (name.startsWith('remote.') || name === 'backup.restart' || name.startsWith('setup.')) continue
      const answer = await store.call(name, '{}', owner)
      if (answer.status >= 500) crashed.push(`${name}: ${answer.body}`)
      if (answer.status === 200) wrote.push(name)
    }
    expect(crashed).toEqual([])
    // Nothing answers 200 (that would be "live"): every success is marked as coming from the copy.
    expect(wrote).toEqual([])
    expect(tableDigests(store.writer(), { identity: true })).toEqual(before)
  })

  it('bir değişiklik "yedek kopya: yalnız okunur" der; oturum açma da kopyada yapılmaz', async () => {
    const create = await store.call(
      'guests.create',
      JSON.stringify({ firstName: 'Ali', lastName: 'Kaya' }),
      owner
    )
    expect(create.status).toBe(409)
    expect(JSON.parse(create.body)).toMatchObject({ error: { messageKey: 'errors.readOnlyCopy' } })
    const signIn = await store.call('auth.signIn', JSON.stringify({ username: 'sahip', secret: 'x' }), owner)
    expect(JSON.parse(signIn.body)).toMatchObject({ error: { messageKey: 'errors.readOnlyCopy' } })
    expect(h.services.guests.list(systemCtx(), {})).toBeTruthy()
  })

  it('kopyada bulunmayan kişi okuyamaz', async () => {
    expect((await store.call('rooms.listTypes', '{}', 'nobody')).status).toBe(401)
  })
})
