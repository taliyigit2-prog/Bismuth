import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { FileTextIcon, ShieldCheckIcon } from 'lucide-react'
import { formatDate, isAppLocale } from '@shared/format'
import type { LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BismuthMark } from '@/components/bismuth-mark'
import { Page } from '@/components/page'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { ErrorState, LoadingState } from '@/components/states'
import { useApiQuery } from '@/lib/api/hooks'
import notices from './third-party.json'

/**
 * The full licence texts (THIRD_PARTY_NOTICES.md, written by `npm run notices` and also shipped next to the program)
 * in their own chunk: about 70 kB that only this dialog reads, so start-up never loads them.
 */
const loadNotices = () => import('../../../../THIRD_PARTY_NOTICES.md?raw').then((m) => m.default)

function LicenseTextsDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const text = useQuery({
    queryKey: ['about', 'notices'],
    queryFn: loadNotices,
    enabled: open,
    staleTime: Infinity
  })
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('about.licenseTexts')}
      description={t('about.licenseTextsHelp')}
      className="sm:max-w-3xl"
    >
      {text.isPending ? <LoadingState cards={1} /> : null}
      {text.isError ? <ErrorState error={text.error} onRetry={() => void text.refetch()} /> : null}
      {text.data ? (
        <pre
          lang="en"
          dir="ltr"
          className="text-muted-foreground font-mono text-xs break-words whitespace-pre-wrap"
          data-testid="license-texts"
        >
          {text.data}
        </pre>
      ) : null}
    </ResponsiveDialog>
  )
}

interface Notice {
  name: string
  version: string
  license: string
}

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,12rem)_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-all" data-testid={testId}>
        {value}
      </dd>
    </div>
  )
}

export function AboutPage() {
  const { t, i18n } = useTranslation()
  const lang = isAppLocale(i18n.language) ? i18n.language : 'tr'
  const [licensesOpen, setLicensesOpen] = useState(false)
  const info = useApiQuery('app.getInfo', {})
  const packages = notices.packages as Notice[]
  const copied = notices.copiedCode as { project: string; license: string }[]

  return (
    <Page title={t('about.title')} description={t('about.description')}>
      {info.isPending ? <LoadingState /> : null}
      {info.isError ? <ErrorState error={info.error} onRetry={() => void info.refetch()} /> : null}
      {info.data ? (
        <Card>
          {/* The program itself: mark, name and what it is, above the technical details. */}
          <CardHeader className="flex items-center gap-3">
            <BismuthMark className="size-10 shrink-0" />
            <div className="grid min-w-0 gap-1">
              <CardTitle className="text-lg">{t('app.name')}</CardTitle>
              <CardDescription>{t('app.tagline')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label={t('about.version')} value={info.data.version} testId="about-version" />
              {info.data.build.date ? (
                <Row
                  label={t('about.buildDate')}
                  value={formatDate(info.data.build.date as LocalDate, lang)}
                  testId="about-build-date"
                />
              ) : null}
              {info.data.build.commit ? (
                <Row label={t('about.commit')} value={info.data.build.commit} testId="about-commit" />
              ) : null}
              {info.data.versions.electron ? (
                <Row label={t('about.electron')} value={info.data.versions.electron} />
              ) : null}
              {info.data.versions.chrome ? (
                <Row label={t('about.chrome')} value={info.data.versions.chrome} />
              ) : null}
              <Row label={t('about.node')} value={info.data.versions.node} />
              <Row label={t('about.sqlite')} value={info.data.versions.sqlite} />
              <Row label={t('about.platform')} value={`${info.data.platform}-${info.data.arch}`} />
              <Row label={t('about.schema')} value={String(info.data.schemaVersion)} />
              <Row
                label={t('about.integrity')}
                value={info.data.integrity === 'ok' ? t('about.integrityOk') : t('about.integrityBad')}
                testId="about-integrity"
              />
              <Row
                label={t('about.connection')}
                value={info.data.transport === 'ipc' ? t('about.connectionIpc') : t('about.connectionHttp')}
              />
              {info.data.dataDir ? <Row label={t('about.dataDir')} value={info.data.dataDir} /> : null}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex items-start gap-3">
          <ShieldCheckIcon className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="grid gap-2">
            <p className="text-sm">{t('about.privacy')}</p>
            <p className="text-muted-foreground text-xs" data-testid="about-attribution">
              {t('about.attribution')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('about.licenses')}</CardTitle>
          <CardDescription>{t('about.licensesHelp')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <Button variant="outline" onClick={() => setLicensesOpen(true)} data-testid="show-licenses">
              <FileTextIcon aria-hidden />
              {t('about.showLicenses')}
            </Button>
          </div>
          <ul className="gap-x-6 text-sm sm:columns-2 lg:columns-3" data-testid="license-list">
            {packages.map((p) => (
              <li key={p.name} className="flex min-w-0 break-inside-avoid justify-between gap-2 py-0.5">
                <span className="truncate" title={`${p.name} ${p.version}`}>
                  {p.name} <span className="text-muted-foreground">{p.version}</span>
                </span>
                <span className="text-muted-foreground shrink-0">{p.license}</span>
              </li>
            ))}
          </ul>
          <div>
            <h3 className="mb-1 text-sm font-medium">{t('about.copiedCode')}</h3>
            <ul className="text-muted-foreground grid gap-1 text-sm">
              {copied.map((c) => (
                <li key={c.project}>
                  {c.project} · {c.license}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
      <LicenseTextsDialog open={licensesOpen} onOpenChange={setLicensesOpen} />
    </Page>
  )
}
