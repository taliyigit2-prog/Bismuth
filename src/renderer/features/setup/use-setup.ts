// The wizard's procedures (G-10): its state and choices, and the four writes. Mutations follow
// settings/use-status-tags.ts (transport from the API context, errors as ApiError with a messageKey).
import { useMutation } from '@tanstack/react-query'
import type { AppMode, ProcedureInput, ProcedureOutput, SetupDraft } from '@shared/contract'
import { useTransport } from '@/lib/api/api-context'
import { useApiQuery } from '@/lib/api/hooks'
import type { ApiError } from '@/lib/transport'

export function useSetupState() {
  return useApiQuery('setup.state', {}, { staleTime: Infinity, refetchOnWindowFocus: false })
}

/** Only while the hotel is not set up: afterwards the procedure is closed. */
export function useSetupOptions(enabled: boolean) {
  return useApiQuery('setup.options', {}, { staleTime: Infinity, refetchOnWindowFocus: false, enabled })
}

export function useSetupWrites() {
  const transport = useTransport()
  const save = useMutation<unknown, ApiError, ProcedureInput<'setup.saveProgress'>>({
    mutationFn: (input) => transport.call('setup.saveProgress', input)
  })
  const setMode = useMutation<unknown, ApiError, AppMode>({
    mutationFn: (mode) => transport.call('setup.setMode', { mode })
  })
  const finish = useMutation<ProcedureOutput<'setup.finish'>, ApiError, SetupDraft>({
    mutationFn: (draft) => transport.call('setup.finish', draft)
  })
  return { save, setMode, finish }
}
