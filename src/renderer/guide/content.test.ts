// The guide's text (K-40): the same pages with the same anchors in every language, every link and picture leads
// somewhere, every screen's "?" lands on a heading that exists.
import { describe, expect, it } from 'vitest'
import { APP_LOCALES } from '@shared/format'
import { guideImageNames } from './images'
import { headingIds, imageNames, links, parseMarkdown } from './markdown'
import { allGuideTargets } from './route-map'
import { buildSection, GUIDE_SECTIONS, sectionIdOfFile, type GuideSection } from './sections'

const RAW = import.meta.glob<string>('./content/*/*.md', { query: '?raw', import: 'default', eager: true })

const filesOf = (lang: string): string[] =>
  Object.keys(RAW)
    .filter((p) => p.startsWith(`./content/${lang}/`))
    .map((p) => p.slice(`./content/${lang}/`.length))
    .sort()

const pagesOf = (lang: string): GuideSection[] =>
  filesOf(lang).map((file) => {
    const id = sectionIdOfFile(file)
    if (!id) throw new Error(`${lang}/${file}: not a guide section`)
    return buildSection(id, RAW[`./content/${lang}/${file}`] ?? '')
  })

describe('kılavuzun içeriği', () => {
  it('her bölümün her dilde dosyası var; dosya adları bölüm listesiyle aynı sırada', () => {
    const expected = GUIDE_SECTIONS.map((s, i) => `${String(i + 1).padStart(2, '0')}-${s.id}.md`)
    for (const lang of APP_LOCALES) expect(filesOf(lang), lang).toEqual(expected)
  })

  it('üç dilde aynı başlık çapaları aynı sırada; her dosyada tek bir # başlık', () => {
    const tr = pagesOf('tr')
    for (const lang of APP_LOCALES) {
      const pages = pagesOf(lang)
      pages.forEach((page, i) => {
        const blocks = page.blocks
        expect(
          blocks.filter((b) => b.t === 'heading' && b.level === 1),
          `${lang}/${page.id}`
        ).toHaveLength(1)
        expect(headingIds(blocks), `${lang}/${page.id}`).toEqual(headingIds(tr[i]?.blocks ?? []))
        expect(imageNames(blocks), `${lang}/${page.id} resimleri`).toEqual(imageNames(tr[i]?.blocks ?? []))
      })
    }
  })

  it('her ## başlığın çapası var ve çapalar bütün kılavuzda tek', () => {
    const pages = pagesOf('tr')
    const all = pages.flatMap((p) => headingIds(p.blocks))
    expect(new Set(all).size).toBe(all.length)
    for (const id of GUIDE_SECTIONS.map((s) => s.id)) expect(all).not.toContain(id)
    for (const page of pages)
      for (const b of page.blocks)
        if (b.t === 'heading' && b.level === 2)
          expect(b.id, `${page.id}: ${JSON.stringify(b.c)}`).not.toBeNull()
  })

  it('bütün bağlantılar var olan bir bölüme, başlığa ya da program ekranına gider', () => {
    const appPaths = ['/calendar', '/today', '/ledger', '/settings', '/guide', '/tourism', '/shift']
    for (const lang of APP_LOCALES) {
      const pages = pagesOf(lang)
      const anchors = new Map<string, Set<string>>(pages.map((p) => [p.id, new Set(headingIds(p.blocks))]))
      for (const page of pages)
        for (const href of links(page.blocks)) {
          if (href.kind === 'app') {
            expect(appPaths, `${lang}/${page.id}`).toContain(href.path)
            continue
          }
          const section = href.section ?? page.id
          expect(anchors.has(section), `${lang}/${page.id} → ${section}`).toBe(true)
          if (href.anchor)
            expect(anchors.get(section)?.has(href.anchor), `${lang}/${page.id} → #${href.anchor}`).toBe(true)
        }
    }
  })

  it('her ekranın "?" düğmesinin gösterdiği bölüm ve başlık kılavuzda var', () => {
    const pages = new Map(pagesOf('tr').map((p) => [p.id, new Set(headingIds(p.blocks))]))
    for (const target of allGuideTargets()) {
      expect(pages.has(target.section), target.section).toBe(true)
      if (target.anchor)
        expect(pages.get(target.section)?.has(target.anchor), JSON.stringify(target)).toBe(true)
    }
  })

  it('kılavuzdaki her resmin her dilde görüntüsü var', () => {
    for (const lang of APP_LOCALES) {
      const have = new Set(guideImageNames(lang))
      for (const page of pagesOf(lang))
        for (const name of imageNames(page.blocks))
          expect(have.has(name), `${lang}/${page.id}: ${name}`).toBe(true)
    }
  })

  it('her bölüm ekranlarla karşılaştırıldı: hiçbir dilde "doğrula" notu kalmadı', () => {
    for (const lang of APP_LOCALES)
      for (const file of filesOf(lang))
        expect(RAW[`./content/${lang}/${file}`], `${lang}/${file}`).not.toMatch(/<!-- doğrula/)
  })

  it('metinde kullanılmayan Markdown (tablo, satır içi kod, HTML) yok', () => {
    for (const lang of APP_LOCALES)
      for (const file of filesOf(lang)) {
        const text = (RAW[`./content/${lang}/${file}`] ?? '').replace(/<!--[\s\S]*?-->/g, '')
        expect(text, `${lang}/${file}`).not.toMatch(/^\|/m)
        expect(text, `${lang}/${file}`).not.toMatch(/`/)
        expect(text.replace(/<\/?kbd>/g, ''), `${lang}/${file}`).not.toMatch(/<[a-z/]/i)
        for (const b of parseMarkdown(text)) expect(b.t).not.toBe(undefined)
      }
  })
})
