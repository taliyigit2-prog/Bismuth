// Tailwind classes of the status and tag colours (styles/globals.css @theme). No hex in TSX: an automatic
// status reads `--status-*` (owner colours per theme override them), a custom tag reads `--tag` from its
// class rule in <style id="tag-colors"> (lib/theme/user-theme.ts buildTagCss).
import { useEffect, useState } from 'react'
import type { StatusKey } from '@shared/contract'
import { buildTagCss, tagClass } from '@/lib/theme/user-theme'

export const STATUS_FILL: Record<StatusKey, string> = {
  paid: 'bg-status-paid text-status-paid-fg',
  unpaid: 'bg-status-unpaid text-status-unpaid-fg',
  partial: 'bg-status-partial text-status-partial-fg',
  dayuse: 'bg-status-dayuse text-status-dayuse-fg',
  pastEmpty: 'bg-status-past-empty text-status-past-empty-fg',
  empty: 'bg-status-empty text-status-empty-fg',
  blocked: 'bg-status-blocked text-status-blocked-fg'
}

export const STATUS_BORDER: Record<StatusKey, string> = {
  paid: 'border-status-paid',
  unpaid: 'border-status-unpaid',
  partial: 'border-status-partial',
  dayuse: 'border-status-dayuse',
  pastEmpty: 'border-status-past-empty',
  empty: 'border-status-empty',
  blocked: 'border-status-blocked'
}

/** Fill of a custom tag (its class sets `--tag`). */
export const tagFill = (tagId: string): string => `${tagClass(tagId)} bg-tag text-tag-fg`
/** Border of a custom tag. */
export const tagBorder = (tagId: string): string => `${tagClass(tagId)} border-tag`

type TagColor = { id: string; color: string | null }

/**
 * Every mounted `useTagStyles` (the calendar's tags, the panel's chips, the settings preview) registers its tags;
 * <style id="tag-colors"> holds them all, the latest registration winning per tag (a colour being edited in the
 * preview). One writer would otherwise overwrite another's rules — the panel's enabled-only list could drop a
 * rule the grid still draws.
 */
const registered = new Map<symbol, readonly TagColor[]>()

function writeTagStyles(): void {
  const byId = new Map<string, TagColor>()
  for (const tags of registered.values()) for (const tag of tags) byId.set(tag.id, tag)
  let style = document.getElementById('tag-colors')
  if (!style) {
    style = document.createElement('style')
    style.id = 'tag-colors'
    document.head.appendChild(style)
  }
  style.textContent = buildTagCss([...byId.values()])
}

/** Keeps <style id="tag-colors"> in step with the custom tags shown on screen. */
export function useTagStyles(tags: readonly TagColor[] | undefined): void {
  const [key] = useState(() => Symbol('tag-styles'))
  // A stable dependency: the same tags and colours give the same text, whatever array holds them.
  const signature = (tags ?? []).map((t) => `${t.id}=${t.color ?? ''}`).join('|')
  useEffect(() => {
    registered.delete(key)
    registered.set(key, tags ?? [])
    writeTagStyles()
    // `signature` stands for `tags`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, signature])
  useEffect(
    () => () => {
      registered.delete(key)
      writeTagStyles()
    },
    [key]
  )
}
