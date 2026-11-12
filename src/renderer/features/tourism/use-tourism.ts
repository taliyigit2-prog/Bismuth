// Data of the tourism statistics screen: the imports, the selected import's ministry table and comparison, and
// the writes (import, nationality confirmation, country name, in-house correction, "bildirildi").
import type { TFunction } from 'i18next'
import type { ProcedureName } from '@shared/contract'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { ApiError } from '@/lib/transport'

/** A refused write in the user's words (the service's message key; details fill its placeholders). */
export function errorText(t: TFunction, error: unknown): string {
  if (!(error instanceof ApiError)) return t('errors.internal')
  const details = error.details && typeof error.details === 'object' ? error.details : {}
  return t(error.messageKey as 'errors.internal', { ...details, defaultValue: t('errors.internal') })
}

const TABLE_READS: readonly ProcedureName[] = ['tourism.table', 'tourism.compare']

export const useImports = (enabled = true) => useApiQuery('tourism.listImports', {}, { enabled })

export const useTourismTable = (importId: string | undefined) =>
  useApiQuery('tourism.table', { importId: importId ?? '' }, { enabled: !!importId })

export const useComparison = (importId: string | undefined) =>
  useApiQuery('tourism.compare', { importId: importId ?? '' }, { enabled: !!importId })

export const useCountries = (enabled: boolean) =>
  useApiQuery('tourism.countries', {}, { enabled, staleTime: Infinity })

export const useImportKbs = () =>
  useApiMutation('tourism.import', { invalidates: ['tourism.listImports', ...TABLE_READS] })

export const useConfirmCountry = () => useApiMutation('tourism.confirmCountry', { invalidates: TABLE_READS })

export const useRenameCountry = () =>
  useApiMutation('tourism.renameCountry', { invalidates: [...TABLE_READS, 'tourism.countries'] })

export const useStayUntil = () => useApiMutation('tourism.setStayUntil', { invalidates: TABLE_READS })

export const useAssignRow = () => useApiMutation('tourism.assignRow', { invalidates: TABLE_READS })

export const useMarkReported = () =>
  useApiMutation('tourism.markReported', { invalidates: ['tourism.listImports', 'tourism.table'] })

export const useExport = () => useApiMutation('tourism.export')
