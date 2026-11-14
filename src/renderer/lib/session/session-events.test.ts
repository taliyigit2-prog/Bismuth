// P21b: another hotel's main computer in use → the earlier hotel's cached data and sign-in leave the window.
import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { AuthState } from '@shared/contract'
import { AUTH_STATE_KEY, placeIsForgotten, sessionEvents } from './session'

describe('otel değişince oturum yenilenir', () => {
  it('önceki otelin önbelleği silinir, oturum kapanır; bağlantı ekranının soruları kalır', async () => {
    const client = new QueryClient()
    client.setQueryData(AUTH_STATE_KEY, {
      setup: 'done',
      mode: 'client',
      session: { user: { id: 'u1' } }
    } as unknown as AuthState)
    client.setQueryData(['reservations.list', {}], [{ id: 'r1' }])
    client.setQueryData(['ledger.day', { date: '2026-11-13' }], { total: 1 })
    client.setQueryData(['remote.hotels', {}], [{ code: 'a' }])

    await sessionEvents(client).hotelChanged()

    expect(client.getQueryData(['reservations.list', {}])).toBeUndefined()
    expect(client.getQueryData(['ledger.day', { date: '2026-11-13' }])).toBeUndefined()
    expect(client.getQueryData<AuthState>(AUTH_STATE_KEY)?.session).toBeNull()
    expect(client.getQueryData(['remote.hotels', {}])).toBeDefined()
    expect(placeIsForgotten()).toBe(true)
  })
})
