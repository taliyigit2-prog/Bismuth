// Accessibility scan (faz-15 madde 5, kabul ölçütü "erişilebilirlik taraması kritik hata vermez"): axe-core over a
// screen, WCAG 2.x A/AA rules. A "critical" finding fails; "serious" ones are reported (attached and printed) so a
// review sees them. Colour contrast of the owner's status colours is the owner's choice (the settings screen warns),
// so the calendar's coloured bars are scanned like the rest but a finding there is a report, not a failure.
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

export interface AxeFinding {
  id: string
  impact: string | null
  help: string
  nodes: string[]
}

export async function scan(page: Page): Promise<AxeFinding[]> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Toast region and the closed Radix portals hold nothing to read.
    .exclude('[data-sonner-toaster]')
    // Electron cannot open the extra page the default mode uses to join frames; the app has no iframes.
    .setLegacyMode(true)
    .analyze()
  return result.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? null,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' '))
  }))
}

export const critical = (findings: readonly AxeFinding[]): AxeFinding[] =>
  findings.filter((f) => f.impact === 'critical')

/** The screens scanned (desktop): the daily ones, the money ones, settings and the theme editor. */
export const A11Y_ROUTES = [
  'calendar',
  'today',
  'in-house',
  'tasks',
  'shift',
  'rooms',
  'guests',
  'ledger',
  'month-end',
  'currency',
  'issues',
  'staff',
  'reports',
  'settings?tab=general',
  'settings?tab=tags',
  'theme-preview',
  'guide',
  'about'
] as const
