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
- [ ] F11 tam ekrana alır/çıkarır (Electron `before-input-event` ya da menü hızlandırıcı), durum `window-state.json`'da;
      yeniden açılışta tam ekran/maximize geri gelir (birim test `window-state`).
- [ ] Yakınlaştırma kişisel ayar olarak kalıcı; Ayarlar → Görünüm'de de değiştirilebilir.
- [ ] Çoklu monitörde pencere son bulunduğu ekranda açılır (kod incelemesi + `screen.getDisplayMatching` testi).
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
