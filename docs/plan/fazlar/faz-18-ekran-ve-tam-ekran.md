# Faz 18 — Ekran ve tam ekran uyumu, çalışmayan öğeler

> Kaynak: `docs/analiz/05-ekran-ve-tam-ekran-uyumu.md` (ölçümler, görüntüler) ve `02-hata-raporu.md` (akış testi);
> paket kartları `08-gelistirme-plani.md` §2. Dalgalar 2 (P18a), 3 (P18c), 5 (P18b, P18d).

## Amaç
Program her bilgisayarda (1280×720'den 4K'ya, Windows %100/%125/%150, macOS Retina, açık/koyu, TR/EN/RU) tam ekran ve
rahat çalışır; hiçbir öğe çalışmaz durumda kalmaz.

## Gereksinimler
G-143 (telefon kırılımı), G-08 (üç dil), tasarım dili (`docs/tasarim.md` §4, §8, §12), Ö-23 (pencere; sahip onayı
beklemeden kısayol ve hatırlama yapılır, çoklu monitör davranışı varsayılanla).

## Sorular
Yok (Ö-23 öneri; cevap gelmezse uygulanır).

## Teslimatlar
1. **P18a** `scripts/ui-shot.mjs` çoklu boyut/ölçek/dil + ölçüm JSON'u (taşma, kesilme, 44 px hedef, viewport dışı öğe);
   Electron e2e'nin (`xvfb-run -a npm run e2e`) yeni devcontainer'da yeşil olduğunun doğrulanması.
2. **P18b** 05 raporundaki düzen bulguları (ekran ekran liste: faz dosyasının "Bulgu listesi" bölümü, Opus doldurur).
3. **P18c** Pencere: F11 / Ctrl+Shift+F tam ekran; tam ekran ve maximize hatırlama; `ui.zoom` kalıcı; çoklu monitörde
   son ekran; pencere durumu taşıma/boyutta debounce ile kayıt; 960 px altı düzen kırılımı.
4. **P18d** Akış testindeki çalışmayan/yanlış davranan öğeler (liste: 02 raporu "P18d" işaretli).

## Kabul ölçütleri
- [ ] `npm run ui:shot -- --size 1280x720,1366x768,1440x900,1536x864,1920x1080,2560x1440 --scale 1,1.25,1.5 --langs tr,en,ru --metrics .tmp/ui-shot/metrics.json`
      tek komutla çalışır; ölçüm dosyasını üretir.
- [ ] `xvfb-run -a npm run e2e` Codespace'te yeşil (P18a).
- [ ] `screen-auditor` tüm kombinasyonlarda Kritik/Yüksek bulgu vermez; 1280×720 ve 1536×864 @1.25'te yatay taşma yok.
- [x] F11 tam ekrana alır/çıkarır (`window-state.test.ts`, `window.spec.ts`) (Electron `before-input-event` ya da menü hızlandırıcı), durum `window-state.json`'da;
      yeniden açılışta tam ekran/maximize geri gelir (birim test `window-state`).
- [x] Yakınlaştırma kişisel ayar olarak kalıcı (`window.spec.ts`); Ayarlar → Görünüm'de de değiştirilebilir.
- [x] Çoklu monitörde pencere son bulunduğu ekranda açılır (`fitToScreens` testleri; `getDisplayMatching` yerine çalışma alanı kesişimi).
- [ ] `flow-tester` yeniden koşunca P18d listesinde 0 Kritik/Yüksek.
- [ ] `security-reviewer` pencere değişikliklerini onaylar (BrowserWindow seçenekleri değişmedi).

## Teknik notlar
Yazı boyutu `ui.fontSize` rem ölçeğiyle; zoom `webContents.setZoomFactor` (kişisel ayar `ui.zoom`, IPC ile uygulanır,
HTTP'den uygulanmaz — K-37); tam ekran `win.setFullScreen`; `window-state.ts` `isFullScreen()` de saklar.

## Yapılmayacaklar
Kiosk modu; yeni tema; tablet düzeni.

## Bulgu listesi
- **P18b (05 §3):** #1 takvim üç kaydırma çubuğu / tam yükseklik düzeni; #2 panel genişliği ve üst düğmeler; #3 çubuk ad
  kısaltma / gün sütunu genişliği; #4 telefon 44 px hedefler (ayarlar radyoları, görev anahtarları, H-28 defter/ay sonu onay kutuları, döviz anahtarı; H-35 ayarlar/görev anahtar ve çipleri); #5 kenar çubuğu alt
  grupları 768 px; #6 bugün/kılavuz/ayarlar tek kaydırma, yedek uyarısı tek satır.
- **P18c (05 §3):** #7 zoom üst sınırı; #8 tam ekran durumu hatırlama + debounce kayıt; #9 F11 / Ctrl+Shift+F; #10 `ui.zoom`
  kalıcı; #11 çoklu monitör sığdırma (isteğe bağlı).
- **P18d (02 §2):** H-04 telefon tarih seçici taşması; H-34 tedarik telefon düzeninde eksik düğmeler; H-36 ayar formlarında
  sessiz pasif Kaydet (alan altı hata + `aria-invalid`, ortak kalıp). H-16 çürütüldü (sheet kapanıyor; geri tuşu pürüzü P21e); Electron e2e doğrulaması P18a'da.

## Sonuç

### P18c — Pencere ve tam ekran (2026-11-13)
- Yapılan: F11 ve Ctrl/Cmd+Shift+F tam ekran, Ctrl/Cmd +/-/0 yakınlaştırma (ana süreçte `before-input-event`, metin alanında da çalışır; menü maddeleri aynı eylemi fareyle yapar). `ui.zoom` kişisel ayar (%80–150, adımlı; üst sınır 1280 px ekranda %150'de 853 CSS px'i, telefon kırılımının üstünde tutar); Ayarlar → Görünüm'de seçilebilir (telefonda gizli). Pencere durumu (boyut, konum, büyütülmüş, tam ekran) taşıma/boyutta 500 ms gecikmeyle ve kapanışta yazılır; açılışta pencere kaldığı ekranda, ekran yoksa birincil ekranın ortasında açılır. `minWidth` 960 ama ekran çalışma alanından geniş değil (853 DIP) ve yakınlaştırmayla telefon düzenine düşmeyecek kadar geniş.
- Testler: `window-state.test.ts`, `window-keys.test.ts`, `registry.test.ts`, e2e `window.spec.ts`.
- Kalanlar: ~~menüden ya da tuşla değişen zoom açık Ayarlar seçimini güncellemez~~ (P18b'de giderildi); istemci modunda zoom kalıcı değil (yerel ayar yok); 853 px düzen kırılımı P18b kapsamında.

### P18d — Çalışmayan öğeler (2026-11-13)
- **H-34** Tedarik telefon düzeni bilerek salt okunur (faz-12 madde 6); boş durum metni olmayan "Ürün ekle"/"Alım gir" düğmelerine gönderiyordu. Telefonda "bilgisayardan girilir", yetkisiz kullanıcıda "yetkili kullanıcı ekler" metni gösterilir (ürün ve alım listesi). Test: `supply-page.test.tsx` "telefonda boş durum metni olmayan düğmelere göndermez".
- **H-36** Ayarlar → Yedek: Kaydet artık pasif değil; geçersiz saat/saklama/kopya sayısı alan altında hata metni + `aria-invalid` gösterir, kaydetmez. Asıl sessizlik nedeni tarayıcının `type=number min/max` doğrulamasıydı (`noValidate` eklendi). Otel ve Personel kuralları formlarında aynı kalıp P17e'den beri vardı. Test: `backup-section.test.tsx` (H-36).
- **H-04** Bu dalda (P18b/P17e sonrası) 390 px'te popover 350 px ve yedi sütun görünür; yeniden üretilemedi. Yine de popover `max-w-[calc(100vw-1rem)]`, sütunlar `minmax(0,1fr)`, hücre telefonda `w-full h-11` yapıldı. Test: `tests/e2e/mobile/booking.spec.ts` (H-04; düzeltmeden önce de geçiyor, gerileme koruması).
- P21e'ye kalanlar (düşük, tasarım isteyen): H-26, H-30, H-37, H-39, H-40, H-41, H-42, H-46 (hepsi 02 raporunda P21e işaretli).

### P18b — Düzen düzeltmeleri (2026-11-13)
- Yapılan: telefonda 44 px hedef: radyo ve anahtar `components/ui` içinde `max-md:after` görünmez dokunma alanı (onay kutusundaki kalıp); ölçüm betiği artık `::after` alanını ve etiket içindeki denetimi sayar, düz metin kutusunu kendi kutusuyla ölçer (kılavuz araması yanlış "14 px" veriyordu). Takvim telefon düğmeleri RU'da kesilmek yerine sarar. 853 px (1280 ekran, %150): üst çubuk tarihi 1024 px altında kısa yazar (RU'da "Сегодня пятница, 13 ноября 2026 г." kesiliyordu; tam tarih başlıkta ve ekran okuyucuda). Menü/tuşla değişen zoom, açık Ayarlar → Görünüm seçimini günceller (pencere boyut olayında 300 ms gecikmeli yeniden okuma).
- Ölçüm (`--size 853x720,1280x720,1366x768,1920x1080 --langs tr,ru`, mobil dahil, 100 görüntü): yatay taşma 0, ekran dışı 0, kesilme 0 (önce 2), telefonda küçük hedef 0 (önce 64); yatay kaydırıcılar 16 = takvim ızgarası ve Durum filtre çipleri (kasıtlı).
- Testler: `shell.test.tsx` (kısa tarih beklentisi güncellendi), `settings-page.test.tsx` (zoom seçimi izler); mobil e2e shell, calendar, languages, today, a11y, admin, tasks-shift yeşil.
- Bulgu #1, #2, #3, #5, #6 (masaüstü düzen cilaları, Düşük/Orta, ölçüm eşiklerini aşmıyor): bu pakette yapılmadı, P21e'ye (varsayılan).
