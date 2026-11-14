import { describe, expect, it } from 'vitest'
import { tFor } from '../../src/main/app/i18n'

describe('ana süreç metinleri: çoğul biçimler', () => {
  it('kamera durma bildirimi Rusçada sayıya göre doğru biçimi seçer (1 раз, 2 раза, 5 раз)', () => {
    const ru = tFor('ru')
    expect(ru('main.camera.crashedBody', { count: '1' })).toContain('остановилась 1 раз;')
    expect(ru('main.camera.crashedBody', { count: '2' })).toContain('останавливалась 2 раза;')
    expect(ru('main.camera.crashedBody', { count: '5' })).toContain('останавливалась 5 раз;')
  })

  it('İngilizcede tekil ve çoğul, Türkçede tek biçim; sayısız anahtar olduğu gibi gelir', () => {
    expect(tFor('en')('main.camera.crashedBody', { count: '1' })).toContain('stopped 1 time;')
    expect(tFor('en')('main.camera.crashedBody', { count: '3' })).toContain('stopped 3 times;')
    expect(tFor('tr')('main.camera.crashedBody', { count: '3' })).toContain('3 kez durdu')
    expect(tFor('tr')('main.camera.crashedTitle')).toBe('Kamera sistemi durdu')
  })
})
