// Shared plumbing of the admin screens (Settings, Denetim kaydı): one mutation hook that calls a contract
// procedure, refreshes the lists it changed and reports the outcome; the error text of a refused call; and the
// display name of a seeded row (translated until the hotel renames it, then the hotel's own words).
import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import type { ProcedureInput, ProcedureName, ProcedureOutput, RoleViewDto } from '@shared/contract'
import { isAppLocale } from '@shared/format'
import { SYSTEM_ROLE_CODES, type SystemRoleCode } from '@shared/permissions'
import { useTransport } from '@/lib/api/api-context'
import { isSessionError } from '@/lib/session/query-client'
import { ApiError } from '@/lib/transport/types'

/** What a failed call says (`errors.*` with the service's details, e.g. "{{users}} hesap"). */
export function errorText(t: TFunction, error: unknown): string {
  if (!(error instanceof ApiError)) return t('errors.internal')
  const details = error.details && typeof error.details === 'object' ? error.details : {}
  return t(error.messageKey as 'errors.internal', { ...details, defaultValue: t('errors.internal') })
}

export interface AdminMutationOptions {
  /** Queries to refetch after success (every input of each procedure). */
  invalidate?: readonly ProcedureName[]
  /** Toast after success (already translated). */
  success?: string
  /** A second line under the error toast, from the refusal's details (e.g. the tasks that still use a role). */
  errorDetail?: (error: ApiError) => string | undefined
  /** The form answers this refusal itself (e.g. a closed day asks for a reason): return true, no toast. */
  handled?: (error: ApiError) => boolean
}

/**
 * A write through the contract. Errors always toast (`errors.*`, refused rights included: the service is the one
 * that decides, G-23); callers add their own `onSuccess` per call (close a dialog, select the new row).
 */
export function useAdminMutation<K extends ProcedureName>(name: K, options: AdminMutationOptions = {}) {
  const transport = useTransport()
  const client = useQueryClient()
  const { t } = useTranslation()
  return useMutation<ProcedureOutput<K>, ApiError, ProcedureInput<K>>({
    mutationFn: (input) => transport.call(name, input),
    onSuccess: async () => {
      if (options.success) toast.success(options.success)
      await Promise.all(
        (options.invalidate ?? []).map((key) => client.invalidateQueries({ queryKey: [key] }))
      )
    },
    onError: (error) => {
      // Signed out or locked meanwhile: the gate takes the window to the right screen, no toast.
      if (isSessionError(error)) return
      if (options.handled?.(error)) return
      const description = options.errorDetail?.(error)
      toast.error(errorText(t, error), description ? { description } : undefined)
    }
  })
}

/**
 * Enter in an amount field submits the form before the field has turned its text into minor units (MoneyInput
 * does that on blur). Call first in `onSubmit`: when it returns true the field was blurred and the form submits
 * again on the next tick, with the amount in the state.
 */
export function deferForPendingAmount(form: HTMLFormElement): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLInputElement) || active.inputMode !== 'decimal' || !form.contains(active))
    return false
  active.blur()
  setTimeout(() => form.requestSubmit(), 0)
  return true
}

interface I18nText {
  tr?: string
  en?: string
  ru?: string
}

/** Name of a seeded row in the UI language; a renamed row (translations cleared) shows the hotel's own name. */
export function useLocalName(): (
  i18n: I18nText | null | undefined,
  plain: string | null | undefined
) => string {
  const { i18n: i18next } = useTranslation()
  const locale = isAppLocale(i18next.language) ? i18next.language : 'tr'
  return useCallback((i18n, plain) => i18n?.[locale] || plain || i18n?.tr || i18n?.en || '', [locale])
}

export const isSystemRole = (code: string | null): code is SystemRoleCode =>
  code !== null && (SYSTEM_ROLE_CODES as readonly string[]).includes(code)

/** A role's name in the UI language (seeded roles are translated until renamed); without the role, its code. */
export function useRoleName(): (
  role: Pick<RoleViewDto, 'displayName' | 'name'> | undefined,
  code?: string | null
) => string {
  const nameOf = useLocalName()
  const { t } = useTranslation()
  return useCallback(
    (role, code = null) =>
      role ? nameOf(role.displayName, role.name) : isSystemRole(code) ? t(`roles.${code}`) : '—',
    [nameOf, t]
  )
}
