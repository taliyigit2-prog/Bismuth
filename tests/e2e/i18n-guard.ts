// E2E helpers for the three interface languages (Faz 16 v2 "Üç dil"): the text of a language file by key (so a spec
// finds a button in English or Russian without copying the words), and a check that no raw key ("ledger.day.title")
// and no unfilled placeholder ("{{count}}") is on the screen — what i18next shows when a key is missing.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'

export const LANGS = ['tr', 'en', 'ru'] as const
export type Lang = (typeof LANGS)[number]

type Tree = { [key: string]: string | Tree }

const files = new Map<Lang, Tree>()
const load = (lang: Lang): Tree => {
  let tree = files.get(lang)
  if (!tree) {
    tree = JSON.parse(
      readFileSync(resolve(__dirname, `../../src/renderer/i18n/${lang}.json`), 'utf8')
    ) as Tree
    files.set(lang, tree)
  }
  return tree
}

/** The text of `key` in `lang`, with `{{name}}` placeholders filled from `values`. */
export function text(lang: Lang, key: string, values: Record<string, string> = {}): string {
  let node: string | Tree | undefined = load(lang)
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined
  if (typeof node !== 'string') throw new Error(`no text for ${key} in ${lang}.json`)
  return node.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name] ?? `{{${name}}}`)
}

let keyList: string[] | null = null
/** Every key of tr.json (the source language), plural keys also by their base ("nights" for "nights_one"). */
export function allKeys(): string[] {
  if (keyList) return keyList
  const out = new Set<string>()
  const walk = (tree: Tree, prefix: string): void => {
    for (const [k, v] of Object.entries(tree)) {
      const key = prefix ? `${prefix}.${k}` : k
      if (typeof v === 'string') {
        out.add(key)
        out.add(key.replace(/_(zero|one|two|few|many|other)$/, ''))
      } else walk(v, key)
    }
  }
  walk(load('tr'), '')
  keyList = [...out]
  return keyList
}

/**
 * Raw keys and unfilled placeholders on the page: the visible text plus the accessible names, placeholders and
 * titles. [] when every text came from a language file.
 */
export async function rawTextReport(page: Page): Promise<string[]> {
  return page.evaluate((keys) => {
    const known = new Set(keys)
    const parts = [document.body.innerText]
    for (const el of document.querySelectorAll('[aria-label],[placeholder],[title]'))
      for (const attr of ['aria-label', 'placeholder', 'title']) {
        const v = el.getAttribute(attr)
        if (v) parts.push(v)
      }
    const all = parts.join('\n')
    const found = new Set<string>()
    for (const token of all.match(/[A-Za-z][\w-]*(?:\.[\w-]+)+/g) ?? [])
      if (known.has(token)) found.add(token)
    for (const hole of all.match(/\{\{\s*\w+\s*\}\}/g) ?? []) found.add(hole)
    return [...found]
  }, allKeys())
}

/** Buttons and tabs whose label is cut off (wider than the control; Russian is the longest language). */
export async function clippedControls(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('button, [role="tab"], a[data-testid^="nav-"]')]
      .filter((el) => {
        const box = el as HTMLElement
        if (!box.offsetParent || !box.innerText.trim()) return false
        // Screen-reader-only controls (the "skip to content" link) are 1 px boxes on purpose.
        if (box.closest('.sr-only') || box.getBoundingClientRect().width <= 2) return false
        // A stay bar on the tape chart is as wide as its nights: a long guest name is cut there by design.
        if (box.closest('[data-testid="tape-chart"]')) return false
        return box.scrollWidth > box.clientWidth + 1
      })
      .map((el) => `${el.tagName.toLowerCase()}: ${(el as HTMLElement).innerText.trim().slice(0, 40)}`)
  )
}
