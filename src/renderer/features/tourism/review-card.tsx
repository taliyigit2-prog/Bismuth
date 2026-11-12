// Step 2: what needs a person before the table goes to the ministry. Nationality spellings Bismuth does not take on
// its own (K-36: a typo is suggested, "KIBRIS"/"CYPRUS" and former countries are chosen; once confirmed it is
// remembered) and the guests still in-house, whose nights are counted to a planned or assumed day (correctable).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BedDoubleIcon, CheckCircle2Icon, PencilIcon, SpellCheckIcon } from 'lucide-react'
import { toast } from 'sonner'
import { localDate, type LocalDate } from '@shared/date'
import type { TourismCountryOption, TourismTableView } from '@shared/contract/tourism'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/date-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { CountryPicker } from './country-picker'
import { pendingOf } from './derive'
import { errorText, useAssignRow, useConfirmCountry, useCountries, useStayUntil } from './use-tourism'

type Review = TourismTableView['review'][number]
type Blank = TourismTableView['blankNationality'][number]

type InHouse = TourismTableView['inHouse'][number]

const HINT: Record<Review['reason'], string> = {
  typo: '',
  ambiguous: 'tourism.review.ambiguousHint',
  sensitive: 'tourism.review.sensitiveHint',
  historical: 'tourism.review.historicalHint',
  unknown: 'tourism.review.unknownHint'
}

function ReviewItem({
  item,
  countries,
  editable,
  busy,
  onPick
}: {
  item: Review
  countries: readonly TourismCountryOption[]
  editable: boolean
  busy: boolean
  onPick: (c: TourismCountryOption) => void
}) {
  const { t } = useTranslation()
  const suggestion = item.reason === 'typo' ? item.suggestions[0] : undefined
  return (
    <li className="grid gap-2 rounded-lg border p-3" data-testid={`review-${item.raw}`}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="bg-muted rounded px-1.5 py-0.5 text-sm font-semibold break-all">{item.raw}</code>
        <Badge variant={item.reason === 'typo' ? 'outline' : 'destructive'}>
          {t(`tourism.review.kind.${item.reason}`)}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {t('tourism.review.rows', { count: item.rows })}
        </span>
      </div>
      {suggestion ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">{t('tourism.review.suggest', { country: suggestion.name })}</p>
          {editable ? (
            <div className="flex flex-wrap gap-2 max-md:w-full max-md:[&>*]:flex-1">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => onPick(suggestion)}
                data-testid="review-accept"
              >
                {t('tourism.review.accept')}
              </Button>
              <CountryPicker
                raw={item.raw}
                suggestions={[]}
                countries={countries}
                onPick={onPick}
                disabled={busy}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-2">
          <p className="text-muted-foreground text-sm">
            {t(HINT[item.reason] as 'tourism.review.ambiguousHint')}
          </p>
          {editable ? (
            <CountryPicker
              raw={item.raw}
              suggestions={item.suggestions}
              countries={countries}
              onPick={onPick}
              disabled={busy}
            />
          ) : null}
        </div>
      )}
    </li>
  )
}

/**
 * KBS rows written without a nationality ("" or "-"): not a spelling to remember, so each row gets its own country
 * here (P10fix #4); until all are assigned the table is not copied.
 */
function BlankRows({
  table,
  rows,
  countries,
  editable
}: {
  table: TourismTableView
  rows: readonly Blank[]
  countries: readonly TourismCountryOption[]
  editable: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const assign = useAssignRow()
  const send = (row: Blank, c: TourismCountryOption | null): void => {
    if (!row.rowId) return
    assign.mutate(
      { importId: table.import.id, rowId: row.rowId, iso2: c?.iso2 ?? null },
      {
        onSuccess: () =>
          toast.success(
            c ? t('tourism.blank.saved', { room: row.room, country: c.name }) : t('tourism.blank.undone')
          ),
        onError: (error) => toast.error(errorText(t, error))
      }
    )
  }
  return (
    <div className="grid gap-2" data-testid="tourism-blank">
      <p className="text-sm font-medium">{t('tourism.blank.title')}</p>
      <p className="text-muted-foreground text-xs">{t('tourism.blank.intro')}</p>
      <ul className="grid grid-cols-1 gap-2">
        {rows.map((row, i) => {
          const where = t('tourism.blank.row', {
            room: row.room,
            date: f.date(localDate(row.arrival), 'medium')
          })
          return (
            <li
              key={row.rowId ?? i}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              data-testid="blank-row"
            >
              <span className="grid min-w-0 gap-0.5">
                <span className="font-medium">{where}</span>
                {row.country ? (
                  <span className="text-success flex items-center gap-1.5">
                    <CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
                    <span className="text-foreground">{row.country.name}</span>
                  </span>
                ) : (
                  <Badge variant="destructive" className="justify-self-start">
                    {t('tourism.blank.missing')}
                  </Badge>
                )}
              </span>
              {editable && row.rowId ? (
                <div className="flex flex-wrap gap-2 max-md:w-full max-md:[&>*]:flex-1">
                  {row.country ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={assign.isPending}
                      onClick={() => send(row, null)}
                    >
                      {t('tourism.blank.undo')}
                    </Button>
                  ) : null}
                  <CountryPicker
                    raw={row.raw}
                    suggestions={[]}
                    countries={countries}
                    onPick={(c) => send(row, c)}
                    disabled={assign.isPending}
                    label={t('tourism.blank.choose', { row: where })}
                    testId="blank-picker"
                  />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function ReviewCard({ table, editable }: { table: TourismTableView | undefined; editable: boolean }) {
  const { t } = useTranslation()
  const review = table?.review ?? []
  const blank = table?.blankNationality ?? []
  const pending = table ? pendingOf(table) : 0
  const countries = useCountries(editable && (review.length > 0 || blank.length > 0))
  const confirm = useConfirmCountry()
  const pick = (item: Review, c: TourismCountryOption): void =>
    confirm.mutate(
      { rawValue: item.raw, iso2: c.iso2, ministryNameTr: c.name },
      {
        onSuccess: () => toast.success(t('tourism.review.saved', { raw: item.raw, country: c.name })),
        onError: (error) => toast.error(errorText(t, error))
      }
    )
  return (
    <SectionCard
      title={t('tourism.review.title')}
      icon={SpellCheckIcon}
      count={table ? pending : undefined}
      tone="warn"
      testId="tourism-step-review"
    >
      {!table ? (
        <p className="text-muted-foreground text-sm">{t('tourism.step.needFile')}</p>
      ) : review.length === 0 && blank.length === 0 ? (
        <p className="text-success flex items-center gap-2 text-sm font-medium">
          <CheckCircle2Icon className="size-4" aria-hidden />
          {t('tourism.review.none')}
        </p>
      ) : (
        <div className="grid gap-4">
          {review.length ? (
            <div className="grid gap-3">
              <p className="text-muted-foreground text-xs">{t('tourism.review.intro')}</p>
              <ul className="grid grid-cols-1 gap-2">
                {review.map((item) => (
                  <ReviewItem
                    key={item.key}
                    item={item}
                    countries={countries.data ?? []}
                    editable={editable}
                    busy={confirm.isPending}
                    onPick={(c) => pick(item, c)}
                  />
                ))}
              </ul>
            </div>
          ) : null}
          {blank.length ? (
            <BlankRows table={table} rows={blank} countries={countries.data ?? []} editable={editable} />
          ) : null}
        </div>
      )}
    </SectionCard>
  )
}

function UntilDialog({
  table,
  stay,
  onClose
}: {
  table: TourismTableView
  stay: InHouse
  onClose: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const save = useStayUntil()
  const [until, setUntil] = useState<LocalDate>(stay.countedUntil)
  const send = (value: LocalDate | null): void => {
    if (!stay.rowId) return
    save.mutate(
      { importId: table.import.id, rowId: stay.rowId, until: value },
      {
        onSuccess: () => {
          toast.success(t('tourism.inHouse.saved'))
          onClose()
        },
        onError: (error) => toast.error(errorText(t, error))
      }
    )
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t('tourism.inHouse.dialogTitle')}
      description={t('tourism.inHouse.dialogBody', {
        room: stay.room,
        date: f.date(localDate(stay.arrival), 'medium')
      })}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2 max-md:[&>*]:flex-1">
          {stay.basis === 'manual' ? (
            <Button variant="ghost" disabled={save.isPending} onClick={() => send(null)}>
              {t('tourism.inHouse.reset')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="tourism-until" disabled={save.isPending} data-testid="until-save">
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <form
        id="tourism-until"
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          send(until)
        }}
      >
        <DateInput
          label={t('tourism.inHouse.untilLabel')}
          value={until}
          min={localDate(stay.arrival)}
          onChange={setUntil}
        />
      </form>
    </ResponsiveDialog>
  )
}

export function InHouseCard({ table, editable }: { table: TourismTableView; editable: boolean }) {
  const { t } = useTranslation()
  const f = useFormat()
  const [editing, setEditing] = useState<InHouse | null>(null)
  return (
    <SectionCard
      title={t('tourism.inHouse.title')}
      icon={BedDoubleIcon}
      count={table.inHouse.length}
      testId="tourism-in-house"
    >
      {table.inHouse.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('tourism.inHouse.none')}</p>
      ) : (
        <div className="grid gap-3">
          <p className="text-muted-foreground text-xs">{t('tourism.inHouse.intro')}</p>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {table.inHouse.map((s, i) => (
              <li
                key={s.rowId ?? i}
                className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm"
                data-testid="in-house-row"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {t('tourism.inHouse.room', { room: s.room })}
                    <span className="text-muted-foreground ms-2 font-normal">
                      {t('tourism.inHouse.arrival', { date: f.date(localDate(s.arrival), 'medium') })}
                    </span>
                  </span>
                  <span className="block">
                    {t('tourism.inHouse.until', { date: f.date(localDate(s.countedUntil), 'medium') })}
                    {' · '}
                    <span className="tabular-nums">
                      {t('tourism.result.nightsShort', { count: s.nights })}
                    </span>
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {t(`tourism.inHouse.basis.${s.basis}`)}
                  </span>
                </span>
                {editable && s.rowId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t('tourism.inHouse.editLabel', {
                      room: s.room,
                      date: f.date(localDate(s.arrival), 'medium')
                    })}
                    onClick={() => setEditing(s)}
                  >
                    <PencilIcon aria-hidden />
                    {t('tourism.inHouse.edit')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {editing ? <UntilDialog table={table} stay={editing} onClose={() => setEditing(null)} /> : null}
    </SectionCard>
  )
}
