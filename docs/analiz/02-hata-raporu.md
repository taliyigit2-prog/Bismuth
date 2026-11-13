# 02 — Hata raporu

> Hazırlayan: Fable (2026-11-12). Kaynaklar: baz kontroller (§1), kod izi (`03-resepsiyon-geri-bildirimi.md`), gerçek
> uygulamada akış testi (`flow-tester`, ~410 öğe, sahip + resepsiyon rolü, masaüstü 1440×900 + telefon 390×844; rapor
> özeti §3, görüntüler `ekler/akis/`), ekran denetimi (`05-ekran-ve-tam-ekran-uyumu.md`), belge tutarlılığı (§5), kurulum
> (`07-…`), ajan sistemi (`09-…`), kamera kodu (`06-…` §7, `ekler/kamera-kod-bulgulari.md`, 28 madde — burada tekrar yok).
> Her bulgu: önem · etki · kanıt · çözüm · büyüklük · paket. Satır numaraları 2026-11-12 koduna aittir.

## 1. Baz kontroller (Codespace, 2 çekirdek)

| Kontrol | Sonuç | Not |
|---|---|---|
| `npm run typecheck` | ✓ | üç tsconfig (node, web, e2e) |
| `npm run lint` | ✓ | |
| `npm test` | ✓ **2427/2427 test, 277 dosya** | 1285 s (yük altında; boş makinede ~9 dk). Çalışma sırasında tek "FAIL" satırı, yardımcı ajanın geçici `zz-repro-tmp.test.ts` dosyasının koşu bitmeden silinmesinden; gerçek hata değil |
| `npm run format:check` | ✓ (düzeltme sonrası) | `otel-kamera/` iki dosyada takılıyordu → `.prettierignore`'a `otel-kamera` eklendi (Python projesi) |
| `node .claude/hooks/test-hooks.mjs` | ✓ 89/89 | önce 73/73; yeni kancalarla 89 |
| `npm run build` | ✓ 13,6 s | |
| `npm run check` | ✓ (2026-11-12, oturum sonu) | typecheck + lint + format:check + 2427 test; `.claude/.checks-passed` yazıldı |
| e2e | 1. oturum: koşulmadı (Electron `libgtk-3`/`xauth` eksikliğiyle açılmıyordu; devcontainer düzeltildi). **2. oturum (2026-11-12, 4 çekirdek):** Electron `xvfb-run -a` ile açıldı; `flow-tester` doğrulama ve modül turlarını **gerçek Electron'da** koştu | tam `npm run e2e` koşusu P18a kabulünde |

## 2. Mantık hataları, yarım akışlar, çalışmayan öğeler (koddan ve gerçek uygulamadan)

| # | Önem | Bulgu | Etki | Kanıt | Çözüm | Büyüklük | Paket |
|---|---|---|---|---|---|---|---|
| H-01 | **Kritik** | Girişten sonra vazgeçen misafir için akış yok: `in_house` menüde yalnız pasif satır, `checked_out`'ta üç nokta hiç yok, iade resepsiyona kapalı | Resepsiyon "iptal edilmiyor" diye bildirdi; para iadesi kayıt dışı kalıyor | akış A4, A8, A10; `reservation-panel.tsx:134,148,222,267`; `reservations-service.ts:737`; `permissions.ts:58` | "Vazgeçme ve iade" akışı (03 §2), `undoCheckIn`, kapalı rezervasyonda menü | M | P17a |
| H-02 | **Yüksek** | İptal/çıkış pencereleri tahsilatı göstermiyor; kaporalı iptalden sonra bakiye −₺1.500 kırmızı kalıyor, "iade gerekir" bildirimi yok; defterde kapora satırı oda "—" ile duruyor | "Tam çıkmıyor" algısı; iade unutulur | akış B2–B5, A7; `stay-dialogs.tsx:258`; `endReservation` ödemeye dokunmaz | İptal penceresinde tutar + üç seçenek; panelde "İade bekliyor" rozeti; defterde iptal rozeti | S | P17a |
| H-03 | **Yüksek** | Aynı gün ikinci tur çıkışında gece yuvası kilitli kalıyor: misafir çıktı, oda o gece satılamıyor; çıkış penceresi "oda o gece yeniden satılabilir" diyor (yanlış) | Butik otelde gelir kaybı; resepsiyon madde 4 | akış C(iii), bulgu 3; `reservations-service.ts:1388-1421`; repro betiği C | Gece satırını `day` yuvasına saat aralığıyla çevir (P17d); kısa vadede pencere metni koşula göre | S (metin) / L (model) | P17d |
| H-04 | **Yüksek** | Telefonda tarih seçici popover 447 px > 390 px; Pazar sütunu ~19 px görünür, seçilemez gibi | Telefonda rezervasyon tarihi seçilemez (haftanın bir günü) | akış telefon; `ekler/akis/P-06-telefon-tarih-secici-tasma.png` | Popover `max-w-[calc(100vw-1rem)]`, takvim hücre genişliği vw'ye göre; telefonda alt sayfa seçici | S | P18d |
| H-05 | **Yüksek** | Telefon numarası maskesi `+90`/`0` ile başlayan girişi bozuyor (`+90 532 123 45 67` → `905 321 23 45 67`; kartta `+90 905 320 00 00 00`) | Misafir telefonları yanlış kaydedilir; kara liste eşleşmesi (telefonla) bozulur | akış G3/G4b | Ülke kodu/baş sıfır ayıklama, yapıştırma ayrıştırma; birim test 6 biçim | S | P17e |
| H-06 | Orta | Çıkış penceresinde "aynı gün ücreti" alanı gece fiyatıyla dolu; 0 yazılınca toplam ₺0 ve bakiye −kapora; onay yok; gündüz yuvası doluysa alan geçersiz ama gösteriliyor | Yanlış ücret / sessiz sıfırlama | akış A6–A7, C3d; `reservations-service.ts:1408-1410` | Varsayılan `dayUse` fiyat ayarından; 0 için onay; yuva doluysa alanı gizle ve sonucu yaz | S | P17d |
| H-07 | Orta | Yeni rezervasyonda misafir adı 300 harf kabul ediliyor; panel başlığı taşıyor; `blacklist.check` ve `guests.duplicates` **HTTP 400** | Bozuk kayıt, gereksiz hata | akış R3; `forms.console.log` | Ad uzunluk sınırı (zod `max(120)`) + alan altı hata; istemci uzun adda sorguyu kesmesin | S | P17e |
| H-08 | Orta | Gecelik fiyat alanı `-500`, `99999999999` değerlerini gösterip toplamı sessizce eski değerde bırakıyor; `abc` sessizce geri alınıyor; `0` ile ₺0 rezervasyon | Fiyat hatası fark edilmez | akış R4 | Alan altı hata metni; 0 için onay; üst sınır | S | P17e |
| H-09 | Orta | Resepsiyon rolünde `/settings?tab=hotel` adresi: yetkisiz sekme adı listede beliriyor, gövde "yetkiniz yok" | UI tutarsızlığı (yetki servis katmanında korunuyor, doğru) | akış rec2 | Sekme listesini yetkiye göre süz; bilinmeyen `tab` → ilk izinli sekme | S | P17e |
| H-10 | Orta | Takvim 1280×720/1366×768'de üç kaydırma çubuğu, 19 odanın 9–12'si görünür; rezervasyon paneli 1280×720'de ızgaranın çoğunu örtüyor | Küçük ekranlı otel bilgisayarında takvim rahat değil | 05 §3 #1–2 | Sayfa tam yükseklik, tek kaydırma; panel genişliği | M | P18b |
| H-11 | Orta | Tam ekran durumu hatırlanmıyor; F11 yok; menü Windows/Linux'ta gizli → tam ekran bulunamıyor; zoom kalıcı değil | "Her bilgisayarda tam ekran" hedefi karşılanmıyor | 05 §3 #8–10; `window-state.ts`, `menu.ts:36-40` | F11/Ctrl+Shift+F, `isFullScreen` kaydı, `ui.zoom` | S | P18c |
| H-12 | Orta | Grup rezervasyonu / toplu giriş yok; sağ tık ve çift tık (boş hücre) hiçbir şey yapmıyor | Resepsiyon madde 2 | akış E, D; `calendar-grid.tsx` (onContextMenu yok) | P17b, P17c | L/M | P17b, P17c |
| H-13 | Düşük | Telefon gün listesinde çıkış yapmış misafir "Gidenler"de "Ödenmedi" rozetiyle; "çıkış yaptı" bilgisi yok | Yanıltıcı rozet | akış P8 | Durum rozeti `done` → "Çıkış yaptı" | S | P21e |
| H-14 | Düşük | Telefonda Ayarlar radyoları 16×16, görev anahtarları 32×18 (<44 px) | Dokunma zorluğu | 05 §3 #4 | Satır tıklanabilir, min-h 44 | S | P18b |
| H-15 | — | ~~`?` kısayolu listeyi açmadı~~ **Doğrulandı, hata değil** (2026-11-12, gerçek Electron): odak gövde/ızgara/düğmedeyken `?` ve F1 listeyi açıyor (takvim, bugün, defter, misafirler, ayarlar); yazı alanı odaktayken ve diyalog açıkken bilerek susuyor (`use-global-shortcuts.ts`). İlk turdaki gözlem Playwright `press('Shift+/')`'in `key="/"` üretmesinden | — | `.tmp` doğrulama raporu §2 | — | — | — |
| H-16 | Düşük | ~~Telefon ledger sheet'i Esc ile kapanmadı~~ **Çürütüldü** (2026-11-12, telefon 390×844): "Gider ekle"/"Ödeme ekle" sheet'inde 44×44 Kapat (X), Vazgeç, Esc ve dışa dokunma dördü de kapatıyor. Kalan pürüz: **tarayıcı geri tuşu sheet'i kapatmıyor** | Küçük (telefonda geri tuşu alışkanlığı) | `.tmp` doğrulama raporu §3 | Sheet açıkken `history.pushState` + `popstate` ile kapatma | S | P21e |
| H-17 | Düşük | 2×/3× zoom'da araç çubuğu düğmeleri üst üste biniyor | Nadir | 05 #7 | Zoom üst sınırı 1.5 ya da katlanan araç çubuğu | S | P18c |
| H-18 | Düşük | 1–2 gecelik çubuklarda ad "…" ile kısalıyor (her çözünürlükte) | Okunabilirlik | 05 #3 | Gün sütunu genişliği çözünürlüğe göre | S | P18b |

**Çalıştığı doğrulananlar (akış testi):** takvim araç çubuğu (bugün, ok, ay/yıl, tarihe git, misafir ara, boş oda, toplu not,
yeni rezervasyon), panel düğmeleri, sürükle-bırak (dolu odaya 409 + anlaşılır toast; Esc iptal), kısayollar N/T/"/"/Ctrl K/F1/ok
tuşları, çok odalı rezervasyon (oda başına giriş/çıkış/iptal menüsü), çift kayıt uyarısı ve birleştirme yolu, Otelde kalanlar
(yazdır, kişi ekle, KBS işaretleri), Misafirler, Bugün bağlantıları, Genel/Görünüm ayarları (dil anında değişiyor), telefon gün
listesi ve alt gezinme, resepsiyon rolünde menü/adres/API yetki denetimleri (403'ler doğru). `pageerror` yok.

## 3. Test edilmemiş kritik yollar (kapsam boşlukları)

| Yol | Durum | Eklenecek test | Paket |
|---|---|---|---|
| `in_house` iken iptal reddi (`guestInHouse`) | servis testi yok | `reservations-service.test.ts` | P17a |
| `in_house` / `checked_out` panel menüsü | UI testi yok | `reservation-panel.test.tsx` durum × menü matrisi | P17a |
| 1 gecelik aynı gün çıkış, ikinci tur (C), iki gündüz kullanımı | yok | repro betiği (`ekler/resepsiyon-repro.test.ts.txt`) beklenen davranışa çevrilir | P17d |
| İptal sonrası ızgara ve park alanı | **Doğrulandı:** `grid.test.ts:106` iptal ve park edilen rezervasyonun ızgarada olmadığını kapsıyor (`grid.ts:63` `ON_GRID` süzmesi); gerçek Electron'da iptal/gelmedi onayından <40 ms sonra çubuk kalkıyor, park alanına düşmüyor, misafir kartı geçmişinde kalıyor | — (kapsam var) | — |
| Telefon tarih seçici genişliği | e2e yok | mobil e2e viewport ölçümü | P18d |
| Telefon alanı maskesi | yok | 6 biçim birim testi | P17e |
| Pencere durumu (tam ekran/maximize) | `window-state` testi yalnız sınırlar | `isFullScreen` kaydı | P18c |
| Gerçek Electron e2e Codespace'te | ortam eksikti | devcontainer düzeltmesiyle `npm run e2e` yeniden yeşil olmalı | P18a |

## 4. Yetki ve güvenlik (bu turda)

Akış testinde yetki denetimleri temiz (resepsiyon: `settings.set`, `roles.list`, `staff.listEmployees`, `audit.list` → 403;
menü ve adres korumaları doğru). Yeni risk yüzeyi yalnız kamera entegrasyonunda (06 §5); Faz 13 güvenlik incelemeleri (K-45,
P13sec/P13sec2) bu turda tekrarlanmadı → "Son" dalgasında `security-reviewer`.

## 5. Karar / gereksinim / belge çelişkileri

| # | Çelişki | Kanıt | Çözüm | Paket |
|---|---|---|---|---|
| Ç-01 | Hafta sonu tanımı: fiyat varsayılanı Cuma + Cumartesi (K-44, `03-mimari.md:362`) ↔ takvim vurgusu Cumartesi + Pazar (G-40, `03-mimari.md:95`) | belgeler | Bilinçli ayrım ise K-44 detayına tek cümle; değilse sahibe soru (00-ozet S-119 önerisi) | P19b (belge) |
| Ç-02 | G-03 "terminal gerekmez" ↔ `docs/kurulum.md:257` `xattr` komutu | belge | Komut kaldırılır | P19b |
| Ç-03 | K-44 metni "oda bu gece yeniden satılabilir" ↔ kod ikinci turda satmıyor (H-03) | kod | P17d | P17d |
| Ç-04 | `05-sorular.md` S-06 "TR, EN, RU, AR" ↔ K-20 Arapça ertelendi | belge | S-06 satırına not | P19b |
| Ç-05 | `akislar.md` check-in/check-out/iptal/iade akışlarını içermiyor; kılavuzda var | belge | akislar.md'ye "programdaki karşılığı" satırları | P19b |
| Ç-06 | CLAUDE.md "YURUTME.md sıkıştırmadan sonra önce okunur" ↔ hiçbir kanca/beceri okumuyordu | `.claude` | düzeltildi (session-context, /orkestra) | ✅ |
| Ç-07 | `parallel-build` model tablosu ↔ ajan dosyaları | `.claude` | düzeltildi (tek kaynak) | ✅ |
| Ç-08 | `AI_GELISTIRICI_NOTLARI.md` `guest_face_profiles`, watchdog, `.env.example`, ByteTrack ↔ kodda yok | otel-kamera | belge kodla eşitlenir | P20a |
| Ç-09 | Gereksinim G-37 "ayrı fiyat yok" ↔ resepsiyon ihtiyacı | 03 §5 | G-196 eklendi, G-37 notu | ✅ |

## 6. Veri kaybı riski
Bu turda veri kaybı yaratan hata bulunmadı. Riskli yerler plan paketlerinde korunur: migrasyon 0019/0020 indeks
değişikliği (`db-migration-builder` testleri), biyometrik verinin bilinçli silinmesi (K-52, audit ile), profil taşıma
(P21a, yedek zorunlu). `ekler/kamera-kod-bulgulari.md` §3-8/17'deki kamera tarafı kayıp riskleri (bakım temizliği yarışı,
serbest biçimli çıkış tarihiyle anında pasifleştirme) P20a'da kapanır.
