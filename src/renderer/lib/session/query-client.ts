// The app's query client. Every query and mutation error passes here: a 401 that says the session is gone or the
// window is locked (the main process locks on its own when the computer sleeps or locks; a session ends when its
// device is removed or the password changes elsewhere) means the sign-in state changed. `auth.state` is asked
// again and the gate moves the window to the lock or sign-in screen; screens show no error for it.
import { MutationCache, QueryCache, QueryClient, type QueryClientConfig } from '@tanstack/react-query'
import { ApiError } from '../transport/types'
import { AUTH_STATE_KEY } from './session'

/** The sign-in state changed under the window (not a wrong password: that is `errors.invalidCredentials`). */
export const SESSION_ERROR_KEYS: readonly string[] = ['errors.unauthenticated', 'errors.locked']

export function isSessionError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401 && SESSION_ERROR_KEYS.includes(error.messageKey)
}

export function createAppQueryClient(config: Omit<QueryClientConfig, 'queryCache' | 'mutationCache'> = {}) {
  let client: QueryClient | null = null
  const onError = (error: unknown): void => {
    if (client && isSessionError(error)) void client.invalidateQueries({ queryKey: AUTH_STATE_KEY })
  }
  client = new QueryClient({
    ...config,
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError })
  })
  return client
}
