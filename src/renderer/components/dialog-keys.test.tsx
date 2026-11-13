// Esc closes, Enter saves — in every dialog and form (.claude/rules/ui.md, faz-15 madde 3). The behaviour is checked
// once on the shared frame (ResponsiveDialog, desktop and phone), and the source of every screen is checked for the
// shape that gives it: a dialog with buttons holds a form whose save button is its submit button.
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { renderWithProviders } from '@/test/render'
import { ResponsiveDialog } from './responsive-dialog'

const phone = (on: boolean): void => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: on && query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false
      }) as MediaQueryList
  )
}

afterEach(() => vi.restoreAllMocks())

/** The shape every form dialog of the program has: fields in the body, Vazgeç + Kaydet in the footer. */
function FormDialog({ onSave, onClose }: { onSave: (name: string) => void; onClose: () => void }) {
  const [open, setOpen] = useState(true)
  const [name, setName] = useState('')
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) onClose()
      }}
      title="Kayıt"
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="keys-form">
            Kaydet
          </Button>
        </>
      }
    >
      <form
        id="keys-form"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(name)
        }}
      >
        <label htmlFor="keys-name">Ad</label>
        <Input id="keys-name" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="keys-note">Not</label>
        <Input id="keys-note" />
      </form>
    </ResponsiveDialog>
  )
}

describe.each([
  ['masaüstü', false],
  ['telefon', true]
])('pencere klavyesi (%s)', (_name, onPhone) => {
  it('Enter yazı alanından kaydeder, Esc kaydetmeden kapatır', async () => {
    phone(onPhone)
    const onSave = vi.fn()
    const onClose = vi.fn()
    await renderWithProviders(<FormDialog onSave={onSave} onClose={onClose} />)
    const user = userEvent.setup()
    const field = await screen.findByLabelText('Ad')
    await user.click(field)
    await user.type(field, 'Ayşe{Enter}')
    expect(onSave).toHaveBeenCalledWith('Ayşe')
    // From another field too: Enter is the form's, not the first field's.
    await user.click(screen.getByLabelText('Not'))
    await user.keyboard('{Enter}')
    expect(onSave).toHaveBeenCalledTimes(2)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledTimes(2)
  })
})

// ── Every dialog of the program ───────────────────────────────────────────────────────────────────────────────

/** Every screen and component source, by its path under src/renderer ("features/ledger/void-dialog.tsx"). */
const SOURCES = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(['../features/**/*.tsx', '../components/**/*.tsx', '!**/*.test.tsx'], {
      query: '?raw',
      import: 'default',
      eager: true
    })
  ).map(([path, text]) => [path.replace(/^\.\.\//, '').replace(/^\.\//, 'components/'), text])
)

/**
 * Dialogs that only show something (a list, photos, a help text): their footer has no save. Each one says why.
 */
const SHOW_ONLY = new Set([
  'components/shortcut-list.tsx', // the shortcut list: "Kılavuzda aç" and "Kapat"
  'components/cash-drawer/handover-history.tsx', // past handovers; the filter form has no save
  'features/laundry/laundry-cards.tsx', // the slip's photos
  'features/supply/purchases-list.tsx', // a purchase's photos
  'features/camera/privacy-notice.tsx', // the privacy notice: a text with "Kapat" and "Yazdır"
  'features/contacts/import-dialog.tsx', // a file picker and a preview: "Ekle" runs on the parsed rows
  'features/data-transfer/import-wizard.tsx', // steps of an import, each a button
  'features/theme-preview/component-gallery.tsx', // the theme preview's sample dialog
  'features/settings/camera-rescan.tsx' // the camera setup flow: its own "Kamerayı kaydet"; Enter in a field tries the connection
])

describe('programdaki her pencere', () => {
  it('düğmeli her pencere bir form taşır ve kaydet düğmesi formun gönder düğmesidir (Enter kaydeder)', () => {
    const offenders: string[] = []
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100)
    for (const [rel, text] of Object.entries(SOURCES)) {
      if (rel.startsWith('components/ui/') || rel === 'components/responsive-dialog.tsx') continue
      if (!/<ResponsiveDialog[\s\S]*?footer=/.test(text)) continue
      if (SHOW_ONLY.has(rel)) continue
      const hasForm = /<form\b|<FormBody\b/.test(text)
      const hasSubmit = /type="submit"|<DialogFooter\b|<DialogActions\b/.test(text)
      if (!hasForm || !hasSubmit) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('istisna listesindeki her dosya hâlâ var ve hâlâ formsuz pencere içeriyor', () => {
    for (const rel of SHOW_ONLY) {
      expect(SOURCES[rel], rel).toMatch(/<ResponsiveDialog/)
    }
  })
})
