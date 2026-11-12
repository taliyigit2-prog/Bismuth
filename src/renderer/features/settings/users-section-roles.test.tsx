// Faz 4 bug hunt P4fix #13: a role that manages accounts (`settings.users`) but does not open the role editor
// (`settings.roles`) still adds and edits accounts — the role names come from the account form's own list.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PERMISSION_KEYS, type PermissionKey, type PermissionLevel } from '@shared/permissions'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import { adminTransport, defaultAdminState } from './admin-fake'
import { UsersSection } from './users-section'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => setViewAs(null))

describe('Kullanıcılar, rol düzenleyici yetkisi olmadan', () => {
  it('yalnız kullanıcı yetkisi olan rol hesap ekler: rol seçimi hesap formunun listesinden gelir', async () => {
    const state = defaultAdminState()
    const permissions = Object.fromEntries(
      PERMISSION_KEYS.map((k) => [k, k === 'settings.users' ? 'edit' : 'none'])
    ) as Record<PermissionKey, PermissionLevel>
    const base = state.roles.find((r) => r.code === 'reception')!
    state.roles.push({
      ...base,
      id: 'role-it',
      code: null,
      name: 'Hesap yöneticisi',
      displayName: null,
      permissions
    })
    const transport = adminTransport({ state })
    setViewAs('role-it')
    await renderWithProviders(<UsersSection />, { transport })
    const user = userEvent.setup()
    const add = await screen.findByTestId('add-user')
    await waitFor(() => expect(add).toBeEnabled())
    expect(transport.callsTo('users.roleChoices')).not.toEqual([])
    await user.click(add)
    await user.type(await screen.findByTestId('user-username'), 'gece')
    await user.type(screen.getByTestId('user-display-name'), 'Gece Resepsiyonu')
    await user.type(screen.getByTestId('user-password'), 'gece-sifre-123')
    await user.click(screen.getByTestId('dialog-save'))
    await waitFor(() =>
      expect(transport.callsTo('users.create')).toEqual([
        expect.objectContaining({ username: 'gece', roleId: 'role-reception' })
      ])
    )
  })
})
