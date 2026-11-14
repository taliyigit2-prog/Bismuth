import { describe, expect, it } from 'vitest'
import { isPlausiblePhone, splitPhoneInput } from './phone'

describe('telefon girişi tek yerde okunur (H-05)', () => {
  it.each([
    ['+90 532 123 45 67', { code: '90', number: '5321234567' }],
    ['0532 123 45 67', { code: '90', number: '5321234567' }],
    ['905321234567', { code: '90', number: '5321234567' }],
    ['0090 532 123 45 67', { code: '90', number: '5321234567' }],
    ['(0532) 123-45-67', { code: '90', number: '5321234567' }],
    ['532 123 45 67', { code: '90', number: '5321234567' }],
    ['+7 900 123 4567', { code: '7', number: '9001234567' }],
    ['+44 20 7946 0958', { code: '44', number: '2079460958' }]
  ])('%s', (raw, expected) => {
    expect(splitPhoneInput(raw)).toEqual(expected)
  })

  it('+90 alanında yapıştırılan "+49 …" kodu değiştirir, başa eklenmez', () => {
    expect(splitPhoneInput('+49 151 2345678', '90')).toEqual({ code: '49', number: '1512345678' })
  })

  it('başka kod alanında 0 ile başlayan numara kodu korur', () => {
    expect(splitPhoneInput('0151 2345678', '49')).toEqual({ code: '49', number: '1512345678' })
  })

  it('kodu iki kez yapışmış eski kayıt düzelir: "+90 905 320 00 00 00"', () => {
    expect(splitPhoneInput('+90 905 320 00 00 00')).toEqual({ code: '90', number: '5320000000' })
  })

  it('listede olmayan ülke kodu (+86) olduğu gibi korunur, +90 altına konmaz', () => {
    expect(splitPhoneInput('+86 138 0013 8000')).toEqual({ code: '', number: '8613800138000' })
    expect(splitPhoneInput('0086 138 0013 8000', '49')).toEqual({ code: '', number: '8613800138000' })
    // Written again from what the field shows ("+" + digits) it reads the same.
    expect(splitPhoneInput('+8613800138000', '90')).toEqual({ code: '', number: '8613800138000' })
  })

  it('boş metin boş numara verir', () => {
    expect(splitPhoneInput('  ')).toEqual({ code: '90', number: '' })
  })

  it('makul telefon: "telefon" ve çok uzun rakam dizisi reddedilir', () => {
    expect(isPlausiblePhone('+90 532 123 45 67')).toBe(true)
    expect(isPlausiblePhone('')).toBe(true)
    expect(isPlausiblePhone('telefon')).toBe(false)
    expect(isPlausiblePhone('123')).toBe(false)
    expect(isPlausiblePhone('1'.repeat(40))).toBe(false)
  })
})
