// Who may use the P13b parts of Ayarlar → Uzaktan erişim (faz-13 madde 3–5, 8; G-23): the box and summary status
// and the conflict list need `remote.settings` view, "Şimdi yaz" edit; a copy grant is given only over the network
// to a signed-in role with `remote.settings`; every signed-in screen may ask whether this computer was replaced.
// A replaced computer refuses "Şimdi yaz" and new grants; a read-only context says why, not "no permission".
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServices } from '../../src/main/services'
import { readOnlyCtx } from '../../src/main/services/context'
import { requirePermission } from '../../src/main/services/kit'
import { createRemoteService, setReplicaHostRuntime } from '../../src/main/server/remote-service'
import type { DatabaseHandle } from '../../src/main/db/client'
import type { RelayHostStatus } from '@shared/contract/remote'
import type { Replaced } from '../../src/main/relay/epoch'
import { roleCtx } from '../factories/ctx'
import { seededDatabase } from '../factories/db'
import { tempDataDir } from '../factories/runtime'

let handle: DatabaseHandle
afterEach(() => {
  setReplicaHostRuntime(null)
  handle?.close()
})

const STATUS: RelayHostStatus = {
  epoch: 1,
  box: { folder: '/d/Bismuth/kutu', problem: null, lastSegmentAt: null, lastSnapshotAt: null, pending: 0 },
  summary: { folder: '/d/Bismuth', problem: null, lastAt: null },
  keyExists: true,
  replaced: null
}

async function setup(replaced: Replaced | null = null) {
  handle = await seededDatabase()
  const services = createServices(handle, {
    name: 'Bismuth',
    version: '0.1.0',
    packaged: false,
    dataDir: tempDataDir(),
    electron: null,
    chrome: null
  })
  const runtime = {
    db: handle.db,
    relayStatus: () => STATUS,
    relayRun: vi.fn(async () => undefined),
    replaced: () => replaced,
    conflicts: () => [{ seq: 9, tbl: 'guests', pk: ['g1'], op: 'I' as const, ts: 'x' }],
    conflictRows: () => [],
    saveFile: vi.fn(async () => '/tmp/x.json')
  }
  setReplicaHostRuntime(runtime)
  return { services, runtime, remote: createRemoteService(services) }
}

const REPLACED: Replaced = {
  epoch: 2,
  previousEpoch: 1,
  baseSeq: 5,
  by: 'Sahibin Mac',
  at: '2026-10-05T09:00:00.000Z',
  seenAt: '2026-10-05T09:01:00.000Z'
}

describe('kutu, özet, devral — yetki', () => {
  it('sahip kutu durumunu görür ve "Şimdi yaz" der; uzaktan erişim yetkisi olmayan rol 403', async () => {
    const { remote, runtime } = await setup()
    expect(remote.relayStatus(roleCtx('owner'))).toEqual(STATUS)
    await remote.relayRun(roleCtx('owner'))
    expect(runtime.relayRun).toHaveBeenCalledOnce()
    // Telefondan (HTTP) sahip bile kutuya yazdıramaz (QA3d D3).
    runtime.relayRun.mockClear()
    await expect(remote.relayRun({ ...roleCtx('owner'), transport: 'http' })).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      messageKey: 'errors.remoteLocalOnly'
    })
    expect(runtime.relayRun).not.toHaveBeenCalled()
    for (const role of ['manager', 'reception', 'accountant', 'housekeeping'] as const) {
      expect(() => remote.relayStatus(roleCtx(role))).toThrow(
        expect.objectContaining({ code: 'PERMISSION_DENIED' })
      )
      await expect(remote.relayRun(roleCtx(role))).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
      expect(() => remote.conflicts(roleCtx(role))).toThrow(
        expect.objectContaining({ code: 'PERMISSION_DENIED' })
      )
      await expect(remote.saveConflicts(roleCtx(role), 'ipc')).rejects.toMatchObject({
        code: 'PERMISSION_DENIED'
      })
      expect(() => remote.replicaGrant(roleCtx(role), 'http')).toThrow(
        expect.objectContaining({ code: 'PERMISSION_DENIED' })
      )
    }
  })

  it('kopya izni yalnız ağ üzerinden verilir (otel bilgisayarının kendi penceresine değil)', async () => {
    const { remote } = await setup()
    expect(() => remote.replicaGrant(roleCtx('owner'), 'ipc')).toThrow(
      expect.objectContaining({ messageKey: 'errors.notClientMode' })
    )
  })

  it('her oturum "bu bilgisayarın yerine başkası geçti mi" sorusunu sorabilir', async () => {
    const { remote } = await setup(REPLACED)
    expect(remote.epochState()).toEqual({
      epoch: 1,
      replaced: { epoch: 2, by: 'Sahibin Mac', at: '2026-10-05T09:00:00.000Z' }
    })
  })

  it('yerine başkası geçen bilgisayar kutuya yazmaz, kopya izni vermez; çakışan kayıtlar listelenir ve kaydedilir', async () => {
    const { remote, runtime } = await setup(REPLACED)
    await expect(remote.relayRun(roleCtx('owner'))).rejects.toMatchObject({
      messageKey: 'errors.notMainComputer'
    })
    expect(() => remote.replicaGrant(roleCtx('owner'), 'http')).toThrow(
      expect.objectContaining({ messageKey: 'errors.notMainComputer' })
    )
    expect(remote.conflicts(roleCtx('owner'))).toMatchObject({
      replaced: { epoch: 2 },
      items: [{ tbl: 'guests' }]
    })
    expect(await remote.saveConflicts(roleCtx('owner'), 'ipc')).toEqual({ path: '/tmp/x.json' })
    expect(runtime.saveFile).toHaveBeenCalledWith(
      expect.stringMatching(/^bismuth-cakisan-kayitlar-\d{4}-\d{2}-\d{2}\.json$/),
      expect.any(Buffer)
    )
    // From a phone the file cannot be written on this computer.
    await expect(remote.saveConflicts(roleCtx('owner'), 'http')).rejects.toMatchObject({
      messageKey: 'errors.remoteLocalOnly'
    })
  })

  it('salt okunur bağlamda değişiklik "yetkiniz yok" değil, nedenini söyler; görmek serbest', () => {
    const copy = readOnlyCtx(roleCtx('owner'), 'replica')
    expect(() => requirePermission(copy, 'guests', 'edit')).toThrow(
      expect.objectContaining({ code: 'CONFLICT', messageKey: 'errors.readOnlyCopy' })
    )
    expect(() => requirePermission(copy, 'guests', 'view')).not.toThrow()
    const replaced = readOnlyCtx(roleCtx('owner'), 'replaced')
    expect(() => requirePermission(replaced, 'payments', 'edit')).toThrow(
      expect.objectContaining({ messageKey: 'errors.notMainComputer' })
    )
    // A role without the view right still gets "no permission".
    expect(() =>
      requirePermission(readOnlyCtx(roleCtx('housekeeping'), 'replica'), 'staff.salary', 'view')
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
  })
})
