// Standing request (G-192, S-75): the "her gelişinde" note shown on every reservation of the guest. Two levels:
// "bilgi" is a yellow box, "önemli" asks for a confirmation before a reservation is saved. Edited here, in place.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangleIcon, PencilIcon, PlusIcon, StickyNoteIcon } from 'lucide-react'
import type { GuestViewDto } from '@shared/contract/procedures/guests'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { useAdminMutation } from '@/features/settings/use-admin'
import { GUEST_READS } from './guests-api'

const LEVELS = ['info', 'warn'] as const
type Level = (typeof LEVELS)[number]

export function StandingNote({ guest, canEdit }: { guest: GuestViewDto; canEdit: boolean }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(guest.standingNote ?? '')
  const [level, setLevel] = useState<Level>(guest.standingNoteLevel)
  const save = useAdminMutation('guests.setStandingNote', {
    invalidate: GUEST_READS,
    success: t('guests.note.saved')
  })
  const submit = (clear = false): void => {
    save.mutate(
      { id: guest.id, note: { standingNote: clear ? '' : text, standingNoteLevel: level } },
      {
        onSuccess: () => {
          setEditing(false)
          if (clear) setText('')
        }
      }
    )
  }

  if (editing)
    return (
      <form
        className="bg-muted/40 grid gap-3 rounded-lg border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) submit()
        }}
        data-testid="standing-note-form"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="standing-note">{t('guests.note.label')}</Label>
          <Textarea
            id="standing-note"
            rows={2}
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('guests.note.placeholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            autoFocus
          />
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium" id="standing-level">
            {t('guests.note.levelLabel')}
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            value={level}
            onValueChange={(v) => v && setLevel(v as Level)}
            aria-labelledby="standing-level"
            className="w-full"
          >
            {LEVELS.map((key) => (
              <ToggleGroupItem key={key} value={key} className="flex-1" data-testid={`standing-level-${key}`}>
                {t(`guests.note.level.${key}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-muted-foreground text-xs">{t(`guests.note.hint.${level}`)}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {guest.standingNote ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="me-auto"
              disabled={save.isPending}
              onClick={() => submit(true)}
            >
              {t('guests.note.clear')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!text.trim() || save.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    )

  if (!guest.standingNote)
    return canEdit ? (
      <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setEditing(true)}>
        <PlusIcon aria-hidden />
        {t('guests.note.add')}
      </Button>
    ) : null

  const warn = guest.standingNoteLevel === 'warn'
  const Icon = warn ? AlertTriangleIcon : StickyNoteIcon
  return (
    <section
      aria-label={t('guests.note.title')}
      data-testid="standing-note"
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3',
        warn ? 'border-destructive/50 bg-destructive/10' : 'border-warning/60 bg-warning/15'
      )}
    >
      <Icon
        className={cn('mt-0.5 size-4 shrink-0', warn ? 'text-destructive' : 'text-warning')}
        aria-hidden
      />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="text-xs font-semibold">
          {t('guests.note.title')} · {t(`guests.note.level.${guest.standingNoteLevel}`)}
        </p>
        <p className="text-sm break-words">{guest.standingNote}</p>
        <p className="text-muted-foreground text-xs">{t(`guests.note.hint.${guest.standingNoteLevel}`)}</p>
      </div>
      {canEdit ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="-my-1 -me-1"
          aria-label={t('guests.note.edit')}
          onClick={() => {
            setText(guest.standingNote ?? '')
            setLevel(guest.standingNoteLevel)
            setEditing(true)
          }}
        >
          <PencilIcon aria-hidden />
        </Button>
      ) : null}
    </section>
  )
}
