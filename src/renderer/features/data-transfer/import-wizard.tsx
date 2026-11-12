// "İçe aktar" (faz-14 madde 4; G-123, K-30, S-08): the owner's spreadsheets come in four steps — choose the template
// and the file (CSV, or XLSX to keep the payment colours) → check which column is which → preview with the list of
// faulty rows and possible duplicate guests → import. The sound rows go in, the faulty ones are listed with their row
// number so they can be fixed and imported again. Nothing is written before the last step. A record an earlier
// import took in is marked and skipped (P14fix #2); the salary sheet is the third template (P14fix #10) and each
// template has a sample file to fill in.
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileUpIcon,
  HistoryIcon,
  TriangleAlertIcon,
  UsersIcon
} from 'lucide-react'
import {
  GRID_FIELDS,
  IMPORT_TEMPLATES,
  LEDGER_FIELDS,
  SALARY_FIELDS,
  type ImportError,
  type ImportField,
  type ImportInput,
  type ImportPreview,
  type ImportReport,
  type ImportTemplate
} from '@shared/contract/backup'
import { localDate, localDateOf } from '@shared/date'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { SwitchRow } from '../settings/room-dialogs'
import { useLocalName } from '../settings/use-admin'
import { fileToBase64, IMPORT_MAX_BYTES, saveExport } from './files'

type Step = 'file' | 'map' | 'preview' | 'done'
const STEPS: readonly Step[] = ['file', 'map', 'preview', 'done']
/** ISO instant → its local day (the "imported on" line). */
const isoDay = (iso: string): string => localDateOf(new Date(iso))
const NONE = 'none'
const PREVIEW_ROWS = 50

interface Options {
  headerRow?: number
  mapping: Partial<Record<ImportField, number | null>>
  month?: string
  sheet: number
  channelId?: string
  paidMethodId: string | null
  defaultMethodId: string | null
  matchReservations: boolean
}

const initialOptions = (): Options => ({
  mapping: {},
  sheet: 0,
  paidMethodId: null,
  defaultMethodId: null,
  matchReservations: true
})

function StepDots({ step }: { step: Step }) {
  const { t } = useTranslation()
  const at = STEPS.indexOf(step)
  return (
    <ol className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={t('dataTransfer.import.steps')}>
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={s === step ? 'step' : undefined}
          className={cn(
            'flex items-center gap-1.5',
            i === at ? 'text-foreground font-semibold' : 'text-muted-foreground'
          )}
        >
          <span
            className={cn(
              'grid size-5 place-items-center rounded-full border tabular-nums',
              i <= at && 'bg-primary text-primary-foreground border-primary'
            )}
          >
            {i + 1}
          </span>
          {t(`dataTransfer.import.step.${s}`)}
        </li>
      ))}
    </ol>
  )
}

function ErrorList({ errors, total }: { errors: readonly ImportError[]; total: number }) {
  const { t } = useTranslation()
  if (!errors.length) return null
  return (
    <section className="grid gap-2" data-testid="import-errors">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <TriangleAlertIcon className="text-destructive size-4" aria-hidden />
        {t('dataTransfer.import.errorsTitle', { count: total })}
      </h3>
      <ul className="divide-y rounded-lg border text-sm">
        {errors.slice(0, 100).map((e, i) => (
          <li key={i} className="grid gap-0.5 px-3 py-2 md:grid-cols-[11rem_1fr]">
            <span className="text-muted-foreground tabular-nums">
              {e.column
                ? t('dataTransfer.import.rowColumn', { row: e.row, column: e.column })
                : t('dataTransfer.import.row', { row: e.row })}
            </span>
            <span className="min-w-0 break-words">
              {t(`dataTransfer.import.error.${e.code}`)}
              {e.value ? <span className="text-muted-foreground"> · {e.value}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {total > 100 ? (
        <p className="text-muted-foreground text-xs">
          {t('dataTransfer.import.moreErrors', { count: total - 100 })}
        </p>
      ) : null}
    </section>
  )
}

function Duplicates({ list }: { list: ImportPreview['duplicates'] }) {
  const { t } = useTranslation()
  if (!list.length) return null
  return (
    <section className="grid gap-2" data-testid="import-duplicates">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <UsersIcon className="text-muted-foreground size-4" aria-hidden />
        {t('dataTransfer.import.duplicatesTitle', { count: list.length })}
      </h3>
      <p className="text-muted-foreground text-xs">{t('dataTransfer.import.duplicatesHelp')}</p>
      <ul className="divide-y rounded-lg border text-sm">
        {list.slice(0, 50).map((d) => (
          <li key={d.name} className="px-3 py-2 break-words">
            {t('dataTransfer.import.duplicateLine', { name: d.name, similar: d.similar.join(', ') })}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Records({ preview }: { preview: ImportPreview }) {
  const { t } = useTranslation()
  const f = useFormat()
  const rows = preview.records.slice(0, PREVIEW_ROWS)
  const dateOf = (d: string) => f.date(localDate(d), 'medium')
  const whenOf = (r: ImportPreview['records'][number]) =>
    r.kind === 'salary'
      ? f.monthYear(localDate(r.date))
      : r.until && r.until !== r.date
        ? t('dataTransfer.import.range', { from: dateOf(r.date), to: dateOf(r.until) })
        : dateOf(r.date)
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold">
        {t('dataTransfer.import.recordsTitle', { count: preview.recordCount })}
      </h3>
      <div className="max-md:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('dataTransfer.import.col.row')}</TableHead>
              <TableHead>{t('dataTransfer.import.col.kind')}</TableHead>
              <TableHead>{t('dataTransfer.import.col.date')}</TableHead>
              <TableHead>{t('dataTransfer.import.col.room')}</TableHead>
              <TableHead>{t('dataTransfer.import.col.name')}</TableHead>
              <TableHead className="text-end">{t('dataTransfer.import.col.amount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i} className={cn(r.already && 'text-muted-foreground')}>
                <TableCell className="tabular-nums">{r.row}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1">
                    <Badge variant={r.kind === 'expense' ? 'outline' : 'secondary'}>
                      {t(`dataTransfer.import.kind.${r.kind}`)}
                    </Badge>
                    {r.already ? <Badge variant="outline">{t('dataTransfer.import.already')}</Badge> : null}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">{whenOf(r)}</TableCell>
                <TableCell>{r.room ?? '—'}</TableCell>
                <TableCell className="max-w-56 truncate" title={r.name}>
                  {r.name}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  <bdi>{f.money(r.amountMinor, r.currency)}</bdi>
                  {r.paidMinor > 0 && r.kind !== 'income' ? (
                    <span className="text-muted-foreground block text-xs">
                      {t('dataTransfer.import.paid', { amount: f.money(r.paidMinor, r.currency) })}
                    </span>
                  ) : null}
                  {r.marked ? (
                    <span className="text-muted-foreground block text-xs">
                      {t('dataTransfer.import.marked')}
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="divide-y rounded-lg border text-sm md:hidden">
        {rows.map((r, i) => (
          <li key={i} className={cn('grid gap-1 px-3 py-2', r.already && 'text-muted-foreground')}>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 font-medium break-words">{r.name}</span>
              <bdi className="tabular-nums">{f.money(r.amountMinor, r.currency)}</bdi>
            </div>
            <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
              <span>{t(`dataTransfer.import.kind.${r.kind}`)}</span>
              {r.already ? <span>{t('dataTransfer.import.already')}</span> : null}
              <span>{whenOf(r)}</span>
              {r.room ? <span>{t('dataTransfer.import.roomLine', { room: r.room })}</span> : null}
              <span>{t('dataTransfer.import.row', { row: r.row })}</span>
            </div>
          </li>
        ))}
      </ul>
      {preview.recordCount > PREVIEW_ROWS ? (
        <p className="text-muted-foreground text-xs">
          {t('dataTransfer.import.moreRecords', { count: preview.recordCount - PREVIEW_ROWS })}
        </p>
      ) : null}
    </section>
  )
}

function Field({
  id,
  label,
  children,
  help
}: {
  id: string
  label: string
  children: ReactNode
  help?: string
}) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {help ? <p className="text-muted-foreground text-xs">{help}</p> : null}
    </div>
  )
}

export function ImportWizard({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const nameOf = useLocalName()
  const [step, setStep] = useState<Step>('file')
  const [template, setTemplate] = useState<ImportTemplate>('reservationGrid')
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [options, setOptions] = useState<Options>(initialOptions)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const channels = useApiQuery('lists.list', { kind: 'salesChannels' }, { enabled: open })
  const methods = useApiQuery('lists.list', { kind: 'paymentMethods' }, { enabled: open })

  const failed = (error: { messageKey: string }) =>
    toast.error(t('dataTransfer.import.failed'), {
      description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
    })
  const previewCall = useApiMutation('dataImport.preview', { onError: failed })
  const runCall = useApiMutation('dataImport.run', {
    onError: failed,
    invalidates: ['backup.overview', 'dataExport.datasets', 'dataImport.batches']
  })
  const sample = useApiMutation('dataImport.sample', {
    onSuccess: (file) => {
      if (file.delivery === 'canceled') return
      if (file.delivery === 'download') saveExport(file)
      toast.success(t('dataTransfer.import.sampleDone', { name: file.savedPath ?? file.fileName }))
    },
    onError: failed
  })

  const reset = (): void => {
    setStep('file')
    setFile(null)
    setFileError(null)
    setOptions(initialOptions())
    setPreview(null)
    setReport(null)
  }
  const close = (next: boolean): void => {
    onOpenChange(next)
    if (!next) reset()
  }

  const input = (): ImportInput | null =>
    file
      ? {
          template,
          fileName: file.name,
          contentBase64: file.base64,
          sheet: options.sheet,
          mapping: options.mapping,
          matchReservations: options.matchReservations,
          ...(options.headerRow ? { headerRow: options.headerRow } : {}),
          ...(options.month ? { month: options.month } : {}),
          ...(options.channelId ? { channelId: options.channelId } : {}),
          ...(options.paidMethodId ? { paidMethodId: options.paidMethodId } : {}),
          ...(options.defaultMethodId ? { defaultMethodId: options.defaultMethodId } : {})
        }
      : null

  const analyse = (next: Step): void => {
    const body = input()
    if (!body) return
    previewCall.mutate(body, {
      onSuccess: (p) => {
        setPreview(p)
        // The columns found become the starting point of the mapping step.
        setOptions((o) => ({ ...o, headerRow: p.headerRow, mapping: { ...p.mapping, ...o.mapping } }))
        setStep(next)
      }
    })
  }

  const pick = async (chosen: File | undefined): Promise<void> => {
    setFileError(null)
    setFile(null)
    if (!chosen) return
    if (chosen.size > IMPORT_MAX_BYTES) {
      setFileError(t('dataTransfer.import.tooLarge'))
      return
    }
    setFile({ name: chosen.name, base64: await fileToBase64(chosen) })
  }

  const fields: readonly ImportField[] =
    template === 'reservationGrid' ? GRID_FIELDS : template === 'ledgerRows' ? LEDGER_FIELDS : SALARY_FIELDS
  const columns = preview?.columns ?? []
  const columnLabel = (i: number) =>
    t('dataTransfer.import.columnOption', { n: i + 1, title: columns[i] ?? '' })
  const methodItems = useMemo(() => methods.data ?? [], [methods.data])
  const channelItems = useMemo(() => channels.data ?? [], [channels.data])
  const busy = previewCall.isPending || runCall.isPending
  /** Records the run will write: the ones an earlier import took in are skipped. */
  const toImport = preview ? preview.recordCount - preview.alreadyImported : 0
  const errorsBlockRun = !preview || toImport <= 0 || preview.needsMonth

  const footer: ReactNode =
    step === 'file' ? (
      <>
        <Button variant="outline" onClick={() => close(false)}>
          {t('common.cancel')}
        </Button>
        <Button onClick={() => analyse('map')} disabled={!file || busy} data-testid="import-next">
          {previewCall.isPending ? t('dataTransfer.import.reading') : t('dataTransfer.import.next')}
        </Button>
      </>
    ) : step === 'map' ? (
      <>
        <Button variant="outline" onClick={() => setStep('file')}>
          <ArrowLeftIcon className="rtl:rotate-180" aria-hidden />
          {t('dataTransfer.import.back')}
        </Button>
        <Button onClick={() => analyse('preview')} disabled={busy} data-testid="import-preview">
          {previewCall.isPending ? t('dataTransfer.import.reading') : t('dataTransfer.import.toPreview')}
        </Button>
      </>
    ) : step === 'preview' ? (
      <>
        <Button variant="outline" onClick={() => setStep('map')}>
          <ArrowLeftIcon className="rtl:rotate-180" aria-hidden />
          {t('dataTransfer.import.back')}
        </Button>
        <Button
          onClick={() => {
            const body = input()
            if (body)
              runCall.mutate(body, {
                onSuccess: (r) => {
                  setReport(r)
                  setStep('done')
                  toast.success(t('dataTransfer.import.doneToast'))
                }
              })
          }}
          disabled={busy || errorsBlockRun}
          data-testid="import-run"
        >
          {runCall.isPending
            ? t('dataTransfer.import.importing')
            : t('dataTransfer.import.run', { count: toImport })}
        </Button>
      </>
    ) : (
      <>
        <Button variant="outline" onClick={reset}>
          {t('dataTransfer.import.another')}
        </Button>
        <Button onClick={() => close(false)}>{t('common.close')}</Button>
      </>
    )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={t('dataTransfer.import.title')}
      description={t('dataTransfer.import.description')}
      className="sm:max-w-3xl"
      footer={footer}
    >
      <StepDots step={step} />

      {step === 'file' ? (
        <div className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t('dataTransfer.import.template')}</legend>
            <RadioGroup
              value={template}
              onValueChange={(v) => {
                setTemplate(v as ImportTemplate)
                setOptions(initialOptions())
              }}
              className="grid gap-2 md:grid-cols-3"
            >
              {IMPORT_TEMPLATES.map((tpl) => (
                <Label
                  key={tpl}
                  htmlFor={`template-${tpl}`}
                  className="has-[[data-state=checked]]:border-primary flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal"
                >
                  <RadioGroupItem id={`template-${tpl}`} value={tpl} className="mt-0.5" />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{t(`dataTransfer.import.templates.${tpl}.name`)}</span>
                    <span className="text-muted-foreground text-xs">
                      {t(`dataTransfer.import.templates.${tpl}.help`)}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
          <Field
            id="import-file"
            label={t('dataTransfer.import.file')}
            help={t('dataTransfer.import.fileHelp')}
          >
            <Input
              id="import-file"
              type="file"
              accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => void pick(e.target.files?.[0])}
              data-testid="import-file"
              className="max-md:text-base"
            />
          </Field>
          {fileError ? (
            <p role="alert" className="text-destructive text-sm">
              {fileError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-md:w-full"
              onClick={() => sample.mutate({ template, locale: f.locale })}
              disabled={sample.isPending}
              data-testid="import-sample"
            >
              <DownloadIcon aria-hidden />
              {t('dataTransfer.import.sampleDownload')}
            </Button>
            <span className="text-muted-foreground text-xs">{t('dataTransfer.import.sampleHelp')}</span>
          </div>
        </div>
      ) : null}

      {step === 'map' && preview ? (
        <div className="grid gap-4">
          <p className="text-muted-foreground text-sm">
            {t('dataTransfer.import.mapHelp', { rows: preview.rows, name: file?.name ?? '' })}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {preview.sheetNames.length > 1 ? (
              <Field id="import-sheet" label={t('dataTransfer.import.sheet')}>
                <Select
                  value={String(options.sheet)}
                  onValueChange={(v) =>
                    setOptions((o) => ({ ...o, sheet: Number(v), mapping: {}, headerRow: undefined }))
                  }
                >
                  <SelectTrigger id="import-sheet" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {preview.sheetNames.map((name, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field
              id="import-header"
              label={t('dataTransfer.import.headerRow')}
              help={t('dataTransfer.import.headerRowHelp')}
            >
              <Input
                id="import-header"
                type="number"
                inputMode="numeric"
                dir="ltr"
                min={1}
                value={options.headerRow ?? preview.headerRow}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isInteger(n) && n >= 1) setOptions((o) => ({ ...o, headerRow: n }))
                }}
                className="max-md:text-base"
              />
            </Field>
            <Field
              id="import-month"
              label={t('dataTransfer.import.month')}
              help={t(
                preview.needsMonth
                  ? 'dataTransfer.import.monthNeeded'
                  : template === 'salaryRows'
                    ? 'dataTransfer.import.salaryMonthHelp'
                    : 'dataTransfer.import.monthHelp'
              )}
            >
              <Input
                id="import-month"
                type="month"
                dir="ltr"
                value={options.month ?? ''}
                onChange={(e) => setOptions((o) => ({ ...o, month: e.target.value || undefined }))}
                aria-invalid={preview.needsMonth && !options.month}
                data-testid="import-month"
                className="max-md:text-base"
              />
            </Field>
            {fields.map((field) => (
              <Field key={field} id={`map-${field}`} label={t(`dataTransfer.import.field.${field}`)}>
                <Select
                  value={
                    options.mapping[field] === null || options.mapping[field] === undefined
                      ? NONE
                      : String(options.mapping[field])
                  }
                  onValueChange={(v) =>
                    setOptions((o) => ({
                      ...o,
                      mapping: { ...o.mapping, [field]: v === NONE ? null : Number(v) }
                    }))
                  }
                >
                  <SelectTrigger id={`map-${field}`} className="w-full" data-testid={`map-${field}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('dataTransfer.import.noColumn')}</SelectItem>
                    {columns.map((_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {columnLabel(i)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
            {template === 'reservationGrid' ? (
              <>
                <Field
                  id="import-channel"
                  label={t('dataTransfer.import.channel')}
                  help={t('dataTransfer.import.channelHelp')}
                >
                  <Select
                    value={options.channelId ?? NONE}
                    onValueChange={(v) =>
                      setOptions((o) => ({ ...o, channelId: v === NONE ? undefined : v }))
                    }
                  >
                    <SelectTrigger id="import-channel" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('dataTransfer.import.channelDefault')}</SelectItem>
                      {channelItems.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {nameOf(c.nameI18n, c.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  id="import-paid"
                  label={t('dataTransfer.import.paidMethod')}
                  help={t('dataTransfer.import.paidMethodHelp')}
                >
                  <Select
                    value={options.paidMethodId ?? NONE}
                    onValueChange={(v) => setOptions((o) => ({ ...o, paidMethodId: v === NONE ? null : v }))}
                  >
                    <SelectTrigger id="import-paid" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('dataTransfer.import.noPayments')}</SelectItem>
                      {methodItems.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {nameOf(m.nameI18n, m.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </>
            ) : (
              <Field
                id="import-method"
                label={t('dataTransfer.import.defaultMethod')}
                help={t('dataTransfer.import.defaultMethodHelp')}
              >
                <Select
                  value={options.defaultMethodId ?? NONE}
                  onValueChange={(v) => setOptions((o) => ({ ...o, defaultMethodId: v === NONE ? null : v }))}
                >
                  <SelectTrigger id="import-method" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('dataTransfer.import.noDefault')}</SelectItem>
                    {methodItems.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {nameOf(m.nameI18n, m.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
          {template === 'ledgerRows' ? (
            <SwitchRow
              id="import-match"
              label={t('dataTransfer.import.match')}
              help={t('dataTransfer.import.matchHelp')}
              checked={options.matchReservations}
              onChange={(v) => setOptions((o) => ({ ...o, matchReservations: v }))}
            />
          ) : (
            <Alert>
              <TriangleAlertIcon aria-hidden />
              <AlertDescription>
                {t(
                  template === 'salaryRows'
                    ? 'dataTransfer.import.doubleSalary'
                    : 'dataTransfer.import.doubleIncome'
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      ) : null}

      {step === 'preview' && preview ? (
        <div className="grid gap-5" data-testid="import-preview-step">
          {preview.needsMonth ? (
            <Alert variant="destructive">
              <TriangleAlertIcon aria-hidden />
              <AlertDescription>{t('dataTransfer.import.monthNeeded')}</AlertDescription>
            </Alert>
          ) : null}
          {preview.sameFileAt ? (
            <Alert data-testid="import-same-file">
              <HistoryIcon aria-hidden />
              <AlertDescription>
                {t('dataTransfer.import.sameFile', {
                  when: f.date(localDate(isoDay(preview.sameFileAt)), 'medium')
                })}
              </AlertDescription>
            </Alert>
          ) : null}
          <p className="text-sm" data-testid="import-summary">
            {t('dataTransfer.import.summary', { count: preview.recordCount })}{' '}
            {preview.errorCount
              ? t('dataTransfer.import.summaryErrors', { count: preview.errorCount })
              : t('dataTransfer.import.summaryClean')}
            {preview.blockedCells
              ? ` ${t('dataTransfer.import.blocked', { count: preview.blockedCells })}`
              : ''}
            {preview.alreadyImported
              ? ` ${
                  toImport <= 0
                    ? t('dataTransfer.import.allAlready')
                    : t('dataTransfer.import.alreadySummary', { count: preview.alreadyImported })
                }`
              : ''}
          </p>
          <ErrorList errors={preview.errors} total={preview.errorCount} />
          <Duplicates list={preview.duplicates} />
          {preview.recordCount ? <Records preview={preview} /> : null}
        </div>
      ) : null}

      {step === 'done' && report ? (
        <div className="grid gap-5" data-testid="import-report">
          <Alert>
            <CheckCircle2Icon aria-hidden />
            <AlertTitle>{t('dataTransfer.import.doneTitle')}</AlertTitle>
            <AlertDescription>
              <ul className="grid gap-0.5">
                {template === 'reservationGrid' ? (
                  <>
                    <li>{t('dataTransfer.import.result.reservations', { count: report.reservations })}</li>
                    <li>{t('dataTransfer.import.result.nights', { count: report.nights })}</li>
                    <li>{t('dataTransfer.import.result.guests', { count: report.guestsCreated })}</li>
                    <li>{t('dataTransfer.import.result.payments', { count: report.payments })}</li>
                  </>
                ) : template === 'ledgerRows' ? (
                  <>
                    <li>{t('dataTransfer.import.result.payments', { count: report.payments })}</li>
                    <li>{t('dataTransfer.import.result.expenses', { count: report.expenses })}</li>
                  </>
                ) : (
                  <>
                    <li>{t('dataTransfer.import.result.salaries', { count: report.salaries })}</li>
                    <li>
                      {t('dataTransfer.import.result.salaryPayments', { count: report.salaryPayments })}
                    </li>
                  </>
                )}
                {report.skipped ? (
                  <li>{t('dataTransfer.import.result.skipped', { count: report.skipped })}</li>
                ) : null}
              </ul>
            </AlertDescription>
          </Alert>
          {report.errorCount ? <p className="text-sm">{t('dataTransfer.import.fixAndRetry')}</p> : null}
          {report.batchId ? (
            <p className="text-muted-foreground text-sm">{t('dataTransfer.import.undoHint')}</p>
          ) : null}
          <ErrorList errors={report.errors} total={report.errorCount} />
          <Duplicates list={report.duplicates} />
          {!report.errorCount && !report.duplicates.length ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <FileUpIcon className="size-4" aria-hidden />
              {t('dataTransfer.import.allIn')}
            </p>
          ) : null}
        </div>
      ) : null}
    </ResponsiveDialog>
  )
}
