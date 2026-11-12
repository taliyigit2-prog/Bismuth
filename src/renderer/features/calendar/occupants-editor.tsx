// People in the room of one stay (faz-05 madde 2; G-53, G-54, K-33): every person is a row with an optional
// descriptor for the night shift and the KBS marks (who and when are kept by the service). A person can be added
// during the stay; one who leaves early is marked and then needs a KBS check-out. Missing marks are loud. A person on
// the blacklist is a red warning that needs a tick before the person is added (G-45, §6.9).
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontalIcon, UserPlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OccupantList, kbsState } from '@/components/occupant-list'
import { OCCUPANT_NAME_MAX, OCCUPANT_NOTE_MAX } from './booking-limits'
import { useBookingMutation, type BlacklistHit, type BookingStay } from './booking-api'
import { BlacklistWarning } from './new-reservation-dialog'

export function OccupantsEditor({ stay, editable }: { stay: BookingStay; editable: boolean }) {
  const { t } = useTranslation()
  const nameId = useId()
  const noteId = useId()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [reported, setReported] = useState(false)
  /** Blacklist entries the service named for the typed person, and whether the user ticked the warning. */
  const [hits, setHits] = useState<{ name: string; hits: BlacklistHit[] } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const shownHits = hits && hits.name === name.trim() ? hits.hits : null
  const open = stay.status === 'planned' || stay.status === 'in_house'
  const mark = useBookingMutation('booking.markKbs', { success: t('booking.toast.kbs') })
  const add = useBookingMutation('booking.addOccupant', {
    success: t('booking.toast.personAdded'),
    onSuccess: () => {
      setName('')
      setNote('')
      setReported(false)
      setHits(null)
      setConfirmed(false)
    },
    onError: (e, input) => {
      if (e.messageKey !== 'errors.blacklistMatch') return false
      const details = e.details as { hits?: BlacklistHit[] } | undefined
      setHits({ name: input.occupant.fullName, hits: details?.hits ?? [] })
      setConfirmed(false)
      return true
    }
  })
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (!name.trim()) return
    if (shownHits && !confirmed) return
    add.mutate({
      stayId: stay.id,
      occupant: { fullName: name.trim(), descriptorNote: note.trim() || null },
      kbsReported: reported || undefined,
      ...(shownHits && confirmed ? { blacklistConfirmed: true } : {})
    })
  }
  // KBS marks are written for people who are in the house (or left); a planned stay only lists names.
  const marking = editable && stay.status !== 'planned'
  return (
    <div className="grid gap-3" data-testid={`occupants-${stay.roomNumber}`}>
      {stay.occupants.length && stay.status === 'planned' ? (
        // Before check-in nobody is in the house yet: names only, no KBS alarm.
        <ul className="grid gap-2" data-testid="occupant-list">
          {stay.occupants.map((o) => (
            <li key={o.id} className="rounded-lg border px-3 py-2 text-sm">
              <span className="font-medium">{o.fullName}</span>
              {o.descriptorNote ? (
                <span className="text-muted-foreground block text-xs break-words">{o.descriptorNote}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : stay.occupants.length ? (
        <div className="grid gap-2">
          <OccupantList
            occupants={stay.occupants}
            onMarkKbs={
              marking
                ? (occupantId, m) => mark.mutate({ occupantId, mark: m === 'in' ? 'reported' : 'checkout' })
                : undefined
            }
          />
          {marking ? (
            <ul className="flex flex-wrap gap-2" aria-label={t('booking.people.more')}>
              {stay.occupants
                .filter((o) => !o.leftAt || (o.kbsReportedAt && !o.kbsCheckoutAt))
                .map((o) => {
                  const state = kbsState(o)
                  const canLeave = !o.leftAt && stay.status === 'in_house'
                  const canClear = state === 'ok' && !o.kbsCheckoutAt
                  if (!canLeave && !canClear) return null
                  return (
                    <li key={o.id}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontalIcon aria-hidden />
                            {o.fullName}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {canLeave ? (
                            <DropdownMenuItem
                              onSelect={() => mark.mutate({ occupantId: o.id, mark: 'left' })}
                            >
                              {t('booking.people.markLeft')}
                            </DropdownMenuItem>
                          ) : null}
                          {canClear ? (
                            <DropdownMenuItem
                              onSelect={() => mark.mutate({ occupantId: o.id, mark: 'clearReported' })}
                            >
                              {t('booking.people.clearKbs')}
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  )
                })}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('calendar.panel.noOccupants')}</p>
      )}
      {editable && open ? (
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
          data-testid="add-person-form"
        >
          <p className="text-sm font-semibold sm:col-span-2">{t('booking.people.addTitle')}</p>
          <div className="grid gap-1.5">
            <Label htmlFor={nameId}>{t('booking.people.name')}</Label>
            <Input
              id={nameId}
              value={name}
              maxLength={OCCUPANT_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              data-testid="person-name"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={noteId}>{t('booking.people.note')}</Label>
            <Input
              id={noteId}
              value={note}
              maxLength={OCCUPANT_NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('booking.people.notePlaceholder')}
              autoComplete="off"
            />
          </div>
          {stay.status === 'in_house' ? (
            <label className="flex min-h-8 items-center gap-2 text-sm max-md:min-h-11 sm:col-span-2">
              <Checkbox checked={reported} onCheckedChange={(c) => setReported(c === true)} />
              {t('booking.people.reportedNow')}
            </label>
          ) : null}
          {shownHits ? (
            <BlacklistWarning
              hits={shownHits}
              confirmed={confirmed}
              onConfirm={setConfirmed}
              className="sm:col-span-2"
            />
          ) : null}
          <Button
            type="submit"
            variant="outline"
            className="justify-self-start"
            disabled={!name.trim() || add.isPending || (!!shownHits && !confirmed)}
          >
            <UserPlusIcon aria-hidden />
            {t('booking.people.add')}
          </Button>
        </form>
      ) : null}
    </div>
  )
}
