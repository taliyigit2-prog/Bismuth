// Small form pieces the wizard's steps share: a labelled field with its hint or error, a checkbox chip, a switch
// row, a password field with show/hide, a digits-only field and the "add your own name" field.
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { EyeIcon, EyeOffIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { Aria } from './aria'
import type { FieldError, FieldErrors, SetupErrorKey } from './draft'

/** The message under a field: its error when it has one, otherwise its hint. */
export function FieldMessage({ id, error, hint }: { id: string; error?: FieldError; hint?: ReactNode }) {
  const { t } = useTranslation()
  if (error)
    return (
      <p id={`${id}-error`} className="text-destructive text-sm" data-testid={`${id}-error`}>
        {/* Server keys (errors.*) may arrive before this build's tr.json has them: fall back to the generic one. */}
        {t(error.key as SetupErrorKey, { ...error.values, defaultValue: t('errors.validation') })}
      </p>
    )
  return hint ? (
    <p id={`${id}-hint`} className="text-muted-foreground text-xs">
      {hint}
    </p>
  ) : null
}

export function Field({
  id,
  label,
  errors,
  hint,
  children,
  className
}: {
  id: string
  label: string
  errors: FieldErrors
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid min-w-0 content-start gap-1.5', className)}>
      <Label htmlFor={id} className="leading-snug">
        {label}
      </Label>
      {children}
      <FieldMessage id={id} error={errors[id]} hint={hint} />
    </div>
  )
}

/** A small section heading inside a step. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{children}</h3>
      {aside}
    </div>
  )
}

/** A checkbox that looks like a chip (lists, currencies, room types); the whole chip is the touch target. */
export function ChoiceChip({
  id,
  checked,
  onChange,
  disabled,
  children,
  testId,
  describedBy
}: {
  id?: string
  describedBy?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  children: ReactNode
  testId?: string
}) {
  return (
    <Label
      className={cn(
        'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent min-h-9 cursor-pointer scroll-my-2 rounded-lg border px-3 py-1.5 leading-snug font-normal max-md:min-h-11',
        disabled && 'cursor-default'
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
        aria-describedby={describedBy}
        data-testid={testId}
      />
      {children}
    </Label>
  )
}

/** A switch with its label (and an optional hint) on one row; the whole row toggles it. */
export function SwitchRow({
  id,
  checked,
  onChange,
  label,
  hint
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="min-h-9 cursor-pointer gap-3 leading-snug font-normal max-md:min-h-11">
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onChange}
          aria-describedby={hint ? `${id}-hint` : undefined}
          data-testid={id}
        />
        {label}
      </Label>
      {hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground ps-11 text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Password (or PIN) field with a show/hide button. */
export function SecretInput({
  id,
  value,
  onChange,
  autoComplete,
  numeric = false,
  maxLength = 256,
  aria
}: {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  numeric?: boolean
  maxLength?: number
  aria: Aria
}) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  const label = numeric
    ? t(shown ? 'auth.hidePin' : 'auth.showPin')
    : t(shown ? 'setup.hidePassword' : 'setup.showPassword')
  return (
    <div className="relative">
      <Input
        id={id}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        inputMode={numeric ? 'numeric' : undefined}
        maxLength={maxLength}
        dir="ltr"
        value={value}
        onChange={(e) => onChange(numeric ? e.target.value.replace(/\D/g, '') : e.target.value)}
        className="pe-11"
        data-testid={id}
        {...aria}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute end-0.5 top-1/2 -translate-y-1/2"
        onClick={() => setShown(!shown)}
        aria-label={label}
        aria-pressed={shown}
        aria-controls={id}
      >
        {shown ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
      </Button>
    </div>
  )
}

/** Whole numbers only (floors, beds, hours). */
export function DigitsInput({
  id,
  value,
  onChange,
  maxLength = 4,
  aria,
  className,
  label,
  disabled
}: {
  id: string
  value: string
  onChange: (value: string) => void
  maxLength?: number
  aria: Aria
  className?: string
  disabled?: boolean
  /** For a field without a visible label (table rows). */
  label?: string
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      dir="ltr"
      maxLength={maxLength}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      className={cn('tabular-nums', className)}
      aria-label={label}
      disabled={disabled}
      data-testid={id}
      {...aria}
    />
  )
}

/**
 * "Add your own": a name field and an Add button. Enter adds (and does not move the wizard on); an empty or
 * repeated name shows why it was not added.
 */
export function AddName({
  id,
  label,
  placeholder,
  existing,
  onAdd,
  maxLength = 80
}: {
  id: string
  label: string
  placeholder?: string
  existing: readonly string[]
  onAdd: (name: string) => void
  maxLength?: number
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState<FieldError | undefined>()
  const add = (): void => {
    const name = value.trim()
    if (!name) return setError({ key: 'setup.errors.required' })
    const same = name.toLocaleLowerCase('tr-TR')
    if (existing.some((e) => e.trim().toLocaleLowerCase('tr-TR') === same))
      return setError({ key: 'setup.errors.duplicateName' })
    onAdd(name)
    setValue('')
    setError(undefined)
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder ?? label}
          autoComplete="off"
          onChange={(e) => {
            setValue(e.target.value)
            setError(undefined)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          data-testid={id}
        />
        <Button type="button" variant="outline" onClick={add} data-testid={`${id}-add`}>
          <PlusIcon aria-hidden />
          {t('common.add')}
        </Button>
      </div>
      <FieldMessage id={id} error={error} />
    </div>
  )
}
