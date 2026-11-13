import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isAppUrl, isCameraStream, isFileInside } from './app-url'

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

describe('kamera canlı yayın adresi (Faz 20 P20b)', () => {
  const origin = 'http://127.0.0.1:51234'

  it('yalnız yan sürecin kullandığı kapıdaki /api/stream geçer', () => {
    expect(isCameraStream(`${origin}/api/stream?st=1.abc`, origin)).toBe(true)
    expect(isCameraStream('http://127.0.0.1:51235/api/stream?st=1.abc', origin)).toBe(false)
    expect(isCameraStream(`${origin}/api/guests`, origin)).toBe(false)
    expect(isCameraStream(`${origin}.evil.example/api/stream?st=1`, origin)).toBe(false)
    expect(isCameraStream('http://localhost:51234/api/stream?st=1', origin)).toBe(false)
  })

  it('yan süreç yokken ya da adres loopback değilken hiçbir şey geçmez', () => {
    expect(isCameraStream(`${origin}/api/stream?st=1`, null)).toBe(false)
    expect(isCameraStream('http://192.168.1.5:5000/api/stream?st=1', 'http://192.168.1.5:5000')).toBe(false)
    expect(isCameraStream('https://example.com/api/stream?st=1', 'https://example.com')).toBe(false)
  })
})
