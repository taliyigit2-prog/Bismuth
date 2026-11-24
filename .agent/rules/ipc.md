---
trigger: model_decision
description: Apply when editing IPC, API handlers, HTTP server, preload bridge, or Zod contracts (src/main/ipc/**, src/main/api/**, src/main/server/**, src/preload/**, src/shared/contract/**).
---

# IPC / API Kuralları (03-mimari.md §1, §8, §9 "Çağrı yolu")

- **Tek kontrat**: her yordam `src/shared/contract/` altında (`index.ts` veya `procedures/<modül>.ts`) `'modül.eylem': { input, output }` (zod; `import * as z`). Ad `modül.eylem`; yol `POST /api/modül.eylem`.
- **Tek yönlendirici**: `src/main/api/app.ts` (Hono). Sıra: bilinmeyen yordam → 404 `unknownProcedure`; `ctx` yok → 401; JSON + `input` zod → 400 (`z.flattenError` alanları); işleyici; `output` zod (sözleşme dışı çıktı = 500). Hata yalnızca `AppError(code, messageKey)` ile atılır (`src/main/services/errors.ts`); `messageKey` bir `errors.*` çeviri anahtarıdır. Yetki hatası `permissionDenied()` → 403.
- **İki taşıma, aynı kapı**: IPC tek kanal `bismuth:api` (`src/shared/contract/channels.ts`); `src/main/ipc/handle.ts` zarfı (`{ path, body }`, ≤ 8 MB) doğrular ve `app.fetch(new Request('http://bismuth.ipc' + path), { ctx, session, transport: 'ipc' })` çağırır — port açılmaz. `ctx` ve oturum bağı (`SessionBinding`) pencereye göre `src/main/session/desktop-sessions.ts`'ten gelir; belirteç ana süreçte kalır, arayüze hiç verilmez. Taşıma türü (`HandlerEnv.transport`) giriş noktasında belirlenir: IPC dışındaki her şey uzaktan sayılır. HTTP (sunucu modu, Faz 13) aynı `app`'i `@hono/node-server` ile sunar. Yeni kanal açılmaz; yeni yordam = kontrat satırı + `api/handlers/<modül>.ts` satırı.
- **Gönderen denetimi**: `ipc/register.ts` her çağrıda `senderFrame.url` için `isAppUrl` (yalnız `out/renderer` içindeki `file://` ya da geliştirme sunucusu) bakar.
- **Preload**: yalnızca `window.bismuth = { api, ready, platform }`; zod ve iş kodu girmez; `ipcRenderer` dışa verilmez. Bileşenler köprüye değil `lib/api` ve `lib/shell` kancalarına dokunur.
- **Erişim türü** (kontrat `access`): `public` (herkes), `setup` (otel kurulmadan, yalnız IPC), `user` (oturum açık, kilitsiz; varsayılan), `locked` (kilitli pencere). Yönlendirici reddi: kurulmamış → 409 `errors.setupNeeded`; oturum yok → 401 `errors.unauthenticated`; kilitli → 401 `errors.locked`; kurulmuş otelde `setup.*` → 409 `errors.setupDone`.
- **Yetki serviste** (G-23): işleyici `ctx`'i olduğu gibi servise geçirir; servis `ctx.can(izin, düzey)` ile denetler, yazmayı transaction içinde yapar ve `audit_log`'a yazar. `ctx` = penceredeki kullanıcı; `localOwnerCtx()`/`systemCtx()` yalnız programın kendi işleri (açılış, zamanlayıcı) ve testler içindir.
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `spellcheck: false`; CSP `default-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'` (kullanıcı renkleri `<style id="user-theme">` ve Radix konumlandırması için); `object-src 'none'; base-uri 'none'`. `frame-ancestors 'none'` yalnızca HTTP başlığında (meta'da geçersiz).
- Servisler Electron'u import etmez (aynı kod sunucu modunda ve testlerde çalışır).
- Ağ: yalnızca `src/main/network/`, `src/main/server/`, `src/main/discovery/`, `src/main/camera/` (loopback/RTSP/özel IP keşfi) ve `src/renderer/lib/transport/` (ANTIGRAVITY.md yasak 1).
- Çerezli oturumda `/api/*` için `Content-Type: application/json` ve `Origin` denetimi zorunlu (CSRF).
