import { describe, expect, it } from 'vitest'
import {
  classifyAddress,
  hostAddresses,
  isAllowedHostName,
  isPrivatePeer,
  listenAddresses,
  unservedPrivateAddresses,
  type Interfaces
} from './net'

const info = (address: string, internal = false) => ({
  address,
  family: 'IPv4' as const,
  internal,
  netmask: '',
  mac: '',
  cidr: null
})

describe('adres sınıfları', () => {
  it('yerel ağ, özel ağ (NetBird/Tailscale 100.64/10), bu bilgisayar ve internet ayrılır', () => {
    expect(classifyAddress('192.168.1.20')).toBe('lan')
    expect(classifyAddress('10.0.0.4')).toBe('lan')
    expect(classifyAddress('172.16.3.1')).toBe('lan')
    expect(classifyAddress('172.32.0.1')).toBe('public')
    expect(classifyAddress('100.64.0.2')).toBe('private')
    expect(classifyAddress('100.127.255.1')).toBe('private')
    expect(classifyAddress('100.128.0.1')).toBe('public')
    expect(classifyAddress('127.0.0.1')).toBe('loopback')
    expect(classifyAddress('::ffff:192.168.1.5')).toBe('lan')
    expect(classifyAddress('::1')).toBe('loopback')
    expect(classifyAddress('fd7a:115c:a1e0::1')).toBe('private')
    expect(classifyAddress('fe80::1%en0')).toBe('lan')
    expect(classifyAddress('8.8.8.8')).toBe('public')
    expect(classifyAddress('2001:db8::1')).toBe('public')
    expect(classifyAddress('')).toBe('public')
  })
})

describe('dinleme ve gösterilen adresler', () => {
  const ifaces: Interfaces = {
    lo: [info('127.0.0.1', true)],
    Ethernet: [info('192.168.1.20'), { ...info('fe80::1'), family: 'IPv6', scopeid: 0 }],
    wt0: [info('100.92.10.4')],
    tailscale0: [info('100.101.1.2')],
    utun4: [info('100.70.0.9')],
    modem: [info('85.105.1.2')],
    direct: [info('169.254.3.3')],
    // An internet provider's shared range (carrier-grade NAT) on an ordinary card: not a private network (D1).
    'Wi-Fi': [info('100.80.4.4')]
  }

  it('varsayılan: yalnız bu bilgisayar ve özel ağ (NetBird/Tailscale); yerel ağ, genel adres ve 0.0.0.0 dinlenmez (K-45)', () => {
    const list = listenAddresses(ifaces)
    expect(list).toEqual(['127.0.0.1', '100.92.10.4', '100.101.1.2', '100.70.0.9'])
    expect(list).not.toContain('0.0.0.0')
    expect(list).not.toContain('85.105.1.2')
    expect(list).not.toContain('192.168.1.20')
  })

  it('yerel ağ ayarı açılınca otel ağı da dinlenir; sıradan karttaki 100.x (sağlayıcının ortak ağı) hiç dinlenmez (D1)', () => {
    const list = listenAddresses(ifaces, { lan: true })
    expect(list).toEqual([
      '127.0.0.1',
      '192.168.1.20',
      '100.92.10.4',
      '100.101.1.2',
      '100.70.0.9',
      '169.254.3.3'
    ])
    expect(list).not.toContain('100.80.4.4')
    expect(unservedPrivateAddresses(ifaces)).toEqual([{ address: '100.80.4.4', iface: 'Wi-Fi' }])
    expect(hostAddresses(ifaces, 7373, { lan: true }).map((a) => a.address)).not.toContain('100.80.4.4')
  })

  it('ekranda yerel ağ adresi yalnız ayar açıkken listelenir', () => {
    expect(hostAddresses(ifaces, 7373).map((a) => a.kind)).toEqual(['netbird', 'tailscale', 'private'])
  })

  it('ekranda: önce otel ağı, sonra NetBird (wt0), Tailscale, diğer özel ağ; bağlantı yerel adres yok', () => {
    expect(hostAddresses(ifaces, 7373, { lan: true })).toEqual([
      { url: 'http://192.168.1.20:7373', address: '192.168.1.20', kind: 'lan', iface: 'Ethernet' },
      { url: 'http://100.92.10.4:7373', address: '100.92.10.4', kind: 'netbird', iface: 'wt0' },
      { url: 'http://100.101.1.2:7373', address: '100.101.1.2', kind: 'tailscale', iface: 'tailscale0' },
      { url: 'http://100.70.0.9:7373', address: '100.70.0.9', kind: 'private', iface: 'utun4' }
    ])
  })
})

describe('istekte geçerli ana bilgisayar adları (DNS rebinding)', () => {
  it('IP, bilgisayarın adı ve özel ağ/yerel ağ adları geçer; başka site adı geçmez', () => {
    for (const ok of [
      '192.168.1.20:7373',
      '100.64.0.2:7373',
      '[::1]:7373',
      'localhost:7373',
      'OTEL-PC:7373',
      'otel-pc.local:7373',
      'bismuth-host.netbird.cloud:7373',
      'otel-pc.tail1234.ts.net'
    ])
      expect(isAllowedHostName(ok, 'OTEL-PC'), ok).toBe(true)
    for (const bad of ['kotu-site.example:7373', '8.8.8.8:7373', '', 'netbird.cloud.kotu.example'])
      expect(isAllowedHostName(bad, 'OTEL-PC'), bad).toBe(false)
  })

  it('bilgisayarın adıyla başlayan başka site adı geçmez (O-1: OTEL-PC.saldirgan.example)', () => {
    for (const bad of ['otel-pc.saldirgan.example:7373', 'OTEL-PC.evil.com', 'otel-pc.local.evil.com'])
      expect(isAllowedHostName(bad, 'OTEL-PC'), bad).toBe(false)
    for (const ok of ['otel-pc:7373', 'otel-pc.lan', 'otel-pc.home.arpa:7373'])
      expect(isAllowedHostName(ok, 'OTEL-PC'), ok).toBe(true)
  })
})

describe('yerel ağ adları ve bu bilgisayardan gelen istek (N-4)', () => {
  it('.local/.lan/.home.arpa yalnız bilgisayarın adıyla; genel sonek yalnız özel ağlar', () => {
    for (const bad of ['evil.local:7373', 'pc.lan', 'router.home.arpa', 'x.netbird.io'])
      expect(isAllowedHostName(bad, 'OTEL-PC'), bad).toBe(false)
    for (const ok of ['otel-pc.local', 'a.netbird.selfhosted', 'pc.tail1.ts.net', 'b.netbird.cloud:7373'])
      expect(isAllowedHostName(ok, 'OTEL-PC'), ok).toBe(true)
  })

  it('loopback isteğinde yalnız localhost, 127.0.0.1, [::1] ve bilgisayarın adı', () => {
    for (const ok of ['localhost:7373', '127.0.0.1:7373', '[::1]:7373', 'OTEL-PC', 'otel-pc.local:7373'])
      expect(isAllowedHostName(ok, 'OTEL-PC', 'loopback'), ok).toBe(true)
    for (const bad of ['evil.local:7373', '192.168.1.20:7373', 'pc.tail1.ts.net', '100.64.0.2'])
      expect(isAllowedHostName(bad, 'OTEL-PC', 'loopback'), bad).toBe(false)
  })
})

describe('özel ağdan gelen istek (N-5)', () => {
  const card = (address: string, netmask: string) => ({ ...info(address), netmask })
  const cards: Interfaces = {
    en0: [card('192.168.1.20', '255.255.255.0')],
    wt0: [card('100.90.1.2', '255.255.0.0')],
    tailscale0: [card('100.101.7.8', '255.255.255.255')],
    eth1: [card('100.70.0.9', '255.192.0.0')]
  }
  it('kartın aralığındaki ve kartın adresine gelen istemci özel ağdır', () => {
    expect(isPrivatePeer(cards, '100.90.3.4', '100.90.1.2')).toBe(true)
    expect(isPrivatePeer(cards, '::ffff:100.90.3.4', '::ffff:100.90.1.2')).toBe(true)
  })
  it('aralık dışı, başka karta gelen ya da özel ağ kartı olmayan 100.x özel ağ sayılmaz', () => {
    expect(isPrivatePeer(cards, '100.65.0.5', '100.90.1.2')).toBe(false)
    expect(isPrivatePeer(cards, '100.90.3.4', '192.168.1.20')).toBe(false)
    // An internet provider's shared range on an ordinary card (D1).
    expect(isPrivatePeer(cards, '100.70.0.10', '100.70.0.9')).toBe(false)
    expect(isPrivatePeer({}, '100.90.3.4', '100.90.1.2')).toBe(false)
  })
  it('tek adresli kart (Tailscale /32): ortak 100.64.0.0/10 aralığı geçerli', () => {
    expect(isPrivatePeer(cards, '100.64.9.9', '100.101.7.8')).toBe(true)
    expect(isPrivatePeer(cards, '100.128.0.1', '100.101.7.8')).toBe(false)
  })
})
