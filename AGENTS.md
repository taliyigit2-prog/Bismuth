# Bismuth — Başlangıç Rehberi (Antigravity)

> Bu depo **Antigravity** tarafından yönetilmektedir. Tam ve bağlayıcı kurallar [`ANTIGRAVITY.md`](ANTIGRAVITY.md) içindedir.
> Belgeler ve sahiple yazışma **Türkçe**; kod, tanımlayıcılar ve commit mesajları **İngilizce**.

## 1. Ürün Özeti

Bismuth, küçük ve orta oteller için **çevrimdışı çalışan masaüstü otel yönetim programı**dır (Electron 37 + React 19 +
TypeScript + Tailwind v4 + shadcn/ui + SQLite `better-sqlite3` + Drizzle + Hono sunucu modu + Python kamera yan süreci `otel-kamera/`).
Arayüz Türkçe / İngilizce / Rusça. İlk müşteri 19 odalı bir İstanbul otelidir; otele özgü her kural koda değil **ayara** yazılır.

## 2. Okuma Sırası

1. [`ANTIGRAVITY.md`](ANTIGRAVITY.md): 15 yasak, katmanlar, komutlar, git akışı. **Bağlayıcı.**
2. [`docs/gelistirici/README.md`](docs/gelistirici/README.md): derleme, test, klasör haritası, tarifler, §10 bilinen tuzaklar.
3. [`docs/plan/03-mimari.md`](docs/plan/03-mimari.md): mimari, veri modeli ve §6 iş kuralları.
4. Alan kuralları ve beceriler: `.agent/rules/` (`db.md`, `ui.md`, `ipc.md`, `testing.md`, `camera.md`) ve `.agent/skills/`.

## 3. Kırmızı Çizgiler (Özet; Tam Metin `ANTIGRAVITY.md`)

1. **İnternet şartı yok.** Ağ kodu yalnız 5 klasörde: `src/main/network/`, `src/main/server/`, `src/main/discovery/`, `src/main/camera/` (yalnız `127.0.0.1`, `rtsp://`, özel IP keşfi), `src/renderer/lib/transport/`. Font ve kaynaklar paket içinde.
2. **Telemetri, otomatik güncelleme, lisans sunucusu, OTA/kanal yöneticisi, e-Fatura kesme yok.**
3. **Para tam sayı kuruş (`amount_minor` + `currency`):** çarpma/bölme yalnız `src/shared/money.ts`.
4. **Yetki servis katmanında (`ctx` + `requirePermission`).**
5. **Kullanıcıya görünen her metin i18n anahtarı** (`npm run i18n:add -- <spec.json>`, mantıksal CSS `ms-`/`me-`/`text-start`).
6. **Commit edilmiş migrasyon (`drizzle/*.sql`) değişmez;** yeni numaralı migrasyon: `npm run db:generate -- --name <ad>`.
7. **İş verisi silinmez** (`voided_at`/durum + `audit_log`; istisnalar: biyometrik veri K-52 ve `03-mimari.md` §4.8b'deki türetilmiş satırlar).
8. **Tek yazıcı:** yazma işlemleri yalnız sunucu/tek-bilgisayar servislerinde; istemci kopyası salt-okunurdur.
9. **Gizli veri depoya girmez:** KBS/kimlik listesi, T.C. kimlik no, yüz görüntüsü/vektörü, model ağırlığı, `.env`, RTSP şifresi, Telegram token'ı yasak.
10. **GitHub Actions tetiklenmez:** `gh workflow run`, `gh release create`, `git tag v*` yasak; sürümü sahip başlatır.

## 4. Korumalar ve Git Akışı

- Araç kancası: `.agent/hooks.json` → `.agent/hooks/pre-tool-use.mjs` (`scripts/guards/` korumalarını çalıştırır).
- Git kancaları: `.githooks/pre-commit` ve `.githooks/pre-push` (`scripts/guards/` kullanır; `--no-verify` yasak).
- Her iş için `antigravity/<kısa-konu>` dalı açın; `main`'e push etmeyin; `git add -A` yerine açık dosya yolları kullanın.
- Sahip Mac'i bellek kısıtlıdır: ağır işleri (`npm run check`, `npm run build`, e2e) tek tek ve sırayla çalıştırın.
- Bitince: sade Türkçe, kısa cümle, numaralı adımlar (ne değişti, ne denendi, ne denenmedi).
