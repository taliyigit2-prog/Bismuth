// Ayarlar → Uzaktan erişim on the computer that keeps the data (faz-13 madde 4, 5, 8): the encrypted Drive box the
// owner's read-only copy is kept fresh from, the hourly PDF summary without personal data, and — when another
// computer took over as the main computer — what that means here: nothing can be changed, the records written here
// after the new main computer's last known one are listed (to be carried over by hand, never merged by itself), and
// this computer can start using the new main computer. Reading needs `remote.settings` view, changing edit.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArchiveIcon, FileTextIcon, FolderIcon, KeyRoundIcon, LockIcon, SaveIcon } from 'lucide-react'
import type { ConflictItemView, RelayHostStatus } from '@shared/contract/remote'
import { localDateOf } from '@shared/date'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { QueryView } from '@/components/query-view'
import { useFormat } from '@/hooks/use-format'
import { useTransport } from '@/lib/api/api-context'
import { useApiQuery, useSettings, useUpdateSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { entityLabel } from '../audit/audit-labels'
import { SwitchRow } from './room-dialogs'
import { useAdminMutation } from './use-admin'

/** "14:32" today, "3 Eki 14:32" on another day. */
function useWhen(): (iso: string | null | undefined) => string | null {
  const f = useFormat()
  return (iso) => {
    if (!iso) return null
    const day = localDateOf(new Date(iso))
    return day === localDateOf(new Date()) ? f.time(iso) : `${f.dayMonth(day)} ${f.time(iso)}`
  }
}

/** The Drive box and the PDF summary on the main computer. */
export function RelayCard() {
  const { t } = useTranslation()
  const can = useCan()
  // The box belongs to the main computer: a phone or browser only reads it (QA3d D3).
  const onHost = useTransport().kind === 'ipc'
  const canEdit = can('remote.settings', 'edit') && onHost
  const status = useApiQuery('remote.relayStatus', {}, { refetchInterval: 30_000 })
  const settings = useSettings()
  const update = useUpdateSettings()
  const run = useAdminMutation('remote.relayRun', {
    invalidate: ['remote.relayStatus'],
    success: t('settings.remote.box.written')
  })
  const values = settings.data
  return (
    <Card className="lg:col-span-2" data-testid="relay-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArchiveIcon className="text-muted-foreground size-4" aria-hidden />
          {t('settings.remote.box.title')}
        </CardTitle>
        <CardDescription className="max-w-prose">{t('settings.remote.box.help')}</CardDescription>
      </CardHeader>
      <CardContent>
        <QueryView query={status}>
          {(s) => (
            <div className="grid gap-6 md:grid-cols-2">
              <BoxState status={s} />
              <div className="grid content-start gap-4">
                <SwitchRow
                  id="relay-enabled"
                  label={t('settings.remote.box.enabled')}
                  help={t('settings.remote.box.enabledHelp')}
                  checked={values?.['relay.enabled'] ?? true}
                  disabled={!canEdit || update.isPending}
                  onChange={(v) => update.mutate({ 'relay.enabled': v })}
                />
                <SwitchRow
                  id="relay-identity"
                  label={t('settings.remote.box.excludeIdentity')}
                  help={t('settings.remote.box.excludeIdentityHelp')}
                  checked={values?.['relay.excludeIdentity'] ?? true}
                  disabled={!canEdit || update.isPending}
                  onChange={(v) => update.mutate({ 'relay.excludeIdentity': v })}
                />
                <SwitchRow
                  id="summary-enabled"
                  label={t('settings.remote.box.summary')}
                  help={t('settings.remote.box.summaryHelp')}
                  checked={values?.['summary.enabled'] ?? true}
                  disabled={!canEdit || update.isPending}
                  onChange={(v) => update.mutate({ 'summary.enabled': v })}
                />
                {canEdit && !s.replaced ? (
                  <div className="grid justify-items-start gap-1.5">
                    <Button
                      variant="outline"
                      className="max-md:w-full"
                      disabled={run.isPending || !s.box.folder || !s.keyExists}
                      onClick={() => run.mutate({})}
                      aria-describedby={!s.box.folder || !s.keyExists ? 'relay-run-blocked' : undefined}
                      data-testid="relay-run"
                    >
                      <SaveIcon aria-hidden />
                      {t('settings.remote.box.runNow')}
                    </Button>
                    {!s.box.folder || !s.keyExists ? (
                      <p id="relay-run-blocked" className="text-muted-foreground text-xs">
                        {t('settings.remote.box.runBlocked')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </QueryView>
      </CardContent>
    </Card>
  )
}

function BoxState({ status }: { status: RelayHostStatus }) {
  const { t } = useTranslation()
  const when = useWhen()
  const { box, summary } = status
  const boxProblem = box.problem
  return (
    <div className="grid content-start gap-3 text-sm" data-testid="relay-state">
      <p className="flex items-start gap-2">
        <FolderIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        {box.folder ? (
          <code dir="ltr" className="min-w-0 break-all" data-testid="relay-folder">
            {box.folder}
          </code>
        ) : (
          <span className="text-destructive">{t('settings.remote.box.noFolder')}</span>
        )}
      </p>
      {!status.keyExists ? (
        <p className="text-destructive flex items-start gap-2" data-testid="relay-no-key">
          <KeyRoundIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('settings.remote.box.noKey')}
        </p>
      ) : null}
      {boxProblem === 'writeFailed' ? (
        <p className="text-destructive">{t('settings.remote.box.writeFailed')}</p>
      ) : null}
      {boxProblem === 'off' ? <p className="text-muted-foreground">{t('settings.remote.box.off')}</p> : null}
      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt>{t('settings.remote.box.lastSegment')}</dt>
        <dd className="text-foreground" data-testid="relay-last-segment">
          {when(box.lastSegmentAt) ?? t('settings.remote.box.never')}
        </dd>
        <dt>{t('settings.remote.box.lastSnapshot')}</dt>
        <dd className="text-foreground">{when(box.lastSnapshotAt) ?? t('settings.remote.box.never')}</dd>
        <dt>{t('settings.remote.box.pending')}</dt>
        <dd className="text-foreground tabular-nums">{box.pending}</dd>
        <dt>{t('settings.remote.box.lastSummary')}</dt>
        <dd className="text-foreground" data-testid="relay-last-summary">
          {summary.problem === 'off'
            ? t('settings.remote.box.summaryOff')
            : summary.problem === 'noFolder'
              ? t('settings.remote.box.noFolderShort')
              : summary.problem === 'writeFailed'
                ? t('settings.remote.box.summaryFailed')
                : (when(summary.lastAt) ?? t('settings.remote.box.never'))}
        </dd>
        <dt>{t('settings.remote.box.term')}</dt>
        <dd className="text-foreground tabular-nums">{status.epoch}</dd>
      </dl>
      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <FileTextIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('settings.remote.box.summaryPlace')}
      </p>
    </div>
  )
}

/** A word for a record type of the conflict list ("guests" → the audit log's "Misafir"). */
function useTableLabel(): (tbl: string) => string {
  const { t } = useTranslation()
  return (tbl) => {
    const singular = tbl.endsWith('ies') ? `${tbl.slice(0, -3)}y` : tbl.replace(/s$/, '')
    const label = entityLabel(t, singular)
    return label === singular ? tbl : label
  }
}

/** This computer was replaced by another main computer: what that means and what to do. */
export function ReplacedCard() {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const local = useTransport().kind === 'ipc'
  const epoch = useApiQuery('remote.epochState', {})
  const replaced = epoch.data?.replaced ?? null
  const conflicts = useApiQuery(
    'remote.conflicts',
    {},
    { enabled: replaced !== null && can('remote.settings') }
  )
  const [confirmClient, setConfirmClient] = useState(false)
  const [showList, setShowList] = useState(false)
  const save = useAdminMutation('remote.saveConflicts')
  const becomeClient = useAdminMutation('remote.becomeClient')
  const label = useTableLabel()
  if (!replaced) return null
  const items: ConflictItemView[] = conflicts.data?.items ?? []
  return (
    <Card className="border-destructive lg:col-span-2" data-testid="replaced-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockIcon className="text-destructive size-4" aria-hidden />
          {t('settings.remote.replaced.title')}
        </CardTitle>
        <CardDescription className="max-w-prose">
          {t('settings.remote.replaced.body', {
            by: replaced.by,
            date: f.date(localDateOf(new Date(replaced.at)))
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm" data-testid="conflict-count">
          {items.length === 0
            ? t('settings.remote.replaced.noConflicts')
            : t('settings.remote.replaced.conflicts', { count: items.length })}
        </p>
        {items.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowList((v) => !v)} aria-expanded={showList}>
              {showList ? t('settings.remote.replaced.hideList') : t('settings.remote.replaced.showList')}
            </Button>
            {local ? (
              <Button
                variant="outline"
                disabled={save.isPending}
                onClick={() => save.mutate({})}
                data-testid="save-conflicts"
              >
                <SaveIcon aria-hidden />
                {t('settings.remote.replaced.save')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {showList && items.length > 0 ? (
          <Table data-testid="conflict-list">
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.remote.replaced.when')}</TableHead>
                <TableHead>{t('settings.remote.replaced.record')}</TableHead>
                <TableHead>{t('settings.remote.replaced.change')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.seq}>
                  <TableCell className="tabular-nums">
                    {f.dayMonth(localDateOf(new Date(c.ts)))} {f.time(c.ts)}
                  </TableCell>
                  <TableCell>
                    {label(c.tbl)}{' '}
                    <span className="text-muted-foreground text-xs" dir="ltr">
                      …{String(c.pk[0] ?? '').slice(-6)}
                    </span>
                  </TableCell>
                  <TableCell>{t(`settings.remote.replaced.op.${c.op}`)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        <p className="text-muted-foreground max-w-prose text-sm">{t('settings.remote.replaced.next')}</p>
        {local && can('remote.settings', 'view') ? (
          <Button className="justify-self-start max-md:w-full" onClick={() => setConfirmClient(true)}>
            {t('settings.remote.replaced.useNew')}
          </Button>
        ) : null}
      </CardContent>
      <AlertDialog open={confirmClient} onOpenChange={setConfirmClient}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.remote.replaced.useNewTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.remote.replaced.useNewBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => becomeClient.mutate({})}>
              {t('settings.remote.replaced.useNew')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
