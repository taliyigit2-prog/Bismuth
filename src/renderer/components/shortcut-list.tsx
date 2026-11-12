// The keyboard shortcut list (G-19): opened with `?` or F1, or from the quick search. The table is the guide's too
// (shortcut-table.tsx); the keys are read from the same list (lib/shortcuts/registry.ts).
import { Link } from '@tanstack/react-router'
import { BookOpenIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { setShortcutListOpen, useShortcutListOpen } from '@/lib/shortcuts/list-store'
import { useGlobalShortcuts } from '@/lib/shortcuts/use-global-shortcuts'
import { ShortcutTable } from './shortcut-table'

export function ShortcutListDialog() {
  const { t } = useTranslation()
  const open = useShortcutListOpen()
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setShortcutListOpen}
      title={t('shortcuts.title')}
      description={t('shortcuts.description')}
      footer={
        <>
          <Button variant="outline" asChild>
            <Link
              to="/guide"
              search={{ s: 'getting-started', a: 'keyboard' }}
              onClick={() => setShortcutListOpen(false)}
            >
              <BookOpenIcon aria-hidden />
              {t('shortcuts.inGuide')}
            </Link>
          </Button>
          <Button onClick={() => setShortcutListOpen(false)} data-testid="shortcut-list-close">
            {t('common.close')}
          </Button>
        </>
      }
    >
      <ShortcutTable />
    </ResponsiveDialog>
  )
}

/** Mounted once by each shell layout: the key listener and the list it opens. */
export function ShellShortcuts({ onSearch }: { onSearch: () => void }) {
  useGlobalShortcuts({ onSearch })
  return <ShortcutListDialog />
}
