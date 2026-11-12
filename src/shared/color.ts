// Colour helpers for owner-chosen colours (G-33): text on a status or tag fill must stay readable whatever
// colour the hotel picks, so the foreground is derived (WCAG 2.x relative luminance), never chosen by hand.

/** `#rrggbb` only (the settings and tag schemas accept nothing else). */
export const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** WCAG relative luminance of `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** WCAG contrast ratio of two `#rrggbb` colours (1…21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Near-black or white text, whichever reads better on `background`. */
export function readableOn(background: string): '#0a0a0a' | '#ffffff' {
  return contrastRatio('#0a0a0a', background) >= contrastRatio('#ffffff', background) ? '#0a0a0a' : '#ffffff'
}

/** Starting colours offered for a new custom tag (the owner can pick any colour). */
export const TAG_PALETTE = ['#7c3aed', '#0ea5e9', '#16a34a', '#db2777', '#f59e0b', '#475569'] as const

/** WCAG AA for normal text: the bar label must stay readable on the tag colour. */
export const isReadable = (background: string): boolean =>
  contrastRatio(background, readableOn(background)) >= 4.5

/**
 * Bismuth's own accent per theme (globals.css `--primary`; tests/unit/theme-contrast.test.ts keeps them equal):
 * the starting colour of the accent picker when the hotel has not chosen one (faz-15 madde 6).
 */
export const DEFAULT_ACCENT = { light: '#573c9d', dark: '#b9aaf8' } as const

/** Ready accents: a dark step for the light theme, a light step for the dark theme (each ≥ 3:1 on its page). */
export const ACCENT_PRESETS = [
  { id: 'blue', light: '#1d4ed8', dark: '#93c5fd' },
  { id: 'teal', light: '#0f766e', dark: '#5eead4' },
  { id: 'green', light: '#15803d', dark: '#86efac' },
  { id: 'rose', light: '#be123c', dark: '#fda4af' },
  { id: 'amber', light: '#b45309', dark: '#fcd34d' },
  { id: 'slate', light: '#334155', dark: '#cbd5e1' }
] as const
