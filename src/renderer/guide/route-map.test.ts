import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { SETTINGS_TABS } from '@/features/settings/tabs'
import { NAV_ITEMS } from '@/navigation'
import { createAppRouter } from '@/router'
import { GUIDE_ROUTE_MAP, guideTargetFor } from './route-map'

describe('her ekranın "?" düğmesi', () => {
  it('yönlendiricideki bütün rotalar eşlemede var', () => {
    const router = createAppRouter(new QueryClient())
    const paths = Object.keys(router.routesByPath).filter((p) => p !== '__root__')
    expect(paths.length).toBeGreaterThan(30)
    for (const path of paths) expect(Object.keys(GUIDE_ROUTE_MAP), path).toContain(path)
  })

  it('menüdeki her ekranın bir bölümü var (kılavuz dışında)', () => {
    for (const item of NAV_ITEMS) {
      if (item.to === '/guide') expect(guideTargetFor(item.to)).toBeNull()
      else expect(guideTargetFor(item.to), item.to).not.toBeNull()
    }
  })

  it('ekranın kendi bölümünü ve başlığını açar', () => {
    expect(guideTargetFor('/calendar')).toEqual({ section: 'reservations' })
    expect(guideTargetFor('/blacklist')).toEqual({ section: 'guests', anchor: 'blacklist' })
    expect(guideTargetFor('/laundry')).toEqual({ section: 'operations', anchor: 'laundry' })
  })

  it('ayarlarda açık bölüme göre gider; bilinmeyen rota kılavuzun ana sayfasını açar', () => {
    expect(guideTargetFor('/settings', { tab: 'backup' })).toEqual({ section: 'backup' })
    expect(guideTargetFor('/settings', { tab: 'users' })).toEqual({ section: 'settings', anchor: 'users' })
    expect(guideTargetFor('/settings', {})).toEqual({ section: 'settings' })
    for (const tab of SETTINGS_TABS) expect(guideTargetFor('/settings', { tab }), tab).not.toBeNull()
    expect(guideTargetFor('/bilinmeyen')).toBeNull()
  })
})
