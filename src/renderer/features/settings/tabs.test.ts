import { describe, expect, it } from 'vitest'
import { defaultPermissions, levelAllows, type PermissionKey, type SystemRoleCode } from '@shared/permissions'
import { canOpenTab, isSettingsTab, sectionOf, SETTINGS_SECTIONS } from './tabs'

const canAs = (role: SystemRoleCode) => (key: PermissionKey) =>
  levelAllows(defaultPermissions(role)[key], 'view')

describe('Ayar bölümlerinin adresleri', () => {
  it('eski bağlantılar çalışır: "appearance" Genel’i, "roles" Kullanıcılar ve roller’i açar', () => {
    expect(isSettingsTab('appearance')).toBe(true)
    expect(sectionOf('appearance')).toBe('general')
    expect(sectionOf('roles')).toBe('users')
    expect(sectionOf(undefined)).toBe('general')
    expect(sectionOf('rooms')).toBe('rooms')
    expect(isSettingsTab('nope')).toBe(false)
  })

  it('her bölüm yetkiye göre açılır: sahip hepsini, temizlik yalnız genel, görevler ve hakkında bölümünü görür', () => {
    expect(SETTINGS_SECTIONS.filter((s) => canOpenTab(s, canAs('owner')))).toEqual([...SETTINGS_SECTIONS])
    expect(SETTINGS_SECTIONS.filter((s) => canOpenTab(s, canAs('housekeeping')))).toEqual([
      'general',
      'tasks',
      'guide',
      'about'
    ])
    // The old "roles" link follows the section it now opens.
    expect(canOpenTab('roles', canAs('manager'))).toBe(false)
  })
})
