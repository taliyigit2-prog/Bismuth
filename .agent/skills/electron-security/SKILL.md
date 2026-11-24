---
name: electron-security
description: >-
  Bismuth Electron ve HTTP güvenlik başvuru listesi — BrowserWindow seçenekleri, tek kanallı
  preload köprüsü, IPC gönderen denetimi, CSP dizesi, gezinme/pencere/izin işleyicileri,
  tek örnek, electron-builder electronFuses listesi, sunucu modu oturum ve çerez kuralları.
  Ana süreç, preload, IPC, sunucu modu ya da paketleme ayarı yazarken/incelerken kullanın.
---

# Electron Güvenlik Başvurusu (Bismuth)

Gerekçe: `docs/plan/03-mimari.md` §7–§8, `ANTIGRAVITY.md` Yasak 1, 4, 7, 13.

## 1. BrowserWindow

- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `nodeIntegrationInWorker: false`, `webviewTag: false`, `spellcheck: false` (Windows'ta sözlükleri CDN'den indirir, G-01).
- `webSecurity` ve `allowRunningInsecureContent` varsayılanında kalır; asla gevşetilmez.
- Preload tek CommonJS dosyasıdır; `@electron-toolkit/preload` ve `@electron/remote` kullanılmaz.
- Paketli sürümde DevTools kapalıdır (`devTools: !app.isPackaged`).

## 2. Preload Köprüsü ve Tek `bismuth:api` Kanalı

- Renderer'a yalnızca `window.bismuth = { api, ready, platform }` açılır; `ipcRenderer` dışa verilmez.
- `src/main/ipc/register.ts` gelen her çağrıda `event.senderFrame.url` için `isAppUrl` denetler.
- `src/main/ipc/handle.ts` zarfı (`{ path, body }`, ≤ 8 MB) doğrular ve `app.fetch(new Request('http://bismuth.ipc' + path), { ctx, session, transport: 'ipc' })` çağırır (port açılmaz).
- Her rota girdiyi zod ile doğrular; servis `ctx` ile yetkiyi **kendisi** denetler (G-23). Renderer'dan gelen kullanıcı kimliğine güvenilmez. Hata yanıtı kod + `errors.*` i18n anahtarı taşır; yığın izi, SQL veya dosya yolu sızdırmaz.

## 3. CSP

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

- `src/renderer/index.html` içinde `<meta http-equiv="Content-Security-Policy" ...>`; sunucu modunda Hono aynı dizeyi **HTTP başlığı** olarak gönderir (`frame-ancestors` yalnız başlıkta etkilidir).
- Kamera sekmesi canlı yayında `img-src` yalnız `127.0.0.1:<port>` için genişler; istemci modunda `connect-src` yalnız `<hostUrl>` ekler. `unsafe-eval`, CDN, uzak font yoktur.
- Geliştirme gevşetmesi (`devCsp`) yalnızca `electron.vite.config.ts` `apply: 'serve'` eklentisindedir.

## 4. Gezinme, Yeni Pencere, İzinler, Tek Örnek

- `will-navigate` ve `will-redirect`: `!isAppUrl(url)` ise engellenir.
- `will-attach-webview`: her zaman engellenir.
- `setWindowOpenHandler`: yalnızca izinli `https:` adresleri haricî açılır, pencere her zaman `{ action: 'deny' }` döner.
- İzinler: yalnız `clipboard-sanitized-write` (G-191 fatura bilgisi kopyalama) açıktır; kamera/mikrofon/konum/bildirim izni renderer'a verilmez.
- Tarayıcı/telefon istemcisinde düz HTTP üzerinde `navigator.clipboard` olmayabileceği için `document.execCommand('copy')` yedeği bulunur.
- `shell.openPath` yalnızca `userData/attachments/` içindeki yol geçişi denetlenmiş dosyalar için kullanılır.
- `app.requestSingleInstanceLock()` ile tek örnek kilidi zorunlu tutulur.

## 5. Paketleme: `electronFuses` (`electron-builder.yml`)

- `runAsNode: false`, `enableCookieEncryption: true`, `enableNodeOptionsEnvironmentVariable: false`, `enableNodeCliInspectArguments: false`, `enableEmbeddedAsarIntegrityValidation: true`, `onlyLoadAppFromAsar: true`, `resetAdHocDarwinSignature: true`.
- `publish: null` (G-07); tüm paketleme komutları `--publish never` ile çağrılır.

## 6. HTTP Sunucu Modu (Hono)

- Oturum belirteci: `crypto.randomBytes(32)`, veritabanında yalnızca sha256 (`sessions.token_hash`); süre ve iptal (G-144); cihaz kaydı.
- Çerez: `HttpOnly; SameSite=Strict; Path=/` (+ HTTPS'te `Secure`). Durum değiştiren isteklerde `Content-Type: application/json` ve `Origin` başlığı denetimi zorunludur (CORS yoktur).
- Girişte hız sınırı ve `failed_attempts` / `locked_until`; parola ve PIN `scrypt` ile saklanır.
- Statik dosya sunumu yol geçişine karşı `path.resolve` + önek doğrulaması yapar.

## 7. Ağ ve Bağımlılıklar

- Ağ kodu yalnız 5 izinli klasörde (`network/`, `server/`, `discovery/`, `camera/`, `renderer/lib/transport/`).
- Yasak paketler: `electron-updater`, `update-electron-app`, `@sentry/*`, `posthog*`, `mixpanel`, `firebase`, `@segment/*`, `@amplitude/*`, `bugsnag`, `electron-devtools-installer`.
- Gizli bilgiler `safeStorage` ile şifrelenir; `logs/main.log` asla parola, belirteç, kimlik numarası, KBS verisi veya RTSP şifresi içermez (`log-redact.ts`).
