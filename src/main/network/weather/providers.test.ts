import { describe, expect, it } from 'vitest'
import type { HttpClient, HttpOutcome } from '../http'
import { fetchMet, metUserAgent } from './providers'

describe('MET User-Agent (K-13)', () => {
  it('otelin e-postası verilince UA "Bismuth/<sürüm> <e-posta>" olur', () => {
    expect(metUserAgent('1.0.0', 'resepsiyon@ornek-otel.com')).toBe('Bismuth/1.0.0 resepsiyon@ornek-otel.com')
    expect(metUserAgent('1.0.0', '  resepsiyon@ornek-otel.com ')).toBe(
      'Bismuth/1.0.0 resepsiyon@ornek-otel.com'
    )
  })

  it('e-posta yoksa ya da geçersizse proje adresi kalır (başlığa boşluk, köşeli ayraç, satır sonu girmez)', () => {
    const project = 'Bismuth/1.0.0 (+https://github.com/taliyigit2-prog/Hotel-CRM)'
    expect(metUserAgent('1.0.0')).toBe(project)
    expect(metUserAgent('1.0.0', null)).toBe(project)
    expect(metUserAgent('1.0.0', '')).toBe(project)
    expect(metUserAgent('1.0.0', 'otel')).toBe(project)
    expect(metUserAgent('1.0.0', 'a b@ornek.com')).toBe(project)
    expect(metUserAgent('1.0.0', 'x@ornek.com\r\nX-Evil: 1')).toBe(project)
    expect(metUserAgent('1.0.0', '<x@ornek.com>')).toBe(project)
    expect(metUserAgent('1.0.0', `${'a'.repeat(120)}@ornek.com`)).toBe(project)
  })

  it('fetchMet verilen UA ile ister', async () => {
    const seen: Record<string, string>[] = []
    const http: HttpClient = {
      requestCount: 0,
      get: (_url: string, headers?: Record<string, string>): Promise<HttpOutcome> => {
        seen.push(headers ?? {})
        return Promise.resolve({ ok: false, reason: 'network' })
      }
    }
    await fetchMet(http, {
      lat: 41.01,
      lon: 28.97,
      userAgent: metUserAgent('2.3.4', 'info@ornek-otel.com'),
      lastModified: null
    })
    expect(seen[0]?.['User-Agent']).toBe('Bismuth/2.3.4 info@ornek-otel.com')
  })
})
