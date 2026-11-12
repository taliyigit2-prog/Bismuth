// The keyboard shortcut table (G-19), drawn from the list the keys are read from (lib/shortcuts/registry.ts): the
// "?" list shows it, and so does the guide wherever its text says `[[shortcuts]]`.
import { Fragment, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { isMacLike } from '@/lib/platform'
import { comboCaps, SHORTCUT_GROUPS, SHORTCUTS, type ShortcutDef } from '@/lib/shortcuts/registry'

function Keys({ def, mac }: { def: ShortcutDef; mac: boolean }) {
  const { t } = useTranslation()
  // The four arrows are one set of keys; other alternatives read "Ctrl + K ya da /".
  const isSet = def.keys.every((k) => k.startsWith('Arrow'))
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {def.keys.map((combo, i) => (
        <Fragment key={combo}>
          {i > 0 && !isSet ? (
            <span className="text-muted-foreground text-xs">{t('shortcuts.or')}</span>
          ) : null}
          <KbdGroup>
            {comboCaps(combo, mac).map((cap) => (
              <Kbd key={cap} className="text-foreground border">
                {cap}
              </Kbd>
            ))}
          </KbdGroup>
        </Fragment>
      ))}
    </span>
  )
}

/** Every shortcut, grouped: each screen, the calendar, forms. Also the table in the guide. */
export function ShortcutTable({ headingLevel = 3 }: { headingLevel?: 2 | 3 | 4 }) {
  const { t } = useTranslation()
  const mac = isMacLike()
  const id = useId()
  const Heading = (['h2', 'h3', 'h4'] as const)[headingLevel - 2] ?? 'h3'
  return (
    <div className="grid gap-5" data-testid="shortcut-table">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group} className="grid gap-2" aria-labelledby={`${id}-${group}`}>
          <Heading id={`${id}-${group}`} className="text-sm font-semibold">
            {t(`shortcuts.group.${group}`)}
          </Heading>
          <dl className="divide-y rounded-lg border">
            {SHORTCUTS.filter((s) => s.group === group).map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2"
                data-shortcut={s.id}
              >
                <dt className="min-w-0 text-sm">{t(s.labelKey)}</dt>
                <dd className="ms-auto">
                  <Keys def={s} mac={mac} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className="text-muted-foreground text-xs">{t('shortcuts.typingNote')}</p>
    </div>
  )
}
