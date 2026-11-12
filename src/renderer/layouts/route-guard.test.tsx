import { afterEach, describe, expect, it } from 'vitest'
import { act, screen } from '@testing-library/react'
import { setViewAs } from '@/lib/view-as'
import { renderApp } from '@/test/render-app'
import { NAV_ITEMS, navAllows, visibleNav } from '@/navigation'

afterEach(() => {
  act(() => setViewAs(null))
})

const item = (to: string) => NAV_ITEMS.find((i) => i.to === to)!

describe('menü ve adres yetkisi', () => {
  it('Ayarlar, Kılavuz ve Hakkında hiçbir yetki istemez; Denetim kaydı telefonda "Daha fazla"dadır', () => {
    const nothing = () => false
    expect(visibleNav(nothing).map((i) => i.to)).toEqual(['/settings', '/guide', '/about'])
    expect(navAllows(item('/settings'), nothing)).toBe(true)
    expect(navAllows(item('/audit'), nothing)).toBe(false)
    expect(navAllows(item('/audit'), (key) => key === 'audit_log')).toBe(true)
    expect(item('/audit').mobile).toBe('more')
  })

  it('hiçbir ekranı görmeyen rol de Ayarlar’ı adresle açar: Genel herkesindir', async () => {
    // A role the list does not know sees nothing at all.
    act(() => setViewAs('role-without-rights'))
    await renderApp({ hash: '#/settings' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Ayarlar' })).toBeInTheDocument()
    expect(await screen.findByTestId('language-select')).toBeInTheDocument()
    expect(screen.queryByText('Bu ekrana yetkiniz yok')).not.toBeInTheDocument()
    expect(screen.getByTestId('nav-settings')).toBeInTheDocument()
    expect(screen.queryByTestId('nav-today')).not.toBeInTheDocument()
  })

  it('yetkisi olmayan ekran adresle açılınca yine "yetkiniz yok" der', async () => {
    act(() => setViewAs('role-without-rights'))
    await renderApp({ hash: '#/audit' })
    expect(await screen.findByRole('heading', { name: 'Bu ekrana yetkiniz yok' })).toBeInTheDocument()
  })
})
