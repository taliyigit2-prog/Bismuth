// "Sık kullanılan" (04 §3): fourteen sections are many for an owner who sets most of them once. This lists the
// few that change over time — rooms, prices, lists, users, backup — as links, each with one line on what is in it.
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { SettingsSection } from './tabs'

/** The sections shown, in order; a role sees only those it may open (`sections` is already filtered). */
const FREQUENT_SECTIONS = ['hotel', 'rooms', 'lists', 'staff', 'users', 'backup'] as const

export function FrequentSection({
  sections,
  icons
}: {
  sections: readonly SettingsSection[]
  icons: Record<SettingsSection, ComponentType<{ 'aria-hidden'?: boolean; className?: string }>>
}) {
  const { t } = useTranslation()
  const shown = FREQUENT_SECTIONS.filter((key) => sections.includes(key))
  return (
    <Card data-testid="settings-frequent">
      <CardHeader>
        <CardTitle>{t('settings.frequent.title')}</CardTitle>
        <CardDescription>{t('settings.frequent.help')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((key) => {
            const Icon = icons[key]
            return (
              <li key={key}>
                <Link
                  to="."
                  search={{ tab: key }}
                  replace
                  data-testid={`frequent-${key}`}
                  className="hover:bg-accent focus-visible:ring-ring flex min-h-14 items-start gap-3 rounded-lg border p-3 text-start outline-none focus-visible:ring-[3px]"
                >
                  <Icon aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-sm font-medium break-words">{t(`settings.tab.${key}`)}</span>
                    <span className="text-muted-foreground text-xs break-words">
                      {t(`settings.frequent.hint.${key}`)}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
