// When the "Ana ekrana ekle" hint shows (faz-13 madde 6): pure, unit-tested.

export const isApplePhone = (ua: string): boolean => /iPhone|iPad|iPod/.test(ua)

/**
 * Only a browser that reached the hotel's computer over the network: the computer itself (localhost, 127.0.0.1)
 * has no home screen to add to, and the program's own window is not a browser.
 */
export function shouldShowInstallHint(o: {
  http: boolean
  hostname: string
  asApp: boolean
  dismissed: boolean
}): boolean {
  const loopback = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i.test(o.hostname)
  return o.http && !loopback && !o.asApp && !o.dismissed
}
