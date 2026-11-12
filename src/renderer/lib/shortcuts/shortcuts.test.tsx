// The global shortcuts in the real shell (G-19): the list, quiet while typing, a dialog on top stops them, the
// screen that can do the job is opened, the role's rights count, the sidebar remembers the person's choice.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { currentHref, renderApp } from '@/test/render-app'
import { FAKE_ACCOUNTS } from '@/test/render'
import { resetShortcutHandlers } from './actions'
import { setShortcutListOpen } from './list-store'

beforeAll(() => {
  // jsdom has no scrollIntoView (the quick search list scrolls the active item into view).
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  setShortcutListOpen(false)
  resetShortcutHandlers()
})

const onCalendar = () => screen.findByRole('heading', { level: 1, name: 'Takvim' })

describe('genel klavye kısayolları', () => {
  it('"?" kısayol listesini açar; liste kayıttaki her satırı tuşlarıyla gösterir; Esc kapatır', async () => {
    await renderApp()
    await onCalendar()
    fireEvent.keyDown(document.body, { key: '?', shiftKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Klavye kısayolları' })
    const row = within(dialog).getByText('Yeni rezervasyon').closest('[data-shortcut]') as HTMLElement
    expect(row).toHaveAttribute('data-shortcut', 'new-reservation')
    expect(within(row).getByText('N')).toBeInTheDocument()
    expect(within(dialog).getByText('Takvimde bugüne git')).toBeInTheDocument()
    expect(within(dialog).getByText('Pencerelerde ve formlarda')).toBeInTheDocument()
    await userEvent.setup().keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Klavye kısayolları' })).toBeNull())
  })

  it('F1 de listeyi açar; hızlı aramada "Klavye kısayolları" satırı var', async () => {
    await renderApp()
    await onCalendar()
    fireEvent.keyDown(document.body, { key: 'F1' })
    expect(await screen.findByRole('dialog', { name: 'Klavye kısayolları' })).toBeInTheDocument()
    setShortcutListOpen(false)
    // Quick search does not open over an open window (QA2c #17): the list is closed first.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Klavye kısayolları' })).toBeNull())
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    const item = await screen.findByTestId('command-shortcuts')
    await userEvent.setup().click(item)
    expect(await screen.findByRole('dialog', { name: 'Klavye kısayolları' })).toBeInTheDocument()
  })

  it('yazı alanındayken tek harfli kısayollar çalışmaz, harf metne yazılır', async () => {
    await renderApp({ hash: '#/today' })
    await screen.findByRole('heading', { level: 1, name: 'Bugün' })
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: '?', shiftKey: true })
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 't' })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(currentHref()).toBe('/today')
    // Ctrl/⌘ combinations work in a field too: the quick search opens.
    fireEvent.keyDown(input, { key: 'k', ctrlKey: true })
    expect(await screen.findByRole('dialog', { name: 'Hızlı arama' })).toBeInTheDocument()
    input.remove()
  })

  it('N başka ekrandan takvimi açar ve yeni rezervasyon penceresini getirir', async () => {
    await renderApp({ hash: '#/today' })
    await screen.findByRole('heading', { level: 1, name: 'Bugün' })
    fireEvent.keyDown(document.body, { key: 'n' })
    expect(await screen.findByRole('dialog', { name: 'Yeni rezervasyon' })).toBeInTheDocument()
    expect(currentHref()).toBe('/calendar')
  })

  it('T başka ekrandan takvime götürür; P defteri ödeme penceresiyle açar', async () => {
    await renderApp({ hash: '#/today' })
    await screen.findByRole('heading', { level: 1, name: 'Bugün' })
    fireEvent.keyDown(document.body, { key: 't' })
    await onCalendar()
    expect(currentHref()).toBe('/calendar')
    fireEvent.keyDown(document.body, { key: 'p' })
    await screen.findByRole('heading', { level: 1, name: 'Defter ve kasa' })
    await waitFor(() => expect(currentHref()).toBe('/ledger'))
  })

  it('bir pencere açıkken arkadaki ekranın kısayolu çalışmaz', async () => {
    await renderApp()
    await onCalendar()
    fireEvent.keyDown(document.body, { key: '?', shiftKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Klavye kısayolları' })
    fireEvent.keyDown(within(dialog).getByTestId('shortcut-list-close'), { key: 'n' })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog', { name: 'Yeni rezervasyon' })).toBeNull()
  })

  it('rezervasyon yazamayan rol için N hiçbir şey açmaz', async () => {
    await renderApp({
      hash: '#/today',
      accounts: [
        ...FAKE_ACCOUNTS,
        { id: 'u-acc', username: 'muhasebe', displayName: 'Muhasebe', roleCode: 'accountant', password: 'x' }
      ],
      signedIn: 'u-acc'
    })
    await screen.findByRole('heading', { level: 1, name: 'Bugün' })
    fireEvent.keyDown(document.body, { key: 'n' })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog', { name: 'Yeni rezervasyon' })).toBeNull()
    expect(currentHref()).toBe('/today')
  })
})

describe('kenar menü', () => {
  it('daraltma kişinin tercihi olarak kaydedilir ve yeniden açılışta korunur', async () => {
    const first = await renderApp()
    await onCalendar()
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Menüyü aç/kapat' })[0]!)
    await waitFor(() =>
      expect(first.transport.calls.find((c) => c.name === 'settings.set')?.input).toEqual({
        'ui.sidebarCollapsed': true
      })
    )
    first.unmount()
    window.localStorage.clear()
    await renderApp({ settings: { 'ui.sidebarCollapsed': true } })
    await onCalendar()
    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'collapsed')
  })

  it('Ctrl+B Rusça düzende (и) ve Büyük harf kilidiyle de menüyü daraltıp açar (QA2c #11)', async () => {
    await renderApp()
    await onCalendar()
    const sidebar = () => document.querySelector('[data-slot="sidebar"]')
    expect(sidebar()).toHaveAttribute('data-state', 'expanded')
    fireEvent.keyDown(window, { key: 'и', code: 'KeyB', ctrlKey: true })
    await waitFor(() => expect(sidebar()).toHaveAttribute('data-state', 'collapsed'))
    fireEvent.keyDown(window, { key: 'B', code: 'KeyB', ctrlKey: true })
    await waitFor(() => expect(sidebar()).toHaveAttribute('data-state', 'expanded'))
  })
})

// Son kontrol (QA2c #17): like the other shortcuts, quick search does not open over an open window.
describe('açık pencere varken hızlı arama', () => {
  it('Ctrl+K ve "/" açık pencerenin üstünde aramayı açmaz; pencere yokken Ctrl+K aramayı açar ve kapatır', async () => {
    await renderApp()
    await onCalendar()
    fireEvent.keyDown(document.body, { key: '?', shiftKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Klavye kısayolları' })
    fireEvent.keyDown(within(dialog).getByTestId('shortcut-list-close'), { key: 'k', ctrlKey: true })
    fireEvent.keyDown(within(dialog).getByTestId('shortcut-list-close'), { key: '/' })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog', { name: 'Hızlı arama' })).toBeNull()
    fireEvent.click(within(dialog).getByTestId('shortcut-list-close'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Klavye kısayolları' })).toBeNull())

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    const search = await screen.findByRole('dialog', { name: 'Hızlı arama' })
    fireEvent.keyDown(search, { key: 'k', ctrlKey: true })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Hızlı arama' })).toBeNull())
  })
})
