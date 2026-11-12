import { describe, expect, it } from 'vitest'
import type { AuthState, Me } from '@shared/contract'
import { defaultPermissions } from '@shared/permissions'
import { gateRedirect, safeRedirect } from './gate'

const me = (patch: { locked?: boolean; mustChange?: boolean } = {}): Me => ({
  user: {
    id: 'u1',
    username: 'sahip',
    displayName: 'Otel Sahibi',
    roleId: 'r1',
    roleCode: 'owner',
    roleName: 'Sahip',
    roleNameI18n: null,
    hasPin: true,
    mustChange: patch.mustChange ?? false
  },
  permissions: defaultPermissions('owner'),
  locked: patch.locked ?? false
})

const state = (patch: Partial<AuthState> = {}): AuthState => ({
  setup: 'done',
  mode: 'standalone',
  session: me(),
  ...patch
})

/** `href` like the router gives it: path + query; `search` parsed. */
const at = (href: string) => {
  const q = href.indexOf('?')
  const pathname = q < 0 ? href : href.slice(0, q)
  const query = q < 0 ? '' : href.slice(q + 1)
  return { pathname, href, search: Object.fromEntries(new URLSearchParams(query)) }
}

describe('açılış kapısı', () => {
  it('kurulmamış otel: sihirbaz; istemci modunda bağlantı ekranı; ikisi arasında geçilebilir', () => {
    const setup = state({ setup: 'needed', session: null })
    expect(gateRedirect(setup, at('/'))).toBe('/setup')
    expect(gateRedirect(setup, at('/ledger'))).toBe('/setup')
    expect(gateRedirect(setup, at('/setup?step=3'))).toBeNull()
    expect(gateRedirect(setup, at('/connect'))).toBeNull()
    expect(gateRedirect({ ...setup, mode: 'client' }, at('/calendar'))).toBe('/connect')
    expect(gateRedirect(setup, at('/login'))).toBe('/setup')
  })

  it('oturum yok: yazılan adres oturum açma ekranında saklanır; kurtarma ekranı açıktır', () => {
    const out = state({ session: null })
    expect(gateRedirect(out, at('/'))).toBe('/login')
    expect(gateRedirect(out, at('/settings?tab=roles'))).toBe(
      `/login?redirect=${encodeURIComponent('/settings?tab=roles')}`
    )
    expect(gateRedirect(out, at('/login?redirect=/ledger'))).toBeNull()
    expect(gateRedirect(out, at('/recover'))).toBeNull()
    expect(gateRedirect(out, at('/lock?redirect=/ledger'))).toBe('/login?redirect=%2Fledger')
    expect(gateRedirect(out, at('/setup'))).toBe('/login')
  })

  it('kilitli pencere yalnız kilit ekranını gösterir; dönülecek ekran korunur', () => {
    const locked = state({ session: me({ locked: true }) })
    expect(gateRedirect(locked, at('/guests'))).toBe('/lock?redirect=%2Fguests')
    expect(gateRedirect(locked, at('/lock?redirect=/guests'))).toBeNull()
    expect(gateRedirect(locked, at('/login'))).toBe('/lock')
  })

  it('şifresi başkasınca konan hesap önce şifre değiştirme ekranına gider', () => {
    const must = state({ session: me({ mustChange: true }) })
    expect(gateRedirect(must, at('/calendar'))).toBe('/change-password?redirect=%2Fcalendar')
    expect(gateRedirect(must, at('/change-password'))).toBeNull()
    expect(gateRedirect(must, at('/login?redirect=/ledger'))).toBe('/change-password?redirect=%2Fledger')
  })

  it('oturum açık: yalın ekranlar uygulamaya (ya da saklanan adrese) döner, uygulama ekranları açık kalır', () => {
    const signedIn = state()
    expect(gateRedirect(signedIn, at('/calendar'))).toBeNull()
    expect(gateRedirect(signedIn, at('/'))).toBeNull()
    expect(gateRedirect(signedIn, at('/login'))).toBe('/')
    const back = encodeURIComponent('/settings?tab=roles')
    expect(gateRedirect(signedIn, at(`/lock?redirect=${back}`))).toBe('/settings?tab=roles')
    expect(gateRedirect(signedIn, at('/setup'))).toBe('/')
    expect(gateRedirect(signedIn, at('/connect'))).toBe('/')
  })

  it('dönülecek adres yalnız uygulamanın kendi ekranı olabilir', () => {
    expect(safeRedirect('/ledger')).toBe('/ledger')
    expect(safeRedirect('//example.com')).toBeNull()
    expect(safeRedirect('https://example.com')).toBeNull()
    expect(safeRedirect('/login?redirect=/x')).toBeNull()
    expect(safeRedirect('/')).toBeNull()
    expect(safeRedirect(42)).toBeNull()
  })
})
