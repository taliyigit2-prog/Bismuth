import { describe, expect, it } from 'vitest'
import {
  buildHikvisionRtsp,
  hikvisionFormValid,
  isCameraHost,
  isPrivateIpv4,
  maskRtsp,
  parseIpv4,
  rtspHost
} from './camera-source'

const S = 'rtsp:' + '//'

describe('Hikvision RTSP kalıbı (K-59)', () => {
  it('1. kanal 101, 2. kanal 201 yoluna gider ve port varsayılan 554 olur', () => {
    expect(buildHikvisionRtsp({ host: '192.168.1.64', user: 'admin', password: 'pw', channel: 1 })).toBe(
      S + 'admin:pw@192.168.1.64:554/Streaming/Channels/101'
    )
    expect(
      buildHikvisionRtsp({ host: '192.168.1.64', port: 8554, user: 'admin', password: 'pw', channel: 2 })
    ).toBe(S + 'admin:pw@192.168.1.64:8554/Streaming/Channels/201')
  })

  it('kullanıcı adı ve şifredeki özel karakterler adrese güvenle kodlanır', () => {
    const url = buildHikvisionRtsp({ host: '10.0.0.5', user: 'a b', password: 'p@ss:w/rd', channel: 1 })
    expect(url).toBe(S + 'a%20b:p%40ss%3Aw%2Frd@10.0.0.5:554/Streaming/Channels/101')
    expect(rtspHost(url)).toBe('10.0.0.5')
  })

  it('adres yalnız özel ağ ve bu bilgisayar için kamera sayılır', () => {
    for (const ok of ['10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.0.9', '169.254.3.4'])
      expect(isPrivateIpv4(ok)).toBe(true)
    for (const no of ['8.8.8.8', '172.32.0.1', '192.169.0.1', '11.0.0.1', '300.1.1.1', 'cam.local', ''])
      expect(isPrivateIpv4(no)).toBe(false)
    expect(isCameraHost('127.0.0.1')).toBe(true)
    expect(isCameraHost('1.1.1.1')).toBe(false)
    expect(parseIpv4('192.168.1')).toBeNull()
  })

  it('maskelenen adreste kullanıcı ve şifre görünmez', () => {
    expect(maskRtsp(S + 'admin:gizli@192.168.1.64:554/x')).toBe(S + '***@192.168.1.64:554/x')
    expect(maskRtsp(S + '192.168.1.64/x')).toBe(S + '192.168.1.64/x')
  })

  it('form denetimi: geçerli IP, kullanıcı ve kanal aralığı', () => {
    const ok = { host: '192.168.1.64', user: 'admin', password: '', channel: 1 }
    expect(hikvisionFormValid(ok)).toBe(true)
    expect(hikvisionFormValid({ ...ok, host: 'kamera' })).toBe(false)
    expect(hikvisionFormValid({ ...ok, user: ' ' })).toBe(false)
    expect(hikvisionFormValid({ ...ok, channel: 0 })).toBe(false)
    expect(hikvisionFormValid({ ...ok, channel: 33 })).toBe(false)
    expect(hikvisionFormValid({ ...ok, port: 70000 })).toBe(false)
  })

  it('rtsp olmayan adresin sunucusu yoktur', () => {
    expect(rtspHost('http://192.168.1.64/x')).toBeNull()
    expect(rtspHost('0')).toBeNull()
  })

  it('kullanıcı adında satır sonu, denetim karakteri ya da tırnak varsa adres reddedilir', () => {
    for (const user of ['a%0d%0aX-Evil:%201', 'a%0a', 'a%00', 'a%22b', 'a"b', '%E0%A4%A'])
      expect(rtspHost(S + user + ':pw@192.168.1.64/x')).toBeNull()
    expect(rtspHost(S + 'admin:p%0d%0aw@192.168.1.64/x')).toBeNull()
    // an ordinary quote-free user and a password with special characters stay valid
    expect(rtspHost(S + 'ad%20min:p%22w@192.168.1.64/x')).toBe('192.168.1.64')
  })
})
