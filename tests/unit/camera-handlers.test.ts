// The camera handlers pass service failures on to the caller (a refused alarm mark must not answer ok).
import { describe, expect, it } from 'vitest'
import { cameraHandlers } from '../../src/main/api/handlers/camera'
import type { Services } from '../../src/main/services'

describe('kamera işleyicileri', () => {
  it('alarm işaretleme reddedilirse istemci ok değil hata alır', async () => {
    const refused = Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' })
    const services = {
      camera: { markAlert: () => Promise.reject(refused) }
    } as unknown as Services
    const handlers = cameraHandlers(services)
    const call = handlers['camera.markAlert'] as (ctx: unknown, input: unknown) => Promise<unknown>
    await expect(call({}, { id: '0'.repeat(26), state: 'seen' })).rejects.toBe(refused)
  })
})
