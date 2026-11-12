// "Listeler" (G-13…G-15, faz-04 madde 4): the hotel's own lists — payment methods, sales channels, extra
// services, expense sections, laundry item types, product categories. Seeded rows come translated; the hotel
// renames them (its name then shows in every language), switches them on or off, moves them up or down and adds
// its own. Nothing is deleted: a row in use stays readable in old records. A channel carries its commission, a
// service its suggested price. One list at a time (tabs on the desktop, wrapping onto a second row when they must;
// a picker on the phone, like the section picker).
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownIcon, ArrowUpIcon, ListIcon, PencilIcon, PlusIcon } from 'lucide-react'
import {
  LIST_KINDS,
  PAYMENT_METHOD_NEW_GROUPS,
  type ListItem,
  type ListKind,
  type SettingsValues
} from '@shared/contract'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MoneyInput, type MoneyValue } from '@/components/money-input'
import { QueryView } from '@/components/query-view'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { DialogActions, Field } from './room-dialogs'
import { deferForPendingAmount, useAdminMutation, useLocalName } from './use-admin'

const UNITS = ['per_booking', 'per_night', 'per_person', 'per_item', 'per_bag_day'] as const
type Unit = (typeof UNITS)[number]
const isUnit = (v: unknown): v is Unit => UNITS.some((u) => u === v)
const GROUPS = ['cash', 'bank', 'card', 'online', 'platform', 'account', 'other'] as const
const isGroup = (v: unknown): v is (typeof GROUPS)[number] => GROUPS.some((g) => g === v)
type NewGroup = (typeof PAYMENT_METHOD_NEW_GROUPS)[number]
const isNewGroup = (v: unknown): v is NewGroup => PAYMENT_METHOD_NEW_GROUPS.some((g) => g === v)
const CHANNEL_KINDS = ['direct', 'ota', 'agency', 'platform_service'] as const
const isChannelKind = (v: unknown): v is (typeof CHANNEL_KINDS)[number] => CHANNEL_KINDS.some((k) => k === v)

/** "15" / "12,5" / "12.5" → basis points (1250); null when empty, NaN when not a rate 0–100. */
function percentToBp(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(trimmed)
  if (!m) return Number.NaN
  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return bp > 10_000 ? Number.NaN : bp
}

/** Basis points → "12,5" in the UI language's decimal sign. */
function bpToPercent(bp: number | null | undefined, locale: string): string {
  if (bp === null || bp === undefined) return ''
  const whole = Math.trunc(bp / 100)
  const frac = String(bp % 100)
    .padStart(2, '0')
    .replace(/0+$/, '')
  return frac ? `${whole}${locale === 'en' ? '.' : ','}${frac}` : String(whole)
}

type Dialog = { mode: 'add' } | { mode: 'edit'; item: ListItem } | null

function ItemDialog({
  kind,
  item,
  values,
  onClose
}: {
  kind: ListKind
  item: ListItem | null
  values: SettingsValues
  onClose: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const nameOf = useLocalName()
  const formId = useId()
  const initialName = item ? nameOf(item.nameI18n, item.name) : ''
  const [name, setName] = useState(initialName)
  const [group, setGroup] = useState<NewGroup>('card')
  const [collectedBy, setCollectedBy] = useState<'hotel' | 'channel'>('hotel')
  const [commission, setCommission] = useState(bpToPercent(item?.commissionBp, f.locale))
  const [price, setPrice] = useState<MoneyValue>({
    amountMinor: item?.defaultPriceMinor ?? null,
    currency: item?.defaultCurrency ?? values['hotel.baseCurrency']
  })
  const [unit, setUnit] = useState<Unit>('per_item')
  const [errors, setErrors] = useState<{ name?: boolean; commission?: boolean; taken?: boolean }>({})
  // A name the list already has is answered under the field (the service decides), not in a toast.
  const nameTaken = (e: { messageKey: string }): boolean => {
    if (e.messageKey !== 'errors.nameTaken') return false
    setErrors({ taken: true })
    document.getElementById(`${formId}-name`)?.focus()
    return true
  }
  const create = useAdminMutation('lists.create', {
    invalidate: ['lists.list'],
    success: t('settings.lists.added'),
    handled: nameTaken
  })
  const update = useAdminMutation('lists.update', {
    invalidate: ['lists.list'],
    success: t('settings.saved'),
    handled: nameTaken
  })

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (deferForPendingAmount(e.currentTarget)) return
    const trimmed = name.trim()
    const bp = kind === 'salesChannels' ? percentToBp(commission) : null
    const next = {
      name: !trimmed || trimmed.length > 80,
      commission: bp !== null && Number.isNaN(bp)
    }
    setErrors(next)
    if (next.name || next.commission) {
      document.getElementById(`${formId}-${next.name ? 'name' : 'commission'}`)?.focus()
      return
    }
    const priceMinor = price.amountMinor !== null && price.amountMinor >= 0 ? price.amountMinor : null
    if (!item) {
      create.mutate(
        {
          kind,
          name: trimmed,
          ...(kind === 'paymentMethods' ? { group } : {}),
          ...(kind === 'salesChannels' ? { defaultCollectedBy: collectedBy, commissionBp: bp } : {}),
          ...(kind === 'extraServices'
            ? { defaultPriceMinor: priceMinor, defaultCurrency: price.currency, unit }
            : {})
        },
        { onSuccess: onClose }
      )
      return
    }
    const patch = {
      ...(trimmed !== initialName ? { name: trimmed } : {}),
      ...(kind === 'salesChannels' && bp !== (item.commissionBp ?? null) ? { commissionBp: bp } : {}),
      ...(kind === 'extraServices' && priceMinor !== (item.defaultPriceMinor ?? null)
        ? { defaultPriceMinor: priceMinor }
        : {})
    }
    if (Object.keys(patch).length === 0) onClose()
    else update.mutate({ kind, id: item.id, patch }, { onSuccess: onClose })
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={item ? t('settings.lists.editTitle') : t(`settings.lists.addTitle.${kind}`)}
      footer={
        <DialogActions form={formId} pending={create.isPending || update.isPending} onCancel={onClose} />
      }
    >
      <form id={formId} className="grid gap-4" onSubmit={submit} noValidate>
        <Field
          id={`${formId}-name`}
          label={t('settings.lists.col.name')}
          help={item?.seeded ? t('settings.seededRename') : undefined}
          error={errors.name ? t('settings.lists.nameRequired') : errors.taken ? t('errors.nameTaken') : null}
        >
          <Input
            id={`${formId}-name`}
            value={name}
            maxLength={80}
            autoComplete="off"
            aria-invalid={errors.name || errors.taken || undefined}
            aria-describedby={`${formId}-name-msg`}
            onChange={(e) => {
              setName(e.target.value)
              if (errors.taken) setErrors((x) => ({ ...x, taken: false }))
            }}
            data-testid="list-name"
          />
        </Field>
        {kind === 'paymentMethods' && !item ? (
          <Field
            id={`${formId}-group`}
            label={t('settings.lists.col.group')}
            help={t('settings.lists.groupHelp')}
          >
            <Select value={group} onValueChange={(v) => (isNewGroup(v) ? setGroup(v) : null)}>
              <SelectTrigger id={`${formId}-group`} className="w-full" data-testid="list-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_NEW_GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {t(`settings.lists.group.${g}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        {kind === 'salesChannels' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${formId}-commission`}
              label={t('settings.lists.commission')}
              help={t('settings.lists.commissionHelp')}
              error={errors.commission ? t('settings.lists.commissionInvalid') : null}
            >
              <Input
                id={`${formId}-commission`}
                inputMode="decimal"
                dir="ltr"
                className="text-end tabular-nums"
                value={commission}
                aria-invalid={errors.commission || undefined}
                aria-describedby={`${formId}-commission-msg`}
                onChange={(e) => setCommission(e.target.value)}
                data-testid="list-commission"
              />
            </Field>
            {!item ? (
              <Field id={`${formId}-collected`} label={t('settings.lists.collectedBy')}>
                <Select
                  value={collectedBy}
                  onValueChange={(v) => (v === 'hotel' || v === 'channel' ? setCollectedBy(v) : null)}
                >
                  <SelectTrigger id={`${formId}-collected`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hotel">{t('settings.lists.collected.hotel')}</SelectItem>
                    <SelectItem value="channel">{t('settings.lists.collected.channel')}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>
        ) : null}
        {kind === 'extraServices' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyInput
              label={t('settings.lists.defaultPrice')}
              value={price}
              onChange={setPrice}
              currencies={item ? [price.currency] : values['hotel.currencies']}
            />
            {!item ? (
              <Field id={`${formId}-unit`} label={t('settings.lists.unit')}>
                <Select value={unit} onValueChange={(v) => (isUnit(v) ? setUnit(v) : null)}>
                  <SelectTrigger id={`${formId}-unit`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {t(`settings.lists.units.${u}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}

/** The kind's own column: cash group, channel kind + commission, service price, who sees an expense section. */
function Extra({ kind, item, baseCurrency }: { kind: ListKind; item: ListItem; baseCurrency: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  if (kind === 'paymentMethods')
    return <>{isGroup(item.group) ? t(`settings.lists.group.${item.group}`) : item.group}</>
  if (kind === 'salesChannels')
    return (
      <span className="grid gap-0.5">
        <span>
          {isChannelKind(item.kind)
            ? t(`settings.lists.channelKind.${item.kind}`)
            : t('settings.lists.channelKindCustom')}
        </span>
        {item.commissionBp !== null && item.commissionBp !== undefined ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {t('settings.lists.commissionValue', {
              value: f.percent(
                item.commissionBp,
                item.commissionBp % 100 === 0 ? 0 : item.commissionBp % 10 === 0 ? 1 : 2
              )
            })}
          </span>
        ) : null}
      </span>
    )
  if (kind === 'extraServices')
    return (
      <span className="grid gap-0.5">
        <span className="tabular-nums">
          {item.defaultPriceMinor !== null && item.defaultPriceMinor !== undefined ? (
            <bdi>{f.money(item.defaultPriceMinor, item.defaultCurrency ?? baseCurrency)}</bdi>
          ) : (
            <span className="text-muted-foreground">{t('settings.rooms.noPrice')}</span>
          )}
        </span>
        {isUnit(item.unit) ? (
          <span className="text-muted-foreground text-xs">{t(`settings.lists.units.${item.unit}`)}</span>
        ) : null}
      </span>
    )
  if (kind === 'expenseSections')
    return (
      <>
        {item.visibilityPermission === 'expenses.owner'
          ? t('settings.lists.visibility.owner')
          : t('settings.lists.visibility.expenses')}
      </>
    )
  return null
}

const EXTRA_HEAD: Partial<Record<ListKind, 'group' | 'kind' | 'price' | 'visibility'>> = {
  paymentMethods: 'group',
  salesChannels: 'kind',
  extraServices: 'price',
  expenseSections: 'visibility'
}

function ListTable({
  kind,
  items,
  canEdit,
  baseCurrency,
  onEdit
}: {
  kind: ListKind
  items: ListItem[]
  canEdit: boolean
  baseCurrency: string
  onEdit: (item: ListItem) => void
}) {
  const { t } = useTranslation()
  const nameOf = useLocalName()
  const isMobile = useIsMobile()
  const update = useAdminMutation('lists.update', { invalidate: ['lists.list'] })
  const head = EXTRA_HEAD[kind]
  const rows = [...items].sort((a, b) => a.sort - b.sort)

  /** Moves a row one place: the new order is numbered 1…n and only rows whose number changed are written. */
  const move = async (index: number, delta: -1 | 1): Promise<void> => {
    const order = rows.map((r) => r.id)
    const target = index + delta
    const [moved] = order.splice(index, 1)
    if (moved === undefined || target < 0 || target > order.length) return
    order.splice(target, 0, moved)
    for (const [i, id] of order.entries()) {
      const row = rows.find((r) => r.id === id)
      if (row && row.sort !== i + 1) await update.mutateAsync({ kind, id, patch: { sort: i + 1 } })
    }
  }

  const arrows = (index: number, name: string) => (
    <span className="flex">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!canEdit || index === 0 || update.isPending}
        aria-label={t('settings.lists.moveUp', { name })}
        onClick={() => void move(index, -1)}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!canEdit || index === rows.length - 1 || update.isPending}
        aria-label={t('settings.lists.moveDown', { name })}
        onClick={() => void move(index, 1)}
      >
        <ArrowDownIcon />
      </Button>
    </span>
  )
  const toggle = (item: ListItem, name: string) => (
    <Switch
      checked={item.active}
      disabled={!canEdit}
      className="relative max-md:after:absolute max-md:after:-inset-x-2 max-md:after:-inset-y-[14px]"
      aria-label={t('settings.lists.active', { name })}
      onCheckedChange={(active) => update.mutate({ kind, id: item.id, patch: { active } })}
      data-testid={`list-active-${item.code ?? item.id}`}
    />
  )
  const edit = (item: ListItem, name: string) => (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={!canEdit}
      aria-label={t('settings.lists.edit', { name })}
      onClick={() => onEdit(item)}
    >
      <PencilIcon />
    </Button>
  )
  const title = (item: ListItem, name: string) => (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {name}
      {item.isCash ? <Badge variant="secondary">{t('settings.lists.cash')}</Badge> : null}
    </span>
  )

  // Phone: one card per row — the name (and the kind's own detail) above, the controls under it.
  if (isMobile)
    return (
      <ul className="grid gap-2" data-testid={`list-${kind}`}>
        {rows.map((item, index) => {
          const name = nameOf(item.nameI18n, item.name)
          return (
            <li
              key={item.id}
              className={cn('grid gap-1 rounded-lg border p-3', !item.active && 'text-muted-foreground')}
              data-testid={`list-row-${item.code ?? item.id}`}
            >
              <span className="font-medium break-words">{title(item, name)}</span>
              {head ? (
                <span className="text-muted-foreground text-sm">
                  <Extra kind={kind} item={item} baseCurrency={baseCurrency} />
                </span>
              ) : null}
              <span className="-mx-1 flex items-center gap-3">
                {arrows(index, name)}
                <span className="ms-auto">{toggle(item, name)}</span>
                {edit(item, name)}
              </span>
            </li>
          )
        })}
      </ul>
    )

  return (
    <div className="contain-inline-size">
      <Table data-testid={`list-${kind}`}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">
              <span className="sr-only">{t('settings.lists.order')}</span>
            </TableHead>
            <TableHead>{t('settings.lists.col.name')}</TableHead>
            {head ? <TableHead>{t(`settings.lists.col.${head}`)}</TableHead> : null}
            <TableHead>{t('settings.lists.col.active')}</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">{t('common.edit')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item, index) => {
            const name = nameOf(item.nameI18n, item.name)
            return (
              <TableRow
                key={item.id}
                className={cn(!item.active && 'text-muted-foreground')}
                data-testid={`list-row-${item.code ?? item.id}`}
              >
                <TableCell className="px-1 py-1">{arrows(index, name)}</TableCell>
                <TableCell className="font-medium break-words whitespace-normal">
                  {title(item, name)}
                </TableCell>
                {head ? (
                  <TableCell className="whitespace-normal">
                    <Extra kind={kind} item={item} baseCurrency={baseCurrency} />
                  </TableCell>
                ) : null}
                <TableCell>{toggle(item, name)}</TableCell>
                <TableCell className="px-1 py-1">{edit(item, name)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function KindList({ kind, values, canEdit }: { kind: ListKind; values: SettingsValues; canEdit: boolean }) {
  const { t } = useTranslation()
  const query = useApiQuery('lists.list', { kind, includeInactive: true })
  const [dialog, setDialog] = useState<Dialog>(null)
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground min-w-0 flex-1 basis-60 text-xs">
          {t('settings.lists.noDelete')}
        </p>
        <Button
          size="sm"
          disabled={!canEdit}
          onClick={() => setDialog({ mode: 'add' })}
          className="max-md:w-full"
          data-testid="list-add"
        >
          <PlusIcon aria-hidden />
          {t('settings.lists.add')}
        </Button>
      </div>
      <QueryView
        query={query}
        isEmpty={(items) => items.length === 0}
        empty={{ icon: ListIcon, title: t('settings.lists.emptyTitle'), body: t('settings.lists.emptyBody') }}
      >
        {(items) => (
          <ListTable
            kind={kind}
            items={items}
            canEdit={canEdit}
            baseCurrency={values['hotel.baseCurrency']}
            onEdit={(item) => setDialog({ mode: 'edit', item })}
          />
        )}
      </QueryView>
      {dialog ? (
        <ItemDialog
          kind={kind}
          item={dialog.mode === 'edit' ? dialog.item : null}
          values={values}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}

export function ListsSection({ values }: { values: SettingsValues }) {
  const { t } = useTranslation()
  const can = useCan()
  const isMobile = useIsMobile()
  const canEdit = can('settings.lists', 'edit')
  const [kind, setKind] = useState<ListKind>('paymentMethods')
  const pick = (v: string): void => {
    const next = LIST_KINDS.find((k) => k === v)
    if (next) setKind(next)
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="max-md:sr-only">{t('settings.lists.title')}</CardTitle>
        <CardDescription>{t('settings.lists.help')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {isMobile ? (
          // Phone: six lists do not fit as tabs; one picker, like the section picker above.
          <>
            <Select value={kind} onValueChange={pick}>
              <SelectTrigger className="w-full" aria-label={t('settings.lists.pick')} data-testid="list-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIST_KINDS.map((key) => (
                  <SelectItem key={key} value={key} data-testid={`list-kind-${key}`}>
                    {t(`settings.lists.kind.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <KindList key={kind} kind={kind} values={values} canEdit={canEdit} />
          </>
        ) : (
          <Tabs value={kind} onValueChange={pick} className="gap-4">
            {/* The tab row wraps onto a second line when it must; the underline stays under both. */}
            <div className="min-w-0 border-b">
              <TabsList
                variant="line"
                aria-label={t('settings.lists.title')}
                className="flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto"
              >
                {LIST_KINDS.map((key) => (
                  <TabsTrigger key={key} value={key} className="h-9 flex-none px-3">
                    {t(`settings.lists.kind.${key}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {LIST_KINDS.map((key) => (
              <TabsContent key={key} value={key}>
                <KindList kind={key} values={values} canEdit={canEdit} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}
