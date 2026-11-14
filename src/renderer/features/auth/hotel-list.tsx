// The hotels this computer knows (P21b, K-54: every hotel has its own main computer; the connection between them is
// the private network, NetBird). One row per hotel: name, address, the identity kept for its main computer and when
// it was used last; touch a row to connect (the main process checks the identity before anything is sent). Rename,
// change the address and remove are here too. The list lives in this computer's own settings file; no password.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { FingerprintIcon, HotelIcon, Loader2Icon, PencilIcon, Trash2Icon } from 'lucide-react'
import { localDateOf } from '@shared/date'
import type { SavedHotel } from '@shared/contract/remote'
import { hostAddressProblem } from '@shared/contract/remote'
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
import { Input } from '@/components/ui/input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { ErrorState, LoadingState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { failureKey, type AuthMessageKey } from './rules'
import { Field, FormAlert } from './fields'

const LIST_KEY = ['remote.hotels', {}] as const

export function HotelList({ busy, onConnect }: { busy: boolean; onConnect: (hotel: SavedHotel) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const list = useApiQuery('remote.hotels', {})
  const [editing, setEditing] = useState<SavedHotel | null>(null)
  const [removing, setRemoving] = useState<SavedHotel | null>(null)
  const remove = useApiMutation('remote.hotelRemove', {
    onSuccess: (next) => {
      queryClient.setQueryData(LIST_KEY, next)
      setRemoving(null)
    }
  })
  const removeFailure = remove.isError ? failureKey(remove.error) : null

  return (
    <section className="grid gap-2" aria-labelledby="connect-hotels">
      <h2 id="connect-hotels" className="text-sm font-medium">
        {t('connect.hotels.title')}
      </h2>
      {list.isPending ? (
        <LoadingState cards={1} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <p className="text-muted-foreground text-sm" data-testid="hotel-list-empty">
          {t('connect.hotels.empty')}
        </p>
      ) : (
        <ul className="grid gap-2" data-testid="hotel-list">
          {list.data.map((hotel) => (
            <HotelRow
              key={hotel.code}
              hotel={hotel}
              busy={busy}
              onConnect={() => onConnect(hotel)}
              onEdit={() => setEditing(hotel)}
              onRemove={() => {
                remove.reset()
                setRemoving(hotel)
              }}
            />
          ))}
        </ul>
      )}
      <EditHotelDialog hotel={editing} onClose={() => setEditing(null)} />
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('connect.hotels.removeTitle', { name: removing?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('connect.hotels.removeBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          {removeFailure ? (
            <FormAlert>
              <p>{t(removeFailure as AuthMessageKey)}</p>
            </FormAlert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (removing) remove.mutate({ code: removing.code })
              }}
              data-testid="hotel-remove-confirm"
            >
              {t('connect.hotels.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function HotelRow({
  hotel,
  busy,
  onConnect,
  onEdit,
  onRemove
}: {
  hotel: SavedHotel
  busy: boolean
  onConnect: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const last = hotel.lastUsedAt ? new Date(hotel.lastUsedAt) : null
  const lastText = last
    ? t('connect.hotels.lastUsed', {
        date: f.dayMonth(localDateOf(last)),
        time: f.time(hotel.lastUsedAt as string)
      })
    : t('connect.hotels.neverUsed')
  return (
    <li
      className="flex items-stretch gap-1 rounded-lg border"
      data-testid="hotel-row"
      data-hotel={hotel.code}
    >
      <button
        type="button"
        disabled={busy}
        onClick={onConnect}
        className="hover:bg-accent focus-visible:ring-ring flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-s-lg p-3 text-start outline-none focus-visible:ring-[3px] disabled:opacity-60"
        data-testid="hotel-connect"
      >
        <HotelIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium" title={hotel.name}>
              {hotel.name}
            </span>
            {hotel.active ? <Badge variant="secondary">{t('connect.hotels.active')}</Badge> : null}
          </span>
          <code dir="ltr" className="text-muted-foreground text-start text-xs break-all">
            {hotel.url}
          </code>
          <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
            <FingerprintIcon className="size-3.5 shrink-0" aria-hidden />
            {hotel.fingerprint ? (
              <code dir="ltr" data-testid="hotel-fingerprint">
                {hotel.fingerprint}
              </code>
            ) : (
              <span>{t('connect.hotels.noFingerprint')}</span>
            )}
            <span className="basis-full">{lastText}</span>
          </span>
        </span>
      </button>
      <div className="flex items-center pe-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onEdit}
          aria-label={t('connect.hotels.editLabel', { name: hotel.name })}
          data-testid="hotel-edit"
        >
          <PencilIcon aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onRemove}
          aria-label={t('connect.hotels.removeLabel', { name: hotel.name })}
          data-testid="hotel-remove"
        >
          <Trash2Icon aria-hidden />
        </Button>
      </div>
    </li>
  )
}

function EditHotelDialog({ hotel, onClose }: { hotel: SavedHotel | null; onClose: () => void }) {
  // The fields start from the hotel each time the dialog opens (the parent keys it by code).
  return hotel ? <EditForm key={hotel.code} hotel={hotel} onClose={onClose} /> : null
}

function EditForm({ hotel, onClose }: { hotel: SavedHotel; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState(hotel.name)
  const [url, setUrl] = useState(hotel.url)
  const save = useApiMutation('remote.hotelUpdate', {
    onSuccess: (next) => {
      queryClient.setQueryData(LIST_KEY, next)
      onClose()
    }
  })
  const nameProblem = name.trim() ? null : 'auth.validation.required'
  const problem = url !== hotel.url ? hostAddressProblem(url) : null
  const urlError = problem ? `connect.problem.${problem}` : undefined
  const failure = save.isError ? failureKey(save.error) : null
  const canSave = !nameProblem && !problem && !save.isPending
  const submit = (): void => {
    if (!canSave) return
    save.mutate({
      code: hotel.code,
      name: name.trim(),
      ...(url !== hotel.url ? { url: url.trim() } : {})
    })
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('connect.hotels.editTitle')}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="hotel-edit-form" disabled={!canSave} data-testid="hotel-save">
            {save.isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id="hotel-edit-form"
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field id="hotel-name" label={t('connect.hotels.name')} error={nameProblem ?? undefined}>
          {(aria) => (
            <Input
              {...aria}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="hotel-name"
            />
          )}
        </Field>
        <Field
          id="hotel-url"
          label={t('connect.address')}
          error={urlError}
          help={hotel.active ? t('connect.hotels.addressInUse') : t('connect.hotels.addressHelp')}
        >
          {(aria) => (
            <Input
              {...aria}
              dir="ltr"
              inputMode="url"
              spellCheck={false}
              disabled={hotel.active}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              data-testid="hotel-url"
            />
          )}
        </Field>
        {failure ? (
          <FormAlert>
            <p>{t(failure as AuthMessageKey)}</p>
          </FormAlert>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}
