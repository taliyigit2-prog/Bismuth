// The destruction report (Faz 20 P20e; K-52, K-58): what the retention rules deleted between two days — faces at
// check-out, faces past their keep time, faces deleted by hand, staff faces, alarm pictures — counted from the audit log,
// what is still kept and the rules in force. Counts only: no name, no picture. Printable for the hotel's records.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PrinterIcon } from 'lucide-react'
import { addDays, localDate, today, type LocalDate } from '@shared/date'
import type { CameraRetentionReport } from '@shared/contract/camera'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DateInput } from '@/components/date-input'
import { QueryView } from '@/components/query-view'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { PrintLayout } from '../reports/print-layout'
import { usePrint } from '../reports/use-report-export'

/** The days the report covers by default: the last 30. */
const DEFAULT_DAYS = 30

function Counts({ report }: { report: CameraRetentionReport }) {
  const { t } = useTranslation()
  const rows: {
    key: 'checkout' | 'retention' | 'manual' | 'staffRemoved' | 'staffLeft' | 'crops'
    value: number
  }[] = [
    { key: 'checkout', value: report.faces.checkout },
    { key: 'retention', value: report.faces.retention },
    { key: 'manual', value: report.faces.manual },
    { key: 'staffRemoved', value: report.staff.removed },
    { key: 'staffLeft', value: report.staff.left },
    { key: 'crops', value: report.crops }
  ]
  const total = rows.reduce((sum, r) => sum + r.value, 0)
  const held: { key: 'guestFaces' | 'waiting' | 'staffFaces' | 'alarmCrops'; value: number }[] = [
    { key: 'guestFaces', value: report.held.guestFaces },
    { key: 'waiting', value: report.held.waitingForDeletion },
    { key: 'staffFaces', value: report.held.staffFaces },
    { key: 'alarmCrops', value: report.held.alarmCrops }
  ]
  const { faceRetentionDays: face, alertRetentionDays: alerts } = report.policy
  return (
    <div className="grid gap-4">
      <Table density="compact">
        <TableHeader>
          <TableRow>
            <TableHead>{t('camera.report.column.what')}</TableHead>
            <TableHead className="text-end">{t('camera.report.column.count')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody data-testid="camera-report-rows">
          {rows.map((r) => (
            <TableRow key={r.key} data-testid={`camera-report-${r.key}`}>
              <TableCell>{t(`camera.report.rows.${r.key}`)}</TableCell>
              <TableCell className="text-end tabular-nums" dir="ltr">
                {r.value}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="font-medium" data-testid="camera-report-total">
            <TableCell>{t('camera.report.total')}</TableCell>
            <TableCell className="text-end tabular-nums" dir="ltr">
              {total}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      {total === 0 ? <p className="text-muted-foreground text-sm">{t('camera.report.none')}</p> : null}
      <div className="grid gap-1">
        <h4 className="text-sm font-medium">{t('camera.report.held.title')}</h4>
        <ul className="text-muted-foreground grid gap-0.5 text-sm" data-testid="camera-report-held">
          {held.map((h) => (
            <li key={h.key} className="flex justify-between gap-4">
              <span>{t(`camera.report.held.${h.key}`)}</span>
              <span className="tabular-nums" dir="ltr">
                {h.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-1">
        <h4 className="text-sm font-medium">{t('camera.report.policy')}</h4>
        <p className="text-muted-foreground text-sm">
          {face === 0
            ? t('camera.notice.retention.faceNow')
            : t('camera.notice.retention.faceDays', { count: face })}{' '}
          {t('camera.notice.retention.alerts', { count: alerts })}
        </p>
      </div>
    </div>
  )
}

export function RetentionReport() {
  const { t } = useTranslation()
  const f = useFormat()
  const print = usePrint()
  const [to, setTo] = useState<LocalDate>(today())
  const [from, setFrom] = useState<LocalDate>(addDays(today(), -DEFAULT_DAYS))
  const validRange = from <= to
  const report = useApiQuery('camera.retentionReport', { from, to }, { enabled: validRange })

  return (
    <section className="grid gap-3" data-testid="camera-report">
      <div className="grid gap-1">
        <h3 className="text-sm font-medium">{t('camera.report.title')}</h3>
        <p className="text-muted-foreground text-xs">{t('camera.report.help')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 max-md:[&>*]:flex-1">
        <DateInput
          value={from}
          onChange={(d) => setFrom(localDate(d))}
          label={t('camera.report.from')}
          max={to}
        />
        <DateInput
          value={to}
          onChange={(d) => setTo(localDate(d))}
          label={t('camera.report.to')}
          min={from}
        />
        <Button
          variant="outline"
          onClick={print.start}
          disabled={!validRange || !report.data || print.printing}
          data-testid="camera-report-print"
        >
          <PrinterIcon aria-hidden />
          {t('camera.report.print')}
        </Button>
      </div>
      {validRange ? (
        <QueryView query={report}>{(data) => <Counts report={data} />}</QueryView>
      ) : (
        <p className="text-destructive text-sm" role="alert">
          {t('camera.report.invalidRange')}
        </p>
      )}
      {print.printing && report.data ? (
        <PrintLayout
          title={t('camera.report.printTitle')}
          range={t('camera.report.printRange', {
            from: f.date(from, 'medium'),
            to: f.date(to, 'medium')
          })}
        >
          <Counts report={report.data} />
        </PrintLayout>
      ) : null}
    </section>
  )
}
