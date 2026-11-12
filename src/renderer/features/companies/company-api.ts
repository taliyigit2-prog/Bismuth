// Company reads a write makes stale, and the copy labels in the UI language (companies.copy.*, yasak 8).
import { useTranslation } from 'react-i18next'
import { COPY_FIELD_KEYS, type CopyFieldKey } from '@shared/domain/company-copy'

export const COMPANY_READS = ['companies.list', 'companies.get', 'guests.card'] as const

export function useCopyLabels(): Record<CopyFieldKey, string> {
  const { t } = useTranslation()
  return Object.fromEntries(COPY_FIELD_KEYS.map((key) => [key, t(`companies.copy.${key}`)])) as Record<
    CopyFieldKey,
    string
  >
}
