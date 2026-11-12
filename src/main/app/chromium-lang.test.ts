import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { tempDataDir } from '../../../tests/factories/runtime'
import { chromiumLang, chromiumLangSwitch, readUiLocale, uiLocaleFile, writeUiLocale } from './chromium-lang'

describe('pencerenin dili (faz-15 madde 11)', () => {
  it('İngilizce en-GB olur (24 saat, gün önce); Türkçe ve Rusça kendi adıyla', () => {
    expect(chromiumLang('en')).toBe('en-GB')
    expect(chromiumLang('tr')).toBe('tr')
    expect(chromiumLang('ru')).toBe('ru')
  })

  it('seçilen dil bir sonraki açılışta --lang olarak uygulanır', () => {
    const file = uiLocaleFile(tempDataDir())
    expect(chromiumLangSwitch(file)).toBeNull()
    writeUiLocale(file, 'en')
    expect(readUiLocale(file)).toBe('en')
    expect(chromiumLangSwitch(file)).toBe('en-GB')
    writeUiLocale(file, 'ru')
    expect(chromiumLangSwitch(file)).toBe('ru')
  })

  it('bozuk ya da tanınmayan dosya bilgisayarın diline bırakır', () => {
    const file = uiLocaleFile(tempDataDir())
    writeFileSync(file, '{not json')
    expect(chromiumLangSwitch(file)).toBeNull()
    writeFileSync(file, JSON.stringify({ locale: 'de' }))
    expect(readUiLocale(file)).toBeNull()
  })
})
