import { describe, expect, it, vi } from 'vitest'
import { MutationObserver, QueryObserver } from '@tanstack/react-query'
import { ApiError } from '../transport/types'
import { createAppQueryClient, isSessionError } from './query-client'
import { AUTH_STATE_KEY } from './session'

const fail = (error: ApiError) => () => Promise.reject(error)
const signedOut = { setup: 'done', mode: 'standalone', session: null }

/** A client whose `auth.state` is on screen (an observer, like the gate) and counts how often it is asked. */
function watched() {
  const client = createAppQueryClient({ defaultOptions: { queries: { retry: false } } })
  const authState = vi.fn().mockResolvedValue(signedOut)
  client.setQueryData(AUTH_STATE_KEY, signedOut)
  const observer = new QueryObserver(client, {
    queryKey: [...AUTH_STATE_KEY],
    queryFn: authState,
    staleTime: Infinity
  })
  const stop = observer.subscribe(() => {})
  return { client, authState, stop }
}

describe('oturum hataları', () => {
  it('bir sorgu "ekran kilitli" (401) derse oturum durumu yeniden sorulur', async () => {
    const { client, authState, stop } = watched()
    await client
      .fetchQuery({
        queryKey: ['rooms.list', {}],
        queryFn: fail(new ApiError('UNAUTHENTICATED', 401, 'errors.locked'))
      })
      .catch(() => undefined)
    await vi.waitFor(() => expect(authState).toHaveBeenCalledTimes(1))
    stop()
  })

  it('bir yazma "oturum yok" (401) derse oturum durumu yeniden sorulur', async () => {
    const { client, authState, stop } = watched()
    await new MutationObserver(client, {
      mutationFn: fail(new ApiError('UNAUTHENTICATED', 401, 'errors.unauthenticated'))
    })
      .mutate(undefined)
      .catch(() => undefined)
    await vi.waitFor(() => expect(authState).toHaveBeenCalledTimes(1))
    stop()
  })

  it('yanlış şifre, yetkisiz işlem ve doğrulama hatası oturum hatası sayılmaz', async () => {
    expect(isSessionError(new ApiError('UNAUTHENTICATED', 401, 'errors.invalidCredentials'))).toBe(false)
    expect(isSessionError(new ApiError('UNAUTHENTICATED', 401, 'errors.pinPaused'))).toBe(false)
    expect(isSessionError(new ApiError('PERMISSION_DENIED', 403, 'errors.permissionDenied'))).toBe(false)
    expect(isSessionError(new ApiError('VALIDATION', 400, 'errors.validation'))).toBe(false)
    expect(isSessionError(new Error('x'))).toBe(false)
    expect(isSessionError(new ApiError('UNAUTHENTICATED', 401, 'errors.locked'))).toBe(true)

    const { client, authState, stop } = watched()
    await client
      .fetchQuery({
        queryKey: ['auth.signIn'],
        queryFn: fail(new ApiError('UNAUTHENTICATED', 401, 'errors.invalidCredentials'))
      })
      .catch(() => undefined)
    await new Promise((r) => setTimeout(r, 20))
    expect(authState).not.toHaveBeenCalled()
    stop()
  })
})
