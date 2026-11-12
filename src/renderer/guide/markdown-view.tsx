// Draws a parsed guide page (markdown.ts) as React elements: no HTML string ever reaches the page. Headings carry
// their anchor as an element id (`guide-<anchor>`), pictures come from the bundled screenshots, links inside the
// guide and to the program's screens are router links, "ipucu / dikkat" boxes are marked with an icon and a word.
import { Fragment, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LightbulbIcon, TriangleAlertIcon } from 'lucide-react'
import type { AppLocale } from '@shared/format'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'
import { ShortcutTable } from '@/components/shortcut-table'
import { guideImage } from './images'
import { anchorId, type Block, type Inline } from './markdown'

interface ViewProps {
  blocks: readonly Block[]
  lang: AppLocale
  /** The section on display: `#anchor` links stay in it. */
  section: string
  /** Print copy: plain text links and no ids (the screen copy keeps the ids). */
  print?: boolean
}

function InlineView({ nodes, props }: { nodes: readonly Inline[]; props: ViewProps }): ReactNode {
  return nodes.map((node, i) => {
    switch (node.t) {
      case 'text':
        return <Fragment key={i}>{node.v}</Fragment>
      case 'strong':
        return (
          <strong key={i} className="font-semibold">
            <InlineView nodes={node.c} props={props} />
          </strong>
        )
      case 'kbd':
        return (
          <Kbd key={i} className="text-foreground border align-baseline">
            {node.v}
          </Kbd>
        )
      case 'link': {
        const label = <InlineView nodes={node.c} props={props} />
        if (props.print) return <Fragment key={i}>{label}</Fragment>
        const className = 'text-primary font-medium underline underline-offset-4 hover:no-underline'
        if (node.href.kind === 'app')
          return (
            <Link key={i} to={node.href.path} className={className} data-guide-link="app">
              {label}
            </Link>
          )
        const search = {
          s: node.href.section ?? props.section,
          ...(node.href.anchor ? { a: node.href.anchor } : {})
        }
        return (
          <Link
            key={i}
            to="/guide"
            search={search}
            resetScroll={false}
            className={className}
            data-guide-link="guide"
          >
            {label}
          </Link>
        )
      }
    }
  })
}

const HEADING_CLASS = {
  1: 'text-xl font-semibold tracking-tight md:text-2xl',
  2: 'mt-4 text-lg font-semibold tracking-tight',
  3: 'mt-2 text-base font-semibold'
} as const

function BlockView({ block, props }: { block: Block; props: ViewProps }): ReactNode {
  const { t } = useTranslation()
  switch (block.t) {
    case 'heading': {
      // The page frame's h1 is "Kılavuz": a section title is h2, its parts h3 and h4.
      const Tag = (['h2', 'h3', 'h4'] as const)[block.level - 1] ?? 'h4'
      return (
        <Tag
          id={block.id && !props.print ? anchorId(block.id) : undefined}
          className={cn(HEADING_CLASS[block.level], 'scroll-mt-20 text-balance')}
        >
          <InlineView nodes={block.c} props={props} />
        </Tag>
      )
    }
    case 'paragraph':
      return (
        <p className="leading-relaxed">
          <InlineView nodes={block.c} props={props} />
        </p>
      )
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i} className="ps-1 leading-relaxed">
          <InlineView nodes={item} props={props} />
        </li>
      ))
      return block.ordered ? (
        <ol start={block.start} className="ms-6 grid list-decimal gap-1.5 marker:font-semibold">
          {items}
        </ol>
      ) : (
        <ul className="ms-6 grid list-disc gap-1.5">{items}</ul>
      )
    }
    case 'image': {
      const src = guideImage(props.lang, block.name)
      if (!src) return null
      // The pictures' own sizes (scripts/guide-shots.mjs): the page keeps their place before they load, so a link to
      // a heading stays on that heading.
      const phone = block.name.startsWith('phone-')
      return (
        <figure className={cn('grid gap-1.5', phone && 'max-w-64')} data-guide-image={block.name}>
          <img
            src={src}
            alt={block.alt}
            loading="lazy"
            width={phone ? 390 : 1100}
            height={phone ? 844 : 618}
            className="bg-muted h-auto w-full rounded-lg border shadow-xs print:max-h-[11cm] print:w-auto"
          />
          {block.alt ? (
            <figcaption className="text-muted-foreground text-xs" aria-hidden>
              {block.alt}
            </figcaption>
          ) : null}
        </figure>
      )
    }
    case 'shortcuts':
      return (
        <div data-guide-shortcuts>
          <ShortcutTable headingLevel={4} />
        </div>
      )
    case 'callout': {
      const warning = block.kind === 'warning'
      const Icon = warning ? TriangleAlertIcon : LightbulbIcon
      return (
        <aside
          className={cn(
            'grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-lg border p-4',
            warning ? 'border-warning bg-warning/10' : 'border-info/40 bg-info/5'
          )}
          data-guide-callout={block.kind}
        >
          <Icon className={cn('mt-0.5 size-5', warning ? 'text-warning' : 'text-info')} aria-hidden />
          <div className="grid min-w-0 gap-2">
            <p className="text-sm font-semibold">
              {t(warning ? 'guide.callout.warning' : 'guide.callout.tip')}
            </p>
            <MarkdownView {...props} blocks={block.blocks} />
          </div>
        </aside>
      )
    }
  }
}

/** One page (or the inside of a box) of the guide. */
export function MarkdownView(props: ViewProps) {
  return (
    <div className="grid gap-4">
      {props.blocks.map((block, i) => (
        <BlockView key={i} block={block} props={props} />
      ))}
    </div>
  )
}
