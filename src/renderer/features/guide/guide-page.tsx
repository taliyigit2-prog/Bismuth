// Kılavuz (G-18, S-52, K-40): the program's own guide in the person's language — a section list, a search over
// every page, a "Kimin için" filter (reception, housekeeping, accounting, owner; the signed-in role by default) and
// a print copy of the open section. Opened from Ayarlar → Kılavuz, the menu and every screen's "?". The phone shows
// one column: the sections, or the open section with a way back to the list.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CompassIcon,
  PrinterIcon,
  SearchIcon,
  SearchXIcon,
  XIcon
} from 'lucide-react'
import { formatDate, isAppLocale, type AppLocale } from '@shared/format'
import { today } from '@shared/date'
import { Page } from '@/components/page'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useIsMobile } from '@/hooks/use-mobile'
import { useMe } from '@/lib/session/session'
import { cn } from '@/lib/utils'
import { anchorId } from '@/guide/markdown'
import { MarkdownView } from '@/guide/markdown-view'
import { searchGuide } from '@/guide/search'
import {
  audienceOfRole,
  GUIDE_AUDIENCES,
  loadGuide,
  type GuideAudience,
  type GuideSection
} from '@/guide/sections'
import type { GuideSearch } from './guide-search'
import { usePrint } from '@/features/reports/use-report-export'
import { startTour } from './tour-store'
import './guide-print.css'

type AudienceFilter = GuideAudience | 'all'

const sectionLink = (section: GuideSection, anchor?: string | null) => ({
  to: '/guide' as const,
  search: { s: section.id, ...(anchor ? { a: anchor } : {}) },
  resetScroll: false
})

function SectionList({
  sections,
  current,
  label
}: {
  sections: GuideSection[]
  current: string | undefined
  label: string
}) {
  return (
    <nav aria-label={label} className="grid gap-0.5" data-testid="guide-sections">
      {sections.map((section, i) => {
        const active = section.id === current
        return (
          <Button
            key={section.id}
            asChild
            variant={active ? 'secondary' : 'ghost'}
            className={cn(
              'h-auto min-h-9 justify-start gap-2 px-3 py-1.5 text-start whitespace-normal',
              active ? 'font-semibold' : 'text-muted-foreground font-normal'
            )}
          >
            <Link
              {...sectionLink(section)}
              aria-current={active ? 'page' : undefined}
              data-testid={`guide-section-${section.id}`}
            >
              <span className="text-muted-foreground w-5 shrink-0 text-xs tabular-nums">{i + 1}</span>
              {section.title}
            </Link>
          </Button>
        )
      })}
    </nav>
  )
}

function HomeCards({ sections }: { sections: GuideSection[] }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4">
      <div className="bg-accent text-accent-foreground flex gap-3 rounded-xl p-4 pe-6">
        <CompassIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p className="text-sm leading-relaxed">{t('guide.homeIntro')}</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2" data-testid="guide-home">
        {sections.map((section) => (
          <li key={section.id} className="min-w-0">
            <Link
              {...sectionLink(section)}
              className="hover:bg-accent focus-visible:ring-ring grid h-full gap-1 rounded-xl border p-4 outline-none focus-visible:ring-[3px]"
              data-testid={`guide-card-${section.id}`}
            >
              <span className="font-semibold">{section.title}</span>
              <span className="text-muted-foreground line-clamp-3 text-sm">{section.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SearchResults({
  sections,
  query,
  onPick,
  onClear
}: {
  sections: GuideSection[]
  query: string
  onPick: () => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const hits = useMemo(() => searchGuide(sections, query), [sections, query])
  if (hits.length === 0)
    return (
      <EmptyState
        compact
        icon={SearchXIcon}
        title={t('guide.search.noneTitle')}
        body={t('guide.search.noneBody')}
        action={
          <Button variant="outline" size="sm" onClick={onClear}>
            {t('guide.search.clear')}
          </Button>
        }
      />
    )
  return (
    <div className="grid gap-3" data-testid="guide-results">
      <p className="text-muted-foreground text-sm" role="status">
        {t('guide.search.results', { count: hits.length })}
      </p>
      <ul className="grid gap-2">
        {hits.map((hit) => {
          const section = sections.find((s) => s.id === hit.section)
          if (!section) return null
          return (
            <li key={`${hit.section}:${hit.anchor ?? ''}`}>
              <Link
                {...sectionLink(section, hit.anchor)}
                onClick={onPick}
                className="hover:bg-accent focus-visible:ring-ring grid gap-1 rounded-lg border p-3 outline-none focus-visible:ring-[3px]"
                data-testid="guide-result"
              >
                <span className="text-muted-foreground text-xs">
                  {hit.sectionTitle}
                  {hit.heading !== hit.sectionTitle ? ` › ${hit.heading}` : ''}
                </span>
                <span className="text-sm">{hit.snippet}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SectionArticle({
  section,
  lang,
  previous,
  next
}: {
  section: GuideSection
  lang: AppLocale
  previous: GuideSection | null
  next: GuideSection | null
}) {
  const { t } = useTranslation()
  const outline = section.headings.filter((h) => h.level === 2)
  // The page's own `# title` is the article's heading; the rest is the body.
  const body = section.blocks.filter((b) => !(b.t === 'heading' && b.level === 1))
  return (
    <article
      className="grid min-w-0 gap-6"
      data-testid={`guide-article-${section.id}`}
      aria-labelledby="guide-title"
    >
      <header id={anchorId(section.id)} className="grid scroll-mt-20 gap-3">
        <h2 id="guide-title" className="text-xl font-semibold tracking-tight text-balance md:text-2xl">
          {section.title}
        </h2>
        {outline.length > 1 ? (
          <nav aria-label={t('guide.inThisSection')} className="rounded-lg border p-3">
            <p className="text-muted-foreground mb-1.5 text-xs font-medium">{t('guide.inThisSection')}</p>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {outline.map((h) => (
                <li key={h.id}>
                  <Link
                    {...sectionLink(section, h.id)}
                    className="text-primary underline-offset-4 hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center"
                  >
                    {h.text}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>
      <MarkdownView blocks={body} lang={lang} section={section.id} />
      <nav aria-label={t('guide.sections')} className="flex flex-wrap justify-between gap-2 border-t pt-4">
        {previous ? (
          <Button variant="outline" asChild className="h-auto min-h-9 max-w-full whitespace-normal">
            <Link {...sectionLink(previous)} data-testid="guide-previous">
              <ArrowLeftIcon className="rtl:rotate-180" aria-hidden />
              <span className="grid text-start">
                <span className="text-muted-foreground text-xs font-normal">{t('guide.previous')}</span>
                {previous.title}
              </span>
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {next ? (
          <Button variant="outline" asChild className="ms-auto h-auto min-h-9 max-w-full whitespace-normal">
            <Link {...sectionLink(next)} data-testid="guide-next">
              <span className="grid text-end">
                <span className="text-muted-foreground text-xs font-normal">{t('guide.next')}</span>
                {next.title}
              </span>
              <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
            </Link>
          </Button>
        ) : null}
      </nav>
    </article>
  )
}

/** The open section for paper only (guide-print.css shows it and hides the program window). */
function PrintCopy({ section, lang }: { section: GuideSection; lang: AppLocale }) {
  const { t } = useTranslation()
  const body = section.blocks.filter((b) => !(b.t === 'heading' && b.level === 1))
  return createPortal(
    <section className="guide-print hidden" aria-hidden data-testid="guide-print">
      <p className="guide-print-meta">
        {t('guide.printedFrom', { date: formatDate(today(), lang, 'long') })}
      </p>
      <h1>{section.title}</h1>
      <MarkdownView blocks={body} lang={lang} section={section.id} print />
    </section>,
    document.body
  )
}

export function GuidePage() {
  const { t, i18n } = useTranslation()
  const lang: AppLocale = isAppLocale(i18n.language) ? i18n.language : 'tr'
  const isMobile = useIsMobile()
  const me = useMe()
  // Paper is light: the dark theme is taken off while printing, as in the reports and the ledger (QA2c #6).
  const print = usePrint()
  const search: GuideSearch = useSearch({ strict: false })
  const guide = useQuery({
    queryKey: ['guide.content', lang],
    queryFn: () => loadGuide(lang),
    staleTime: Infinity
  })
  const ownAudience = audienceOfRole(me?.user.roleCode)
  const [audience, setAudience] = useState<AudienceFilter>(ownAudience ?? 'all')
  const [query, setQuery] = useState('')

  const sections = useMemo(() => guide.data ?? [], [guide.data])
  const current = sections.find((s) => s.id === search.s) ?? null
  const shown = sections.filter(
    (s) => audience === 'all' || s.audiences.includes(audience) || s.id === current?.id
  )
  const at = current ? sections.indexOf(current) : -1
  const searching = query.trim().length > 0

  // Open at the heading the link names, or at the top of the section.
  const anchor = search.a
  const sectionId = current?.id
  useEffect(() => {
    if (!sectionId || searching) return
    // After the router's own scroll handling of the navigation that brought us here.
    const timer = window.setTimeout(() => {
      document.getElementById(anchorId(anchor ?? sectionId))?.scrollIntoView({ block: 'start' })
    }, 50)
    return () => window.clearTimeout(timer)
  }, [sectionId, anchor, searching])

  const audienceSelect = (
    <div className="grid gap-1.5 md:w-56">
      <Label htmlFor="guide-audience">{t('guide.audience.label')}</Label>
      <Select value={audience} onValueChange={(v) => setAudience(v as AudienceFilter)}>
        <SelectTrigger id="guide-audience" className="w-full" data-testid="guide-audience">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('guide.audience.all')}</SelectItem>
          {GUIDE_AUDIENCES.map((a) => (
            <SelectItem key={a} value={a} data-testid={`guide-audience-${a}`}>
              {t(`guide.audience.${a}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const searchBox = (
    <div className="grid min-w-0 flex-1 gap-1.5">
      <Label htmlFor="guide-search">{t('guide.search.label')}</Label>
      <div className="relative">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          id="guide-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.stopPropagation()
              setQuery('')
            }
          }}
          placeholder={t('guide.search.placeholder')}
          className="ps-9 pe-9"
          data-testid="guide-search"
        />
        {query ? (
          <Button
            variant="ghost"
            size="icon"
            className="absolute end-0.5 top-1/2 size-8 -translate-y-1/2 max-md:size-10"
            onClick={() => setQuery('')}
            aria-label={t('guide.search.clear')}
          >
            <XIcon aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  )

  let main
  if (guide.isPending) main = <LoadingState />
  else if (guide.isError) main = <ErrorState error={guide.error} onRetry={() => void guide.refetch()} />
  else if (searching)
    main = (
      <SearchResults
        sections={sections}
        query={query}
        onPick={() => setQuery('')}
        onClear={() => setQuery('')}
      />
    )
  else if (search.s && !current)
    main = (
      <EmptyState
        icon={BookOpenIcon}
        title={t('guide.notFoundTitle')}
        body={t('guide.notFoundBody')}
        action={
          <Button variant="outline" asChild>
            <Link to="/guide">{t('guide.allSections')}</Link>
          </Button>
        }
      />
    )
  else if (current)
    main = (
      <>
        {isMobile ? (
          <Button variant="outline" asChild className="justify-self-start">
            <Link to="/guide" data-testid="guide-back">
              <ArrowLeftIcon className="rtl:rotate-180" aria-hidden />
              {t('guide.allSections')}
            </Link>
          </Button>
        ) : null}
        <SectionArticle
          key={current.id}
          section={current}
          lang={lang}
          previous={sections[at - 1] ?? null}
          next={sections[at + 1] ?? null}
        />
        <PrintCopy section={current} lang={lang} />
      </>
    )
  else main = <HomeCards sections={shown} />

  return (
    <Page
      title={t('guide.title')}
      description={t('guide.description')}
      actions={
        <>
          {current && !searching ? (
            <Button
              variant="outline"
              onClick={print.start}
              className="max-md:hidden"
              data-testid="guide-print-button"
            >
              <PrinterIcon aria-hidden />
              {t('guide.print')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={startTour} data-testid="guide-start-tour">
            <CompassIcon aria-hidden />
            {t('guide.tour.restart')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 md:flex md:items-end">
        {searchBox}
        {audienceSelect}
      </div>
      <div className="flex items-start gap-6">
        {isMobile || !guide.data ? null : (
          <aside className="sticky top-20 grid max-h-[calc(100dvh-6rem)] w-60 shrink-0 gap-2 overflow-y-auto">
            <p className="text-muted-foreground px-3 text-xs font-medium">{t('guide.sections')}</p>
            <SectionList sections={shown} current={current?.id} label={t('guide.sections')} />
          </aside>
        )}
        <div className="grid min-w-0 flex-1 gap-4">{main}</div>
      </div>
    </Page>
  )
}
