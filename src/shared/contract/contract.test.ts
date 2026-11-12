import { describe, expect, it } from 'vitest'
import {
  contract,
  isProcedureName,
  SETTINGS_DEFAULTS,
  settingsPatchSchema,
  settingsValuesSchema
} from './index'

describe('kontrat', () => {
  it('varsayılan ayarlar şemaya uyar', () => {
    expect(settingsValuesSchema.parse(SETTINGS_DEFAULTS)).toEqual(SETTINGS_DEFAULTS)
  })

  it('ayar yaması: bilinmeyen anahtar, boş yama ve geçersiz renk reddedilir', () => {
    expect(settingsPatchSchema.safeParse({ 'ui.theme': 'dark' }).success).toBe(true)
    expect(settingsPatchSchema.safeParse({}).success).toBe(false)
    expect(settingsPatchSchema.safeParse({ 'ui.font': 'x' }).success).toBe(false)
    expect(settingsPatchSchema.safeParse({ 'ui.statusColors': { paid: 'red' } }).success).toBe(false)
    expect(settingsPatchSchema.safeParse({ 'ui.statusColors': { paid: '#e11d48' } }).success).toBe(true)
    expect(settingsPatchSchema.safeParse({ 'ui.language': 'ar' }).success).toBe(false)
  })

  it('yordam adları kontrattan gelir', () => {
    expect(isProcedureName('settings.set')).toBe(true)
    expect(isProcedureName('toString')).toBe(false)
    expect(Object.keys(contract)).toContain('app.getInfo')
  })
})
