import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { today } from '@shared/date'
import { formatDate } from '@shared/format'
import { renderWithProviders } from '@/test/render'
import { Button } from './ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Toggle } from './ui/toggle'
import { ResponsiveDialog } from './responsive-dialog'
import { TopBar } from './top-bar'

/** Phone layout (< 768 px) for the next render. */
function phone(): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: true,
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

const tallDialog = (
  <ResponsiveDialog
    open
    onOpenChange={() => {}}
    title="Uzun form"
    footer={<Button data-testid="dialog-save">Kaydet</Button>}
  >
    <div>alan</div>
  </ResponsiveDialog>
)

describe('kabuk bileşenleri', () => {
  it('masaüstü penceresinde form kendi içinde kayar; düğmeler kaymaz, hep görünür', async () => {
    await renderWithProviders(tallDialog)
    const dialog = await screen.findByRole('dialog')
    const body = within(dialog).getByTestId('dialog-body')
    expect(dialog).toHaveClass('flex', 'flex-col', 'max-h-[90dvh]')
    expect(dialog).not.toHaveClass('overflow-y-auto')
    expect(body).toHaveClass('overflow-y-auto', 'min-h-0', 'flex-1')
    // The buttons sit outside the scrolling body.
    expect(within(body).queryByTestId('dialog-save')).not.toBeInTheDocument()
    expect(within(dialog).getByTestId('dialog-save')).toBeInTheDocument()
  })

  it('telefonda kapat (X) düğmesi 44 px; odak halkası klavyede görünür', async () => {
    phone()
    await renderWithProviders(tallDialog)
    const close = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kapat' })
    expect(close).toHaveClass('max-md:size-11', 'focus-visible:ring-[3px]')
    expect(close).not.toHaveClass('focus:ring-2')
  })

  it('seçili açma-kapama düğmesi renk dışında kenarlık ve kalın yazıyla da belli olur', async () => {
    await renderWithProviders(
      <Toggle variant="outline" pressed aria-label="Cmt">
        Cmt
      </Toggle>
    )
    const toggle = await screen.findByRole('button', { name: 'Cmt' })
    expect(toggle).toHaveAttribute('data-state', 'on')
    expect(toggle).toHaveClass(
      'data-[state=on]:border-primary',
      'data-[state=on]:bg-primary/15',
      'data-[state=on]:font-semibold'
    )
  })

  it('sekme içeriği klavyeyle odaklanınca halka görünür', async () => {
    await renderWithProviders(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">içerik</TabsContent>
      </Tabs>
    )
    expect(await screen.findByRole('tabpanel')).toHaveClass(
      'focus-visible:ring-[3px]',
      'focus-visible:ring-ring'
    )
  })

  it('telefonun üst çubuğu tarihi kısa yazar; tam tarih başlıkta ve ekran okuyucuda', async () => {
    phone()
    await renderWithProviders(<TopBar onOpenCommand={() => {}} withSidebarTrigger={false} />, {
      settings: { 'ui.language': 'ru' }
    })
    const label = await screen.findByTestId('today-label')
    const full = `Сегодня ${formatDate(today(), 'ru', 'full')}`
    expect(label).toHaveAttribute('title', full)
    expect(label.querySelector('[aria-hidden]')?.textContent).not.toContain(today().slice(0, 4))
    expect(label.querySelector('.sr-only')).toHaveTextContent(full)
  })
})
