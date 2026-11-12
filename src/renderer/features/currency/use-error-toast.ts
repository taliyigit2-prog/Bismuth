// A failed write on the Döviz/Hava screens: the service's message (errors.*) as a toast, never a raw code.
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ApiError } from '@/lib/transport'

export function useErrorToast(): (error: ApiError) => void {
  const { t } = useTranslation()
  return useCallback(
    (error: ApiError) =>
      void toast.error(t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })),
    [t]
  )
}
