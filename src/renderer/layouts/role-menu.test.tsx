// Faz 16 rol testleri, the screen side: for each of the six system roles the sidebar lists exactly the screens its
// default rights allow (the same rights the services check, tests/unit/permissions-summary.test.ts), and a screen
// outside them, opened by its address, says "yetkiniz yok" instead of showing data.
import { afterEach, describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import {
  SYSTEM_ROLE_CODES,
  defaultPermissions,
  levelAllows,
  type PermissionKey,
  type SystemRoleCode
} from '@shared/permissions'
import { setViewAs } from '@/lib/view-as'
import { renderApp } from '@/test/render-app'
import { NAV_ITEMS, visibleNav } from '@/navigation'

afterEach(() => {
  act(() => setViewAs(null))
})

const canFor = (role: SystemRoleCode) => {
  const levels = defaultPermissions(role)
  return (key: PermissionKey) => levelAllows(levels[key], 'view')
}

const shown = () =>
  NAV_ITEMS.map((i) => i.to).filter((to) => screen.queryByTestId(`nav-${to.slice(1)}`) !== null)

describe('menü her sistem rolünün varsayılan yetkisini izler', () => {
  it.each(SYSTEM_ROLE_CODES.map((r) => [r]))('%s menüsü yalnız yetkili ekranları gösterir', async (role) => {
    act(() => setViewAs(role))
    await renderApp({ hash: '#/settings' })
    await screen.findByTestId('nav-settings')
    const expected = visibleNav(canFor(role as SystemRoleCode)).map((i) => i.to)
    await waitFor(() => expect(shown()).toEqual(expected))
  })

  it('Kat hizmetleri menüsünde olmayan Defter adresle açılınca "yetkiniz yok" der', async () => {
    act(() => setViewAs('housekeeping'))
    await renderApp({ hash: '#/ledger' })
    expect(await screen.findByRole('heading', { name: 'Bu ekrana yetkiniz yok' })).toBeInTheDocument()
  })

  it('Muhasebeci menüsünde olmayan Kara liste adresle açılınca "yetkiniz yok" der', async () => {
    act(() => setViewAs('accountant'))
    await renderApp({ hash: '#/blacklist' })
    expect(await screen.findByRole('heading', { name: 'Bu ekrana yetkiniz yok' })).toBeInTheDocument()
  })
})
