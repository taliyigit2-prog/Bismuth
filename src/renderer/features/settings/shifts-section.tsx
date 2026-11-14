// "Vardiyalar" (faz-04 madde 1/8b, G-91…G-95): the hotel's shifts (Pandora: Gündüz 09:00–21:00, Gece 21:00–09:00)
// — name, start, end, in use. An end before the start runs into the next day. Nothing is deleted: a shift the
// hotel no longer works is switched off (old handovers keep its name).
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ClockIcon, PencilIcon, PlusIcon } from 'lucide-react'
import type { ProcedureOutput } from '@shared/contract'
import { settingsShape } from '@shared/contract'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { QueryView } from '@/components/query-view'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { TimeInput } from '@/components/time-input'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { DialogActions, Field } from './room-dialogs'
import { useAdminMutation, useLocalName } from './use-admin'

type Shift = ProcedureOutput<'shifts.list'>[number]
const validTime = (v: string): boolean => settingsShape['hotel.checkinTime'].safeParse(v).success

function ShiftDialog({
  shift,
  taken,
  onClose
}: {
  shift: Shift | null
  /** Names of the other shifts (compared without case, H-38). */
  taken: readonly string[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const nameOf = useLocalName()
  const formId = useId()
  const initialName = shift ? nameOf(shift.displayName, shift.name) : ''
  const [name, setName] = useState(initialName)
  const [start, setStart] = useState(shift?.startTime ?? '09:00')
  const [end, setEnd] = useState(shift?.endTime ?? '21:00')
  const [errors, setErrors] = useState<{ name?: boolean; taken?: boolean; time?: boolean }>({})
  const create = useAdminMutation('shifts.create', {
    invalidate: ['shifts.list'],
    success: t('settings.shifts.added')
  })
  const update = useAdminMutation('shifts.update', {
    invalidate: ['shifts.list'],
    success: t('settings.saved')
  })

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const trimmed = name.trim()
    const next = {
      name: !trimmed || trimmed.length > 60,
      taken: taken.some((n) => n.toLocaleLowerCase('tr') === trimmed.toLocaleLowerCase('tr')),
      time: !validTime(start) || !validTime(end)
    }
    setErrors(next)
    if (next.name || next.taken || next.time) {
      document.getElementById(`${formId}-${next.name || next.taken ? 'name' : 'start'}`)?.focus()
      return
    }
    if (!shift) {
      create.mutate({ name: trimmed, startTime: start, endTime: end }, { onSuccess: onClose })
      return
    }
    const patch = {
      ...(trimmed !== initialName ? { name: trimmed } : {}),
      ...(start !== shift.startTime ? { startTime: start } : {}),
      ...(end !== shift.endTime ? { endTime: end } : {})
    }
    if (Object.keys(patch).length === 0) onClose()
    else update.mutate({ id: shift.id, patch }, { onSuccess: onClose })
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t(shift ? 'settings.shifts.dialogEdit' : 'settings.shifts.dialogAdd')}
      footer={
        <DialogActions form={formId} pending={create.isPending || update.isPending} onCancel={onClose} />
      }
    >
      <form id={formId} className="grid gap-4" onSubmit={submit} noValidate>
        <Field
          id={`${formId}-name`}
          label={t('settings.shifts.name')}
          help={shift?.code ? t('settings.seededRename') : undefined}
          error={
            errors.name ? t('settings.shifts.nameRequired') : errors.taken ? t('errors.nameTaken') : null
          }
        >
          <Input
            id={`${formId}-name`}
            value={name}
            maxLength={60}
            autoComplete="off"
            placeholder={t('settings.shifts.namePlaceholder')}
            aria-invalid={errors.name || errors.taken || undefined}
            aria-describedby={`${formId}-name-msg`}
            onChange={(e) => setName(e.target.value)}
            data-testid="shift-name"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field id={`${formId}-start`} label={t('settings.shifts.start')}>
            <TimeInput
              id={`${formId}-start`}
              value={start}
              aria-invalid={errors.time || undefined}
              onChange={(v) => setStart(v)}
            />
          </Field>
          <Field id={`${formId}-end`} label={t('settings.shifts.end')}>
            <TimeInput
              id={`${formId}-end`}
              value={end}
              aria-invalid={errors.time || undefined}
              onChange={(v) => setEnd(v)}
            />
          </Field>
        </div>
        {errors.time ? (
          <p className="text-destructive text-xs" role="alert">
            {t('settings.timeInvalid')}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">{t('settings.shifts.endHelp')}</p>
        )}
      </form>
    </ResponsiveDialog>
  )
}

export function ShiftsSection() {
  const { t } = useTranslation()
  const nameOf = useLocalName()
  const can = useCan()
  const canEdit = can('settings', 'edit')
  const query = useApiQuery('shifts.list', { includeInactive: true })
  const toggle = useAdminMutation('shifts.update', { invalidate: ['shifts.list'] })
  const [dialog, setDialog] = useState<{ shift: Shift | null } | null>(null)

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 basis-64 gap-1.5">
          <CardTitle className="max-md:sr-only">{t('settings.shifts.title')}</CardTitle>
          <CardDescription>{t('settings.shifts.help')}</CardDescription>
        </div>
        <Button
          size="sm"
          disabled={!canEdit}
          onClick={() => setDialog({ shift: null })}
          className="max-md:w-full"
          data-testid="add-shift"
        >
          <PlusIcon aria-hidden />
          {t('settings.shifts.add')}
        </Button>
      </CardHeader>
      <CardContent className="contain-inline-size">
        <QueryView
          query={query}
          isEmpty={(list) => list.length === 0}
          empty={{
            icon: ClockIcon,
            title: t('settings.shifts.emptyTitle'),
            body: t('settings.shifts.emptyBody')
          }}
        >
          {(list) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings.shifts.name')}</TableHead>
                  <TableHead>{t('settings.shifts.hours')}</TableHead>
                  <TableHead>{t('settings.lists.col.active')}</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">{t('common.edit')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((shift) => {
                  const name = nameOf(shift.displayName, shift.name)
                  return (
                    <TableRow key={shift.id} className={cn(!shift.active && 'text-muted-foreground')}>
                      <TableCell className="font-medium break-words whitespace-normal">{name}</TableCell>
                      <TableCell className="whitespace-normal">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <bdi className="tabular-nums">
                            {t('settings.shifts.range', { start: shift.startTime, end: shift.endTime })}
                          </bdi>
                          {shift.endTime <= shift.startTime ? (
                            <Badge variant="outline">{t('settings.shifts.nextDay')}</Badge>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={shift.active}
                          disabled={!canEdit}
                          className="relative max-md:after:absolute max-md:after:-inset-x-2 max-md:after:-inset-y-[14px]"
                          aria-label={t('settings.lists.active', { name })}
                          onCheckedChange={(active) => toggle.mutate({ id: shift.id, patch: { active } })}
                        />
                      </TableCell>
                      <TableCell className="px-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={!canEdit}
                          aria-label={t('settings.lists.edit', { name })}
                          onClick={() => setDialog({ shift })}
                        >
                          <PencilIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </QueryView>
      </CardContent>
      {dialog ? (
        <ShiftDialog
          shift={dialog.shift}
          taken={(query.data ?? [])
            .filter((o) => o.id !== dialog.shift?.id)
            .map((o) => nameOf(o.displayName, o.name))}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </Card>
  )
}
