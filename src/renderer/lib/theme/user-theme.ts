import { STATUS_KEYS, hexColor, type StatusColors, type StatusKey } from '@shared/contract'
import { contrastRatio, HEX_COLOR, readableOn } from '@shared/color'

const CSS_VAR: Record<StatusKey, string> = {
  paid: '--status-paid',
  unpaid: '--status-unpaid',
  partial: '--status-partial',
  dayuse: '--status-dayuse',
  pastEmpty: '--status-past-empty',
  empty: '--status-empty',
  blocked: '--status-blocked'
}

export const statusCssVar = (key: StatusKey): string => CSS_VAR[key]

/** The page background of each theme (globals.css `--background`), for the "hard to see" check of a colour. */
export const THEME_BACKGROUND = { light: '#ffffff', dark: '#0d0d11' } as const

/**
 * An accent colour that is hard to see or to read on the theme's background. The accent is also the colour of text
 * (links, the phone menu's current item, the guide's links), so the bar is the one for text: 4.5:1 (WCAG 1.4.3),
 * which also covers outlines and focus rings (1.4.11: 3:1). Text on the accent is derived and always readable.
 */
export const ACCENT_MIN_CONTRAST = 4.5
export const accentHardToSee = (color: string, theme: keyof typeof THEME_BACKGROUND): boolean =>
  contrastRatio(color, THEME_BACKGROUND[theme]) < ACCENT_MIN_CONTRAST

/** The hotel's accent per theme (faz-15 madde 6); null = Bismuth's own purple. */
export interface AccentColors {
  light?: string | null
  dark?: string | null
}

/** How much of the accent tints the "accent" surfaces (selected tab, today's column) in each theme. */
const TINT = { light: 12, dark: 24 } as const

function accentLines(color: string | null | undefined, theme: keyof typeof TINT): string[] {
  if (!color || !hexColor.safeParse(color).success) return []
  const fg = readableOn(color)
  const tint = (surface: string): string => `color-mix(in oklab, ${color} ${TINT[theme]}%, var(${surface}))`
  return [
    `  --primary: ${color};`,
    `  --primary-foreground: ${fg};`,
    `  --sidebar-primary: ${color};`,
    `  --sidebar-primary-foreground: ${fg};`,
    `  --ring: ${color};`,
    `  --sidebar-ring: ${color};`,
    `  --accent: ${tint('--background')};`,
    '  --accent-foreground: var(--foreground);',
    `  --sidebar-accent: ${tint('--sidebar')};`,
    '  --sidebar-accent-foreground: var(--sidebar-foreground);'
  ]
}

/**
 * CSS for <style id="user-theme">. Values are re-validated here (only #rrggbb) so nothing but a colour
 * can ever reach the stylesheet, whatever is stored in the database.
 */
export function buildUserThemeCss(
  light: StatusColors,
  dark: StatusColors = {},
  accent: AccentColors = {}
): string {
  const block = (selector: string, colors: StatusColors, extra: string[]): string => {
    const lines: string[] = []
    for (const key of STATUS_KEYS) {
      const value = colors[key]
      if (value !== undefined && hexColor.safeParse(value).success)
        lines.push(`  ${CSS_VAR[key]}: ${value};`, `  ${CSS_VAR[key]}-fg: ${readableOn(value)};`)
    }
    lines.push(...extra)
    return lines.length ? `${selector} {\n${lines.join('\n')}\n}` : ''
  }
  // Each theme keeps its own colours; the selectors outrank `.dark` in globals.css.
  return [
    block(':root:not(.dark)', light, accentLines(accent.light, 'light')),
    block(':root.dark', dark, accentLines(accent.dark, 'dark'))
  ]
    .filter(Boolean)
    .join('\n')
}

/** Class of a custom tag's colour rule (ids are ULIDs; anything else is stripped). */
export const tagClass = (tagId: string): string => `tag-${tagId.replace(/[^a-zA-Z0-9_-]/g, '')}`

/**
 * CSS for <style id="tag-colors">: one class per custom tag setting `--tag` / `--tag-fg`, so components colour
 * tags with classes, never inline styles (.claude/rules/ui.md). Only `#rrggbb` reaches the stylesheet.
 */
export function buildTagCss(tags: readonly { id: string; color: string | null }[]): string {
  return tags
    .filter((t): t is { id: string; color: string } => !!t.color && HEX_COLOR.test(t.color))
    .map((t) => `.${tagClass(t.id)} {\n  --tag: ${t.color};\n  --tag-fg: ${readableOn(t.color)};\n}`)
    .join('\n')
}
