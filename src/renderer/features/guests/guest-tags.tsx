// Guest tags (G-50, K-46 (2)): the hotel's own list (Ayarlar → Listeler → Misafir etiketleri) shown as badges on the
// guest list, the guest card and the reservation panel's guest summary; chosen on the card with checkboxes in a
// popover (the same on the phone, rows 44 px high); and a filter for the guest list. A switched-off tag stays on
// the cards that have it (faded, "kapalı") but is no longer offered.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TagIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useAdminMutation } from '@/features/settings/use-admin'
import { GUEST_READS, useGuestTags } from './guests-api'

/** The tags of a guest as small badges; a switched-off tag is faded and says so. Nothing when there are none. */
export function GuestTagBadges({
  tagIds,
  className,
  testId
}: {
  tagIds: readonly string[]
  className?: string
  testId?: string
}) {
  const { t } = useTranslation()
  const { tags } = useGuestTags(tagIds.length > 0)
  const shown = tags.filter((tag) => tagIds.includes(tag.id))
  if (!shown.length) return null
  return (
    <ul
      className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}
      aria-label={t('guests.tags.list')}
      data-testid={testId}
    >
      {shown.map((tag) => (
        <li key={tag.id} className="min-w-0">
          <Badge
            variant="outline"
            className={cn('max-w-full', !tag.active && 'text-muted-foreground border-dashed')}
            title={tag.active ? tag.name : t('guests.tags.closed', { name: tag.name })}
            data-closed={!tag.active || undefined}
          >
            <TagIcon aria-hidden />
            <span className="truncate">
              {tag.active ? tag.name : t('guests.tags.closed', { name: tag.name })}
            </span>
          </Badge>
        </li>
      ))}
    </ul>
  )
}

/**
 * The card's tags with the picker (G-50): checking a tag gives it at once, unchecking takes it off. Only active tags
 * are offered; a switched-off tag the guest has stays as it is (shown faded beside the button).
 */
export function GuestTagPicker({
  guestId,
  tagIds,
  canEdit
}: {
  guestId: string
  tagIds: readonly string[]
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { tags, isPending } = useGuestTags()
  const save = useAdminMutation('guests.setTags', { invalidate: GUEST_READS })
  const offered = tags.filter((tag) => tag.active)
  const closedKept = tags.filter((tag) => !tag.active && tagIds.includes(tag.id))
  const toggle = (id: string, on: boolean): void => {
    const next = on ? [...tagIds.filter((x) => x !== id), id] : tagIds.filter((x) => x !== id)
    save.mutate({ id: guestId, tagIds: next })
  }
  const showButton = canEdit && !isPending
  if (!tagIds.length && !showButton) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="guest-tags">
      <GuestTagBadges tagIds={tagIds} testId="guest-tag-badges" />
      {showButton ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground" data-testid="guest-tags-edit">
              <TagIcon aria-hidden />
              {t(tagIds.length ? 'guests.tags.edit' : 'guests.tags.add')}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="grid w-72 max-w-[calc(100vw-2rem)] gap-1 p-2"
            align="start"
            collisionPadding={16}
            data-testid="guest-tags-picker"
          >
            <p className="px-2 pt-1 pb-1.5 text-sm font-semibold">{t('guests.tags.title')}</p>
            {offered.length ? (
              <ul className="grid max-h-72 gap-0.5 overflow-y-auto">
                {offered.map((tag) => {
                  const id = `guest-tag-${tag.id}`
                  return (
                    <li key={tag.id}>
                      <Label
                        htmlFor={id}
                        className="hover:bg-accent flex min-h-11 items-center gap-3 rounded-md px-2 font-normal"
                      >
                        <Checkbox
                          id={id}
                          checked={tagIds.includes(tag.id)}
                          disabled={save.isPending}
                          onCheckedChange={(v) => toggle(tag.id, v === true)}
                        />
                        <span className="min-w-0 flex-1 break-words">{tag.name}</span>
                      </Label>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground px-2 pb-2 text-sm">{t('guests.tags.noneDefined')}</p>
            )}
            {closedKept.length ? (
              <p className="text-muted-foreground border-t px-2 pt-2 pb-1 text-xs">
                {t('guests.tags.closedHint')}
              </p>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}

const ALL = '__all'

/** The guest list's tag filter: shown once the hotel has a tag; switched-off tags stay findable (marked). */
export function GuestTagFilter({
  value,
  onChange,
  className
}: {
  value: string | undefined
  onChange: (tagId: string | undefined) => void
  className?: string
}) {
  const { t } = useTranslation()
  const { tags } = useGuestTags()
  if (!tags.length) return null
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className={className} aria-label={t('guests.filter.tag')} data-testid="guest-tag-filter">
        <TagIcon className="text-muted-foreground" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t('guests.filter.allTags')}</SelectItem>
        {tags.map((tag) => (
          <SelectItem key={tag.id} value={tag.id}>
            {tag.active ? tag.name : t('guests.tags.closed', { name: tag.name })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
