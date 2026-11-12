// "Roller" (faz-04 madde 3; G-20, G-21, K-38): the role editor on the real roles — a plain list of screens, each with
// one choice (Yok / Görür / Düzenler), grouped like the menu. Roles are added, copied ("… (kopya)"), renamed and
// deleted (refused while accounts hold them); each says whether its users may sign in from outside and whether they
// see only their own tasks. The owner role is shown, locked. Nobody grants more than they hold: higher levels are
// disabled here and the service refuses them anyway (403). The save bar stays in reach over the long list and counts
// the unsaved changes (on the phone it shows only then); leaving the section, previewing a role or picking another
// role on the phone with unsaved changes asks first. "Bu rolün gözüyle bak" shows the menu and screens as that role
// would.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useBlocker, useNavigate } from '@tanstack/react-router'
import {
  CopyIcon,
  EyeIcon,
  LockIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  ShieldIcon,
  Trash2Icon
} from 'lucide-react'
import type { RoleViewDto } from '@shared/contract'
import { REMOTE_ACCESS, type RemoteAccess } from '@shared/contract/users'
import {
  PERMISSION_KEYS,
  permissionArea,
  type PermissionArea,
  type PermissionKey,
  type PermissionLevel
} from '@shared/permissions'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { setViewAs, useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { DialogActions, Field, SwitchRow } from './room-dialogs'
import { isSystemRole, useAdminMutation, useRoleName } from './use-admin'
import { ViewOnlyNote } from './view-only'

const AREAS: readonly PermissionArea[] = [
  'daily',
  'guests',
  'money',
  'staff',
  'operations',
  'reports',
  'system'
]
const LEVELS: readonly PermissionLevel[] = ['none', 'view', 'edit']

type Underscored<S extends string> = S extends `${infer A}.${infer B}` ? `${A}_${Underscored<B>}` : S
/** i18n key of a permission (dots in permission keys would nest the JSON). */
const permLabel = (key: PermissionKey) =>
  `permissions.key.${key.replaceAll('.', '_')}` as `permissions.key.${Underscored<PermissionKey>}`

type Levels = Record<PermissionKey, PermissionLevel>
interface Draft {
  permissions: Levels
  tasksOwnOnly: boolean
  remoteAccess: RemoteAccess
}
/** Where the role may sign in from (Faz 13: anywhere / local network only / nowhere). */
const accessOfRole = (role: RoleViewDto): RemoteAccess =>
  role.remoteAccess ?? (role.remoteAllowed ? 'anywhere' : 'off')
const draftOf = (role: RoleViewDto): Draft => ({
  permissions: role.permissions as Levels,
  tasksOwnOnly: role.tasksOwnOnly,
  remoteAccess: accessOfRole(role)
})

/** Only what changed: the permission keys whose level moved, and the two switches. */
function rolePatch(role: RoleViewDto, draft: Draft) {
  const permissions: Partial<Levels> = {}
  for (const key of PERMISSION_KEYS)
    if (draft.permissions[key] !== role.permissions[key]) permissions[key] = draft.permissions[key]
  return {
    ...(Object.keys(permissions).length ? { permissions } : {}),
    ...(draft.tasksOwnOnly !== role.tasksOwnOnly ? { tasksOwnOnly: draft.tasksOwnOnly } : {}),
    ...(draft.remoteAccess !== accessOfRole(role) ? { remoteAccess: draft.remoteAccess } : {})
  }
}

/** How many choices of a role are not saved yet (each permission level and each switch counts one). */
function changeCount(role: RoleViewDto, draft: Draft | undefined): number {
  if (!draft) return 0
  const patch = rolePatch(role, draft)
  return (
    Object.keys(patch.permissions ?? {}).length +
    (patch.tasksOwnOnly !== undefined ? 1 : 0) +
    (patch.remoteAccess !== undefined ? 1 : 0)
  )
}

/** Role name length limit (roles.create / roles.update). */
const NAME_MAX = 60

function RoleMatrix({
  levels,
  locked,
  onChange
}: {
  levels: Levels
  locked: boolean
  onChange: (key: PermissionKey, level: PermissionLevel) => void
}) {
  const { t } = useTranslation()
  const can = useCan()
  return (
    <div className="grid gap-5" data-testid="role-matrix">
      {AREAS.map((area) => (
        <section key={area} className="grid gap-1" aria-labelledby={`area-${area}`}>
          <h3 id={`area-${area}`} className="text-muted-foreground text-xs font-semibold tracking-wide">
            {t(`permissions.area.${area}`)}
          </h3>
          <ul className="divide-y rounded-lg border">
            {PERMISSION_KEYS.filter((key) => permissionArea(key) === area).map((key) => (
              <li key={key} className="flex min-h-12 items-center gap-3 px-3 py-1.5">
                <span className="min-w-0 flex-1 text-sm">{t(permLabel(key))}</span>
                <Select
                  value={levels[key]}
                  disabled={locked}
                  onValueChange={(v) => {
                    const level = LEVELS.find((l) => l === v)
                    if (level) onChange(key, level)
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className={cn('w-32 shrink-0', levels[key] === 'none' && 'text-muted-foreground')}
                    aria-label={t('permissions.levelFor', { name: t(permLabel(key)) })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((level) => (
                      // Nobody grants more than they hold (G-23; the service refuses it too).
                      <SelectItem key={level} value={level} disabled={level !== 'none' && !can(key, level)}>
                        {t(`permissions.level.${level}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** "3 değişiklik kaydedilmedi" / "Değişiklik yok", read out when it changes. */
function UnsavedNote({ changes }: { changes: number }) {
  const { t } = useTranslation()
  return (
    <span
      role="status"
      data-testid="role-unsaved"
      className={cn(
        'flex min-w-0 items-center gap-1.5 text-sm',
        changes ? 'font-medium' : 'text-muted-foreground'
      )}
    >
      {changes ? <span className="bg-warning size-2 shrink-0 rounded-full" aria-hidden /> : null}
      {changes ? t('settings.roles.unsaved', { count: changes }) : t('settings.roles.noChanges')}
    </span>
  )
}

/** Add or rename: name and an optional description. */
function RoleNameDialog({
  role,
  onClose,
  onCreated
}: {
  role: RoleViewDto | null
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { t } = useTranslation()
  const roleName = useRoleName()
  const description = useRoleDescription()
  const formId = useId()
  const initialName = role ? roleName(role) : ''
  const initialDescription = role ? description(role) : ''
  const [name, setName] = useState(initialName)
  const [text, setText] = useState(initialDescription)
  const [error, setError] = useState(false)
  // A name another role already has is answered under the field (the service decides), not in a toast.
  const [taken, setTaken] = useState(false)
  const nameTaken = (e: { messageKey: string }): boolean => {
    if (e.messageKey !== 'errors.nameTaken') return false
    setTaken(true)
    document.getElementById(`${formId}-name`)?.focus()
    return true
  }
  const create = useAdminMutation('roles.create', {
    invalidate: ['roles.list', 'users.roleChoices'],
    success: t('settings.roles.added'),
    handled: nameTaken
  })
  const update = useAdminMutation('roles.update', {
    invalidate: ['roles.list', 'users.roleChoices'],
    success: t('settings.roles.renamed'),
    handled: nameTaken
  })
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > NAME_MAX) {
      setError(true)
      document.getElementById(`${formId}-name`)?.focus()
      return
    }
    const desc = text.trim() || null
    if (!role) {
      create.mutate(
        { name: trimmed, description: desc, permissions: {} },
        { onSuccess: (r) => onCreated(r.id) }
      )
      return
    }
    const patch = {
      ...(trimmed !== initialName ? { name: trimmed } : {}),
      ...((desc ?? '') !== initialDescription ? { description: desc } : {})
    }
    if (Object.keys(patch).length === 0) onClose()
    else update.mutate({ id: role.id, patch }, { onSuccess: onClose })
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t(role ? 'settings.roles.renameTitle' : 'settings.roles.addTitle')}
      description={role ? undefined : t('settings.roles.addHelp')}
      footer={
        <DialogActions form={formId} pending={create.isPending || update.isPending} onCancel={onClose} />
      }
    >
      <form id={formId} className="grid gap-4" onSubmit={submit} noValidate>
        <Field
          id={`${formId}-name`}
          label={t('settings.roles.name')}
          help={role?.displayName ? t('settings.seededRename') : undefined}
          error={error ? t('settings.roles.nameInvalid') : taken ? t('errors.nameTaken') : null}
        >
          <Input
            id={`${formId}-name`}
            value={name}
            maxLength={NAME_MAX}
            autoComplete="off"
            aria-invalid={error || taken || undefined}
            aria-describedby={`${formId}-name-msg ${formId}-name-count`}
            onChange={(e) => {
              setName(e.target.value)
              setError(false)
              setTaken(false)
            }}
            data-testid="role-name"
          />
          {/* The limit before it is reached: the field stops at 60 characters. */}
          <p
            id={`${formId}-name-count`}
            className="text-muted-foreground text-end text-xs tabular-nums"
            data-testid="role-name-count"
          >
            {t('settings.roles.nameCount', { length: name.length, max: NAME_MAX })}
          </p>
        </Field>
        <Field id={`${formId}-description`} label={t('settings.roles.description')}>
          <Textarea
            id={`${formId}-description`}
            value={text}
            maxLength={300}
            rows={2}
            placeholder={t('settings.roles.descriptionPlaceholder')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter saves like every other field; Shift+Enter starts a new line.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
          />
        </Field>
      </form>
    </ResponsiveDialog>
  )
}

/** A seeded role's description in the UI language while it is the seeded Turkish text; else the hotel's own. */
function useRoleDescription(): (role: RoleViewDto) => string {
  const { t, i18n } = useTranslation()
  return (role) => {
    if (isSystemRole(role.code)) {
      const key = `roles.desc.${role.code}` as const
      if (role.description === i18n.getFixedT('tr')(key)) return t(key)
    }
    return role.description ?? ''
  }
}

/**
 * Leaving with unsaved changes by the role preview, or (phone) picking another role; the section's other exits go
 * through the router's blocker.
 */
type Leave = { kind: 'preview' } | { kind: 'switch'; to: string } | null

/** A navigation stopped by unsaved changes: `answer(true)` keeps the user here, `answer(false)` lets it go. */
interface WaitingNavigation {
  answer: (block: boolean) => void
}

export function RolesSection() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const can = useCan()
  const navigate = useNavigate()
  const roleName = useRoleName()
  const description = useRoleDescription()
  const canEdit = can('settings.roles', 'edit')
  const query = useApiQuery('roles.list', {}, { enabled: can('settings.roles') })
  const [picked, setPicked] = useState<string | null>(null)
  // Per role: the edits since it was last saved (switching roles keeps them).
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [dialog, setDialog] = useState<'add' | 'rename' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [leave, setLeave] = useState<Leave>(null)
  // Every role's unsaved choices together: what leaving the section would lose.
  const unsaved = useMemo(
    () => (query.data ?? []).reduce((sum, r) => sum + changeCount(r, drafts[r.id]), 0),
    [query.data, drafts]
  )
  // Set right before a navigation the user has already confirmed (the role preview): it is not asked twice.
  const confirmed = useRef(false)
  // The navigation waiting for an answer. Kept here, not in the router's resolver state: that state is set again
  // asynchronously after each answer, so a quick second try could close the question it had just opened or leave
  // two questions on screen. One question at a time: a new try first answers the waiting one with "stay".
  const [waiting, setWaiting] = useState<WaitingNavigation | null>(null)
  const waitingRef = useRef<WaitingNavigation | null>(null)
  const shouldBlock = useCallback((): boolean | Promise<boolean> => {
    if (confirmed.current) return false
    waitingRef.current?.answer(true)
    return new Promise<boolean>((resolve) => {
      const entry: WaitingNavigation = {
        answer: (block) => {
          if (waitingRef.current === entry) {
            waitingRef.current = null
            setWaiting(null)
          }
          resolve(block)
        }
      }
      waitingRef.current = entry
      setWaiting(entry)
    })
  }, [])
  // Leaving the screen some other way (signed out, locked): nothing is left waiting.
  useEffect(() => () => waitingRef.current?.answer(true), [])
  // Another section, another screen, the command menu: asked first while something is unsaved.
  useBlocker({ shouldBlockFn: shouldBlock, enableBeforeUnload: false, disabled: unsaved === 0 })
  const save = useAdminMutation('roles.update', {
    invalidate: ['roles.list', 'users.roleChoices'],
    success: t('settings.roles.saved')
  })
  const copy = useAdminMutation('roles.create', {
    invalidate: ['roles.list', 'users.roleChoices'],
    success: t('settings.roles.copied')
  })
  const remove = useAdminMutation('roles.delete', {
    invalidate: ['roles.list', 'users.list', 'users.roleChoices'],
    success: t('settings.roles.deleted'),
    // errors.roleInUse names the accounts; open tasks and task templates given to the role come as details.
    errorDetail: (error) => {
      const tasks = (error.details as { tasks?: unknown } | undefined)?.tasks
      return typeof tasks === 'number' && tasks > 0
        ? t('settings.roles.inUseTasks', { count: tasks })
        : undefined
    }
  })
  if (!can('settings.roles')) return null
  if (query.isPending) return <LoadingState cards={1} />
  if (query.isError || !query.data)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  const roles = query.data
  const role =
    roles.find((r) => r.id === picked) ??
    roles.find((r) => r.code === 'reception') ??
    roles.find((r) => !r.locked) ??
    roles[0]
  if (!role)
    return (
      <EmptyState
        icon={ShieldIcon}
        title={t('settings.roles.emptyTitle')}
        body={t('settings.roles.emptyBody')}
      />
    )

  const locked = role.locked
  const draft = drafts[role.id] ?? draftOf(role)
  const patch = rolePatch(role, draft)
  const changes = changeCount(role, drafts[role.id])
  const setDraft = (next: Draft): void => setDrafts((all) => ({ ...all, [role.id]: next }))
  const clearDraft = (id: string): void =>
    setDrafts((all) => {
      const { [id]: _gone, ...rest } = all
      return rest
    })
  const name = roleName(role)
  const about = description(role)

  const doSave = (onDone?: () => void): void => {
    if (changes)
      save.mutate(
        { id: role.id, patch },
        {
          onSuccess: () => {
            clearDraft(role.id)
            onDone?.()
          }
        }
      )
  }
  const doCopy = (): void =>
    copy.mutate(
      {
        name: t('settings.roles.copyName', { name }).slice(0, NAME_MAX),
        description: role.description,
        permissions: draft.permissions,
        tasksOwnOnly: draft.tasksOwnOnly,
        remoteAccess: draft.remoteAccess
      },
      { onSuccess: (r) => setPicked(r.id) }
    )
  // Any role, the hotel's own included; the owner role is the owner's own view (no preview).
  const preview = (): void => {
    confirmed.current = true
    setViewAs(role.code === 'owner' ? null : role.id)
    void navigate({ to: '/today' })
  }
  const viewAs = (): void => (unsaved ? setLeave({ kind: 'preview' }) : preview())
  // The phone shows one role at a time: picking another would hide this one's unsaved changes.
  const pick = (id: string): void => {
    if (isMobile && changes && id !== role.id) setLeave({ kind: 'switch', to: id })
    else setPicked(id)
  }
  const stay = (): void => {
    waiting?.answer(true)
    setLeave(null)
  }
  const goOn = (): void => {
    if (waiting) waiting.answer(false)
    else if (leave?.kind === 'preview') {
      setDrafts({})
      preview()
    } else if (leave?.kind === 'switch') {
      clearDraft(role.id)
      setPicked(leave.to)
    }
    setLeave(null)
  }
  const saveAndSwitch = (): void => {
    if (leave?.kind === 'switch') {
      const to = leave.to
      doSave(() => setPicked(to))
    }
    setLeave(null)
  }

  const viewAsButton = (
    <Button variant="outline" size="sm" onClick={viewAs} data-testid="view-as" className="max-md:flex-1">
      <EyeIcon aria-hidden />
      {t('settings.roles.viewAs')}
    </Button>
  )
  const actions = (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={isMobile ? 'icon' : 'icon-sm'}
          aria-label={t('settings.roles.actions')}
          data-testid="role-actions"
        >
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!canEdit} onSelect={doCopy} data-testid="role-copy">
          <CopyIcon aria-hidden />
          {t('settings.roles.copy')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canEdit || locked}
          onSelect={() => setDialog('rename')}
          data-testid="role-rename"
        >
          <PencilIcon aria-hidden />
          {t('settings.roles.rename')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canEdit || locked}
          onSelect={() => setConfirmDelete(true)}
          data-testid="role-delete"
        >
          <Trash2Icon aria-hidden />
          {t('settings.roles.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const addButton = (
    <Button
      variant="outline"
      disabled={!canEdit}
      onClick={() => setDialog('add')}
      data-testid="role-add"
      className="max-md:flex-1"
    >
      <PlusIcon aria-hidden />
      {t('settings.roles.add')}
    </Button>
  )
  // On the phone the bar shows only while there is something to save: it would cover rows for nothing.
  const showSaveBar = !isMobile || (!locked && changes > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.roles.title')}</CardTitle>
        {canEdit ? null : <ViewOnlyNote />}
        <CardDescription>{t('settings.roles.help')}</CardDescription>
      </CardHeader>
      {/* minmax(0, 1fr): a long role name wraps inside the column instead of widening the page. */}
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        {isMobile ? (
          <div className="grid min-w-0 gap-2">
            <div className="flex min-w-0 gap-2">
              <Select value={role.id} onValueChange={pick}>
                <SelectTrigger
                  className="min-w-0 flex-1"
                  aria-label={t('settings.roles.pick')}
                  data-testid="role-pick"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {roleName(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {actions}
            </div>
            <div className="flex flex-wrap gap-2 [&>button]:basis-40">
              {addButton}
              {viewAsButton}
            </div>
          </div>
        ) : (
          <nav aria-label={t('settings.roles.pick')} className="grid content-start gap-1">
            {roles.map((r) => (
              <Button
                key={r.id}
                variant={r.id === role.id ? 'secondary' : 'ghost'}
                className="h-auto min-h-9 justify-between gap-2 py-1.5 text-start whitespace-normal"
                aria-current={r.id === role.id ? 'true' : undefined}
                onClick={() => pick(r.id)}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {r.locked ? <LockIcon className="text-muted-foreground size-3.5" aria-hidden /> : null}
                  <span className="min-w-0 break-words">{roleName(r)}</span>
                  {changeCount(r, drafts[r.id]) ? (
                    <>
                      <span className="bg-warning size-2 shrink-0 rounded-full" aria-hidden />
                      <span className="sr-only" data-testid={`role-unsaved-mark-${r.id}`}>
                        {t('settings.roles.unsavedMark')}
                      </span>
                    </>
                  ) : null}
                </span>
                <Badge
                  variant="outline"
                  className="tabular-nums"
                  aria-label={t('settings.roles.users', { count: r.userCount })}
                >
                  {r.userCount}
                </Badge>
              </Button>
            ))}
            <div className="mt-2 grid">{addButton}</div>
          </nav>
        )}
        <div className="grid min-w-0 content-start gap-4">
          {/* About 60 rows: Kaydet stays in reach, under the top bar on the desktop and above the bottom
              navigation on the phone (placed after the rows there, so it comes to rest at their end). */}
          {showSaveBar ? (
            <div
              data-testid="role-save-bar"
              className={cn(
                'bg-card/95 sticky z-[5] flex flex-wrap items-center gap-x-3 gap-y-2 backdrop-blur',
                isMobile
                  ? 'bottom-[calc(4rem+env(safe-area-inset-bottom))] order-last flex-nowrap rounded-lg border p-2 shadow-md'
                  : 'top-14 -mx-2 border-b px-2 py-2'
              )}
            >
              {isMobile ? null : (
                <h3 className="flex min-w-0 items-center gap-2 text-base font-semibold break-words">
                  {locked ? <LockIcon className="text-muted-foreground size-4 shrink-0" aria-hidden /> : null}
                  {name}
                </h3>
              )}
              {locked ? null : <UnsavedNote changes={changes} />}
              <div className="ms-auto flex shrink-0 flex-wrap gap-2">
                {isMobile ? null : viewAsButton}
                {isMobile ? null : actions}
                <Button
                  size="sm"
                  disabled={locked || !canEdit || !changes || save.isPending}
                  onClick={() => doSave()}
                  data-testid="role-save"
                >
                  {t('common.save')}
                </Button>
              </div>
            </div>
          ) : null}
          {about ? <p className="text-muted-foreground text-sm">{about}</p> : null}
          {locked ? <p className="text-muted-foreground text-sm">{t('settings.roles.ownerLocked')}</p> : null}
          <div className="grid gap-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="grid min-w-48 flex-1 basis-48 gap-0.5">
                <Label htmlFor="role-remote" className="leading-snug">
                  {t('settings.roles.remoteAccess')}
                </Label>
                <p className="text-muted-foreground text-xs" id="role-remote-help">
                  {t('settings.roles.remoteAccessHelp')}
                </p>
              </div>
              <Select
                value={draft.remoteAccess}
                disabled={locked || !canEdit}
                onValueChange={(v) => {
                  const next = REMOTE_ACCESS.find((a) => a === v)
                  if (next) setDraft({ ...draft, remoteAccess: next })
                }}
              >
                <SelectTrigger
                  id="role-remote"
                  aria-describedby="role-remote-help"
                  className="w-full sm:w-56"
                  data-testid="role-remote-access"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMOTE_ACCESS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {t(`settings.roles.remote.${a}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <SwitchRow
              id="role-own-tasks"
              label={t('settings.roles.tasksOwnOnly')}
              help={t('settings.roles.tasksOwnOnlyHelp')}
              checked={draft.tasksOwnOnly}
              disabled={locked || !canEdit}
              onChange={(v) => setDraft({ ...draft, tasksOwnOnly: v })}
            />
          </div>
          <RoleMatrix
            key={role.id}
            levels={draft.permissions}
            locked={locked || !canEdit}
            onChange={(key, level) =>
              setDraft({ ...draft, permissions: { ...draft.permissions, [key]: level } })
            }
          />
        </div>
      </CardContent>
      {dialog ? (
        <RoleNameDialog
          role={dialog === 'rename' ? role : null}
          onClose={() => setDialog(null)}
          onCreated={(id) => {
            setPicked(id)
            setDialog(null)
          }}
        />
      ) : null}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.roles.deleteTitle', { name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {role.userCount
                ? t('settings.roles.deleteInUse', { count: role.userCount })
                : t('settings.roles.deleteBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-role"
              onClick={() =>
                remove.mutate(
                  { id: role.id },
                  {
                    onSuccess: () => {
                      clearDraft(role.id)
                      setPicked(null)
                    }
                  }
                )
              }
            >
              {t('settings.roles.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={waiting !== null || leave !== null} onOpenChange={(open) => (open ? null : stay())}>
        <AlertDialogContent data-testid="role-leave">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.roles.leaveTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {leave?.kind === 'switch'
                ? t('settings.roles.switchBody', { count: changes, name })
                : t('settings.roles.leaveBody', { count: unsaved })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            {leave?.kind === 'switch' ? (
              <>
                <Button variant="outline" onClick={goOn} data-testid="role-leave-discard">
                  {t('settings.roles.discard')}
                </Button>
                <AlertDialogAction onClick={saveAndSwitch} data-testid="role-leave-save">
                  {t('settings.roles.saveAndSwitch')}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={goOn} data-testid="role-leave-discard">
                {t('settings.roles.leaveWithout')}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
