# 05 — Ekran ve tam ekran uyumu

> Hazırlayan: Fable (2026-11-12). Ölçüm: `screen-auditor` ajanı gerçek Electron penceresinde (Xvfb 3840×2160, `out/`
> derlemesi, 19 odalı yoğun örnek veri) ~111 görüntü ve `metrics.jsonl` (`.tmp/screen-audit/`, depoya girmez). Seçili
> görüntüler: `docs/analiz/ekler/ekran/` (9 PNG). Kod incelemesi: `src/main/windows/main-window.ts`,
> `src/main/app/window-state.ts`, `src/main/app/menu.ts`, `src/renderer/lib/shortcuts/registry.ts`.

## 1. Kapsam ve yöntem

| Boyut | Ölçek | Tema | Dil | Ekranlar |
|---|---|---|---|---|
| 1366×768 | 1 | açık | tr | **27 route'un tamamı** |
| 1280×720, 1440×900, 1536×864, 1920×1080, 2560×1440 | 1 | açık + koyu | tr, en, ru | calendar, today, settings, ledger, guests, in-house, reports |
| 1536×864 (Windows %125), 2560×1440 (%150) | 1.25, 1.5 (`--force-device-scale-factor`) | açık + koyu | tr, ru | aynı 7 ekran |
| 3840×2160 (4K) | 1 | açık | tr | calendar, today |
| 1280×720 | zoom 1.25 / 1.5 / 2 / 3 (`setZoomFactor`) | açık | tr | calendar, settings |
| Telefon 390×844 | — | açık + koyu | tr, ru | calendar, today, guests, ledger, settings, in-house, reports, rooms, tasks |

Ölçümler (her kombinasyonda `page.evaluate`): yatay taşma (`scrollWidth > clientWidth`), `overflow:hidden` + kesilen
metin, viewport dışına taşan etkileşimli öğe, üst üste binen etkileşimli öğeler, telefonda 44×44 px altı hedefler;
24 masaüstü diyalog/menü açma + Esc; pencere davranışı (`minWidth/minHeight`, `setFullScreen`, kapat-aç `window-state.json`).

**Ortam notu (kurulum bulgusu):** Electron bu Codespace'te `libgtk-3` eksikliğinden açılmıyordu ve `xvfb-run` `xauth`
olmadığı için çalışmıyordu; ajan kütüphaneleri kök yetkisi olmadan `/tmp` altına açtı. `.devcontainer/devcontainer.json`
bu dalda düzeltildi (`xauth libgtk-3-0 libnss3 libasound2t64 libxss1`). Yeni Codespace'te e2e ve ekran görüntüsü
komutları bu düzeltmeyle çalışır (**doğrulandı 2. oturumda, 2026-11-12:** Electron `xvfb-run -a` ile açıldı, akış testleri gerçek
Electron'da koştu; tam `npm run e2e` koşusu P18a kabulünde).

## 2. Genel sonuç

**Hiçbir kombinasyonda yatay taşma, viewport dışına taşan öğe ya da açılmayan diyalog yok.** 22/24 diyalog açıldı ve
Esc ile kapandı (kalan ikisi diyalog değil satır içi öneri düğmesi). Telefonda yatay taşma yok. Program 1280×720'den
4K'ya, %100–%150 ölçekte ve üç dilde **kullanılabilir**; bulgular Orta ve Düşük. Kritik/Yüksek bulgu yok.

## 3. Bulgular

| # | Önem | Ekran / kombinasyon | Bulgu | Ölçüm / kanıt | Önerilen çözüm | Paket | Büyüklük |
|---|---|---|---|---|---|---|---|
| 1 | Orta | Takvim 1280×720 ve 1366×768 | **Üç kaydırma çubuğu** aynı anda (sayfa dikey + ızgara dikey + ızgara yatay); 19 odadan 1280×720'de 9'u, 1366×768'de ~12'si görünür; araç çubuğu iki satır (RU'da da) 170 px yiyor | ızgara 464 px (sayfa 998 px, vh 720); `ekler/ekran/calendar-1280x720-1-light-ru.png`, `calendar-1366x768-1-light-tr.png` | Takvim sayfası `h-screen` düzeni: başlık + araç çubuğu tek satır (daraltılabilir), ızgara kalan yüksekliği alır, sayfa kaydırması kalkar; "Sık işlemler" düğmeleri menüye (P17c ile uyumlu) | P18b | M |
| 2 | Orta | Rezervasyon paneli 1280×720 | Panel 672 px genişlik, tam yükseklik; bugün sütunu dahil ızgaranın çoğunu örtüyor; içerik panel içinde kayıyor (979/720), üç ana düğme ilk görünümde aşağıda | `calendar-panel-1280x720-1-light-tr.png` | Panel genişliği `min(560px, 45vw)`; başlıkta Giriş/Ödeme/Çıkış düğmeleri sabit üstte (P17c); panel açılınca ızgara seçili odaya kaydırılır | P18b (+P17c) | S |
| 3 | Düşük | Takvim, tüm çözünürlükler | 1–2 gecelik çubuklarda misafir adı "…" ile kısalıyor (3–23 öğe/ekran; 2560×1440'ta 16) | span 74/38 px; `calendar-2560x1440-1-light-tr.png` | Gün sütunu genişliği `--tape-day` çözünürlüğe göre otomatik (1920+ için 72 px); tek gecelikte baş harf + soyad; hover/odakta tam ad (aria-label zaten tam) | P18b | S |
| 4 | Düşük | Telefon 390×844 settings, tasks, today (RU) | 44 px altı hedefler: tema/yoğunluk radyoları 16×16 (9 öğe), görev anahtarları 32×18 (2–4), RU today 2 öğe | metrics.jsonl | Radyo/anahtar etiketleri tıklanabilir satır (min-h 44) içine; `components/ui/radio-group` telefon varyantı | P18b | S |
| 5 | Düşük | Tüm ekranlar 768 px yükseklik | Yan menünün alt grupları (Raporlar, Sistem) kaydırmadan görünmüyor; menüde ayrı kaydırma çubuğu | `today-1366x768-1-light-tr.png` | Yoğun kenar çubuğu: grup başlıkları daraltılabilir, 768 px altında `ui.density=compact` otomatik | P18b | S |
| 6 | Düşük | Bugün / Kılavuz / Ayarlar 768 px | Belge kaydırması + iç kaydırma birlikte; yedek uyarısı ~140 px; kılavuz kartları 3 satıra kesik (line-clamp, kasıtlı) | `guide-1366x768-1-light-tr.png` | Yedek uyarısı tek satır (ayrıntı tıklayınca); sayfa içi tek kaydırma alanı | P18b | S |
| 7 | Düşük | Zoom 2× ve 3× (1280×720) | Üst üste binen etkileşimli öğeler (takvim araç çubuğu 6–7, ayarlar 5); 1.25×/1.5× temiz | metrics.jsonl zoom satırları | Zoom üst sınırı 1.5 (menü `zoomIn` sınırı `setVisualZoomLevelLimits`/kendi sınırımız) ya da araç çubuğunun 2×'te menüye katlanması | P18c | S |
| 8 | Orta | Pencere | **Tam ekran durumu hatırlanmıyor**: tam ekranda kapatınca normal sınırlar saklanır, yeniden açılış pencere modunda; `maximized` saklanıyor (kod) | window.json; `window-state.ts:trackWindowState` yalnız `close` | `isFullScreen()` de saklanır ve açılışta uygulanır; durum taşıma/boyut değişiminde 500 ms debounce ile de yazılır (çökmede kaybolmasın) | P18c | S |
| 9 | Orta | Pencere | **F11 kısayolu yok**; tam ekran yalnız menü rolü, menü Windows/Linux'ta gizli (`autoHideMenuBar`, Alt ile açılır) → kullanıcı tam ekranı bulamaz | `app/menu.ts:40`, `registry.ts` (F11 yok), grep `globalShortcut` boş | `before-input-event` ile F11 ve `Ctrl/Cmd+Shift+F`; kısayol listesine ekle; ilk açılış turunda ipucu | P18c | S |
| 10 | Düşük | Pencere | Yakınlaştırma (Ctrl +/−) kalıcı değil; her açılışta 100 % | `menu.ts:36-38` roller; `zoomFactor` kodu yok | `ui.zoom` kişisel ayar (IPC ile uygulanır, HTTP'den değil, K-37); Görünüm ayarında seçici | P18c | S |
| 11 | Bilgi | Pencere | Çoklu monitör: yalnız "kayıtlı konum bir ekranla kesişiyor mu" denetimi; monitör çıkarılınca OS yerleşimine düşer (makul) | `window-state.ts` loadWindowState | `screen.getDisplayMatching` ile en yakın ekranın çalışma alanına sığdır (isteğe bağlı) | P18c | S |
| 12 | Bilgi | Pencere | `minWidth 960 / minHeight 600` çalışıyor; 960×600'de yatay taşma yok; ikinci pencere yok | window.json | — | — | — |
| 13 | Düşük (çürütüldü) | Telefon ledger | **Doğrulandı 2026-11-12:** "Gider ekle"/"Ödeme ekle" sheet'inde 44×44 Kapat (X), Vazgeç, Esc ve dışa dokunma dördü de kapatıyor; yatay taşma 0. Kalan: tarayıcı/telefon **geri tuşu** sheet'i kapatmıyor | `.tmp/flow-tester/verify/` §3 | Sheet açıkken `pushState` + `popstate` ile kapat | P21e | S |

Denenemeyenler (pencere yöneticisi yok): gerçek `maximize`, F11 ve Ctrl +/− tuşlarının OS düzeyinde etkisi, çoklu
monitör, gerçek DPI, macOS Retina. Bunlar P18c kabulünde kod incelemesi + birim test ve sahip onay paketinde gerçek
cihaz denemesi (S-80) ile kapanır.

## 4. Pencere ve tam ekran: mevcut davranış (kod)

| Konu | Bugün | Kaynak |
|---|---|---|
| Varsayılan boyut | 1366×820; min 960×600; `show: false → ready-to-show` | `main-window.ts` |
| Durum kaydı | yalnız `close` olayında `getNormalBounds()` + `isMaximized()`; `userData/window-state.json`; konum yalnız bir ekranla kesişiyorsa geri yüklenir | `window-state.ts` |
| Tam ekran | menü rolü `togglefullscreen`; kısayol yok; durum saklanmaz | `menu.ts:40` |
| Zoom | menü rolleri; kalıcı değil; DPI özel kodu yok (Chromium) | `menu.ts:36-38` |
| Yazı boyutu | `ui.fontSize` normal/%112,5/%125 (rem ölçeği) — ölçekle birlikte çalışır | `settings.ts:78` |
| Kısayollar | renderer'da 15 kısayol; Electron `globalShortcut` yok (doğru: yalnız pencere odaklıyken) | `registry.ts:47` |

## 5. Her düğme, menü, sekme, form — akış testi kapsamı

Ekran denetimi 24 diyalog/menüyü açtı. Tam etkileşim taraması (`flow-tester`, her düğme/sekme/form geçerli + geçersiz
veriyle) üç turda yapıldı; bulgular `02-hata-raporu.md` §2 (H-01…H-47) ve paketler P17e/P18b/P18d/P21b/P21e.

| Tur | Ortam | Modüller (route) | Öğe | Sonuç |
|---|---|---|---|---|
| 1 (2026-11-12) | mobil harness (HTTP taşıma) 1440×900 + 390×844, sahip + resepsiyon | `/calendar` (araç çubuğu, panel, sürükle-bırak, kısayollar, çok odalı, çift kayıt), `/in-house`, `/guests`, `/today`, `/settings` Genel/Görünüm, telefon gün listesi + alt gezinme, resepsiyon rolü yetki denetimleri | ~410 | H-01…H-18 |
| 2 doğrulama (2026-11-12) | **gerçek Electron** `xvfb-run` + telefon | iptal/gelmedi → ızgara, `?` kısayolu, telefon defter sheet'i | 3 madde | hepsi doğrulandı/çürütüldü (02 H-15, H-16) |
| 2 grup 1 (2026-11-13) | gerçek Electron 1440×900 + telefon 390×844, sahip | `/ledger`, `/reports`, `/month-end`, `/shift`, `/currency`, `/companies`, `/contacts`, `/tourism`, `/audit` | ~180 | H-19…H-32 (3 Orta, 11 Düşük) |
| 2 grup 2 (2026-11-13) | gerçek Electron + telefon emülasyonu, sahip + resepsiyon + temizlik | `/rooms`, `/tasks`, `/maintenance`, `/issues`, `/lost-items`, `/laundry`, `/supply`, `/staff`, `/blacklist`, `/calendar-notes`, `/settings` (tüm diğer sekmeler), `/about`, `/guide`, `/change-password`, `/lock`, `/login`, `/recover`, `/connect`, `/setup` (12 adım, temiz klasör); EN/RU artık metin taraması (26 rota, 15 diyalog) | ~770 | H-33…H-47 (4 Orta, 11 Düşük) |

Kapsam: `router.tsx`'teki 33 route'un tamamı (`/theme-preview` geliştirici ekranı hariç) en az bir turda tıklanarak denendi.
Denenemeyenler (ortam): gerçek yazdırma penceresi (`window.print` çağrısı doğrulandı), dosya seçici gerektiren geri
yükleme/içe-dışa aktarma, gerçek ağ keşfi ve ana bilgisayara bağlanma, gerçek telefon donanımı, Mac. Bunlar sahip onay
paketinde (S-80) ve "Son" dalgasında.

## 6. Öneri özeti (Faz 18)
- **P18a** çoklu boyut ekran görüntüsü betiği + ölçüm JSON (bu denetimin betikleri `.tmp/screen-audit/shot.mjs`,
  `lib.mjs`, `analyze.py` temel alınır; `scripts/ui-shot.mjs`'e `--size/--scale/--langs/--metrics` eklenir).
- **P18b** düzen: takvim sayfası tam yükseklik tek kaydırma, panel genişliği, ad kısaltma, telefon hedefleri, kenar çubuğu.
- **P18c** pencere: F11/Ctrl+Shift+F, tam ekran + zoom hatırlama, debounce kayıt, zoom üst sınırı, çoklu monitör sığdırma.
- **P18d** akış testindeki çalışmayan öğeler.

## 7. 21st.dev görsel geliştirme — **güncelleme 2026-11-13:** sahip ücretli üyelikle kullanılmasını istedi (S-118, K-60); bağlantı
## kuruldu ve seçimler `12-21st-tasarim-secimi.md`'de. Aşağısı ilk değerlendirmedir (araştırma `ekler/kamera-kaynaklar.md` §D).

- **Ne sunuyor:** shadcn/ui uyumlu React + Tailwind bileşen kataloğu (12.000+), shadcn CLI ile kurulum; "21st MCP"
  (eski Magic MCP) barındırılan sunucu `https://21st.dev/api/mcp`, hesap + API anahtarı ister; ücretsiz planda bileşen
  alma günde 2; bileşen lisansı yazara göre değişir (bazıları "unknown"); ticari kullanım şartlarda açık değil.
- **Projeyle uyum:** Bileşenler shadcn/Radix tabanlı olduğu için teknik olarak uyumlu; ama (1) her bileşenin lisansı tek
  tek kontrol edilmeli, (2) dış font/CDN/Framer Motion gibi bağımlılıklar yasak 1 ve `deps-guard` ile çatışabilir,
  (3) metinler i18n'e, renkler CSS değişkenlerine, sınıflar mantıksal CSS'e çevrilmeli, (4) MCP bir bulut hizmetidir
  (geliştirme aracı; uygulamaya girmez — yasak 4 ihlali değil ama sahip onayı ister).
- **Değerlendirme:** Bismuth'un 30 ekranı zaten shadcn ile ve tutarlı; bu aşamada ihtiyaç **düzen düzeltmeleri**
  (yukarıdaki tablo), yeni bileşen değil. 21st.dev yalnız iki yerde fayda sağlayabilir: takvim araç çubuğu için
  "command bar / toolbar" kalıpları ve portföy özeti (Faz 21) için istatistik kartları. **Öneri: şimdilik kullanılmasın
  (S-118 varsayılanı); Faz 21'de kart tasarımı için sahip isterse denenir.**
- **Kurulum (isterse), adım adım:**
  1. https://21st.dev/mcp → hesap aç → API anahtarını kopyala.
  2. GitHub → profil → Settings → Codespaces → **New secret**: ad `API_KEY_21ST`, değer anahtar, depo olarak Bismuth seç.
  3. Codespace'i durdurup yeniden başlat (secret ortam değişkeni olarak gelir; `echo ${API_KEY_21ST:+var}` ile kontrol).
  4. Depodaki `.mcp.json` zaten hazır (anahtar yok, `${API_KEY_21ST}` başvurusu; başlık `x-api-key` — resmî README ile
     **doğrulandı**, `.mcp.json` değişmedi; Claude Code `headers` içinde `${VAR}` genişletmesini destekler, resmî belge
     code.claude.com/docs/en/mcp). Claude Code ilk açılışta proje MCP sunucusunu onaylamanı ister. Alternatif resmî
     kurulum: `npx @21st-dev/cli@latest init --client claude`. Ücretsiz planda günde 2 bileşen alma sınırı var
     (ayrıntı `ekler/kamera-kaynaklar.md` §D).
  5. Ajanlar yalnız görev metninde "21st.dev'den kalıp ara" yazıyorsa kullanır; alınan her bileşen lisans + bağımlılık
     + i18n + CSS değişkeni dönüşümünden geçer ve `ui-reviewer` onayı alır.
