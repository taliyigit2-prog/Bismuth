import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions
} from '@tanstack/react-query'
import type {
  ProcedureInput,
  ProcedureName,
  ProcedureOutput,
  SettingsPatch,
  SettingsValues
} from '@shared/contract'
import type { ApiError } from '../transport'
import { useTransport } from './api-context'

export const queryKey = <K extends ProcedureName>(name: K, input?: ProcedureInput<K>) =>
  input === undefined ? [name] : [name, input]

/** TanStack Query wrapper around a contract procedure. */
export function useApiQuery<K extends ProcedureName>(
  name: K,
  input: ProcedureInput<K>,
  options: Omit<UseQueryOptions<ProcedureOutput<K>, ApiError>, 'queryKey' | 'queryFn'> = {}
) {
  const transport = useTransport()
  return useQuery<ProcedureOutput<K>, ApiError>({
    queryKey: queryKey(name, input),
    queryFn: () => transport.call(name, input),
    ...options
  })
}

export type ApiMutationOptions<K extends ProcedureName, C = unknown> = Omit<
  UseMutationOptions<ProcedureOutput<K>, ApiError, ProcedureInput<K>, C>,
  'mutationFn'
> & {
  /** Procedures whose queries are stale after this write (every input of each): refetched once it succeeds. */
  invalidates?: readonly ProcedureName[]
}

/** TanStack mutation around a contract procedure (writes). `invalidates` refreshes the screens that read it. */
export function useApiMutation<K extends ProcedureName, C = unknown>(
  name: K,
  { invalidates, onSuccess, ...options }: ApiMutationOptions<K, C> = {}
) {
  const transport = useTransport()
  const client = useQueryClient()
  return useMutation<ProcedureOutput<K>, ApiError, ProcedureInput<K>, C>({
    mutationFn: (input) => transport.call(name, input),
    ...options,
    onSuccess: async (...args) => {
      if (invalidates?.length)
        await Promise.all(invalidates.map((n) => client.invalidateQueries({ queryKey: [n] })))
      await onSuccess?.(...args)
    }
  })
}

export function useSettings() {
  return useApiQuery('settings.get', {}, { staleTime: Infinity })
}

export function useUpdateSettings() {
  const transport = useTransport()
  const client = useQueryClient()
  return useMutation<SettingsValues, ApiError, SettingsPatch>({
    mutationFn: (patch) => transport.call('settings.set', patch),
    onSuccess: (values) => client.setQueryData(['settings.get', {}], values)
  })
}
