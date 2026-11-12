---
name: electron-security
description: Bismuth Electron ve HTTP güvenlik başvuru listesi — BrowserWindow seçenekleri, tek kanallı preload köprüsü, IPC gönderen denetimi, projenin CSP dizesi, gezinme/pencere/izin işleyicileri, tek örnek, electron-builder electronFuses listesi, sunucu modu oturum ve çerez kuralları; kod örnekleriyle. Ana süreç, preload, IPC, sunucu modu ya da paketleme ayarı yazarken veya gözden geçirirken başvur.
user-invocable: false
---

# Electron güvenlik başvurusu (Bismuth)

Gerekçe: `docs/plan/03-mimari.md` §7–§8, `04-arastirma/repo-masaustu-sablonlar.md` §4.3, CLAUDE.md Yasak 1, 4, 7, 13.

## 1. BrowserWindow

```ts
const win = new BrowserWindow({
  show: false,
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'), // sandbox: preload tek dosya, CommonJS (ESM preload sandbox'ta çalışmaz)
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    webviewTag: false,
    spellcheck: false, // Windows'ta sözlükleri Google CDN'den indirir (G-01)
    // webSecurity ve allowRunningInsecureContent varsayılanında kalır; asla false/true yapılmaz
  },
})
```

- Sandbox'lı preload yalnızca `contextBridge`, `ipcRenderer` (ve `webFrame`) kullanabilir; npm paketi `require` edilemez —
  electron-vite preload'ı tek CJS dosyaya paketler.
- `@electron-toolkit/preload` **kullanılmaz** (`electronAPI` her kanala ham `ipcRenderer` açar). `@electron/remote` yok.
- Paketli sürümde DevTools: `devTools: !app.isPackaged` (ya da gizli bir ayarla).

## 2. Preload köprüsü: tek `api` kanalı

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  request: (req: { method: string; path: string; body?: unknown }) => ipcRenderer.invoke('api', req),
})
```

- Renderer'a yalnızca bu dar fonksiyon gider; kanal adı sabit (`'api'`), renderer seçemez. Olay aboneliği gerekirse aynı
  desenle tek bir `onEvent(cb)` ve geri dönen abonelikten çıkma fonksiyonu.

```ts
// src/main/ipc — tek giriş noktası: aynı Hono uygulaması, port açmadan
ipcMain.handle('api', async (event, raw) => {
  if (!isTrustedSender(event.senderFrame)) throw new Error('forbidden')
  const req = apiRequestSchema.parse(raw) // zod: method, path ('/api/...' ile başlar), body
  const ctx = await contextForWebContents(event.sender) // kullanıcı/rol/cihaz ana süreçte belirlenir
  const res = await app.fetch(
    new Request(`http://bismuth.ipc${req.path}`, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
    }),
    { ctx },
  )
  return { status: res.status, body: await res.json() }
})

const isTrustedSender = (frame: Electron.WebFrameMain | null): boolean => {
  if (!frame) return false
  const url = new URL(frame.url)
  return app.isPackaged ? url.protocol === 'file:' : url.origin === new URL(process.env.ELECTRON_RENDERER_URL!).origin
}
```

- Her rota girdiyi zod ile doğrular; servis `ctx` ile yetkiyi **kendisi** denetler (G-23). Renderer'dan gelen kullanıcı kimliğine
  güvenilmez. Hata yanıtı kod + i18n anahtarı taşır; yığın izi, SQL, dosya yolu sızdırmaz.

## 3. CSP (projenin dizesi)

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

- `src/renderer/index.html` içinde `<meta http-equiv="Content-Security-Policy" content="...">`; sunucu modunda Hono aynı dizeyi
  **HTTP başlığı** olarak gönderir (`frame-ancestors` meta etiketinde yok sayılır, yalnızca başlıkta etkilidir).
- İstemci modunda yalnızca `connect-src 'self' <ana bilgisayar adresi>` genişler (03-mimari §7). `unsafe-eval`, CDN, uzak font yok.
- Geliştirme sunucusunun ihtiyacı (React refresh satır içi betiği, HMR websocket'i) için gevşetme yalnızca
  `electron.vite.config.ts` içindeki `apply: 'serve'` eklentisinde (`devCsp`) yapılır; derlenmiş `index.html` bu dizeyi aynen taşır.

## 4. Gezinme, yeni pencere, izinler, tek örnek

```ts
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault() // hash geçişleri bu olayı tetiklemez
  })
  contents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) void shell.openExternal(url) // yalnızca https: + izin listesi
    return { action: 'deny' }
  })
})

const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write']) // G-191: fatura bilgisini kopyalama
session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(ALLOWED_PERMISSIONS.has(permission)))
session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))

if (!app.requestSingleInstanceLock()) app.quit()
else app.on('second-instance', () => focusMainWindow())

app.setAppUserModelId('com.bismuth.hotel')
```

- Kamera, mikrofon, konum, bildirim izni renderer'a verilmez (masaüstü bildirimi ana süreçten `Notification` ile).
- Tarayıcı/telefon istemcisinde düz HTTP üzerinde `navigator.clipboard` yoktur (güvenli bağlam ister) → kopyalama için
  `document.execCommand('copy')` yedeği.
- `shell.openPath` yalnızca `userData/attachments/` içindeki, yol geçişi denetlenmiş dosyalar için.

## 5. Paketleme: `electronFuses` (electron-builder 26)

```yaml
# electron-builder.yml
electronFuses:
  runAsNode: false
  enableCookieEncryption: true
  enableNodeOptionsEnvironmentVariable: false
  enableNodeCliInspectArguments: false
  enableEmbeddedAsarIntegrityValidation: true
  onlyLoadAppFromAsar: true
  resetAdHocDarwinSignature: true # ad-hoc imzalı arm64 Mac: sigorta değişince imza yenilenmezse uygulama açılmaz
asar: true
mac:
  identity: "-"
# publish: YOK (G-07) — komutlar `electron-builder ... --publish never`
```

- `enableNodeCliInspectArguments: false` olunca Playwright `_electron.launch` **paketlenmiş** uygulamaya bağlanamaz: paket
  testi `--remote-debugging-port` + `chromium.connectOverCDP` ile yapılır ya da e2e paketlenmemiş derlemeye (`out/`) karşı koşar.
- `grantFileProtocolExtraPrivileges` varsayılanında kalır (uygulama `file://` + hash yönlendirme ile yüklenir); değiştirmeden önce
  paketli açılış testi.
- `publish`, `postinstall: electron-builder install-app-deps`, Linux hedefleri, `NSCamera/NSMicrophone UsageDescription` yok.

## 6. HTTP sunucu modu (Hono)

- Oturum belirteci: `crypto.randomBytes(32)` (256 bit), veritabanında yalnızca sha256 (`sessions.token_hash`); süre ve iptal
  (G-144); cihaz kaydı.
- Çerez: `HttpOnly; SameSite=Strict; Path=/` (+ HTTPS'te `Secure`). Durum değiştiren her istekte `Origin` başlığı ana bilgisayar
  adresiyle eşleşmeli. CORS başlığı yok.
- Girişte hız sınırı ve `failed_attempts` / `locked_until`; parola ve PIN `scrypt`.
- İstek gövdesi boyut sınırı; tüm `/api` rotaları zod doğrulamalı ve IPC ile **aynı servis** yolundan geçer.
- Statik dosyalar: `resolved = path.resolve(root, decoded)` ve `resolved.startsWith(root + path.sep)` değilse 404.
- Rol bazlı `remote.allowed`; bağlanılan arayüz ayarla sınırlanabilir; aynı CSP başlığı.

## 7. Ağ ve bağımlılıklar

- Ağ kodu yalnızca `src/main/network/` (dış veri: izin listesi, 5 sn zaman aşımı, zod yanıt doğrulaması, sessiz başarısızlık,
  `network.enabled=false` → sıfır istek), `src/main/server/`, `src/renderer/lib/transport/`. `no-network-guard` kancası zorlar.
- Eklenmez: `electron-updater`, `update-electron-app`, `@sentry/*`, `posthog*`, `mixpanel`, `firebase`, `@segment/*`,
  `@amplitude/*`, `bugsnag`, `electron-devtools-installer` (çalışma anında ağdan indirir). `deps-guard` kancası zorlar.
- Gizli bilgi: anahtarlar `safeStorage`; electron-log'a parola, belirteç, kimlik numarası, KBS verisi yazılmaz.
