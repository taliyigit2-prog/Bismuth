import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isAppUrl, isFileInside } from './app-url'

const root = join(process.cwd(), 'Program Dosyaları', 'Bismuth Çalışan', 'out', 'renderer')
const inRoot = (p: string): string => pathToFileURL(join(root, p)).href

describe('uygulama adresi', () => {
  it('yalnızca arayüz klasöründeki dosyalar uygulamadır (boşluk ve Türkçe harfli yol dahil)', () => {
    expect(isAppUrl(`${inRoot('index.html')}#/settings`, null, root)).toBe(true)
    expect(isAppUrl(inRoot('assets/inter-latin-wght-normal.woff2'), null, root)).toBe(true)
    expect(isAppUrl(pathToFileURL(join(root, '..', 'main', 'index.js')).href, null, root)).toBe(false)
    expect(isAppUrl('file:///etc/passwd', null, root)).toBe(false)
    expect(isFileInside(pathToFileURL(root).href, root)).toBe(false)
  })

  it('internet adresleri uygulama değildir; geliştirme sunucusu yalnız geliştirmede', () => {
    expect(isAppUrl('https://example.com/', null, root)).toBe(false)
    expect(isAppUrl('http://localhost:5173/', null, root)).toBe(false)
    expect(isAppUrl('http://localhost:5173/src/main.tsx', 'http://localhost:5173', root)).toBe(true)
    expect(isAppUrl('http://localhost:5173.evil.com/', 'http://localhost:5173', root)).toBe(false)
  })
})
