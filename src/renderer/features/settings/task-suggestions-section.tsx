// "Görev önerileri" (G-91, G-93, G-94, K-34): the seeded task templates — the legal reminders (Turkey seed, on by
// default) and the suggestions from the owner's day and maintenance (off until picked) — and the hotel's own
// repeating tasks, added here with "Görev ekle" (the same fields as the wizard's step 8). Switching one on plans
// its tasks on the Görevler screen; switching it off cancels the ones not done yet. Nothing is deleted. The
// suggestions come in the wizard's groups (daily and weekly work, maintenance and checks).
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ListChecksIcon, PlusIcon } from 'lucide-react'
import type { ProcedureOutput } from '@shared/contract'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { QueryView } from '@/components/query-view'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import {
  checkOwnTask,
  clearErrors,
  emptyOwnTask,
  focusOwnTaskError,
  type OwnTaskErrors,
  type OwnTaskValues
} from '../tasks/own-task'
import { OwnTaskFields } from '../tasks/own-task-fields'
import { useRuleText } from '../tasks/rule-text'
import { DialogActions } from './room-dialogs'
import { useAdminMutation, useLocalName } from './use-admin'

type Template = ProcedureOutput<'tasks.listTemplates'>[number]

/** Ids of the dialog's fields (one dialog at a time). */
const OWN_TASK_ID = 'own-task'

/** The suggestions' groups, in the wizard's order (the legal reminders have a section of their own). */
const SUGGESTION_KINDS = ['general', 'maintenance'] as const

/** A titled list of templates; with `byKind` the rows come in groups under the name of their kind. */
function TemplateList({
  title,
  help,
  items,
  canEdit,
  testId,
  toasts,
  byKind = false
}: {
  title: string
  help: string
  items: Template[]
  canEdit: boolean
  testId: string
  toasts: { on: string; off: string }
  byKind?: boolean
}) {
  const { t } = useTranslation()
  const nameOf = useLocalName()
  const ruleText = useRuleText()
  const on = useAdminMutation('tasks.activateTemplate', {
    invalidate: ['tasks.listTemplates'],
    success: toasts.on
  })
  const off = useAdminMutation('tasks.deactivateTemplate', {
    invalidate: ['tasks.listTemplates'],
    success: toasts.off
  })
  if (items.length === 0) return null
  const rows = (list: Template[], label?: string) => (
    <ul className="divide-y rounded-lg border" aria-label={label}>
      {list.map((tpl) => {
        const name = nameOf(tpl.titleI18n, tpl.title)
        return (
          <li key={tpl.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-sm font-medium break-words">{name}</span>
              {tpl.description ? (
                <span className="text-muted-foreground text-xs break-words">{tpl.description}</span>
              ) : null}
              <span className="text-muted-foreground text-xs">{ruleText(tpl.recurrence)}</span>
            </span>
            <Switch
              checked={tpl.active}
              disabled={!canEdit || on.isPending || off.isPending}
              className="relative shrink-0 max-md:after:absolute max-md:after:-inset-x-2 max-md:after:-inset-y-[14px]"
              aria-label={t('settings.lists.active', { name })}
              onCheckedChange={(active) => (active ? on : off).mutate({ id: tpl.id })}
              data-testid={`template-${tpl.code ?? tpl.id}`}
            />
          </li>
        )
      })}
    </ul>
  )
  return (
    <section className="grid gap-2" aria-labelledby={`${testId}-title`} data-testid={testId}>
      <div className="grid gap-0.5">
        <h3 id={`${testId}-title`} className="text-sm font-semibold">
          {title}
        </h3>
        <p className="text-muted-foreground text-xs">{help}</p>
      </div>
      {byKind ? (
        <div className="grid gap-4 pt-1">
          {SUGGESTION_KINDS.map((kind) => {
            const group = items.filter((tpl) => tpl.kind === kind)
            if (group.length === 0) return null
            const name = t(`settings.taskSuggestions.kind.${kind}`)
            return (
              <div key={kind} className="grid gap-1.5" data-testid={`${testId}-${kind}`}>
                <h4 className="text-muted-foreground text-xs font-medium">{name}</h4>
                {rows(group, name)}
              </div>
            )
          })}
        </div>
      ) : (
        rows(items)
      )}
    </section>
  )
}

/** "Görev ekle": the hotel's own repeating task, switched on at once (kind general, G-94). */
function OwnTaskDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [values, setValues] = useState<OwnTaskValues>(emptyOwnTask)
  const [errors, setErrors] = useState<OwnTaskErrors>({})
  const create = useAdminMutation('tasks.createTemplate', {
    invalidate: ['tasks.listTemplates'],
    success: t('settings.taskSuggestions.ownAdded')
  })
  const formId = `${OWN_TASK_ID}-form`
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const checked = checkOwnTask(values)
    if (checked.errors) {
      setErrors(checked.errors)
      focusOwnTaskError(OWN_TASK_ID, checked.errors)
      return
    }
    create.mutate(checked.task, { onSuccess: onClose })
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('tasks.own.heading')}
      description={t('settings.taskSuggestions.ownDialogHelp')}
      footer={
        <DialogActions form={formId} pending={create.isPending} onCancel={onClose} testId="own-task-save" />
      }
    >
      <form id={formId} noValidate onSubmit={submit} data-testid="own-task-form">
        <OwnTaskFields
          idPrefix={OWN_TASK_ID}
          value={values}
          errors={errors}
          onChange={(patch) => {
            setValues((v) => ({ ...v, ...patch }))
            setErrors((e) => clearErrors(e, patch))
          }}
        />
      </form>
    </ResponsiveDialog>
  )
}

export function TaskSuggestionsSection() {
  const { t } = useTranslation()
  const can = useCan()
  const canEdit = can('tasks', 'edit')
  const query = useApiQuery('tasks.listTemplates', { includeInactive: true })
  const [adding, setAdding] = useState(false)
  const suggestionToasts = {
    on: t('settings.taskSuggestions.activated'),
    off: t('settings.taskSuggestions.deactivated')
  }
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 basis-64 gap-1.5">
          <CardTitle className="max-md:sr-only">{t('settings.taskSuggestions.title')}</CardTitle>
          <CardDescription>{t('settings.taskSuggestions.help')}</CardDescription>
        </div>
        <Button
          size="sm"
          disabled={!canEdit}
          onClick={() => setAdding(true)}
          className="max-md:w-full"
          data-testid="add-own-task"
        >
          <PlusIcon aria-hidden />
          {t('settings.taskSuggestions.addOwn')}
        </Button>
      </CardHeader>
      <CardContent>
        <QueryView
          query={query}
          isEmpty={(list) => list.length === 0}
          empty={{
            icon: ListChecksIcon,
            title: t('settings.taskSuggestions.emptyTitle'),
            body: t('settings.taskSuggestions.emptyBody')
          }}
        >
          {(list) => {
            // Seeded templates carry a code; the hotel's own ones have none.
            const seeded = list.filter((tpl) => tpl.code !== null)
            return (
              <div className="grid gap-6">
                <TemplateList
                  title={t('settings.taskSuggestions.legalTitle')}
                  help={t('settings.taskSuggestions.legalHelp')}
                  items={seeded.filter((tpl) => tpl.kind === 'legal')}
                  canEdit={canEdit}
                  testId="legal-templates"
                  toasts={suggestionToasts}
                />
                <TemplateList
                  title={t('settings.taskSuggestions.ownTitle')}
                  help={t('settings.taskSuggestions.ownHelp')}
                  items={list.filter((tpl) => tpl.code === null)}
                  canEdit={canEdit}
                  testId="own-templates"
                  toasts={{
                    on: t('settings.taskSuggestions.ownActivated'),
                    off: t('settings.taskSuggestions.ownDeactivated')
                  }}
                />
                <TemplateList
                  title={t('settings.taskSuggestions.suggestedTitle')}
                  help={t('settings.taskSuggestions.suggestedHelp')}
                  items={seeded.filter((tpl) => tpl.kind !== 'legal')}
                  canEdit={canEdit}
                  testId="suggested-templates"
                  toasts={suggestionToasts}
                  byKind
                />
              </div>
            )
          }}
        </QueryView>
      </CardContent>
      {adding ? <OwnTaskDialog onClose={() => setAdding(false)} /> : null}
    </Card>
  )
}
