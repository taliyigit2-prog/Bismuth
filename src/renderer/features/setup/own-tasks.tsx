// Step 8 — "Kendi görevleriniz" (G-94): repeating tasks the hotel types in itself, above the suggestions. Each is
// checked when added (tasks/own-task.ts), kept in the draft (saved with the progress) and becomes an active task
// template when the wizard finishes. Enter in a field adds the task; it does not move the wizard on.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlusIcon, XIcon } from 'lucide-react'
import { OWN_TASKS_MAX } from '@shared/contract/operations'
import { Button } from '@/components/ui/button'
import {
  checkOwnTask,
  clearErrors,
  emptyOwnTask,
  focusOwnTaskError,
  ownTaskIds,
  type OwnTaskErrors,
  type OwnTaskValues
} from '../tasks/own-task'
import { OwnTaskFields } from '../tasks/own-task-fields'
import { useRuleText } from '../tasks/rule-text'
import { newKey } from './draft'
import type { StepProps } from './step-props'

const ID = 'setup-own-task'

export function OwnTasks({ draft, update }: Pick<StepProps, 'draft' | 'update'>) {
  const { t } = useTranslation()
  const ruleText = useRuleText()
  const [values, setValues] = useState<OwnTaskValues>(emptyOwnTask)
  const [errors, setErrors] = useState<OwnTaskErrors>({})
  const list = draft.tasks.custom
  const full = list.length >= OWN_TASKS_MAX

  const add = (): void => {
    if (full) return
    const checked = checkOwnTask(values)
    if (checked.errors) {
      setErrors(checked.errors)
      focusOwnTaskError(ID, checked.errors)
      return
    }
    update((d) => ({
      ...d,
      tasks: { ...d.tasks, custom: [...d.tasks.custom, { key: newKey(), ...checked.task }] }
    }))
    // The next task starts empty; how often and when stay as they were (several tasks often share them).
    setValues((v) => ({ ...v, title: '' }))
    setErrors({})
    document.getElementById(ownTaskIds(ID).title)?.focus()
  }

  return (
    <fieldset className="grid min-w-0 gap-2" data-testid="setup-own-tasks">
      <legend className="text-muted-foreground mb-0.5 text-xs font-medium">
        {t('setup.staff.ownTasksTitle')}
      </legend>
      <p className="text-muted-foreground text-xs">{t('setup.staff.ownTasksHint')}</p>
      {list.length > 0 ? (
        <ul
          className="divide-y rounded-lg border"
          aria-label={t('setup.staff.ownTasksTitle')}
          data-testid="setup-own-task-list"
        >
          {list.map((task) => (
            <li key={task.key} className="flex items-center gap-3 py-1.5 ps-3 pe-1.5">
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-sm font-medium break-words">{task.title}</span>
                <span className="text-muted-foreground text-xs">{ruleText(task.recurrence)}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={t('setup.remove', { name: task.title })}
                onClick={() =>
                  update((d) => ({
                    ...d,
                    tasks: { ...d.tasks, custom: d.tasks.custom.filter((x) => x.key !== task.key) }
                  }))
                }
              >
                <XIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div
        className="grid gap-4 rounded-lg border p-3"
        role="group"
        aria-label={t('tasks.own.heading')}
        data-testid="setup-own-task-form"
      >
        <OwnTaskFields
          idPrefix={ID}
          value={values}
          errors={errors}
          onChange={(patch) => {
            setValues((v) => ({ ...v, ...patch }))
            setErrors((e) => clearErrors(e, patch))
          }}
          onEnter={add}
        />
        <div className="grid gap-1.5">
          <Button
            type="button"
            variant="outline"
            className="justify-self-start max-md:w-full"
            disabled={full}
            onClick={add}
            data-testid={`${ID}-add`}
          >
            <PlusIcon aria-hidden />
            {t('tasks.own.add')}
          </Button>
          {full ? (
            <p className="text-muted-foreground text-xs">
              {t('setup.staff.ownTasksFull', { max: OWN_TASKS_MAX })}
            </p>
          ) : null}
        </div>
      </div>
    </fieldset>
  )
}
