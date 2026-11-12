// A report chart with its table view (.claude/rules/ui.md: every chart has one). The table is the accessible
// version too: screen readers and copy/paste read the same numbers; the print layout and exports use it.
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChartColumnIcon, TableIcon, type LucideIcon } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SectionCard } from '@/components/section-card'
import { cn } from '@/lib/utils'
import { usePrintMode } from './print-mode'
import { TableExportMenu } from './report-export'

export interface ChartTable {
  columns: {
    key: string
    label: string
    numeric?: boolean
    /** Hidden on the phone (secondary). */ minor?: boolean
  }[]
  rows: { key: string; cells: Record<string, ReactNode> }[]
  /** Totals row. */
  footer?: Record<string, ReactNode>
}

const VIEWS = ['chart', 'table'] as const
type View = (typeof VIEWS)[number]

export function DataTable({ table, className }: { table: ChartTable; className?: string }) {
  return (
    <Table className={cn('text-sm', className)}>
      <TableHeader>
        <TableRow>
          {table.columns.map((c) => (
            <TableHead
              key={c.key}
              className={cn(c.numeric && 'text-end', c.minor && 'max-md:hidden print:table-cell')}
            >
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {table.rows.map((r) => (
          <TableRow key={r.key}>
            {table.columns.map((c) => (
              <TableCell
                key={c.key}
                className={cn(
                  c.numeric && 'text-end tabular-nums',
                  c.minor && 'max-md:hidden print:table-cell'
                )}
              >
                {r.cells[c.key]}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      {table.footer ? (
        <TableFooter>
          <TableRow>
            {table.columns.map((c) => (
              <TableCell
                key={c.key}
                className={cn(
                  'font-semibold',
                  c.numeric && 'text-end tabular-nums',
                  c.minor && 'max-md:hidden print:table-cell'
                )}
              >
                {table.footer?.[c.key]}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      ) : null}
    </Table>
  )
}

export function ChartCard({
  title,
  icon,
  table,
  empty,
  className,
  testId,
  exportId,
  note,
  children
}: {
  title: string
  icon: LucideIcon
  table: ChartTable
  /** Shown instead of chart and table when there is nothing to draw. */
  empty?: string | null
  className?: string
  testId?: string
  /** The report table this card exports (CSV / Excel). */
  exportId?: string
  /** A line under the chart or table (what the figures mean). */
  note?: ReactNode
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const print = usePrintMode()
  const [view, setView] = useState<View>(children ? 'chart' : 'table')
  const shown: View = print || !children ? 'table' : view
  const action =
    empty || print ? null : (
      <div className="flex items-center gap-1">
        {children ? (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={view}
            onValueChange={(v) => v && setView(v as View)}
            aria-label={t('reports.chart.view')}
          >
            {VIEWS.map((v) => {
              const Icon = v === 'chart' ? ChartColumnIcon : TableIcon
              return (
                <ToggleGroupItem key={v} value={v} aria-label={t(`reports.chart.${v}`)} className="px-2.5">
                  <Icon aria-hidden />
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
        ) : null}
        {exportId ? <TableExportMenu table={exportId} label={title} /> : null}
      </div>
    )
  return (
    <SectionCard
      title={title}
      icon={icon}
      className={cn('break-inside-avoid', className)}
      testId={testId}
      action={action}
    >
      {empty ? (
        <p className="text-muted-foreground py-10 text-center text-sm">{empty}</p>
      ) : shown === 'chart' ? (
        children
      ) : (
        <DataTable table={table} />
      )}
      {note && !empty ? <div className="text-muted-foreground mt-3 text-xs">{note}</div> : null}
    </SectionCard>
  )
}
