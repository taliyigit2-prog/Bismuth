// Shared pieces of the sign-in, recovery and password forms: a labelled field and the form's error line.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircleIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import type { AuthMessageKey } from './rules'

/** aria props of the input inside `Field`. */
export interface FieldAria {
  id: string
  'aria-invalid': true | undefined
  'aria-describedby': string | undefined
}

/** Label, input (given its aria props), then the error or the help line. */
export function Field({
  id,
  label,
  error,
  help,
  children
}: {
  id: string
  label: string
  /** i18n key of the field's error (zod message or a refused call); `true` marks it without a line. */
  error?: string | boolean | undefined
  help?: string
  children: (aria: FieldAria) => ReactNode
}) {
  const { t } = useTranslation()
  const message = typeof error === 'string' ? error : null
  const aria: FieldAria = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': message ? `${id}-error` : help ? `${id}-help` : undefined
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(aria)}
      {message ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {t(message as AuthMessageKey)}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="text-muted-foreground text-xs">
          {help}
        </p>
      ) : null}
    </div>
  )
}

/** A form-level error line (a refused call that belongs to no single field). */
export function FormAlert({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Alert variant="destructive" data-testid={testId}>
      <AlertCircleIcon aria-hidden />
      <AlertDescription className="grid gap-1">{children}</AlertDescription>
    </Alert>
  )
}
