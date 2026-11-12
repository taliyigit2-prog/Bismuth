// Step 9 — employees (optional; G-25): name, position and start date, and if wanted a user account with a
// temporary password and a role. The employee replaces the password at the first sign-in.
import { useTranslation } from 'react-i18next'
import { PlusIcon, UsersIcon, XIcon } from 'lucide-react'
import { isLocalDate, today } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DateInput } from '@/components/date-input'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { describe } from './aria'
import { defaultEmployeeRole, employeeRoles, ids, localName, newEmployee, type DraftEmployee } from './draft'
import { Field, FieldMessage, SecretInput, SwitchRow } from './fields'
import type { StepProps } from './step-props'

export function EmployeesStep({ draft, update, options, errors }: StepProps) {
  const { t } = useTranslation()
  const add = (): void =>
    update((d) => ({
      ...d,
      employees: [...d.employees, newEmployee(today(), defaultEmployeeRole(options))]
    }))
  if (draft.employees.length === 0)
    return (
      <EmptyState
        compact
        icon={UsersIcon}
        title={t('setup.employees.emptyTitle')}
        body={t('setup.employees.emptyBody')}
        action={
          <Button type="button" variant="outline" onClick={add} data-testid="setup-add-employee">
            <PlusIcon aria-hidden />
            {t('setup.employees.add')}
          </Button>
        }
      />
    )
  return (
    <div className="grid gap-4">
      <ul className="grid gap-3">
        {draft.employees.map((e) => (
          <EmployeeCard
            key={e.key}
            employee={e}
            options={options}
            errors={errors}
            onChange={(patch) =>
              update((d) => ({
                ...d,
                employees: d.employees.map((x) => (x.key === e.key ? { ...x, ...patch } : x))
              }))
            }
            onRemove={() => update((d) => ({ ...d, employees: d.employees.filter((x) => x.key !== e.key) }))}
          />
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        onClick={add}
        data-testid="setup-add-employee"
      >
        <PlusIcon aria-hidden />
        {t('setup.employees.add')}
      </Button>
    </div>
  )
}

function EmployeeCard({
  employee: e,
  options,
  errors,
  onChange,
  onRemove
}: {
  employee: DraftEmployee
  options: StepProps['options']
  errors: StepProps['errors']
  onChange: (patch: Partial<DraftEmployee>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const fieldIds = {
    first: ids.employee(e.key, 'first'),
    last: ids.employee(e.key, 'last'),
    position: ids.employee(e.key, 'position'),
    start: ids.employee(e.key, 'start'),
    username: ids.employee(e.key, 'username'),
    password: ids.employee(e.key, 'password'),
    role: ids.employee(e.key, 'role')
  }
  const name =
    [e.firstName, e.lastName]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' ') || t('setup.employees.unnamed')
  return (
    // One column that may shrink: a long name is cut (its full text in the tooltip), the page never widens.
    <li className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-lg border p-3" data-testid="setup-employee">
      <div className="flex items-center justify-between gap-2">
        <span
          className="min-w-0 truncate text-sm font-semibold"
          title={name}
          data-testid="setup-employee-name"
        >
          {name}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('setup.employees.remove', { name })}
          onClick={onRemove}
        >
          <XIcon aria-hidden />
        </Button>
      </div>
      <div className="grid items-start gap-x-4 gap-y-4 sm:grid-cols-2">
        <Field id={fieldIds.first} label={t('setup.employees.firstName')} errors={errors}>
          <Input
            id={fieldIds.first}
            value={e.firstName}
            maxLength={60}
            autoComplete="off"
            onChange={(ev) => onChange({ firstName: ev.target.value })}
            data-testid={fieldIds.first}
            {...describe(fieldIds.first, errors)}
          />
        </Field>
        <Field id={fieldIds.last} label={t('setup.employees.lastName')} errors={errors}>
          <Input
            id={fieldIds.last}
            value={e.lastName}
            maxLength={60}
            autoComplete="off"
            onChange={(ev) => onChange({ lastName: ev.target.value })}
            data-testid={fieldIds.last}
            {...describe(fieldIds.last, errors)}
          />
        </Field>
        <Field id={fieldIds.position} label={t('setup.employees.position')} errors={errors}>
          <Input
            id={fieldIds.position}
            value={e.position}
            maxLength={60}
            autoComplete="off"
            placeholder={t('setup.employees.positionPlaceholder')}
            onChange={(ev) => onChange({ position: ev.target.value })}
            {...describe(fieldIds.position, errors)}
          />
        </Field>
        <div className="grid gap-1">
          <DateInput
            label={t('setup.employees.startDate')}
            value={isLocalDate(e.startDate) ? e.startDate : null}
            onChange={(startDate) => onChange({ startDate })}
          />
          <FieldMessage id={fieldIds.start} error={errors[fieldIds.start]} />
        </div>
      </div>
      <SwitchRow
        id={`setup-employee-${e.key}-account`}
        checked={e.hasAccount}
        onChange={(hasAccount) => onChange({ hasAccount })}
        label={t('setup.employees.account')}
      />
      {e.hasAccount ? (
        <div className="grid gap-3 rounded-md border border-dashed p-3">
          <div className="grid items-start gap-x-4 gap-y-4 sm:grid-cols-3">
            <Field id={fieldIds.username} label={t('setup.employees.username')} errors={errors}>
              <Input
                id={fieldIds.username}
                value={e.username}
                maxLength={40}
                dir="ltr"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(ev) => onChange({ username: ev.target.value })}
                data-testid={fieldIds.username}
                {...describe(fieldIds.username, errors)}
              />
            </Field>
            <Field id={fieldIds.password} label={t('setup.employees.password')} errors={errors}>
              <SecretInput
                id={fieldIds.password}
                value={e.password}
                onChange={(password) => onChange({ password })}
                autoComplete="new-password"
                aria={describe(fieldIds.password, errors)}
              />
            </Field>
            <Field id={fieldIds.role} label={t('setup.employees.role')} errors={errors}>
              <Select value={e.roleId} onValueChange={(roleId) => onChange({ roleId })}>
                <SelectTrigger
                  id={fieldIds.role}
                  className="w-full"
                  data-testid={fieldIds.role}
                  {...describe(fieldIds.role, errors)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {employeeRoles(options).map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {localName(f.locale, role.name, role.displayName)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="text-muted-foreground grid gap-1 text-xs">
            <p>{t('setup.employees.accountHint')}</p>
            <p>{t('setup.secretsNotSaved')}</p>
          </div>
        </div>
      ) : null}
    </li>
  )
}
