# Akış testi C+D — son kontrol (2026-11-14)

Kapsam: takvim, rezervasyon, grup, misafir, ayarlar, giriş, raporlar, turizm, portföy, döviz, yedek, aktarma, uzaktan, telefon.
Ortam: `npm run build` bir kez; Playwright tek tek, `--workers=1`; kendi betiklerim `.tmp/son/flow-*.spec.ts`
(`.tmp/son/playwright.config.ts`, E2E_PORT=47592, masaüstü 1366x768 ve telefon 390x844, Chromium + HTTP harness). Kaynak dosya düzenlenmedi.

## (a) Mevcut e2e sonuçları

Telefon projesi: 26 spec, 24 geçti. Electron projesi: 41 spec, 32 geçti. Kırmızılar bir kez yeniden koşuldu; hepsi aynı şekilde kaldı (kararsız değil).
Ham kayıt: `.tmp/son/e2e-mobile.tsv`, `.tmp/son/e2e-electron.tsv`, `.tmp/son/rerun.tsv`, günlükler `.tmp/son/log-*.txt`.

| spec | proje | sonuç | yeniden koşu | neden / yorum |
|---|---|---|---|---|
| shell.spec.ts (ayarlarda 44 px) | mobile | KALDI | aynı | Test eskimiş: `getByRole('button',{name:'Kaydet'})` artık 2 düğmeye uyuyor (`hotel-save` ve `fees-save` "Ücretleri kaydet"). Ürün hatası değil. |
| wrap.spec.ts (2 test) | mobile | KALDI | aynı | `tests/e2e/long-text.ts:67` `shift.saveHandover` için 5000 karakter yolluyor, sözleşme sınırı 2000 -> VALIDATION. Yardımcı eskimiş; taşma turu şu an hiç çalışmıyor (önemli kapsam boşluğu). İlk koşudaki 184 sn zaman aşımı benim eşzamanlı koşumdan; temiz koşuda da aynı doğrulama hatası. |
| backup.spec.ts | electron | KALDI | aynı | `backup-item` 1 yerine 5. Neden: gerçek Google Drive klasörü (bulgu B1). |
| fees.spec.ts | electron | KALDI | aynı | Yazdırma düzeninde `print-root` 703 px'te 26 px taşıyor (satır 115). Aynı ekran HTTP/Chromium'da 703 px'te 0 taşma; Electron/macOS'a özgü olabilir, doğrulanmadı. |
| full-day.spec.ts | electron | KALDI | aynı | Test eskimiş: kurulum sihirbazına `hourly` ve `camera` adımları eklenmiş, test sırayı bilmiyor. |
| setup.spec.ts (tr, ru) | electron | KALDI | aynı | Aynı neden (adım listesi). |
| languages.spec.ts (tr, en) | electron | KALDI | aynı | Aynı neden: "Ödeme ve satış" beklenirken "Saatlik satış" geliyor. |
| guide.spec.ts | electron | KALDI | aynı | Kılavuz ana sayfasında 21 bağlantı var, test 20 bekliyor (yeni konu eklenmiş). |
| quick-actions.spec.ts (Ctrl ile iki konaklama) | electron | KALDI | aynı | macOS'ta Ctrl+tık bağlam menüsü açıyor, seçim yapmıyor. Kod `metaKey` ile de çalışıyor; test Windows varsayıyor. Mac'te Cmd+tık ile çalıştı (kendi betiğimde, masaüstü). |
| light-mode.spec.ts (hafif mod kapalı) | electron | KALDI | aynı | macOS son pencere kapanınca uygulama kapanmaz (platform kuralı); test Windows/Linux davranışını bekliyor. |
| window.spec.ts (F11) | electron | KALDI | aynı | macOS tam ekran bu yolla algılanmıyor; ortam farkı. |
| Diğer 22 mobile + 31 electron spec | | GEÇTİ | | |

## (b) Bulgular (ürün)

Önem: Y yüksek, O orta, D düşük, B bilgi.

| # | önem | ekran/akış | adımlar | beklenen / gerçek | dosya tahmini | kanıt |
|---|---|---|---|---|---|---|
| B1 | O (test yalıtımı, sahibin Drive'ı) | Ayarlar -> Yedek, tüm Electron e2e | Sahibin Mac'inde `launch()` ile taze veri klasörüyle uygulama açılıyor; Drive klasörü `backup.driveFolder=auto` ile `homedir()` altında bulunuyor | Beklenen: test verisi sahibin gerçek Drive klasörüne yazılmaz. Gerçek: `~/Library/CloudStorage/GoogleDrive-…/Drive'ım/Bismuth/yedekler` içinde 136 `bismuth-yedek-2026-11-14-N.bmy`, son yazım 15:15 (Electron döngümün koştuğu saat), `kutu/` 8 parça. Yedek listesi bunları da gösterdiği için backup.spec "1 yedek" beklentisi bozuluyor (5, HTTP harness'ta 26-27). Bir şey silmedim. | `src/main/backup/drive.ts` (`findMyDrive`, `realProbe`), `backup-service.ts:331`; `tests/e2e/electron/fixtures.ts` yalıtım yok | `ls -lt ".../Bismuth/yedekler"`; harness listesi `settings?tab=backup` (Otomatik / Google Drive (şifreli) 15:11-15:15) |
| B2 | D | Geç çıkış kalemi diyaloğu (rezervasyon paneli, Para sekmesi) | Giriş yapmış konaklamada "Geç çıkış ekle" -> tutarı boş bırakıp "Kalemi ekle" | Beklenen: alanda hata metni. Gerçek: diyalog açık kalıyor, hata metni/toast yok (negatif tutarda "Tutar sıfırdan küçük olamaz." çıkıyor) | `fees-panel.tsx` (LateDialog, tutar doğrulaması) | `flow.jsonl` E/C `3e-late-checkout-add-void` (`lateEmpty: ... errs=`), masaüstü ve telefon |
| B3 | D | Bugün (Temizlik rolü) ve Ayarlar (Resepsiyon rolü) | Rolle giriş, sayfayı aç | Beklenen: yetkisiz çağrı yapılmaz. Gerçek: konsolda `403 reservations.grid` (Temizlik, Bugün) ve `403 staff.panel` (Resepsiyon, Ayarlar > Genel). Ekran doğru çalışıyor, yalnız gereksiz çağrı | `today-page.tsx`/`use-calendar`, `settings-page.tsx` (staff.panel sorgusu `can('staff')` kapısı yok) | `.tmp/son/events.jsonl` (etiket `phone-housekeeping`, `desktop-reception`) |
| B4 | D | Yeni misafir / Gider diyaloğu | Alana 500-3000 karakter yaz | Beklenen: sınır aşılınca arama sorgusu gitmez. Gerçek: `400 guests.duplicates`, `400 blacklist.check`, `400 ledger.suggestDescriptions` konsol hatası (form hatası doğru gösteriliyor) | `guest-dialog.tsx`, `expense-dialog.tsx` (debounce'lı sorgularda uzunluk kırpma) | `.tmp/son/events.jsonl` (desktop-fuzz guests, C4) |
| B5 | D | Telefon, Ayarlar > Listeler / Kullanıcılar / Vardiyalar / Döviz | 390x844'te anahtarları ölç | Beklenen: 44 px dokunma hedefi. Gerçek: `list-active-cash/card/bank` anahtarları 32x18, kendi etiketi yok (ebeveyn 32x24); Kullanıcılar "Hesap açık", Vardiyalar "Vardiya kullanılıyor", Döviz anahtarı 18 px. (Radyo ve onay kutuları 16-20 px ama etiket satırı 44 px, sorun yok.) | `lists-section.tsx`, `users-section.tsx`, `shifts-section.tsx` | `.tmp/son/nav.jsonl`, `flow.jsonl` C4 `hit-settings?tab=lists` |
| B6 | D | Giriş ekranı | `#/login` boş gönder | Beklenen: alan hata metni. Gerçek: hiçbir hata metni/aria-invalid yok, URL aynı (yerel tarayıcı doğrulaması olabilir, doğrulanmadı). 2000 karakterde "En çok 40 karakter" doğru; yanlış şifrede doğru mesaj ve kilit uyarısı | `features/auth/login-page.tsx` | `flow.jsonl` D `d16-login-forms` |
| B7 | D | Ayarlar > Odalar > Tip ekle | Boş gönder | Tek birleşik hata: "Tipin bir adı olmalı (en çok 80 karakter); fiyatlar sıfırdan küçük olamaz." (fiyat alanı boşken de fiyat cümlesi) - hata alan alan ayrışmıyor | `room-dialogs.tsx` | `crawl-fuzz-desktop.jsonl` (Tip ekle) |
| B8 | B | Takvim notu, Gece raporu | Not tarihi 1900-01-01 kabul; Gece raporu 2027 ve 1999 tarihi hatasız rapor gösteriyor | Sınır yok; gerçek sorun değil ama tutarsız (gider tarihi +366 gün sınırlı) | `calendar-notes`, `night-tab.tsx` | `crawl-fuzz-desktop.jsonl` |

Önemli: B1 dışında yüksek/kritik arayüz hatası bulunmadı. Konsolda `pageerror` hiç yok.

## Düzeltmelerin arayüzde çalıştığı doğrulananlar

| düzeltme | nasıl doğrulandı | sonuç |
|---|---|---|
| S-124 `booking.kbsGaps` + "Yine de çıkış yap" | Arayüzden 3 odalı grup kur, toplu giriş, toplu çıkış (masaüstü + telefon) | Uyarı 101, 102, 103 odalarını adıyla listeledi; Vazgeç çıkışı yapmadı; "Yine de çıkış yap" üç odayı "Çıkış yaptı" yaptı. Seçim çubuğunda boş toplu notta kaydet pasif. |
| G1 B1 grup ödemesi çıkış yapmış odayla | Çıkıştan sonra "Grup ödemesi al" | ₺2.000 bakiye -> ₺0 |
| G1 B8 iptal rezervasyona fazla ödeme | API | 400 `errors.reservationClosed` |
| G2 #3 depozito "Gelire çevir" geri al | Panelde depozito al -> çevir -> Geri al | Depozito tekrar "held" |
| G2 #2 geç çıkış kalemini iptal | Boş gerekçede "Bir gerekçe yazın." çıkıyor | Çalışıyor |
| S-125 elle kur sapma uyarısı | Otel kuru diyaloğu EUR 50 -> 70 | Uyarı "20% ve üzeri farklı: 50,0000" çıktı; 51'de çıkmadı; 0, negatif, boş, "abc", "1e9" "Kuru sayı olarak yazın" |
| S-127 çamaşır ayı yeniden aç | Ay kapat (API), arayüzde "Ayı yeniden aç" | Onay düğmesi gerekçe 3 karakter olana dek pasif; "Eki 2026 yeniden açıldı." toast; mutabakat boşaldı |
| G3 #3 / G5 Bugün kamera kartı | Bugün | `summary.camera = {newAlerts:3, problem:false}`, kartta "Kamerayı aç" bağlantısı (sorun durumu denenmedi) |
| G2 #9 gider tarihi sınırı | `ledger.addExpense` 2099 | 400 `errors.dateTooFar`; +30 gün kabul |
| G4 #4 dışa aktarma | 45 veri kümesi listesi; ilk 4 + son 8 kümeyi indirdi | Yeni kümeler (Hasar güvence bedelleri, Maaş dönemleri/kuralları, Ödeme yöntemleri, Satış kanalları, Ek hizmetler, Durum etiketleri) listede, indirme "Dosya hazır" |
| Yetki: Resepsiyon ve Temizlik | Telefon ve masaüstü rol taraması + API | Raporlar, Portföy, Turizm, Ay sonu, Denetim "Bu ekrana yetkiniz yok"; Ayarlar'da yalnız izinli sekmeler; backup/ayar/rapor/kur API'leri 403; Temizlik rezervasyon ve kamera API'leri 403 |
| G2 #1 gece raporu maaş sızıntısı, G2 #6 gelecek günü kapat, oda tipi pasif (S-128), G2 kapalı gün gerekçe alanı | Denenemedi: gün kapatma ayarı kapalı (409 `dayClosingDisabled`), pasif tip ve kapalı gün arayüzde kurulmadı | doğrulanmadı |

## Denenen öğe sayısı

- Genel tarayıcı (masaüstü 23 ekran, telefon 23 ekran, `.tmp/son/crawl*.jsonl`): masaüstünde 428 etkileşimli öğenin ~270'i benzersiz anahtarla tıklandı (+13 pasif, 218 menü/seçenek öğesi, 52 diyalog boş ve uç değerle gönderildi). Telefonda 378 öğeden ~230 (+11 pasif, 231 menü öğesi, 98 diyalog). Sol menü bağlantıları ayrıca: masaüstünde 29/29 çalıştı, 42 rota başlık + taşma taraması temiz (yatay taşma yok, hata sınırı yok).
- Bitiş ölçütü (>=%90) tüm ekranlarda sağlanamadı: Ayarlar > Kullanıcılar (rol matrisi ~58 öğe) ve Denetim kaydı satırları (~50) tarayıcıda yeniden bulunamadı ("vanished"; her tıklamada liste yeniden sıralanıyor). Bunlar dışında ekran başına kapsama ~%85-100.
- Hedefli akışlar: grup formu (boş, grupsuz ad, geçerli), toplu giriş/çıkış, KBS uyarısı, seçim çubuğu (Cmd+tık), ödeme (boş/negatif/0/aşırı/geçerli), depozito, geç çıkış, gelmedi, saatlik satış (boş/bitiş<başlangıç/negatif), misafir (boş/uç/geçerli/yineleme), raporlar (7 sekme), gece raporu, turizm kötü dosya, portföy, döviz (çevirici, otel kuru, kaynaklar, bayramlar), yedek (al, denetle, çift tık), dışa aktarma, içe aktarma sihirbazı açılışı, giriş formu, rol taramaları, dil ve tema.

## Çalışanlar / denenemeyenler

Çalışanlar: yukarıdaki doğrulananlar; boş/geçersiz gönderimlerde hata metinleri doğru alanda ve Türkçe (misafir, firma, kara liste, oda, kullanıcı, saatlik satış, grup, ödeme, gider); uç değerler (3000 karakter, -5, 1900) form düzeyinde reddediliyor; yatay taşma yok (390 px ve 1366 px).
Denenemeyenler: yedeği geri yükleme (HTTP harness'ta masaüstüne özel, Electron backup.spec kırmızı), Drive klasörü seçme/anahtar düğmeleri (HTTP'de yok), sunucu/LAN/relay düğmeleri (HTTP'de yok; Electron remote/replica spec'leri geçti), içe aktarma sihirbazının dosya adımı (tür seçimi gerekiyor, yalnız açılış denendi), kamera "sorun" kartı durumu, kapalı gün gerekçe alanları, pasif oda tipi, gece raporu maaş süzgeci, Resepsiyon/Temizlik rolünde Electron.

## Dosyalar

- Betikler: `/Users/yigittali/Desktop/Bismuth/.tmp/son/flow-*.spec.ts`, `crawl.ts`, `lib.ts`, `playwright.config.ts`
- Ham sonuçlar: `/Users/yigittali/Desktop/Bismuth/.tmp/son/flow.jsonl` (`show.py` ile okunur), `crawl*.jsonl`, `events.jsonl`, `nav.jsonl`
- Ekran görüntüleri: `/Users/yigittali/Desktop/Bismuth/.tmp/son/shots/` (47 dosya; kritik: `C-desktop-1e-group-checkout-kbs-go.png`, `ledger-expense-dialog-*.png`)
- Not: Playwright `test-results/` repo kökünde artefakt bıraktı (git'te izlenmiyor, `git status` temiz).
