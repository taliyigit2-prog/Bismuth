// "Kullanıcılar" (faz-04 madde 3; G-20…G-22, G-25): every account — name, user name, role, last sign-in, PIN, on/off
// — with add (temporary password the person changes at first sign-in, optional link to a staff card), edit,
// "Şifre sıfırla" and switch off/on. Switching an account off ends its sessions; the last owner cannot be switched
// off (errors.lastOwner) and nobody manages an account with more rights than their own (the service refuses).
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { EyeIcon, EyeOffIcon, KeyRoundIcon, PencilIcon, PlusIcon, UsersIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { ProcedureOutput, UserViewDto } from '@shared/contract'
import type { RoleChoice } from '@shared/contract/procedures/users'
import { passwordSchema, usernameSchema } from '@shared/contract/users'
import { localDateOf } from '@shared/date'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { QueryView } from '@/components/query-view'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { DialogActions, Field } from './room-dialogs'
import { useAdminMutation, useRoleName } from './use-admin'
import { ViewOnlyNote } from './view-only'

type Employee = ProcedureOutput<'staff.listEmployees'>[number]
/** Password field with a show/hide button (autocomplete: a new password for someone else). */
function PasswordInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  testId
}: {
  id: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  describedBy?: string
  testId?: string
}) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={shown ? 'text' : 'password'}
        autoComplete="new-password"
        dir="ltr"
        className="pe-11"
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute end-0.5 top-1/2 -translate-y-1/2"
        aria-label={t(shown ? 'settings.users.hidePassword' : 'settings.users.showPassword')}
        aria-pressed={shown}
        onClick={() => setShown(!shown)}
      >
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
    </div>
  )
}

const NONE = 'none'

function UserDialog({
  user,
  roles,
  employees,
  soleOwner,
  onClose
}: {
  user: UserViewDto | null
  /** The only active owner: the program always needs one, so the role cannot be changed here. */
  soleOwner: boolean
  roles: RoleChoice[]
  employees: Employee[] | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const roleName = useRoleName()
  const formId = useId()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  // The roles this person may give (no more rights than their own), and the account's own role as it is.
  const offered = roles.filter((r) => r.assignable || r.id === user?.roleId)
  const [roleId, setRoleId] = useState(
    user?.roleId ??
      offered.find((r) => r.code === 'reception')?.id ??
      offered.find((r) => !r.locked)?.id ??
      ''
  )
  const [password, setPassword] = useState('')
  const [employeeId, setEmployeeId] = useState(user?.employeeId ?? NONE)
  const [errors, setErrors] = useState<{
    username?: boolean
    usernameTaken?: boolean
    displayName?: boolean
    password?: boolean
  }>({})
  /** Typing into a field clears its error: the message speaks of the value that was refused. */
  const clearError = (field: keyof typeof errors): void =>
    setErrors((all) => (all[field] ? { ...all, [field]: false } : all))
  const create = useAdminMutation('users.create', {
    invalidate: ['users.list', 'roles.list', 'staff.listEmployees'],
    success: t('settings.users.added'),
    // A username another account has (any letter case) is answered under the field, not in a toast.
    handled: (e) => {
      if (e.messageKey !== 'errors.usernameTaken') return false
      setErrors({ usernameTaken: true })
      document.getElementById(`${formId}-username`)?.focus()
      return true
    }
  })
  const update = useAdminMutation('users.update', {
    invalidate: ['users.list', 'roles.list', 'staff.listEmployees'],
    success: t('settings.users.saved')
  })
  // A staff card already linked to another account is not offered (one card per account, G-25).
  const cards = (employees ?? []).filter(
    (e) => e.userId === null || e.userId === user?.id || e.id === user?.employeeId
  )

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const name = displayName.trim()
    const next = {
      username: !user && !usernameSchema.safeParse(username).success,
      displayName: !name || name.length > 80,
      password: !user && !passwordSchema.safeParse(password).success
    }
    setErrors(next)
    const first = (['username', 'displayName', 'password'] as const).find((k) => next[k])
    if (first) {
      document.getElementById(`${formId}-${first}`)?.focus()
      return
    }
    const employee = employeeId === NONE ? null : employeeId
    if (!user) {
      create.mutate(
        { username, displayName: name, roleId, password, employeeId: employee },
        { onSuccess: onClose }
      )
      return
    }
    const patch = {
      ...(name !== user.displayName ? { displayName: name } : {}),
      ...(roleId !== user.roleId ? { roleId } : {}),
      ...(employee !== user.employeeId ? { employeeId: employee } : {})
    }
    if (Object.keys(patch).length === 0) onClose()
    else update.mutate({ id: user.id, patch }, { onSuccess: onClose })
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t(user ? 'settings.users.editTitle' : 'settings.users.addTitle')}
      description={user ? undefined : t('settings.users.addHelp')}
      footer={
        <DialogActions form={formId} pending={create.isPending || update.isPending} onCancel={onClose} />
      }
    >
      <form id={formId} className="grid gap-4" onSubmit={submit} noValidate autoComplete="off">
        {user ? null : (
          <Field
            id={`${formId}-username`}
            label={t('settings.users.username')}
            help={t('settings.users.usernameHelp')}
            error={
              errors.username
                ? t('settings.users.usernameInvalid')
                : errors.usernameTaken
                  ? t('errors.usernameTaken')
                  : null
            }
          >
            <Input
              id={`${formId}-username`}
              value={username}
              maxLength={40}
              dir="ltr"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={errors.username || errors.usernameTaken || undefined}
              aria-describedby={`${formId}-username-msg`}
              onChange={(e) => {
                setUsername(e.target.value)
                clearError('username')
                clearError('usernameTaken')
              }}
              data-testid="user-username"
            />
          </Field>
        )}
        <Field
          id={`${formId}-displayName`}
          label={t('settings.users.displayName')}
          error={errors.displayName ? t('settings.users.displayNameInvalid') : null}
        >
          <Input
            id={`${formId}-displayName`}
            value={displayName}
            maxLength={80}
            autoComplete="off"
            aria-invalid={errors.displayName || undefined}
            aria-describedby={`${formId}-displayName-msg`}
            onChange={(e) => {
              setDisplayName(e.target.value)
              clearError('displayName')
            }}
            data-testid="user-display-name"
          />
        </Field>
        <Field
          id={`${formId}-role`}
          label={t('settings.users.role')}
          help={soleOwner ? t('settings.users.soleOwnerHint') : undefined}
        >
          <Select value={roleId} onValueChange={setRoleId} disabled={soleOwner}>
            <SelectTrigger id={`${formId}-role`} className="w-full" data-testid="user-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {offered.map((r) => (
                <SelectItem key={r.id} value={r.id} disabled={!r.assignable}>
                  {roleName(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {user ? null : (
          <Field
            id={`${formId}-password`}
            label={t('settings.users.password')}
            help={t('settings.users.passwordHelp')}
            error={errors.password ? t('settings.users.passwordInvalid') : null}
          >
            <PasswordInput
              id={`${formId}-password`}
              value={password}
              onChange={(v) => {
                setPassword(v)
                clearError('password')
              }}
              invalid={errors.password}
              describedBy={`${formId}-password-msg`}
              testId="user-password"
            />
          </Field>
        )}
        {employees ? (
          <Field
            id={`${formId}-employee`}
            label={t('settings.users.employee')}
            help={t('settings.users.employeeHelp')}
          >
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger id={`${formId}-employee`} className="w-full" data-testid="user-employee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('settings.users.employeeNone')}</SelectItem>
                {cards.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.position
                      ? t('settings.users.employeeOption', { name: e.fullName, position: e.position })
                      : e.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}

function ResetDialog({ user, onClose }: { user: UserViewDto; onClose: () => void }) {
  const { t } = useTranslation()
  const formId = useId()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const reset = useAdminMutation('users.resetPassword', {
    invalidate: ['users.list', 'auth.devices'],
    success: t('settings.users.resetDone')
  })
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (!passwordSchema.safeParse(password).success) {
      setError(true)
      document.getElementById(`${formId}-password`)?.focus()
      return
    }
    reset.mutate({ id: user.id, password }, { onSuccess: onClose })
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('settings.users.resetTitle', { name: user.displayName })}
      description={t('settings.users.resetHelp')}
      footer={
        <DialogActions
          form={formId}
          pending={reset.isPending}
          label={t('settings.users.resetPassword')}
          testId="reset-save"
          onCancel={onClose}
        />
      }
    >
      <form id={formId} className="grid gap-4" onSubmit={submit} noValidate autoComplete="off">
        <Field
          id={`${formId}-password`}
          label={t('settings.users.password')}
          error={error ? t('settings.users.passwordInvalid') : null}
        >
          <PasswordInput
            id={`${formId}-password`}
            value={password}
            onChange={(v) => {
              setPassword(v)
              setError(false)
            }}
            invalid={error}
            describedBy={`${formId}-password-msg`}
            testId="reset-password"
          />
        </Field>
      </form>
    </ResponsiveDialog>
  )
}

type Dialog =
  { kind: 'add' } | { kind: 'edit'; user: UserViewDto } | { kind: 'reset'; user: UserViewDto } | null

export function UsersSection() {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const roleName = useRoleName()
  const isMobile = useIsMobile()
  const canEdit = can('settings.users', 'edit')
  const users = useApiQuery('users.list', { includeInactive: true }, { enabled: can('settings.users') })
  // Names and assignable roles from the users' own list: the role editor's right is not needed (#13).
  const roles = useApiQuery('users.roleChoices', {}, { enabled: can('settings.users') })
  const employees = useApiQuery('staff.listEmployees', { includeInactive: false }, { enabled: can('staff') })
  const [dialog, setDialog] = useState<Dialog>(null)
  const [switchOff, setSwitchOff] = useState<UserViewDto | null>(null)
  const setActive = useAdminMutation('users.setActive', {
    invalidate: ['users.list', 'roles.list', 'auth.devices']
  })
  if (!can('settings.users')) return null
  const roleList = roles.data ?? []
  const roleOf = (u: UserViewDto) => roleList.find((r) => r.id === u.roleId)
  // The program always needs one active owner: with a single one, the account cannot be closed or moved away.
  const owners = (users.data ?? []).filter((u) => u.active && u.roleCode === 'owner')
  const soleOwnerId = owners.length === 1 ? (owners[0]?.id ?? null) : null
  const toggle = (u: UserViewDto, active: boolean): void => {
    if (!active) setSwitchOff(u)
    else setActive.mutate({ id: u.id, active: true }, { onSuccess: () => toastActive(true) })
  }
  const toastActive = (active: boolean): void => {
    toast.success(t(active ? 'settings.users.activated' : 'settings.users.deactivated'))
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 basis-64 gap-1.5">
          <CardTitle>{t('settings.users.title')}</CardTitle>
          {canEdit ? null : <ViewOnlyNote />}
          <CardDescription>{t('settings.users.help')}</CardDescription>
        </div>
        {/* Outline: "Kaydet" of the role editor below is the screen's one filled button. */}
        <Button
          variant="outline"
          size="sm"
          disabled={!canEdit || !roles.data}
          onClick={() => setDialog({ kind: 'add' })}
          className="max-md:w-full"
          data-testid="add-user"
        >
          <PlusIcon aria-hidden />
          {t('settings.users.add')}
        </Button>
      </CardHeader>
      <CardContent className="contain-inline-size">
        <QueryView
          query={users}
          isEmpty={(list) => list.length === 0}
          empty={{
            icon: UsersIcon,
            title: t('settings.users.emptyTitle'),
            body: t('settings.users.emptyBody')
          }}
        >
          {(list) => {
            const name = (u: UserViewDto) => (
              <span className="grid gap-0.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium break-words">
                  {u.displayName}
                  {!u.active ? <Badge variant="outline">{t('settings.users.inactive')}</Badge> : null}
                  {u.active && u.mustChange ? (
                    <Badge variant="secondary">{t('settings.users.mustChange')}</Badge>
                  ) : null}
                </span>
                <bdi className="text-muted-foreground text-xs">{u.username}</bdi>
              </span>
            )
            const lastLogin = (u: UserViewDto) =>
              u.lastLoginAt
                ? `${f.dayMonth(localDateOf(new Date(u.lastLoginAt)))} ${f.time(u.lastLoginAt)}`
                : t('settings.users.never')
            const active = (u: UserViewDto) => (
              <Switch
                checked={u.active}
                disabled={!canEdit || setActive.isPending || u.id === soleOwnerId}
                title={u.id === soleOwnerId ? t('settings.users.soleOwnerHint') : undefined}
                className="relative max-md:after:absolute max-md:after:-inset-x-2 max-md:after:-inset-y-[14px]"
                aria-label={t('settings.users.activeFor', { name: u.displayName })}
                onCheckedChange={(on) => toggle(u, on)}
                data-testid={`user-active-${u.username}`}
              />
            )
            const actions = (u: UserViewDto) => (
              <span className="flex">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canEdit || !roles.data}
                  aria-label={t('settings.lists.edit', { name: u.displayName })}
                  onClick={() => setDialog({ kind: 'edit', user: u })}
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canEdit || !u.active}
                  aria-label={t('settings.users.resetFor', { name: u.displayName })}
                  title={t('settings.users.resetPassword')}
                  onClick={() => setDialog({ kind: 'reset', user: u })}
                >
                  <KeyRoundIcon />
                </Button>
              </span>
            )
            // Phone: a card per account; the role and last sign-in under the name, the controls on the side.
            if (isMobile)
              return (
                <ul className="grid gap-2" data-testid="user-table">
                  {list.map((u) => (
                    <li
                      key={u.id}
                      className={cn('grid gap-2 rounded-lg border p-3', !u.active && 'text-muted-foreground')}
                      data-testid={`user-${u.username}`}
                    >
                      {name(u)}
                      <span className="text-muted-foreground text-sm">
                        {u.lastLoginAt
                          ? t('settings.users.cardLine', {
                              role: roleName(roleOf(u), u.roleCode),
                              when: lastLogin(u)
                            })
                          : t('settings.users.cardLineNever', { role: roleName(roleOf(u), u.roleCode) })}
                      </span>
                      <span className="-mx-1 flex items-center gap-3">
                        {actions(u)}
                        <span className="ms-auto">{active(u)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )
            return (
              <Table data-testid="user-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('settings.users.name')}</TableHead>
                    <TableHead>{t('settings.users.role')}</TableHead>
                    <TableHead>{t('settings.users.lastLogin')}</TableHead>
                    <TableHead>{t('settings.users.pin')}</TableHead>
                    <TableHead>{t('settings.users.active')}</TableHead>
                    <TableHead className="w-20">
                      <span className="sr-only">{t('common.edit')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((u) => (
                    <TableRow
                      key={u.id}
                      className={cn(!u.active && 'text-muted-foreground')}
                      data-testid={`user-${u.username}`}
                    >
                      <TableCell className="whitespace-normal">{name(u)}</TableCell>
                      <TableCell className="break-words whitespace-normal">
                        {roleName(roleOf(u), u.roleCode)}
                      </TableCell>
                      <TableCell className="tabular-nums">{lastLogin(u)}</TableCell>
                      <TableCell>
                        {u.hasPin ? t('settings.users.pinYes') : t('settings.users.pinNo')}
                      </TableCell>
                      <TableCell>{active(u)}</TableCell>
                      <TableCell className="px-1">{actions(u)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          }}
        </QueryView>
      </CardContent>
      {dialog?.kind === 'add' || dialog?.kind === 'edit' ? (
        <UserDialog
          user={dialog.kind === 'edit' ? dialog.user : null}
          roles={roleList}
          soleOwner={dialog.kind === 'edit' && dialog.user.id === soleOwnerId}
          employees={can('staff') ? (employees.data ?? []) : null}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'reset' ? <ResetDialog user={dialog.user} onClose={() => setDialog(null)} /> : null}
      <AlertDialog open={switchOff !== null} onOpenChange={(open) => (open ? null : setSwitchOff(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.users.deactivateTitle', { name: switchOff?.displayName ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('settings.users.deactivateBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-deactivate"
              onClick={() => {
                if (switchOff)
                  setActive.mutate(
                    { id: switchOff.id, active: false },
                    { onSuccess: () => toastActive(false) }
                  )
              }}
            >
              {t('settings.users.deactivate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
