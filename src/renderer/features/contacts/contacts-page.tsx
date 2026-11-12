// Rehber (G-160): the hotel's phone book — suppliers, the laundry, plumber, electrician, taxi, emergency and the
// hotel's own categories. Category chips, search (name, category, note, number), favourites first, several
// labelled numbers per entry (desktop: click copies; phone: tap calls), links to supply and laundry, CSV import.
// Entries are never deleted: "Rehberden kaldır" switches them off and they can be brought back.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearch } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  ContactRoundIcon,
  FileUpIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  StarIcon
} from 'lucide-react'
import { toast } from 'sonner'
import type { ContactView } from '@shared/contract/procedures/contacts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CopyButton } from '@/components/copy-button'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCopyText } from '@/lib/copy-text'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useAdminMutation } from '../settings/use-admin'
import { CATEGORIES, CATEGORY_ICONS, categoryLabel, filterKeyOf, matchesContact, telOf } from './categories'
import { ContactDialog } from './contact-dialog'
import { ImportDialog } from './import-dialog'

const ALL = 'all'

function CategoryBadge({ contact }: { contact: ContactView }) {
  const { t } = useTranslation()
  const Icon = CATEGORY_ICONS[contact.category]
  return (
    <Badge variant={contact.category === 'emergency' ? 'destructive' : 'secondary'} className="max-w-full">
      <Icon aria-hidden />
      <span className="truncate">{categoryLabel(t, contact)}</span>
    </Badge>
  )
}

/** Desktop: the number is a button that copies it (no phone line on the PC); phone: a tap calls. */
function PhoneLine({
  contact,
  phone,
  big
}: {
  contact: ContactView
  phone: ContactView['phones'][number]
  big?: boolean
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const copyText = useCopyText()
  const copy = async (): Promise<void> => {
    if (!(await copyText(phone.number))) return
    toast.success(t('contacts.copied', { phone: phone.number }))
  }
  const label = phone.label ? <span className="text-muted-foreground text-xs">{phone.label}</span> : null
  if (isMobile)
    return (
      <span className="flex flex-wrap items-center gap-1">
        <a
          href={telOf(phone.number)}
          dir="ltr"
          aria-label={t('contacts.call', { name: contact.name, phone: phone.number })}
          className={cn(
            'focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md font-medium tabular-nums outline-none focus-visible:ring-[3px]',
            big ? 'bg-accent text-accent-foreground min-h-11 px-3 text-base' : 'min-h-11 text-sm'
          )}
        >
          <PhoneIcon className="size-4" aria-hidden />
          {phone.number}
        </a>
        <CopyButton
          text={phone.number}
          size="icon-sm"
          variant="ghost"
          label={t('contacts.copyPhone', { name: contact.name })}
        />
        {label}
      </span>
    )
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => void copy()}
        dir="ltr"
        title={t('contacts.clickToCopy')}
        aria-label={t('contacts.copyPhoneOf', { name: contact.name, phone: phone.number })}
        className="hover:bg-accent focus-visible:ring-ring inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium tabular-nums outline-none focus-visible:ring-[3px]"
      >
        <PhoneIcon className="text-muted-foreground size-3.5" aria-hidden />
        {phone.number}
      </button>
      {label}
    </span>
  )
}

function Phones({ contact, big }: { contact: ContactView; big?: boolean }) {
  const { t } = useTranslation()
  if (!contact.phones.length)
    return <span className="text-muted-foreground text-sm">{t('contacts.noPhone')}</span>
  return (
    <span className="grid gap-0.5">
      {contact.phones.map((p, i) => (
        <PhoneLine key={`${p.number}-${i}`} contact={contact} phone={p} big={big && i === 0} />
      ))}
    </span>
  )
}

function FavoriteStar({ contact, canEdit }: { contact: ContactView; canEdit: boolean }) {
  const { t } = useTranslation()
  const update = useAdminMutation('contacts.update', { invalidate: ['contacts.list', 'contacts.favorites'] })
  const icon = (
    <StarIcon
      className={cn('size-4', contact.favorite ? 'fill-warning text-warning' : 'text-muted-foreground')}
      aria-hidden
    />
  )
  if (!canEdit || !contact.active)
    return contact.favorite ? (
      <span role="img" aria-label={t('contacts.favorite')}>
        {icon}
      </span>
    ) : null
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-pressed={contact.favorite}
      disabled={update.isPending}
      aria-label={t(contact.favorite ? 'contacts.unfavorite' : 'contacts.makeFavorite', {
        name: contact.name
      })}
      onClick={() => update.mutate({ id: contact.id, patch: { favorite: !contact.favorite } })}
    >
      {icon}
    </Button>
  )
}

/** Supplier → its products on Tedarik; laundry → Çamaşırhane. */
function LinkOut({ contact, productCount }: { contact: ContactView; productCount: number }) {
  const { t } = useTranslation()
  const can = useCan()
  const laundry = contact.category === 'laundry' && can('laundry')
  if (!productCount && !laundry) return null
  return (
    <Link
      to={laundry ? '/laundry' : '/supply'}
      className="text-primary inline-flex min-h-8 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline max-md:min-h-11"
    >
      {laundry ? t('contacts.laundryLink') : t('contacts.products', { count: productCount })}
      <ArrowRightIcon className="size-3.5 rtl:rotate-180" aria-hidden />
    </Link>
  )
}

function RowActions({
  contact,
  canEdit,
  onEdit,
  big
}: {
  contact: ContactView
  canEdit: boolean
  onEdit: (c: ContactView) => void
  big?: boolean
}) {
  const { t } = useTranslation()
  const restore = useAdminMutation('contacts.setActive', {
    invalidate: ['contacts.list', 'contacts.favorites'],
    success: t('contacts.restored', { name: contact.name })
  })
  if (!canEdit) return null
  if (!contact.active)
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={restore.isPending}
        onClick={() => restore.mutate({ id: contact.id, active: true })}
      >
        <RotateCcwIcon aria-hidden />
        {t('contacts.restore')}
      </Button>
    )
  return (
    <Button
      variant="ghost"
      size={big ? 'icon' : 'icon-sm'}
      aria-label={t('contacts.editOf', { name: contact.name })}
      onClick={() => onEdit(contact)}
    >
      <PencilIcon />
    </Button>
  )
}

interface ListProps {
  contacts: ContactView[]
  canEdit: boolean
  onEdit: (c: ContactView) => void
  productCounts: Map<string, number>
}

function ContactTable({ contacts, canEdit, onEdit, productCounts }: ListProps) {
  const { t } = useTranslation()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <span className="sr-only">{t('contacts.favorite')}</span>
          </TableHead>
          <TableHead>{t('contacts.name')}</TableHead>
          <TableHead className="w-40">{t('contacts.categoryLabel')}</TableHead>
          <TableHead className="w-64">{t('contacts.phone')}</TableHead>
          <TableHead>{t('common.note')}</TableHead>
          {canEdit ? (
            <TableHead className="w-12">
              <span className="sr-only">{t('contacts.actions')}</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {contacts.map((c) => (
          <TableRow
            key={c.id}
            data-testid={`contact-${c.id}`}
            className={cn(!c.active && 'text-muted-foreground')}
          >
            <TableCell className="align-top">
              <FavoriteStar contact={c} canEdit={canEdit} />
            </TableCell>
            <TableCell className="min-w-40 align-top font-medium whitespace-normal">
              {c.name}
              {!c.active ? (
                <span className="text-muted-foreground block text-xs font-normal">
                  {t('contacts.removed')}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="align-top">
              {/* The hotel's own category label is user text: capped, cut with "…", whole in the tooltip. */}
              <div className="max-w-40" title={categoryLabel(t, c)}>
                <CategoryBadge contact={c} />
              </div>
            </TableCell>
            <TableCell className="min-w-40 align-top whitespace-normal">
              <Phones contact={c} />
            </TableCell>
            <TableCell className="text-muted-foreground min-w-48 align-top text-sm whitespace-normal">
              {c.note ? <span className="block">{c.note}</span> : null}
              {c.address ? <span className="block text-xs">{c.address}</span> : null}
              {c.email ? (
                <span className="block text-xs" dir="ltr">
                  {c.email}
                </span>
              ) : null}
              <LinkOut contact={c} productCount={productCounts.get(c.id) ?? 0} />
            </TableCell>
            {canEdit ? (
              <TableCell className="text-end align-top">
                <RowActions contact={c} canEdit={canEdit} onEdit={onEdit} />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ContactCards({ contacts, canEdit, onEdit, productCounts }: ListProps) {
  const { t } = useTranslation()
  return (
    <ul className="grid gap-2">
      {contacts.map((c) => (
        <li
          key={c.id}
          className={cn('bg-card grid gap-2 rounded-xl border p-3', !c.active && 'text-muted-foreground')}
          data-testid={`contact-${c.id}`}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words">{c.name}</p>
              <p className="text-muted-foreground text-xs">
                {[categoryLabel(t, c), c.active ? null : t('contacts.removed')].filter(Boolean).join(' · ')}
              </p>
            </div>
            <FavoriteStar contact={c} canEdit={canEdit} />
            <RowActions contact={c} canEdit={canEdit} onEdit={onEdit} big />
          </div>
          <Phones contact={c} big />
          {c.note ? <p className="text-muted-foreground text-sm break-words">{c.note}</p> : null}
          {c.address ? <p className="text-muted-foreground text-xs break-words">{c.address}</p> : null}
          <LinkOut contact={c} productCount={productCounts.get(c.id) ?? 0} />
        </li>
      ))}
    </ul>
  )
}

function ContactsView({
  contacts,
  showRemoved,
  onShowRemoved,
  initialQuery,
  onEdit
}: {
  contacts: ContactView[]
  showRemoved: boolean
  onShowRemoved: (v: boolean) => void
  initialQuery: string
  onEdit: (c: ContactView) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const can = useCan()
  const [q, setQ] = useState(initialQuery)
  const [category, setCategory] = useState<string>(ALL)
  const canEdit = can('contacts', 'edit')
  const products = useApiQuery('supply.products', {}, { enabled: can('supplies') })
  const productCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of products.data ?? [])
      if (p.supplierContactId) map.set(p.supplierContactId, (map.get(p.supplierContactId) ?? 0) + 1)
    return map
  }, [products.data])

  const customLabels = [
    ...new Set(contacts.filter((c) => c.category === 'custom').map((c) => c.customCategory ?? ''))
  ]
    .filter(Boolean)
    .sort(f.compare)
  const chips = [
    ...CATEGORIES.map((c) => ({ key: c, label: t(`contacts.category.${c}`), Icon: CATEGORY_ICONS[c] })),
    ...customLabels.map((l) => ({ key: `custom:${l}`, label: l, Icon: CATEGORY_ICONS.custom }))
  ]
  const countOf = (key: string): number => contacts.filter((c) => filterKeyOf(c) === key).length
  const present = chips.filter((c) => countOf(c.key) > 0)
  const shown = contacts
    .filter((c) => category === ALL || filterKeyOf(c) === category)
    .filter((c) => matchesContact(t, c, q))
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        Number(b.favorite) - Number(a.favorite) ||
        f.compare(a.name, b.name)
    )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="relative">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('contacts.search')}
          aria-label={t('contacts.search')}
          className="ps-8"
          data-testid="contact-search"
        />
      </div>
      {isMobile ? (
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full" aria-label={t('contacts.categoryLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('contacts.allCount', { count: contacts.length })}</SelectItem>
            {present.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {t('contacts.categoryCount', { name: c.label, count: countOf(c.key) })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={1}
          value={category}
          onValueChange={(v) => v && setCategory(v)}
          aria-label={t('contacts.categoryLabel')}
          className="flex-wrap"
        >
          <ToggleGroupItem value={ALL} className="gap-1.5">
            {t('common.all')}
            <span className="text-muted-foreground tabular-nums">{contacts.length}</span>
          </ToggleGroupItem>
          {present.map(({ key, label, Icon }) => (
            <ToggleGroupItem key={key} value={key} className="gap-1.5">
              <Icon className="size-4" aria-hidden />
              {label}
              <span className="text-muted-foreground tabular-nums">{countOf(key)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {shown.length ? (
        isMobile ? (
          <div data-testid="contact-list">
            <ContactCards contacts={shown} canEdit={canEdit} onEdit={onEdit} productCounts={productCounts} />
          </div>
        ) : (
          <Card className="min-w-0 gap-0 px-2 py-0" data-testid="contact-list">
            <ContactTable contacts={shown} canEdit={canEdit} onEdit={onEdit} productCounts={productCounts} />
          </Card>
        )
      ) : (
        <EmptyState
          compact
          icon={SearchIcon}
          title={t('common.noMatchTitle')}
          body={t('contacts.noMatch')}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQ('')
                setCategory(ALL)
              }}
            >
              {t('common.clearFilter')}
            </Button>
          }
        />
      )}
      {canEdit ? (
        <Label className="flex min-h-11 w-fit items-center gap-3 font-normal">
          <Switch checked={showRemoved} onCheckedChange={onShowRemoved} />
          {t('contacts.showRemoved')}
        </Label>
      ) : null}
    </div>
  )
}

function ContactsSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-9" aria-hidden />
      <Skeleton className="h-9 w-2/3" aria-hidden />
      <div className="grid gap-1" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  )
}

export function ContactsPage() {
  const { t } = useTranslation()
  const can = useCan()
  const search: { q?: string } = useSearch({ strict: false })
  const [showRemoved, setShowRemoved] = useState(false)
  const query = useApiQuery('contacts.list', { includeInactive: showRemoved })
  // undefined = closed, null = new entry.
  const [editing, setEditing] = useState<ContactView | null | undefined>(undefined)
  const [importing, setImporting] = useState(false)
  const customLabels = [
    ...new Set((query.data ?? []).map((c) => c.customCategory).filter((l): l is string => !!l))
  ]
  // The main action is a worded button in the header; on the phone it sits under the title, full width.
  const actions = can('contacts', 'edit') ? (
    <div className="flex flex-wrap gap-2 max-md:grid max-md:w-full max-md:grid-cols-2">
      <Button variant="outline" onClick={() => setImporting(true)}>
        <FileUpIcon aria-hidden />
        {t('contacts.import.button')}
      </Button>
      <Button onClick={() => setEditing(null)} data-testid="contact-add">
        <PlusIcon aria-hidden />
        {t('contacts.add')}
      </Button>
    </div>
  ) : undefined
  return (
    <Page title={t('nav.contacts')} description={t('contacts.description')} actions={actions}>
      <QueryView
        query={query}
        loading={<ContactsSkeleton />}
        isEmpty={(list) => list.length === 0 && !showRemoved}
        empty={{ icon: ContactRoundIcon, title: t('contacts.emptyTitle'), body: t('contacts.emptyBody') }}
      >
        {(list) => (
          <ContactsView
            // A search from Hızlı arama ("rehber: sucu") starts the screen filtered.
            key={search.q ?? ''}
            contacts={list}
            showRemoved={showRemoved}
            onShowRemoved={setShowRemoved}
            initialQuery={search.q ?? ''}
            onEdit={setEditing}
          />
        )}
      </QueryView>
      {editing !== undefined ? (
        <ContactDialog
          key={editing?.id ?? 'new'}
          contact={editing}
          customLabels={customLabels}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
    </Page>
  )
}
