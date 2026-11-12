// Misafirler (G-50, G-51, G-46, G-190…G-192; Faz 6): search-first guest list on the guests service, the guest
// card with the price and payment history (the owner's favourite), standing requests, the company card copied with
// one click, the "possible duplicate → merge" hint, blacklisting from the card, and a new reservation started from
// the card with the guest's last nightly price.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { UserPlusIcon } from 'lucide-react'
import { localDateOf } from '@shared/date'
import type { GuestViewDto } from '@shared/contract/procedures/guests'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/page'
import { NoAccessState } from '@/components/states'
import { useCan } from '@/lib/view-as'
import { requestPanel } from '@/features/calendar/booking-api'
import { NewReservationDialog, type NewReservationSeed } from '@/features/calendar/new-reservation-dialog'
import { AddDialog } from '@/features/blacklist/blacklist-dialogs'
import { GuestDialog } from './guest-dialog'
import { GuestList } from './guest-list'
import { clearGuestCardRequest, guestCardRequest } from './guest-card-request'
import { GuestSheet } from './guest-sheet'
import { MergeDialog } from './merge-dialog'

export function GuestsPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  // Opened from the reservation panel ("Misafir kartını aç"): the card shows at once.
  const [openId, setOpenId] = useState<string | null>(guestCardRequest)
  useEffect(clearGuestCardRequest, [])
  /** null closed; 'new' a new card; a guest = edit it. */
  const [editing, setEditing] = useState<GuestViewDto | 'new' | null>(null)
  const [pair, setPair] = useState<readonly [GuestViewDto, GuestViewDto] | null>(null)
  const [blacklisting, setBlacklisting] = useState<GuestViewDto | null>(null)
  const [seed, setSeed] = useState<NewReservationSeed | null>(null)
  const canWrite = can('guests', 'edit')
  // The main action is a worded button in the header; on the phone it sits under the title, full width.
  const add =
    can('guests') && canWrite ? (
      <Button onClick={() => setEditing('new')} data-testid="guest-new">
        <UserPlusIcon aria-hidden />
        {t('guests.new')}
      </Button>
    ) : undefined
  const open = (id: string): void => {
    setEditing(null)
    setOpenId(id)
  }
  return (
    <Page title={t('nav.guests')} description={t('guests.descriptionReal')} actions={add}>
      {can('guests') ? (
        <GuestList onOpen={open} onNew={canWrite ? () => setEditing('new') : undefined} />
      ) : (
        <NoAccessState />
      )}
      <GuestSheet
        guestId={openId}
        onOpenChange={(o) => !o && setOpenId(null)}
        onEdit={setEditing}
        onMerge={setPair}
        onOpenGuest={open}
        onBlacklist={setBlacklisting}
        onNewReservation={
          can('calendar', 'edit')
            ? (guest, price) =>
                setSeed({
                  roomId: null,
                  date: localDateOf(new Date()),
                  guest: { id: guest.id, name: `${guest.firstName} ${guest.lastName}`.trim() },
                  ...(price ? { nightly: price } : {})
                })
            : undefined
        }
      />
      {editing !== null ? (
        <GuestDialog
          key={editing === 'new' ? 'new' : editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          guest={editing === 'new' ? null : editing}
          onSaved={(g) => setOpenId(g.id)}
          onOpenGuest={open}
        />
      ) : null}
      <MergeDialog
        key={pair ? `${pair[0].id}-${pair[1].id}` : 'none'}
        pair={pair}
        onOpenChange={(o) => !o && setPair(null)}
        onMerged={(id) => setOpenId(id)}
      />
      {blacklisting ? (
        <AddDialog
          open
          onOpenChange={(o) => !o && setBlacklisting(null)}
          guest={{
            id: blacklisting.id,
            name: `${blacklisting.firstName} ${blacklisting.lastName}`.trim()
          }}
        />
      ) : null}
      <NewReservationDialog
        key={seed ? `${seed.guest?.id}-${seed.nightly?.amountMinor ?? ''}` : 'none'}
        seed={seed}
        onOpenChange={(o) => !o && setSeed(null)}
        onCreated={(reservationId) => {
          // The calendar opens the new reservation's panel when it mounts.
          requestPanel(reservationId)
          void navigate({ to: '/calendar' })
        }}
      />
    </Page>
  )
}
