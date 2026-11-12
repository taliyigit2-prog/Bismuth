import { describe, expect, it } from 'vitest'
import { decodeResponse } from './decode'
import { ApiError } from './types'

describe('yanıt çözme', () => {
  it('başarılı yanıtı döner', () => {
    expect(decodeResponse<'auth.ping'>(200, '{"ok":true}')).toEqual({ ok: true })
  })

  it('hata gövdesini ApiError (kod + çeviri anahtarı) yapar', () => {
    try {
      decodeResponse(403, '{"error":{"code":"PERMISSION_DENIED","messageKey":"errors.permissionDenied"}}')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect(e).toMatchObject({
        code: 'PERMISSION_DENIED',
        status: 403,
        messageKey: 'errors.permissionDenied'
      })
    }
  })

  it('bozuk yanıt genel hata olur', () => {
    expect(() => decodeResponse(500, '<html>')).toThrow(ApiError)
  })
})
