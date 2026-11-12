// Step 7 — payment methods, sales channels and extra services (G-13…G-15): the seeded rows as checkboxes with
// their translated names, plus the hotel's own names. Channels are labels only (G-05); there are many of them, so
// they sit under small headings by kind (direct, booking sites, agencies and wholesalers, luggage storage).
import { useTranslation } from 'react-i18next'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/hooks/use-format'
import { ids, localName, type SetupOptions, type WizardDraft } from './draft'
import { AddName, ChoiceChip, FieldMessage } from './fields'
import type { StepProps } from './step-props'

type Lists = WizardDraft['lists']
type Row = SetupOptions['salesChannels'][number]

/** The kinds a seeded channel can have, in the order their headings show; anything else lands under "your own". */
const CHANNEL_KINDS = ['direct', 'ota', 'agency', 'platform_service'] as const
type ChannelSection = { key: (typeof CHANNEL_KINDS)[number] | 'custom'; rows: Row[] }

/** Channel rows split by kind, kept in the seed's order within each kind; the last section is the hotel's own. */
function channelSections(rows: Row[]): ChannelSection[] {
  return [
    ...CHANNEL_KINDS.map((key) => ({ key, rows: rows.filter((r) => r.kind === key) })),
    { key: 'custom' as const, rows: rows.filter((r) => !CHANNEL_KINDS.some((k) => k === r.kind)) }
  ]
}

const GROUPS = [
  {
    kind: 'paymentMethods',
    custom: 'customPaymentMethods',
    title: 'setup.money.methods',
    add: 'setup.money.addMethod',
    hint: null
  },
  {
    kind: 'salesChannels',
    custom: 'customSalesChannels',
    title: 'setup.money.channels',
    add: 'setup.money.addChannel',
    hint: 'setup.money.channelsHint'
  },
  {
    kind: 'extraServices',
    custom: 'customExtraServices',
    title: 'setup.money.services',
    add: 'setup.money.addService',
    hint: 'setup.money.servicesHint'
  }
] as const satisfies readonly {
  kind: keyof SetupOptions & keyof Lists
  custom: keyof Lists
  title: string
  add: string
  hint: string | null
}[]

export function MoneyStep({ draft, update, options, errors }: StepProps) {
  const { t } = useTranslation()
  const f = useFormat()
  return (
    <div className="grid gap-6">
      {GROUPS.map((group) => {
        const rows = options[group.kind]
        const kept = draft.lists[group.kind]
        const own = draft.lists[group.custom]
        const names = [...rows.map((r) => localName(f.locale, r.name, r.nameI18n)), ...own]
        const setKept = (ids: string[]): void =>
          update((d) => ({ ...d, lists: { ...d.lists, [group.kind]: ids } }))
        // The first cash method carries the "a cash method must stay ticked" message (the drawer needs one).
        const cashId = group.kind === 'paymentMethods' ? rows.find((r) => r.isCash)?.id : undefined
        const cashError = group.kind === 'paymentMethods' ? errors[ids.cashMethod] : undefined
        const setOwn = (list: string[]): void =>
          update((d) => ({ ...d, lists: { ...d.lists, [group.custom]: list } }))
        const chip = (row: Row) => (
          <ChoiceChip
            key={row.id}
            id={row.id === cashId ? ids.cashMethod : undefined}
            describedBy={row.id === cashId && cashError ? `${ids.cashMethod}-error` : undefined}
            checked={kept.includes(row.id)}
            onChange={(on) =>
              setKept(
                on
                  ? rows.filter((r) => r.id === row.id || kept.includes(r.id)).map((r) => r.id)
                  : kept.filter((id) => id !== row.id)
              )
            }
            testId={`setup-list-${group.kind}-${row.code ?? row.id}`}
          >
            {localName(f.locale, row.name, row.nameI18n)}
          </ChoiceChip>
        )
        const ownChip = (name: string) => (
          <span
            key={name}
            className="border-primary bg-accent flex min-h-9 items-center gap-1 rounded-lg border ps-3 pe-1 text-sm max-md:min-h-11 max-md:pe-0"
          >
            {name}
            {/* Phone: a full 44 px target; it overlaps the chip's border instead of making the chip taller. */}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="max-md:-my-px max-md:size-11"
              aria-label={t('setup.remove', { name })}
              data-testid={`setup-remove-own-${group.custom}`}
              onClick={() => setOwn(own.filter((n) => n !== name))}
            >
              <XIcon aria-hidden />
            </Button>
          </span>
        )
        // Sales channels: one small heading per kind; the hotel's own names go under the last one.
        const sections =
          group.kind === 'salesChannels'
            ? channelSections(rows).filter(
                (section) => section.rows.length > 0 || (section.key === 'custom' && own.length > 0)
              )
            : null
        return (
          <fieldset key={group.kind} className="grid gap-2" data-testid={`setup-list-${group.kind}`}>
            <legend className="mb-2 text-sm font-medium">{t(group.title)}</legend>
            {sections ? (
              <div className="grid gap-4">
                {sections.map((section) => (
                  <div
                    key={section.key}
                    role="group"
                    aria-labelledby={`setup-channel-kind-${section.key}`}
                    className="grid gap-2"
                    data-testid={`setup-channel-group-${section.key}`}
                  >
                    <p
                      id={`setup-channel-kind-${section.key}`}
                      className="text-muted-foreground text-xs font-medium"
                    >
                      {t(`setup.money.channelKind.${section.key}`)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {section.rows.map(chip)}
                      {section.key === 'custom' ? own.map(ownChip) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {rows.map(chip)}
                {own.map(ownChip)}
              </div>
            )}
            <FieldMessage id={ids.cashMethod} error={cashError} />
            {group.hint ? <p className="text-muted-foreground text-xs">{t(group.hint)}</p> : null}
            <div className="sm:max-w-md">
              <AddName
                id={`setup-add-${group.kind}`}
                label={t(group.add)}
                existing={names}
                onAdd={(name) => setOwn([...own, name])}
              />
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
