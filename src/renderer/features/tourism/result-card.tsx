// Step 3: the ministry table in the panel's order — Ülke · Toplam Giriş · Toplam Geceleme — with totals, the
// ministry occupancy (nights ÷ real beds × days), copy per row and for the whole table, CSV/XLSX, the user's own
// country names and the "bildirildi" mark. Desktop: a table; phone: a list of cards.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2Icon, DownloadIcon, PencilIcon, SendIcon, TableIcon, Undo2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { localDate, localDateOf } from '@shared/date'
import type { TourismTableView } from '@shared/contract/tourism'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { CopyButton } from '@/components/copy-button'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { copyRow, occupancyDigits, pendingOf, saveBase64 } from './derive'
import { errorText, useExport, useMarkReported, useRenameCountry } from './use-tourism'

type Row = TourismTableView['table'][number]

function RenameDialog({ row, onClose }: { row: Row & { iso2: string }; onClose: () => void }) {
  const { t } = useTranslation()
  const rename = useRenameCountry()
  const [name, setName] = useState(row.country)
  const send = (value: string | null): void =>
    rename.mutate(
      { iso2: row.iso2, name: value },
      {
        onSuccess: () => {
          toast.success(t('tourism.result.renameSaved'))
          onClose()
        },
        onError: (error) => toast.error(errorText(t, error))
      }
    )
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t('tourism.result.renameTitle')}
      description={t('tourism.result.renameBody')}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2 max-md:[&>*]:flex-1">
          {row.renamed ? (
            <Button variant="ghost" disabled={rename.isPending} onClick={() => send(null)}>
              {t('tourism.result.renameReset')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="tourism-rename"
            disabled={rename.isPending || !name.trim()}
            data-testid="rename-save"
          >
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <form
        id="tourism-rename"
        className="grid gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) send(name.trim())
        }}
      >
        <Label htmlFor="tourism-rename-name">{t('tourism.result.renameLabel')}</Label>
        <Input
          id="tourism-rename-name"
          value={name}
          maxLength={80}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          data-testid="rename-input"
        />
      </form>
    </ResponsiveDialog>
  )
}

function CountryName({ row }: { row: Row }) {
  const { t } = useTranslation()
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-medium break-words">
        {row.country || (row.iso2 ? row.iso2 : t('tourism.blank.tableRow'))}
      </span>
      {row.needsReview ? (
        <Badge variant="destructive">{t('tourism.result.needsReview')}</Badge>
      ) : row.renamed ? (
        <Badge variant="outline" className="text-muted-foreground">
          {t('tourism.result.renamed')}
        </Badge>
      ) : null}
    </span>
  )
}

function RowActions({
  row,
  editable,
  canCopy,
  onRename
}: {
  row: Row
  editable: boolean
  canCopy: boolean
  onRename: () => void
}) {
  const { t } = useTranslation()
  return (
    <span className="flex shrink-0 items-center justify-end gap-1">
      {editable && row.iso2 ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('tourism.result.rename', { country: row.country })}
          onClick={onRename}
        >
          <PencilIcon aria-hidden />
        </Button>
      ) : null}
      {canCopy ? (
        <CopyButton
          text={copyRow(row)}
          label={t('tourism.result.copyRow', { country: row.country })}
          variant="ghost"
          size="icon-sm"
        />
      ) : null}
    </span>
  )
}

export function ResultCard({ table, editable }: { table: TourismTableView | undefined; editable: boolean }) {
  const { t } = useTranslation()
  const f = useFormat()
  const mobile = useIsMobile()
  const mark = useMarkReported()
  const exporter = useExport()
  const [renaming, setRenaming] = useState<(Row & { iso2: string }) | null>(null)

  if (!table)
    return (
      <SectionCard title={t('tourism.result.title')} icon={TableIcon} testId="tourism-step-result">
        <p className="text-muted-foreground text-sm">{t('tourism.step.needFile')}</p>
      </SectionCard>
    )

  const pending = pendingOf(table)
  const reported = table.import.reportedAt
  const bp = table.occupancyBasisPoints
  const download = (format: 'csv' | 'xlsx'): void =>
    exporter.mutate(
      { importId: table.import.id, format },
      {
        onSuccess: (file) => {
          saveBase64(file.fileName, file.mime, file.dataBase64)
          toast.success(t('dataTransfer.export.done', { name: file.fileName }))
        },
        onError: (error) =>
          toast.error(t('tourism.result.exportFailed'), { description: errorText(t, error) })
      }
    )
  const setReported = (value: boolean): void =>
    mark.mutate(
      { importId: table.import.id, reported: value },
      {
        onSuccess: () => toast.success(t(value ? 'tourism.reported.marked' : 'tourism.reported.unmarked')),
        onError: (error) => toast.error(errorText(t, error))
      }
    )
  const rename = (row: Row): void => {
    if (row.iso2) setRenaming({ ...row, iso2: row.iso2 })
  }
  const canCopy = pending === 0
  const copyAll = canCopy ? (
    <CopyButton text={table.clipboard} label={t('tourism.copy.button')} />
  ) : (
    <Button variant="outline" size="sm" disabled>
      {t('tourism.copy.button')}
    </Button>
  )
  const reportedAt = reported ? localDateOf(new Date(reported)) : null

  return (
    <SectionCard
      title={t('tourism.result.title')}
      icon={TableIcon}
      testId="tourism-step-result"
      action={mobile ? null : copyAll}
    >
      <div className="grid gap-3">
        {mobile ? <div className="justify-self-start">{copyAll}</div> : null}
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" data-testid="tourism-facts">
          {[
            [t('tourism.facts.arrivals'), f.number(table.totals.arrivals)],
            [t('tourism.facts.nights'), f.number(table.totals.nights)],
            [t('tourism.facts.beds'), table.beds === null ? '—' : f.number(table.beds)],
            [t('tourism.facts.occupancy'), bp === null ? '—' : f.percent(bp, occupancyDigits(bp))]
          ].map(([label, value]) => (
            <div key={label} className="bg-muted/60 min-w-0 rounded-lg px-3 py-2">
              <dt className="text-muted-foreground text-xs break-words">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <ul className="text-muted-foreground grid gap-1 text-xs">
          <li>{t('tourism.rules.sameDay', { count: table.issues.sameDay })}</li>
          <li>{t('tourism.rules.arrivalMonth')}</li>
          {table.inHouse.length ? (
            <li>{t('tourism.rules.inHouse', { date: f.date(localDate(table.countedTo), 'medium') })}</li>
          ) : null}
          <li className={table.beds === null ? 'text-destructive' : undefined}>
            {table.beds === null
              ? t('tourism.rules.noBeds')
              : t('tourism.rules.beds', { beds: f.number(table.beds) })}
          </li>
        </ul>
        {table.invalidDates.length ? (
          <div
            className="border-destructive/40 grid gap-1 rounded-lg border p-3"
            data-testid="tourism-invalid-dates"
          >
            <p className="text-destructive text-sm font-medium">
              {t('tourism.invalidDates.title', { count: table.invalidDates.length })}
            </p>
            <p className="text-muted-foreground text-xs">{t('tourism.invalidDates.hint')}</p>
            <ul className="grid gap-0.5 text-xs">
              {table.invalidDates.map((r, i) => (
                <li key={r.rowId ?? i} className="break-words">
                  {t('tourism.invalidDates.row', {
                    room: r.room,
                    arrival: f.date(localDate(r.arrival), 'medium'),
                    departure: f.date(localDate(r.departure), 'medium')
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {pending ? (
          <p className="text-destructive text-sm font-medium" data-testid="tourism-pending">
            {t('tourism.copy.pending', { count: pending })}
          </p>
        ) : null}

        {mobile ? (
          <ul
            className="grid grid-cols-1 gap-2"
            aria-label={t('tourism.result.title')}
            data-testid="tourism-table"
          >
            {table.table.map((r) => (
              <li
                key={`${r.iso2 ?? ''}|${r.country}`}
                className="flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <CountryName row={r} />
                  <span className="text-muted-foreground mt-0.5 block text-xs tabular-nums">
                    {t('tourism.result.arrivalsShort', { count: r.arrivals })} ·{' '}
                    {t('tourism.result.nightsShort', { count: r.nights })}
                  </span>
                </span>
                <RowActions row={r} editable={editable} canCopy={canCopy} onRename={() => rename(r)} />
              </li>
            ))}
            <li className="bg-muted flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-semibold">
              <span>{t('common.total')}</span>
              <span className="tabular-nums">
                {f.number(table.totals.arrivals)} / {f.number(table.totals.nights)}
              </span>
            </li>
          </ul>
        ) : (
          <Table className="text-sm" data-testid="tourism-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-end">{t('tourism.result.no')}</TableHead>
                <TableHead>{t('tourism.result.country')}</TableHead>
                <TableHead className="text-end">{t('tourism.result.arrivals')}</TableHead>
                <TableHead className="text-end">{t('tourism.result.nights')}</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">{t('common.copy')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.table.map((r, i) => (
                <TableRow key={`${r.iso2 ?? ''}|${r.country}`}>
                  <TableCell className="text-muted-foreground text-end tabular-nums">{i + 1}</TableCell>
                  <TableCell className="whitespace-normal">
                    <CountryName row={r} />
                  </TableCell>
                  <TableCell className="text-end font-medium tabular-nums">{f.number(r.arrivals)}</TableCell>
                  <TableCell className="text-end font-medium tabular-nums">{f.number(r.nights)}</TableCell>
                  <TableCell className="py-1">
                    <RowActions row={r} editable={editable} canCopy={canCopy} onRename={() => rename(r)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell />
                <TableCell className="font-semibold">{t('common.total')}</TableCell>
                <TableCell className="text-end font-semibold tabular-nums">
                  {f.number(table.totals.arrivals)}
                </TableCell>
                <TableCell className="text-end font-semibold tabular-nums">
                  {f.number(table.totals.nights)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        )}

        <div className="flex flex-wrap items-center gap-2 max-md:[&>button]:flex-1">
          <Button variant="outline" size="sm" disabled={exporter.isPending} onClick={() => download('xlsx')}>
            <DownloadIcon aria-hidden />
            {t('tourism.result.exportXlsx')}
          </Button>
          <Button variant="outline" size="sm" disabled={exporter.isPending} onClick={() => download('csv')}>
            <DownloadIcon aria-hidden />
            {t('tourism.result.exportCsv')}
          </Button>
        </div>

        <div className="bg-muted/50 grid gap-2 rounded-lg p-3" data-testid="tourism-reported">
          {reported && reportedAt ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-success flex items-center gap-2 text-sm font-medium">
                <CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
                <span className="text-foreground">
                  {table.import.reportedByName
                    ? t('tourism.reported.doneBy', {
                        date: f.date(reportedAt, 'medium'),
                        name: table.import.reportedByName
                      })
                    : t('tourism.reported.done', { date: f.date(reportedAt, 'medium') })}
                </span>
              </p>
              {editable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={mark.isPending}
                  onClick={() => setReported(false)}
                >
                  <Undo2Icon aria-hidden />
                  {t('tourism.reported.undo')}
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">{t('tourism.reported.hint')}</p>
              {editable ? (
                <Button
                  className="justify-self-start max-md:w-full"
                  disabled={mark.isPending}
                  onClick={() => setReported(true)}
                  data-testid="mark-reported"
                >
                  <SendIcon aria-hidden />
                  {t('tourism.reported.mark')}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
      {renaming ? <RenameDialog row={renaming} onClose={() => setRenaming(null)} /> : null}
    </SectionCard>
  )
}
