# Faz 15 · UI Cilası, Üç Dil Gözden Geçirme, Kılavuz ve Kullanılabilirlik (UI Fazı 2)

**Amaç:** Tüm ekranlar çalışıyor; şimdi tek bir ürün gibi hissettirmek: tutarlılık, hız, klavye, boş durumlar,
Türkçe metin kalitesi, erişilebilirlik, küçük ekran, yazdırma, tema editörü.

**Gereksinimler:** G-130, G-33, G-08, **G-18 (program içi kılavuz)**, **G-19 (klavye kısayolları)**.
**Ön koşul:** Faz 5–14 tamam.
**Sorular:** yok — S-50, S-51 (kısayollar evet), S-52 (kılavuz: ayarlardan her zaman, çok ayrıntılı, basit kelimeler), S-77 (Rusça için bizim kontrolümüz yeterli) cevaplandı.
**Yöntem:** `ui-reviewer` ajanı her ekranın ekran görüntüsünü (Playwright) alır, kontrol listesine göre bulgu çıkarır; bulgular bu fazın görev listesi olur. Sahibe ekran görüntüleri gösterilir, onay alınır.

## Kontrol listesi

1. **Tutarlılık**: aynı işlem her ekranda aynı düğme/konum; başlık, boşluk, yazı ölçeği; simge seti tek (lucide); tablo yoğunluğu (resepsiyon ekranı yoğun olmalı — Excel alışkanlığı).
2. **Boş/yükleniyor/hata durumları**: her liste ve grafik için; ilk kurulumda boş takvim "ilk rezervasyonunuzu ekleyin" yönlendirmesi.
3. **Klavye** (G-19): global kısayollar (yeni rezervasyon, ara, bugüne git, ödeme gir), odak halkaları, Esc ile kapanış, Enter ile kaydet; takvimde ok tuşları; kısayol listesi `?` ile.
4. **Üç dil gözden geçirme**: tüm anahtarlar `tr.json`'da ve `en/ru` eşit; terim sözlüğü üç dilde (`docs/gelistirici/sozluk.md`); Türkçe imla; Rusça çeviri kalite turu (S-77: sahip Rusça biliyor, ayrıca ana dili konuşan kontrolü gerekmiyor — `turkish-ui-copy` + Rusça terim sözlüğü); uzun Rusça metinlerde taşma kontrolü; **mobil QA**: S-66 ekranları iPhone/Android boyutlarında.
5. **Erişilebilirlik**: kontrast ≥ 4.5:1, renk tek bilgi taşıyıcı olmasın (takvim simgeleri), ekran okuyucu etiketleri, büyük yazı modu (ayar).
6. **Tema**: açık/koyu (S-50) + sahibin renk ayarları (durum renkleri + vurgu rengi); "tema önizleme" ekranı; sistemle senkron.
7. **Küçük ekran**: 1366×768 dizüstü ve 1280×720'de kaydırmasız kullanım; yan menü daraltılabilir.
8. **Yazdırma**: raporlar ve günlük defter için yazdırma stili.
9. **Performans**: takvim, aylık defter (1.000+ satır), raporlar; ölçümler dokümante; gereksiz yeniden çizimler giderilir.
10. **Program içi kılavuz** (G-18): **Ayarlar → Kılavuz** her zaman açılır + her ekranda "?" ile o ekranın bölümü; **çok ayrıntılı**, **basit kelimelerle**, teknik terim yok, ekran görüntülü, adım adım ("Rezervasyon nasıl yazılır", "Ödeme alınca ne yapılır", "Vardiya devri", "Otelde kalanlar ve KBS", "Kat görevlisi için", "Ay sonu kontrolü", "Bakanlık istatistiği", "Yedek ve uzaktan erişim"); bölümler rolüne göre (resepsiyon, kat görevlisi, muhasebe, sahip); üç dilde; ilk açılış turu (atlanabilir). Kaynak `docs/otel/kullanim-kilavuzu.md` ile aynı içerik (Faz 16).
11. **Saat alanları ve sistem dili** (Faz 4 notu): `<input type="time">` Chromium'un yerel ayarını izler; İngilizce (ABD)
    sistemde "02:00 PM" görünür. Ana süreç `ui.language`'ı bir sonraki açılışta Chromium diline (`--lang`, EN için
    `en-GB`) uygulasın ya da saat alanı 24 saatlik kendi bileşenimizle değişsin; macOS'ta davranış doğrulanır.
12. **Sürükle‑bırak** (değerlendirme): takvimde rezervasyonu başka odaya/tarihe taşıma — risk/kazanç değerlendirilir, uygunsa eklenir.

## Kabul ölçütleri

- [ ] `ui-reviewer` kontrol listesi tüm ekranlarda "geçti".
- [ ] Sahip, ekran görüntülerini onayladı (her ana ekran için).
- [x] (kısmen: masaüstünde 18 ekran taranıyor, `tests/e2e/a11y.ts:35-54`; taranmayanlar takvim notları, kara liste, firmalar, kayıp eşya, bakım, tedarik, çamaşırhane, rehber, turizm, denetim ve Hotel/Odalar/Listeler/Uzaktan erişim/Yedek/Kullanıcılar ayar sekmeleri; kalanlar son kontrol turunda) Lighthouse/axe benzeri erişilebilirlik taraması kritik hata vermez. — `tests/e2e/electron/a11y.spec.ts` "erişilebilirlik taraması: ana ekranlar açık ve koyu temada kritik hata vermez" (18 ekran × 2 tema) ve `tests/e2e/mobile/a11y.spec.ts` "telefon: erişilebilirlik taraması kritik hata vermez" (11 telefon ekranı); ikisinde de "serious" bulgu da çıkmadı.
- [x] 1366×768'de hiçbir ekran yatay kaydırma gerektirmez (takvim hariç; o zaten yatay). — `tests/e2e/electron/shell.spec.ts` "1366×768: hiçbir ekran yatay taşmaz (Türkçe ve Rusça)" (ayrıca "1280×720: …" ve telefonda `tests/e2e/mobile/shell.spec.ts`; P15a1)
- [ ] Kılavuz: her ana ekranda "?" doğru bölüme açılır; yeni başlayan biri (teknik olmayan) yalnız kılavuzla rezervasyon + ödeme + vardiya devri yapabilir (gerçek deneme).

## Sonuç — P15c (madde 4: üç dil gözden geçirme, 2026-10-05)

**Yapılanlar**

- `docs/gelistirici/sozluk.md`: Türkçe · İngilizce · Rusça terim sözlüğü, 260'tan fazla terim (rezervasyon, oda ve oda durumu, para ve kasa,
  döviz, personel, vardiya, misafir/firma/kara liste, arıza, çamaşırhane, tedarik, rapor ve turizm, rol ve güvenlik, yedek ve
  çok cihazlı çalışma). Her satırın üç dildeki karşılığı `tr/en/ru.json`'daki gerçek kullanımla betikle karşılaştırıldı;
  yalnız Faz 13b'de gelecek üç terim (yedek kopya, kutu, devral) ve birkaç çekimli biçim dışında hepsi dosyada var. Sözlüğün
  sonunda kalan tutarsızlıklar ve karar bekleyen öneriler yazılı.
- Üç json tek tek okundu (4.551 anahtar) ve betikle tarandı: anahtar kümeleri eşit; yer tutucular eşleşiyor (yalnız
  bilerek `{{count}}`'suz "Her gün/Her ay/Her yıl" tekil biçimleri farklı); Rusça `_one/_few/_many/_other` dörtlüsü 162 çoğul
  grubun hepsinde tam ve doğru; en/ru'da Türkçe metin kalmamış (yalnız tema önizlemesinin bilerek Türkçe örnek metni).
- Düzeltmeler `i18n-spec/p15c.json` ile uygulandı: **70 anahtar** (tr 21, en 32, ru 48 değer; anahtar eklenmedi, silinmedi, adı
  değişmedi). Örnekler: sürekli not (tr "istek/not" karışıklığı → "not"), gecelik **rate** (en), personel **Bonus** (en kurulum
  "Commission"), tanıtıcı not = **Identifying note** (en 4 yerde farklıydı), Rusça denetim kaydı tek ad (**Журнал действий**),
  kullanıcı adı tek ad, döviz ekranı adı (Settings'te "Currency" ↔ menüde "Exchange rates"), "Roller ve kullanıcılar" →
  "Kullanıcılar ve roller" (ekran adı), "kayıt geçmişi" → "denetim kaydı" (personel), bozuk Rusça "Вернуться к сегодня",
  "Генуборка" kısaltması (üç yerde tam ad "Генеральная уборка"), maaş kilidi (**закрыт/заблокирован** karışıklığı), "Tried again"
  (yanlış zaman), "can be a day off" (yanlış anlam), üç yerde kıvrık kesme işareti (diğerleri düz).
- Metinle birlikte güncellenen test: `new-reservation-dialog.test.tsx` ("Bu notu okudum", "önemli notunu").

**Testler:** `npx vitest run src/renderer` (557 test), `node scripts/i18n-check.mjs` (4.389 anahtar, tr/en/ru eşit), Electron
`shell.spec.ts` (7/7, Türkçe + Rusça 1366×768 taşma) ve mobil `shell.spec.ts` (7/7, Türkçe + Rusça uzun metin taşma) geçti;
`npm run check` sonucu raporda.

**Uygulanmayan öneriler (anlam ya da ürün adı değişeceği için):** Rehber/Contacts/phone book birleştirmesi, Rusça
"платёж" ↔ "оплата", "Void" ↔ "Cancel", "Fixed" ↔ "Resolved", "Misafir notu" ↔ "Sürekli not" (takvimde), "Account" ↔ "Session"
(komut menüsü), tırnak biçimi, Rusça «Забыли пароль?» — hepsi `docs/gelistirici/sozluk.md` §12'de.

**Sahip onay paketine:** yok (S-77: Rusça için bizim kontrolümüz yeterli — sahip Rusça biliyor, sözlük ona okunabilir).

## Sonuç — P15b Program içi kılavuz (madde 10, 2026-10-05)

- **Biçim (K-40, ana oturum kaydedecek)**: kılavuz metni i18n json'a değil, dil başına Markdown dosyalarına yazıldı:
  `src/renderer/guide/content/{tr,en,ru}/NN-<bölüm>.md`, 20 bölüm (Başlarken; Bugün; Rezervasyon; Ödeme; Defter ve
  giderler; Misafirler, firmalar, kara liste; Otelde kalanlar ve KBS; Oda durumu ve arıza; Kat görevlisi için; Görevler
  ve bakım; Vardiya devri; Personel ve maaş; Rehber, tedarik, çamaşırhane, kayıp eşya; Döviz, hava, özel günler; Ay
  sonu ve raporlar; Bakanlık istatistiği; Yedek ve veri aktarma; Uzaktan erişim; Ayarlar, kullanıcılar ve roller; Sık
  sorulanlar). Bağımlılık eklenmedi: kendi küçük okuyucumuz (`guide/markdown.ts`: başlık + `{#çapa}`, paragraf, madde
  ve numaralı liste, kalın, `<kbd>`, tek satırda resim, kılavuz içi `guide:` ve ekran `app:` bağlantıları, `> [!tip]` /
  `> [!warning]` kutuları) ağaç üretir, `markdown-view.tsx` React öğesi çizer; `dangerouslySetInnerHTML` yok, dış
  bağlantı ve HTML düz yazı kalır, yazar notu (`<!-- doğrula: … -->`) atılır. Sayfalar dil başına ayrı parçada,
  kılavuz açılınca yüklenir. Arayüzün kısa metinleri `guide.*` anahtarları.
- **Ekran** `features/guide/` (rota `/guide?s=<bölüm>&a=<çapa>`): sol bölüm listesi, arama (büyük/küçük harf ve
  Türkçe/Rusça işaret farkı gözetilmez; sonuç en yakın başlığa gider), "Kimin için" süzgeci (Resepsiyon, Kat
  görevlisi, Muhasebe, Sahip ve müdür; varsayılan oturumdaki rol), bölüm içi "Bu bölümde" listesi, önceki/sonraki
  bölüm, **Bölümü yazdır** (yalnız açık bölüm basılır, A4, açık renk). Telefonda tek sütun: bölüm kartları → bölüm →
  "Tüm bölümler". Yüklenme/hata/boş arama/olmayan bölüm durumları var. Menüde Sistem → **Kılavuz** (telefonda "Daha
  fazla"), **Ayarlar → Kılavuz** bölümü herkese açık (kılavuzu aç, turu yeniden başlat, "Yeni kullanıcılara tanıtım
  turunu göster" anahtarı — yalnız otel ayarı yetkisi değiştirir).
- **"?" düğmesi**: üst çubukta tek düğme (`top-bar.tsx`'e bir içe aktarma + bir satır `<GuideButton />`; P13a'nın
  dosyası, değişiklik en küçük tutuldu). Rota → bölüm eşlemesi `guide/route-map.ts` (Ayarlar'da açık sekmeye göre
  ayrıca); eşlemesi olmayan rota kılavuzun ana sayfasını açar.
- **İlk açılış turu** (`first-run-tour.tsx`): ekranı kapatmayan köşe kartı (telefonda alt menünün üstünde), 6 adım
  (Bugün, takvim, rezervasyon yazma, ödeme ve kasa, vardiya devri, kılavuzun yeri), kılavuz görüntüsüyle; her adımda
  "Turu atla", Esc kapatır; rolün göremediği ekranın adımı atlanır. Kullanıcı başına bir kez: kişisel `ui.tourDone`
  (user_preferences); otel `guide.tourForNewUsers` (varsayılan açık) ile yeni hesaplara kendiliğinden gösterilir.
  Kılavuzdan ve Ayarlar → Kılavuz'dan yeniden başlar. Şema değişmedi (iki yeni ayar anahtarı, migrasyon yok).
- **İçerik**: düğme ve alan adları `tr/en/ru.json`'dan ve ekran kodundan birebir alındı. Henüz birleşmemiş özellikler
  faz dosyalarından yazıldı ve işaretlendi: `15-month-end.md` (`<!-- doğrula: P10a -->`), `18-remote.md`
  (`<!-- doğrula: P13a, P13b -->`), `01-getting-started.md` klavye kısayolları paragrafı (`<!-- doğrula: P15a -->`).
- **Görüntüler** `scripts/guide-shots.mjs` (`npm run guide:shots`; örnek veri `scripts/guide-shots-seed.ts` →
  `seed/demo`, uydurma adlar): 34 görüntü × 3 dil = 102 JPEG (masaüstü 1366×768 → 1100 px, telefon 390×844, kalite
  78), toplam **6,4 MB** (sınır 8 MB, betik denetler). Cila sonrası yeniden koşulacak; ay sonu/raporlar ve uzaktan erişim
  ekranlarının görüntüleri o turda eklenecek.
- **`docs/otel/kullanim-kilavuzu.md`** Türkçe içerikten `npm run guide:docs` ile üretilir (`scripts/guide-docs-lib.ts`).
- **Testler**: `guide/markdown.test.ts` (her öğe türü, HTML/dış bağlantı/yol enjeksiyonu yok),
  `guide/markdown-view.test.tsx` (React öğeleri, bağlantı adresleri, betik/resim/dış bağlantı yok),
  `guide/content.test.ts` (üç dilde aynı dosyalar, aynı çapa ve resim sırası, tek çapalar, bütün bağlantılar ve "?"
  hedefleri var, her resmin her dilde görüntüsü var, doğrula notları), `guide/route-map.test.ts` (yönlendiricinin
  bütün rotaları eşlemede), `guide/search.test.ts`, `features/guide/guide-page.test.tsx`,
  `features/guide/first-run-tour.test.tsx` (bir kez gösterilir, atlanır, Esc, yeniden başlar, rol adımları),
  `tests/unit/guide-docs.test.ts` (belge güncel); e2e `tests/e2e/electron/guide.spec.ts` (Ayarlar → Kılavuz, "?"
  doğru bölüm, arama, tur) ve `tests/e2e/mobile/guide.spec.ts`.
- **Test altyapısı**: e2e kurulum yardımcıları (`tests/e2e/bridge.ts`, `tests/e2e/mobile/server.ts`) ve
  `scripts/ui-shot.mjs` kurulumdan sonra `guide.tourForNewUsers=false` yazar, `test/render-app.tsx` varsayılanı
  kapalıdır: tur yalnız onu deneyen testlerde çıkar.
- **Kabul ölçütü** "Kılavuz: …": ilk yarısı ("?" doğru bölüme açılır) `route-map.test.ts`, `content.test.ts` ve
  `guide.spec.ts` ile karşılandı; ikinci yarısı (teknik olmayan biri yalnız kılavuzla rezervasyon + ödeme + vardiya
  devri yapar, gerçek deneme) **sahip onay paketine**; kutu bu yüzden işaretlenmedi.
- Karşılanan: G-18, S-52.

## Sonuç — P15a1 (madde 1, 2, 3, 7: tutarlılık, boş durumlar, klavye, küçük ekran; 2026-10-05)

**Klavye (madde 3, G-19, S-51)**

- Bütün kısayollar tek listede: `src/renderer/lib/shortcuts/registry.ts` (saf veri + eşleme). Kabuğun tek tuş dinleyicisi
  (`use-global-shortcuts.ts`), "?" listesi (`components/shortcut-list.tsx`, `shortcut-table.tsx`), takvim ızgarasının
  Home/Enter/N tuşları, üst çubuktaki ve menülerdeki "Ctrl K / Ctrl L" ipuçları ve kılavuzun tablosu aynı listeden okur.
- Genel kısayollar: <kbd>N</kbd> yeni rezervasyon (her ekrandan; takvim açılır, pencere gelir), <kbd>P</kbd> ödeme ekle
  (rezervasyon paneli açıksa o rezervasyona, yoksa Defter ve kasa'da günün ödemesi), <kbd>T</kbd> takvimde bugüne git
  (bugünün hücresi seçilir, ok tuşları oradan sürer; telefonda gün listesi bugüne döner), <kbd>Ctrl/⌘ K</kbd> ve
  <kbd>/</kbd> hızlı arama, <kbd>?</kbd> ve <kbd>F1</kbd> kısayol listesi, <kbd>Ctrl/⌘ L</kbd> kilit, <kbd>Ctrl/⌘ B</kbd>
  kenar menü. Takvimde (P5a'dan korundu) oklar, Page Up/Down, Home, Enter, N. Hızlı aramada yeni "Yardım → Klavye
  kısayolları" satırı.
- Kurallar: tek harfli kısayollar yazı alanında (input, textarea, select, combobox, contenteditable) çalışmaz; yalnız
  Ctrl/⌘'li olanlar her yerde. Bir pencere, alt sayfa ya da menü açıkken arkadaki ekranın kısayolu çalışmaz (yalnız
  açık panelin kendi işi: P). Rolün yapamadığı iş için kısayol hiçbir şey açmaz. Rusça/Türkçe klavye düzeninde aynı
  fiziksel tuş çalışır (`KeyN` → N).
- **Enter kaydeder, Esc kapatır**: `ResponsiveDialog` gövdesinde ortak `submitOnEnter` — kaydet düğmesi alt çubukta
  (`form="…"`) olsa da, imleç hangi alanda olursa olsun Enter formu gönderir; kendi Enter'ını kullanan alan (misafir
  arama, çamaşır fişinde sonraki kutu) önce davranır; çok satırlı alanda Ctrl/⌘+Enter; kaydet düğmesi kapalıyken Enter
  bir şey yapmaz. Kaydet düğmesi forma bağlı olmayan 6 pencere düzeltildi (otel kuru, hava durumu konumu, dışa aktarma,
  misafir birleştirme, ödeme/gider iptali, kasa teslimi) ve arıza planı formu (`issue-sheet`). Esc Radix'in kendisi.
- Odak halkaları zaten tam opak (`ring-ring`, Faz 3); yeni öğeler aynı bileşenlerle.
- Kılavuz: `01-getting-started.md` (üç dil) yeni "Klavye kısayolları" `{#keyboard}` bölümü; `<!-- doğrula: P15a -->`
  kaldırıldı. Kılavuz metninde kendi satırında `[[shortcuts]]` programın kısayol tablosunu çizer (markdown.ts yeni öğe,
  `markdown-view` → `ShortcutTable`); `npm run guide:docs` bunu `tr.json` metinleriyle Markdown tabloya çevirir
  (`docs/otel/kullanim-kilavuzu.md` yeniden üretildi). "?" listesinin "Kılavuzda aç" düğmesi bu bölüme gider.

**Tutarlılık (madde 1)** — bütün ekranların masaüstü görüntüsü alındı (27 ekran, açık/koyu), farklar:

1. Aynı iş iki ad: rezervasyon panelinde "Ödeme al", her yerde "Ödeme ekle" (`docs/gelistirici/sozluk.md`) → "Ödeme ekle / Add
   payment / Добавить оплату" (panel düğmesi, tanıtım turu, kılavuz 03 ve 04 üç dilde).
2. Tablo yoğunluğu: `.claude/rules/ui.md` `density="compact"` diyor ama `Table` desteklemiyordu → `Table` `density`
   alır; kişinin "Sıkışık" seçimi (`<html data-density>`) bütün tabloları sıklaştırır. Resepsiyon/para tabloları
   sıkı: defter gelir ve gider, misafir listesi, oda listesi, denetim kaydı, ay sonu (2), maaş tablosu, çalışma saatleri,
   çamaşırhane, tedarik (11 tablo).
3. Enter ile kaydetmeyen pencereler (yukarıda).
4. Kısayol ipuçları i18n'deki sabit "Ctrl K / ⌘K" metinlerinden geliyordu → listeden.
5. Değişmeyenler (bilerek): her ekran `Page` + h1 + tek cümle açıklama, birincil düğme sağ üstte; simgeler yalnız
   lucide (başka simge paketi yok); Defter ve kasa'nın "Gider ekle / Ödeme ekle" düğmeleri gün görünümüne bağlı
   olduğu için sekme satırında, Ay sonu'nun "Excel'e aktar / Yazdır" düğmeleri ay seçicinin yanında kaldı. Boş
   durumlara üstteki birincil düğmenin ikincisi eklenmedi (ekranda tek birincil düğme, `docs/gelistirici/tasarim.md` §1); boş durum
   metinleri hangi düğmeye basılacağını zaten söylüyor.

**Boş / yükleniyor / hata / yetkisiz (madde 2)**: listeler ve grafikler `QueryView` / `EmptyState` / `ErrorState` (yetkisiz
yanıtta "Bu ekrana yetkiniz yok", yeniden deneme yok) ile tarandı; eksik bulunan yalnız takvimin ilk kurulum yönlendirmesi.
Takvim boşken (otelde henüz hiç misafir kartı, dolayısıyla hiç rezervasyon yok) üstte "İlk rezervasyonunuzu ekleyin"
kartı: boş hücreye tıklayın ya da "Yeni rezervasyon" (N; telefonda yalnız düğme), "Kılavuzda oku" → rezervasyon bölümü
(`features/calendar/first-reservation-hint.tsx`; yalnız rezervasyon yazabilen role; ilk misafirle kendiliğinden kaybolur).

**Küçük ekran (madde 7)**: 1366×768 ve 1280×720'de bütün ekranlar (takvim notları ve kılavuz da listeye eklendi) Türkçe ve
Rusça taşmasız; telefonda (390×844) aynı liste. Kenar menü daralma durumu kişinin tercihi: yeni kişisel ayar
`ui.sidebarCollapsed` (user_preferences, migrasyon yok; ilk çizim için pencerenin son durumu localStorage'da), denetim
kaydında "Menüyü aç/kapat" adıyla görünür.

**Testler**: `lib/shortcuts/registry.test.ts` (tek kaynak, üç dilde metin, tuş çakışması yok, takvim ve kenar menü tuşları
gerçekten dinlenen tuşlar, Caps Lock, Rusça düzen, Shift'li "?"/"/", yazı alanı tanıma), `lib/shortcuts/shortcuts.test.tsx`
(gerçek kabukta "?"/F1 listesi + Esc, yazı alanında çalışmaz, N/T/P başka ekrandan, pencere açıkken arkadaki kısayol
çalışmaz, yetkisiz rol, kenar menü tercihi), `components/dialog-keys.test.tsx` (Esc/Enter ortak DOM testi masaüstü +
telefon; kaynak taraması: düğmeli her pencerede form + gönder düğmesi), `guide/markdown.test.ts`,
`guide/markdown-view.test.tsx`, `tests/unit/guide-docs.test.ts` (`[[shortcuts]]`),
`features/calendar/first-reservation-hint.test.tsx` (ilk kurulum yönlendirmesi); e2e `tests/e2e/electron/keyboard.spec.ts`
(klavyeyle rezervasyon + ödeme: N, Enter, P, Enter; "?" ve Esc; T; yazı alanında harf), `shell.spec.ts` ("1366×768:
hiçbir ekran yatay taşmaz (Türkçe ve Rusça)", yeni "1280×720: hiçbir ekran yatay taşmaz (Türkçe ve Rusça)", "yan menü
daraltılır; tercih kişinin ayarıdır, yeniden açılışta korunur").

Karşılanan: G-19, G-130 (tutarlılık, yoğunluk), S-51. Varsayılan ile çözülen: kısayol tuşları (N, P, T, ?, F1) ve "T =
takvimde bugün" yorumu (varsayılan; sahip sorusu açılmadı, K-39). Sahip onay paketine: yok.

## Sonuç — P15a2 (madde 5, 6, 8, 9, 11, 12; 2026-10-05)

**Madde 11 — 24 saat ve pencerenin dili**

- Kendi saat alanımız `components/time-input.tsx`: `SS:DD`, her dilde 24 saat, `dir="ltr"`, sayısal klavye, telefonda 44 px
  (ortak `Input`). Klavyeyle: "1430" hemen 14:30, "930" ve "9" alandan çıkınca / Enter'da 09:30 ve 09:00; ↑/↓ imleç saatteyse
  saati, dakikadaysa dakikayı, PageUp/PageDown saati değiştirir; alana girince saatin tamamı seçilir. Enter yarım saati
  düzeltip formu düzeltilmiş saatle gönderir. Programdaki **bütün** `<input type="time">` alanları (14 alan, 10 dosya:
  otel, vardiyalar, yedek saati, kurulum sihirbazı, görev, kendi görevim, kişisel not hatırlatması, kayıp eşya teslimi,
  personel geliş/çıkış) bununla değişti; not hatırlatmasına saat denetimi eklendi (`timeInput.invalid`).
- Ana süreç (`src/main/index.ts`, küçük dokunuş — P13b'nin dosyası): `ui.language` her değiştiğinde ve oturum açan
  kişinin diliyle `userData/ui-locale.json`'a yazılır; bir sonraki açılışta `ready`'den önce `--lang` olarak uygulanır
  (EN → `en-GB`, TR → `tr`, RU → `ru`; `src/main/app/chromium-lang.ts`). Pencere kapanınca oturum kapandığı için otelin
  dili kişininkinin üstüne yazılmaz. Not: Linux'ta Chromium dili ortamdan (LANG) alır, `--lang` yalnız Windows ve
  macOS'ta etkilidir; saat alanı artık tarayıcıya bağlı olmadığı için her yerde 24 saattir. **Sahip onay paketine:**
  İngilizce (ABD) Windows ve macOS'ta saat alanının ve sayı alanlarının görünüşü.

**Madde 6 — Tema**

- Açık / koyu / bilgisayarla aynı (vardı). Yeni: otelin **vurgu rengi**, her tema için ayrı (`ui.accentColor`,
  `ui.accentColorDark`; durum renkleri gibi `settings.colors` yetkisi, oturum açma ekranı da okur). `--primary`,
  `--ring`, kenar menü vurgusu ve `--accent` tonu `<style id="user-theme">` ile değişir; yazı rengi türetilir. Tema
  önizleme ekranı editöre dönüştü: tema, yazı boyutu, vurgu rengi (renk seçici + 6 hazır renk + "Bismuth rengine dön",
  zeminde 3:1 altında "zor seçilir" uyarısı), durum renklerine bağlantı ve canlı bileşen galerisi. Yetkisi görüntüleme
  olan Müdür görür, değiştiremez. Ayarlar → Genel → Görünüm'e yazı boyutu ve "Tema önizlemesini aç" eklendi.
- **Büyük yazı modu** `ui.fontSize` (normal / büyük %112,5 / daha büyük %125; kişiye özel, K-37): kökün yazı boyutu,
  rem ile çizilen her şey (takvim dahil) büyür.
- Şema değişmedi (ayar tablosu anahtar–değer; migrasyon yok).

**Madde 5 — Erişilebilirlik**

- Koyu temanın grafik renkleri (`--chart-1…5`) dataviz doğrulayıcısının koyu bandına (OKLCH L 0,48–0,67) alındı, kartta
  ≥ 3:1 ve renk körlüğünde ayırt edilir (P10a notu kapandı); açık temada `--chart-5` doygunluğu artırıldı. Testle
  sabitlendi (`tests/unit/theme-contrast.test.ts`: koyu bant, grafik 3:1, vurgu varsayılanı = `--primary`, hazır
  vurgular 3:1 ve yazı 4,5:1).
- Renk tek taşıyıcı değil: takvimin oda sütunundaki oda durumu noktası artık biçim de taşır (temiz nokta, kirli eşkenar
  dörtgen, kontrol edildi halka, kapalı kare) ve ekran okuyucuya adını söyler; çubukların durum/simge adları zaten
  etiketteydi.
- axe-core taraması e2e'de (`@axe-core/playwright` 4.13.0, geliştirme bağımlılığı, `save-exact`,
  `docs/plan/bagimliliklar.md`, `npm run notices` — kurulum paketine girmez). Bulunan iki kritik hata düzeltildi: oda
  seçicinin etiketsiz tetikleyicisi (`components/room-picker.tsx`, kimliksiz kullanımda kendi `useId`'si) ve telefon
  takviminin panelsiz sekmeleri (`layouts/mobile/mobile-calendar.tsx`, `TabsContent` — P15a1/P13a alanına küçük dokunuş).

**Madde 8 — Yazdırma**

- Günlük defter: "Yazdır / PDF" (masaüstü) günü A4'te basar — raporların yazdırma düzeniyle aynı (otel adı, "Günlük
  defter", gün her sayfada, sayfa numarası, koyu temada da açık renk): günün özeti, ödemeler (saat, oda, misafir, yöntem,
  kanal, tutar, x), giderler (saat, bölüm, açıklama, yöntem, tutar), iptal satırları üstü çizili ve adıyla, gün notu
  (`features/ledger/ledger-print.tsx`). Raporlar (P10a) ve otelde kalanlar (P9) zaten A4.
- `features/reports/print.css` (P10a dosyasına küçük dokunuş): "pencerenin geri kalanını gizle" kuralı yalnız yazdırma
  kökü varken (`body:has(> .print-root)`) geçerli. Defter bu sayfayı ana pakete taşıyınca kural her yazdırmada
  geçerli oluyor, otelde kalanların gece listesini ve kılavuz baskısını gizliyordu. Sayfa boyutu ve "1 / 2" sayfa
  numarası (`@page`) kapsamlanamaz: gece listesinin ve kılavuzun kâğıdında da sayfa numarası çıkar.

**Madde 9 — Performans** (ayrıntı: `docs/plan/04-arastirma/performans.md`)

- Ölçüm: `tests/e2e/electron/perf.spec.ts` (`BISMUTH_PERF=1`), veri `tests/e2e/seed-perf.ts` (20 oda × 2026–2036,
  1.376 satırlık defter ayı); yeniden çizim sayaçları `lib/render-count.ts` (testlerde ve profilde açılır).
- Giderilen yeniden çizimler: takvim satırları `GridRow` (`memo`, sabit işleyiciler) — ok tuşu başına 136 → 56 ms, her
  basışta 20 satır yerine ≈ 1; defter ayı tek geçişte gruplanır ve günler `DayBand` (`memo`) — ay açılışı 1.706 → 970 ms,
  gün açma 347 → 201 ms. Zorlama verisinde (ayda 13.400 ödeme) ay açılışı 27,8 sn idi.
- Faz 16 için veri: 20 odada takvim ilk çizim ~1 sn, iki aylık okuma 0,1–0,35 sn; raporlar yıl için 0,25 sn.
- Kalan: gün görünümü sanallaştırılmadı (tek günde binlerce satırda pencere kilitlenir; gerçek otelde beklenmez —
  öneri). Kaydırma kare hızı bu kapsayıcıda yazılımla çizim nedeniyle düşük: gerçek cihazda ölçüm **sahip onay
  paketine**.

**Madde 12 — Sürükle‑bırak (değerlendirildi, eklendi)**

- Takvimde çubuk sürüklenir; bırakınca "Rezervasyon taşınsın mı?" sorulur, "Taşı" var olan yordamları çağırır
  (`booking.changeRoom`, `booking.changeDates`; çakışma, blok ve yetki serviste; blok/satılmaz oda "yine de yaz"
  nedeniyle). **Tek eksen** (varsayılan): aşağı/yukarı başka oda (aynı geceler), yana başka tarih (aynı gece sayısı);
  hangisinde daha çok hareket edildiyse o. Oda ve tarih birlikte taşınmaz: iki ayrı yazma yarım kalabilir; ikisi
  birden gerekirse servis tarafında tek işlemli bir "taşı" yordamı önerisi (yapılmadı). İçerideki misafir yalnız odaya
  ve bugünden itibaren taşınır, geçmişe ve bitmiş konaklamaya sürükleme yok; Esc vazgeçer; 6 px altı hareket tıklama
  sayılır. Yalnız `calendar` düzenleme yetkisi olan rol sürükler (Muhasebeci sürükleyemez). Klavyeyle karşılığı panelin
  Geceler sekmesi (ipucu takvim altında).

**Testler:** `components/time-input.test.tsx`, `src/main/app/chromium-lang.test.ts`, `lib/theme/theme.test.ts`,
`features/theme-preview/theme-preview-page.test.tsx`, `features/calendar/drag.test.ts`,
`features/calendar/calendar-page.test.tsx` (sürükle-bırak, yetkisiz rol, satır yeniden çizim sayacı),
`features/ledger/ledger-page.test.tsx` (yazdırma, gün bandı sayacı), `tests/unit/theme-contrast.test.ts`,
`tests/unit/permissions-settings.test.ts` (vurgu rengi yalnız `settings.colors` düzenleme yetkisiyle, her rol);
e2e `tests/e2e/electron/ui-polish.spec.ts` (saat + `--lang`, vurgu + büyük yazı, defter A4/printToPDF, sürükle-bırak
102 → 203), `tests/e2e/electron/a11y.spec.ts`, `tests/e2e/mobile/a11y.spec.ts`, `tests/e2e/electron/perf.spec.ts`
(isteğe bağlı).

**Sahip onay paketine:** İngilizce (ABD) Windows ve macOS'ta saat alanı; gerçek yazıcıda günlük defter A4 çıktısı;
otelin bilgisayarında `BISMUTH_PERF=1` ölçümü; vurgu rengi seçimi (otelin kendi rengi).

Karşılanan: G-130 (açık/koyu/sistem tema, serbest renkler: vurgu rengi; mantıksal CSS korundu), G-33 (renk seçici, önizleme,
varsayılana dön; tema önizlemesi).


## Son kontrol düzeltmesi (QA2c, 2026-10-05)

Faz 15 + 16 hata avının Faz 15 bulguları (bulgu → test):

- **#3 sürükle-bırak tarih taşıma fiyatı değiştiriyordu** → yeni yordam `booking.moveDates` (tek işlem; geceler kendi
  fiyatı ve satıldığı taban değeriyle kayar, eski masraflar `stay_moved` gerekçesiyle iptal, denetim kaydı
  `move_dates`; yetki `calendar` düzenleme, içerideki misafirin tarihleri taşınmaz). Onay penceresi: "Gece sayısı aynı
  kalır; her gece kendi fiyatıyla taşınır, toplam tutar değişmez." (varsayılan) —
  `reservation-move-dates.test.ts` ("3 gece (2.000 + 2.000 + 3.500 = 7.500) bir hafta sonraya taşınınca toplam 7.500
  kalır", "…geri sürükleyince eski fiyatlar geri gelir", "ödenmiş konaklama … ödenmiş kalır", "dolu günlere taşınamaz…"),
  `permissions-booking.test.ts` (muhasebe 403), `calendar-page.test.tsx` ("yana bırakılan rezervasyon "Taşı" ile…"),
  e2e `ui-polish.spec.ts` ("yana sürüklenen rezervasyonun geceleri fiyatlarıyla kayar, toplam aynı kalır").
- **#4 N / "Yeni rezervasyon" dünün tarihi** → gün tuşa basıldığı anda okunur — `new-reservation-today.test.tsx`.
- **#6 kılavuz baskısı koyu temada soluk** → "Bölümü yazdır" koyu temayı baskı süresince kaldırır (`usePrint`);
  `guide-print.css` baskıda her öğeyi sayfa mürekkebiyle, renkli zeminsiz basar — e2e `ui-polish.spec.ts` ("kılavuz koyu
  temada basılınca tuş adları, metin ve resim altları kâğıtta okunur").
- **#8 çıkış günü içerideki misafir sürükleniyordu** → `canDragStay(stay, today)`: içeride ve `checkOut > today`
  (gündüz kullanımı kendi gününde) — `drag.test.ts` ("çıkış günü sabahı … sürüklenmez").
- **#9 saat alanı kenarları** → yapıştırmada saniye atılır ("14:30:00" → 14:30), baştaki boşluk atılır (" 9:00" →
  09:00), harfli metin ("2:30 PM") olduğu gibi kalır ve geçersiz sayılır; kaydet düğmesi kapalıyken Enter göndermez —
  `time-input.test.tsx` ("saat alanı: yapıştırma ve kapalı kaydet düğmesi").
- **#10 kayıp eşya tesliminde geçersiz saat iletisiz** → "Saati 14:30 gibi yazın." iletisi (`aria-describedby`) —
  `lost-items-page.test.tsx` ("teslimde geçersiz saat ("25") kaydedilmez…"). Görev penceresi QA2b'de.
- **#11 Ctrl+B fiziksel tuş** → kenar menü `matchesCombo` ile dinler — `shortcuts.test.tsx` ("Ctrl+B Rusça düzende (и)
  ve Büyük harf kilidiyle de…").
- **#13 "Başka kullanıcı" ile giren hesap turu görmüyordu** → tur kapatanı kişi kimliğiyle tutar —
  `first-run-tour.test.tsx` ("turu kapatan kişiden sonra aynı pencerede oturum açan yeni hesap…").
- **#14 vurgu rengi uyarı eşiği** → 4,5:1 (bağlantı yazısı da bu renkte); hazır renkler ve Bismuth moru geçer, uyarı
  metni bağlantıları da söyler — `theme.test.ts` ("zeminde 4,5:1 altında kalan vurgu rengi…").
- **#15 "bugünden itibaren" aralığı girişten başlıyordu** → bugünden başlar — `calendar-page.test.tsx` ("içerideki
  misafir başka odaya taşınırken…").
- **#16 defter baskısı e2e'si koyu temayı hiç kurmuyordu** → yeniden yükleme + `<html class="dark">` ön koşulu —
  `ui-polish.spec.ts` ("günlük defter A4 olarak basılır (koyu temada da açık renk)").
- **#17 açık pencere üstünde Ctrl+K ve "/"** → arama açılmaz (aramanın kendisi açıkken Ctrl+K onu kapatır) —
  `shortcuts.test.tsx` ("açık pencere varken hızlı arama"); "F1 de listeyi açar…" testi listenin kapanmasını bekler.

## Son kontrol düzeltmesi (QA-1, QA2-copy; 2026-10-05)

- **Metin**: copy-REPORT T1–T30 ve E1–E4 `i18n-spec/qa2copy.json` ile (yol adları "Ayarlar → Odalar ve tipler", "Sahip
  giderleri", "Aynı gün giriş‑çıkış ücreti", "Yeniden dene", "ana bilgisayar", "İşten ayrıldı olarak işaretle", "Örn./örn.",
  "yalnız", U+2011). Rusça menüde "Смена и заметки"; üç dilde menü 1366 px'te kesilmiyor (görüntüyle bakıldı).
- **Kılavuz** (K-40, G-18): uzaktan erişim (ekrandaki dört adım, yerel ağ anahtarı kapalı, kimlik, PIN yalnız ana
  bilgisayarda, "Uzaktan oturum süresi", "Bu bilgisayarı ana bilgisayar yap"), ay sonu ve raporlar (kutu adları, dönem ve
  karşılaştırma seçenekleri, "Excel'e aktar", kur kaynakları, tedarik), K-43 elle kur, "Gelmedi olarak işaretle", tek oda
  iptali, K-44 aynı gün ayrılış ve hafta sonu fiyat geceleri, K-42 sahip bölümü kasadan ödenmez, sürekli not; üç dilde.
  "doğrula" notları kapandı; test `kılavuzun içeriği › her bölüm ekranlarla karşılaştırıldı…`. `guide:shots` listesine
  `month-end`, `reports`, `settings-remote` eklendi (görüntüler ayrıca çekilecek; kılavuz metni onlara henüz bağlanmadı).
- **Koda gömülü metin**: içe aktarma gerekçesi kod (`import`) olarak yazılır, denetim kaydında `audit.importReason`
  ile gösterilir; ödeme/teslim notu otelin dilinde (`data-import-fixes.test.ts` "içe aktarmanın gerekçesi kod…",
  `audit-page.test.tsx` "içe aktarmanın gerekçesi kod…"). Sunucunun düz İngilizce cevapları tarayıcının dilinde kısa
  cümle (`server-security.test.ts` "reddedilen sayfa isteği…"). Manifest açıklaması "Otel yönetimi"
  (`web-manifest.test.ts`).
- **Para**: tablo tutarı `money.ts` `parseAmountText(text, currency)` ile para biriminin kuruş hanesine göre okunur
  (`money.test.ts` "tablodaki tutar…", `import-cells.test.ts` "hücredeki tutar…").
- **Otel e-postası (K-13)**: `hotel.email` ayarı, Ayarlar → Otel'de alan; MET isteğinin User-Agent'ına girer
  (`external-service.test.ts` "otelin e-postası yazılınca…", `hotel-sections.test.tsx` "otelin e-postası…").

## Son kontrol düzeltmesi (QA3c2)

Akış testi C2 bulguları (ayarlar, giriş/kilit, turizm). Varsayılanlar (K-39): çıkışı girişten önce olan KBS satırı geceye ve
tabloya katılmaz, "hatalı tarih" uyarısıyla listelenir; yinelenen ad Türkçe büyük/küçük harf katlamasıyla reddedilir
(mevcut yinelenmiş veriye dokunulmaz); kapatılan özel oda tipi soluk satırda kalır ve yeniden açılabilir.

- **Turizm #1**: `ministry-table.test.ts` "çıkışı girişten önce olan satır…", `tourism-stats-fixes.test.ts` "otelde kalan
  sayılmaz, geceye ve tabloya katılmaz…", `kbs-reader.test.ts` (girişten önceki çıkış artık yazıldığı gibi kalır).
- **Personel kuralları #2**: geçersiz sayı alanın altında hemen yazılır, Kaydet açık kalır (`hotel-sections.test.tsx`
  "geçersiz sayı yazılınca ileti hemen çıkar…").
- **Yinelenen ad #3–#6**: `duplicate-names.test.ts` (listeler, oda tipi, rol, kullanıcı adı); alan altında ileti
  (`rooms-section.test.tsx` "aynı ad ikinci kez verilirse…").
- **#7** kurtarma koduyla eski şifre reddedilir, kod harcanmaz (`auth-service.test.ts` "kurtarma koduyla yeni şifre…").
  Bitti ekranı PIN'in silindiğini zaten söylüyor (`auth.recover.doneBody`).
- **#8** `rooms-section.test.tsx` "kapatılan özel tip tabloda soluk satır…". **#9** `users-section.test.tsx` "tek etkin
  sahibin anahtarı ve rol seçicisi baştan kapalıdır…". **#10** `lock-page.test.tsx` "PIN'i olmayan hesaba yanlış şifrede
  PIN anılmaz". **#11** kurulum Otel adımı saat dilimini özetle aynı adla yazar. **#12** arama alanı telefonda 44 px.
- **Kurulum ve yinelenen ad**: sihirbazda otelin yazdığı oda tipi / ödeme-kanal-ek hizmet adı hazır bir satırla aynıysa
  (harf farkı yok sayılır) o satır açılır, ikinci kez eklenmez (`session-access.test.ts` "otelin yazdığı oda tipi adı
  hazır bir tiple aynıysa…"); iki var olan testin örnek adı (Aile odası, Havalimanı transferi) hazır adlarla çakıştığı için
  değiştirildi.

### Son kontrol düzeltmesi (QA3c1: takvim, rezervasyon, misafirler)

- **Tutar yazımı (yüksek)**: `parseMoney` kuralı: yerel ondalık işareti bir kez; diğer işaret tek başına ve ardında 3 hane
  dışında bir şey varsa ondalık (`1250.5` = 1.250,50), 3'lü gruplar binlik (`1.250` = 1.250); yerel ondalıktan sonra gelen
  diğer işaret hata (`1,250.50` tr'de geçersiz). Tüm para alanları (`MoneyInput`, gecelik fiyat tablosu, çamaşır fişi)
  bunu kullanır; Excel/içe aktarma `parseAmountText` ayrı ve değişmedi (`money.test.ts` "tek noktalı 1-2 haneli yazım…",
  "tablodan içe aktarma yolu…", `components.test.tsx` "para alanı Türkçe yazımı…"). Geçersiz gecelik fiyat öneri fiyatına
  dönmez, alan altında hata gösterir (`new-reservation-dialog.test.tsx` "gecelik fiyata abc…").
- **Gelmedi (varsayılan)**: varış gününden önce servis reddeder (`errors.noShowTooEarly`), panel seçeneği kapalı
  (`reservation-flow.test.ts` "gelmedi varış gününden önce…", `reservation-panel.test.tsx` "varışı daha gelmemiş…").
- **Arama**: takvimde soyad-ad sırası, "Oda 102" öneki, telefon sonu "0001"/"00 01" (misafir listesiyle aynı
  `phoneNeedles`); çok uzun sorgu kesilir, hata vermez (`grid.test.ts` "soyad önce yazılınca…",
  `guests-service.test.ts` "telefon sonu 0001…").
- **Formlar**: uzun metin alanları `maxLength` (sözleşmeden okunur, `booking-limits.ts`); 400 geceden uzun konaklamada
  doğru neden (`booking.form.tooLong`); "Engelle" kaydında Resepsiyona onay kutusu sunulmaz, düzey adı her yerde
  "Engelle" (varsayılan; `new-reservation-dialog.test.tsx` "Engelle kaydında…"); satışa kapalı oda penceresi tek mesaj
  (`override.test.tsx`); taşıma listesinde dolu oda işaretli (`reservation-panel.test.tsx` "başka odaya taşı…"); 3 gecelik
  konaklamayı aynı güne çevirmek onay ister ("çıkışı girişe eşitlemek…"); geçmiş girişte uyarı, engel değil (varsayılan;
  "geçmiş bir günde başlayan kayıtta…").
- **Firmalar (varsayılan)**: IBAN mod-97, vergi no 10 hane ya da algoritmayı geçen 11 hane (`tax-id.test.ts`), aynı
  ünvanda uyarı, engel değil (`companies-page.test.tsx` "IBAN kontrol hanesi…"); örnek IBAN'lar geçerli hale getirildi.
- **Telefon**: panel "daha fazla" düğmesi 44×44 (`tests/e2e/mobile/booking.spec.ts`); 70 harflik soyad testi eklendi
  (`guests.spec.ts`; temel kodda yeniden üretilemedi, savunmalı sınıflar eklendi).

### Son kontrol düzeltmesi (QA4)

- **Tek "bugün" (varsayılan: otel saat dilimi):** `src/shared/date.ts` `setHotelTimeZone` / `localDateOf` / `today`, `localDateTimeOf`
  otelin saat dilimini (`hotel.timezone`) kullanır; ana süreç servisler kurulurken ve ayar yazılınca, pencere ayarlar gelince
  dilimi ayarlar. Makine dilimi otelinkiyle aynıysa davranış değişmez. Testler: `src/shared/date.test.ts` ("the hotel day"),
  `tests/unit/hotel-today.test.ts` (Kiritimati, İstanbul değişmez, dilim değişince gün izler). Turizm hatırlatıcısı kalan gün
  sayısı üç ekranda aynı (`daysLeft` = son güne tam gün; 0 = "bugün son gün"): `today.test.ts`, `permissions-today.test.ts`,
  `tasks-fixes.test.ts`.
- **Telefon hedefleri:** Bugün ve Görevler görev kutusunun etrafındaki etiket 44 px gerçek hedef (`mobile/today.spec.ts`,
  `mobile/tasks-shift.spec.ts`).
- **Arayüz bulguları:** Y1 (kalan gün), Y2 (denetim kaydı ham değerler gizli/etiketli: `tests/unit/audit-labels.test.ts`),
  O1 (telefon kısa tarih), O2 (ru arama yer tutucusu), O3 (bakım 2 sütun), O4 (ay sonu "Otomatik" etiketi), O5 (vardiya
  çiftleri telefonda dikey), D1–D6 (yardım düğmesi çerçeveli, kurulum "Geri" yazılı, gün notu italik değil, "1 aydan az",
  raporlar boş durumda "Deftere git": `reports-page.test.tsx`, kılavuz kutusu `pe-6`).
