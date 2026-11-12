# Faz 10 · Raporlar, İstatistikler ve Turizm Bakanlığı Konaklama İstatistiği

**Amaç:** "Eylül Özet" ve "Yıllık Özet" sayfalarının çok daha iyisi: grafikler, karşılaştırma, KPI'lar; hepsi tek
kaynaktan türetilir; rol bazlı görünürlük. Ayrıca **bakanlığa her ay bildirilen uyruk/geceleme tablosunu** KBS
Excel'inden saniyeler içinde üretmek.

**Gereksinimler:** G-100 … G-105, G-70, G-150.
**Ön koşul:** Faz 7, Faz 8, Faz 9.
**Sorular:** yok — S-32, S-40, S-43, S-60, S-61, S-78, S-81, S-91, S-99 (gerçek yatak sayısı; bakanlıktaki 28 kullanılmaz) cevaplandı.
**Referans:** `02-excel-analizi.md` §2.4.1–2.4.2, `03-mimari.md` §6.10–§6.11, K-24, K-29, K-36; prototip `prototypes/kbs-stats` (15 test).
**Tasarım rehberi:** `dataviz` becerisi (renk sistemi, grafik türü seçimi) her grafikten önce okunur.

## Teslimatlar

1. **Rapor çerçevesi**: tarih aralığı seçici (bu ay, geçen ay, bu yıl, özel), karşılaştırma (önceki dönem / geçen yıl aynı dönem), para birimi görünümü (ana para birimi karşılığı + orijinal; kur kaydın yazıldığı dakikada dondurulmuş — S-32), dışa aktar (CSV/XLSX, yazdır/PDF).
2. **Ay sonu kontrol** (G-100; sahibin rutini, `akislar.md` §2): kart ve IBAN toplamları (x'lenmiş / bekleyen), maaşlar (net / ödenen / kalan), ciro, kâr, **en çok harcama** listesi (`topExpenses`: personel, ürün kategorileri, açıklamalar).
2b. **Aylık özet** (Excel "Eylül Özet" karşılığı): 3 KPI kutusu (ciro, gider, net kâr) + önceki döneme göre değişim; gelir detayları tablosu (yöntem × para birimi + TL karşılığı); kanal dağılımı (çubuk/halka); günlük kartlar yerine **günlük ciro çizgi grafiği** + tıklayınca gün detayı; resmi giderler / yönetici giderleri (yetkiye göre).
3. **Yıllık özet** (Excel "Yıllık Özet" karşılığı): ay ay ciro/gider/kâr gruplu çubuk; kümülatif çizgi; yıl seçimi ve 2 yılı yan yana.
4. **Otel KPI'ları** (öncelik sırası S-40: ciro, kâr, gider, doluluk, ödeme yöntemi, kanal): doluluk % (dolu gece / satılabilir gece; satılmaz bloklar paydadan düşer), ADR (oda geliri / dolu gece), RevPAR (oda geliri / satılabilir gece), ortalama kalış süresi, haftanın günlerine göre doluluk ısı haritası (cumartesi etkisi), ay bazında doluluk, oda tipine/odaya göre gelir, tekrar gelen misafir oranı, en çok gelir getiren misafirler (yetki).
5. **Kasa ve ödeme raporları**: yöntem bazlı toplamlar, teslim alma geçmişi, teslim alınmamış bakiye yaşı, x'lenmemiş kart/IBAN satırları, para birimi bazlı kasa.
6. **Gider raporları**: en çok harcama (personel / ürün kategorisi / açıklama grupları), aylık trend, personel maliyeti oranı (maaş+avans+izin+mesai+prim / ciro), bölüm (Genel / Yönetici — yetkiye göre).
7. **Personel raporları**: çalışan bazında yıllık maliyet, izin kullanımı, mesai saatleri.
8. **Dışa aktarma**: her tablo CSV/XLSX; yazdırma şablonu (A4, otel adı, tarih aralığı, sayfa numarası).
9. Rol: rapor grupları yetki anahtarlarıyla (`reports.finance`, `reports.occupancy`, `reports.staff`, `tourism_stats`).
10. **Turizm İstatistiği ekranı** (`features/tourism-stats/`, G-150):
    - **KBS dosyası yükle** (xlsx; sütunlar **başlık adıyla** bulunur; sürükle‑bırak); ay/yıl otomatik dosya adından (`01092026_30092026`) ve satırlardan; önizleme: satır sayısı, aynı gün sayısı, otelde kalanlar (planlı çıkış ya da içe alma gününe kadar sayıldığı yazılı, düzeltilebilir), **kontrol edilecek uyruklar** (yazım hatası önerisi — ör. "TÜRKYİE → Türkiye?" —, belirsiz "KIBRIS", tarihî ülke; kullanıcı bir kez onaylar → `country_map`'e kalıcı; K-36).
    - **Sonuç tablosu**: bakanlık paneli sırasıyla **Ülke · Toplam Giriş · Toplam Geceleme** (Türkçe ülke adı — panelde liste yok, yazdıkça çıkan kutu var; ad Bismuth'tan, kullanıcı yeniden adlandırabilir; Türkler dahil; aynı gün = 1 gece); toplamlar; doluluk oranı; sıralama; **kopyala** (satır satır ve tüm tablo), CSV/XLSX; "bildirildi" işareti + tarih (geçmiş bildirimler listesi).
    - **Karşılaştırma**: programın kendi rezervasyon verisinden (misafir uyruğu) aynı tablo; farklar (ülke bazında) listelenir; uyruğu boş misafirler sayılır ve "uyruk eksik" listesi verilir.
    - Kişisel veri: ad/kimlik sütunları ve cinsiyet hiç okunmaz; yalnızca tarih, oda, uyruk, durum saklanır (`kbs_stay_rows`;
      `gender` sütunu boş kalır — Faz 2'de KVKK veri en aza indirme gereği kaldırıldı; bakanlık tablosu cinsiyet istemiyor).
    - Kurallar (K-29, sahip bakanlıkla teyit etti): **tüm geceler giriş ayına, sonraki aya sarkanlar dahil** (S-81); aynı gün = 1; çocuk ayrı sayılmaz; **doluluk oranı = geceleme ÷ (yatak sayısı × ayın gün sayısı)**, yatak sayısı kapasite geçmişinden (K-27; gerçek sayı, S-99). Otelde kalanlar: Bismuth'ta aynı oda + giriş günü rezervasyonu varsa planlı çıkışa kadar, yoksa içe alma gününe kadar; işaretli, düzeltilebilir.
    - Misafir bazlı KBS bildirim takibi Faz 5 ve Faz 9'da (G-53, G-54); bu ekran yalnız aylık istatistiktir.

## Kabul ölçütleri

- [x] Aynı örnek veriyle aylık ciro = defter toplamı = takvimden türetilen toplam (üç yol aynı rakamı verir; test). — `reports-service.test.ts` "Ekim cirosu 37.300: rapor = defter toplamı = takvimden türetilen ödenmiş geceler"
- [x] Doluluk hesabı satılmaz blokları düşer; day‑use geceleri ayrı sayılır (ayar: dahil/hariç). — `reports-service.test.ts` "3 oda × 31 gün − 4 gün satılmaz = 89…", "aynı gün giriş‑çıkış ayrı sayılır; ayar açılınca…", `reports-period.test.ts`
- [x] Grafikler açık/koyu temada okunur; renk körlüğü güvenli palet; her grafiğin tablo görünümü vardır. — `ChartCard` (grafik/tablo anahtarı), görüntüler tr/ru × açık/koyu × masaüstü/telefon; karşılaştırma dönemi ikinci renk değil gri; ısı haritası tek renk tonu + hücrede değer
- [x] (kısmen: exceljs geri okuma testi var; Excel, Numbers ve LibreOffice'te açma sahip onay paketinde; son kontrol) XLSX dışa aktarma Excel ve Numbers'ta açılır; Türkçe karakterler bozulmaz. — `export-tables.test.ts` "aylık özet Excel dosyası geri okununca Türkçe harfler aynen durur", e2e `reports.spec.ts` (kaydedilen dosya geri okunur); Excel/Numbers'ta açılış sahip onay paketine
- [x] Yazdırma önizlemesi A4'e sığar. — e2e `reports.spec.ts` (printToPDF: A4 MediaBox, sayfa sayısı; A4 yazılabilir genişlikte taşma yok)
- [x] Resepsiyon rolü kâr/gider raporlarını menüde görmez; doğrudan erişim denemesi servis katmanında reddedilir. — `tests/unit/permissions-reports.test.ts` (6 rol × 11 yoklama + yönlendirici 403), e2e "resepsiyon menüde raporları ve ay sonunu görmez"
- [x] Panel doğrulaması: 1 giriş / 2 gece / 28 yatak / 30 gün → %0,24 (bakanlık panelindeki değer); Pandora 38 yatakla Eylül 840 gece → %73,7.
- [x] Sahibin Eylül 2026 KBS dosyası yüklenince 23 ülke, 607 giriş, **840 geceleme** (otelde kalan 5 kişi 1 Ekim'e kadar; planlı çıkışları Bismuth'ta varsa ona göre) üretilir; "GERMANY (Deutschland)" → "Almanya", "KUZEY KIBRIS TURK CUMHURİYETİ" → "Kuzey Kıbrıs Türk Cumhuriyeti" otomatik; "TÜRKYİE" gibi hatalı yazım öneri + onay ister; "KIBRIS" otomatik eşlenmez; onaylanan eşleme hatırlanır.
- [x] Kopyala → bakanlık paneline yapıştırılabilir biçim; "bildirildi" işareti geçmişte görünür.
- [x] Program verisi karşılaştırması: uyruğu girilmiş sentetik veride fark 0; eksik uyruk listesi doğru.

## Sonuç — P10b Turizm istatistiği (madde 10)

- **Ekran** `features/tourism/` (faz metnindeki `tourism-stats/` yerine var olan klasör; rota `/tourism`): örnek veri
  kaldırıldı, gerçek servise bağlandı. Adımlar: 1) KBS listesi sürükle‑bırak ya da seç (yalnız `.xlsx`); özet: satır,
  aynı gün, otelde kalan, dosya dönemi. 2) Uyruk onayı (yazım hatası → öneri + "Kabul et"; belirsiz/hassas/eski/tanınmayan
  → yazdıkça süzülen ülke listesi, öneriler üstte); otelde kalanlar kartı (sayıldığı çıkış günü + dayanağı, "Düzelt" ile
  elle gün, "Otomatiğe döndür"). 3) Bakanlık tablosu Ülke · Toplam Giriş · Toplam Geceleme, toplam, yatak, doluluk
  (%1 altı iki ondalık: %0,24; üstü bir ondalık: %73,7), satır ve tablo kopyası (onay bitmeden kapalı), ülke adını
  değiştirme (sonraki aylarda da), Excel/CSV indir, "Bildirildi olarak işaretle" / "İşareti kaldır". Bismuth kayıtlarıyla
  karşılaştırma (ülke farkları, uyruğu eksik kişiler, KBS'de olmayan / Bismuth'ta olmayan konaklamalar) ve geçmiş
  bildirimler. Telefonda tablolar liste, diyaloglar alttan.
- **Servis/sözleşme**: `tourism.{listImports, import, table, compare, countries, confirmCountry, renameCountry,
  setStayUntil, markReported, export}`; dosya JSON zarfında base64 gelir. Ay/yıl dosya adından (`01092026_30092026`),
  yoksa satırların çoğunun giriş ayından. Yatak sayısı kapasite geçmişinden (ay içinde değiştiyse günlerin yatak
  toplamı payda). Migrasyon `0008_kbs_reported` (`kbs_imports`: `range_from`, `range_to`, `reported_at`, `reported_by`).
- **Otelde kalanlar (varsayılan)**: planlı çıkış yoksa içe alma günü, ama dosyanın son gününün ertesinden ileri değil
  (Eylül dosyası 4 Ekim'de alınsa da 1 Ekim'e kadar → 840). Kullanıcı satır satır düzeltebilir.
- **Kişisel veri**: ad, soyad, kimlik/belge no, plaka ve cinsiyet okunmaz; içe almadan sonra veritabanının tamamının
  dökümünde hiçbiri yok (`tourism-stats-service.test.ts`).
- **Doğrulama**: sahibin Eylül 2026 dosyası yalnız yerelde servis üzerinden yüklendi (dosya ve ondan türeyen hiçbir veri
  depoda değil): 23 ülke, 607 giriş, 840 geceleme, 248 aynı gün, 5 otelde kalan, 38 yatakla %73,68; "Almanya" ve
  "Kuzey Kıbrıs Türk Cumhuriyeti" otomatik; 1 eski ülke yazımı onay istedi. Panel doğrulaması (1 giriş / 2 gece /
  28 yatak / 30 gün → 24 baz puan = %0,24) birim testinde.
- **Testler**: `ministry-table.test.ts`, `tourism-stats-service.test.ts`, `src/shared/contract/tourism.test.ts`,
  `tests/unit/permissions-tourism.test.ts` (6 rol × 10 işlem + yönlendirici), `features/tourism/tourism-page.test.tsx`;
  e2e `tests/e2e/electron/tourism.spec.ts` ve `tests/e2e/mobile/tourism.spec.ts` (sentetik dosya → onay → tablo →
  kopya → bildirildi).
- **Sahip onay paketine**: gerçek panele kopyalanan satırın yapıştırılması; XLSX/CSV'nin Excel ve Numbers'ta açılışı.

## Sonuç — P10a Raporlar, ay sonu, KPI, dışa aktarma (madde 1–9; 2026-10-05)

- **Servis** `src/main/services/reports/` (`reports-service.ts`, `queries.ts`, `export-tables.ts`): `reports.{context,
  summary, monthly, yearly, occupancy, cash, expenses, staff, monthEnd, export}` (sözleşme `procedures/reports.ts`).
  Ciro = canlı ödemeler iş gününe göre (defterin toplamı; x ciroyu değiştirmez), gider = görülebilen bölümlerin
  giderleri, kur kaydın yazıldığı anda dondurulmuş `amount_base_minor` (K-15, S-32); kuru bilinmeyen satırlar sayılıp
  ekranda not olarak yazılır. Toplamlar SQL'de GROUP BY ile (gün/ay × yöntem × kanal × para birimi; oda × ay ×
  haftanın günü × slot); 10 yıl × 20 oda (73 060 gece) bütün raporlar < 1 sn (`reports-perf.test.ts`, sınır 4 sn).
  Yeni dizin/migrasyon gerekmedi.
- **Doluluk** = satılan gece ÷ satılabilir gece; satılabilir gece kapasite geçmişinden gün gün (K-27) ve canlı
  blok günleri (satılmaz + kullanım dışı) düşülerek (`src/shared/domain/reports-period.ts`). Aynı gün giriş‑çıkış
  ayrı sayılır; yeni ayar `reports.dayUseInOccupancy` (varsayılan **hariç** — (varsayılan)), Doluluk sekmesinde
  ayar yetkisi olana anahtar. ADR = oda‑gece ücretleri ÷ satılan gece, RevPAR = ÷ satılabilir gece; oda geliri
  personel komisyon tabanıyla aynı rakam (`revenue-base.ts` ile test).
- **Ekranlar**: Raporlar (sekmeler: Özet [= "Eylül Özet": 4 KPI + karşılaştırma, gelir detayı yöntem × para birimi +
  TL karşılığı, kanal dağılımı (ciroya eklenmez), günlük ciro çizgisi → gün dökümü → "Defterde aç" (`/ledger?day=`),
  gider bölümleri + yönetici giderleri (yetkiye göre), en çok harcama], Yıllık özet [gruplu çubuk, biriken çizgi, iki
  yıl yan yana], Doluluk ve KPI [doluluk, ADR, RevPAR, ortalama kalış, tekrar gelen misafir, ay × haftanın günü ısı
  haritası, aylara göre doluluk, oda tipi/oda geliri, en çok gelir getiren misafirler (finans + misafir yetkisi)],
  Kasa ve ödemeler [yöntem × para birimi + bekleyen, teslim alma geçmişi, bekleyen paranın yaşı, x'lenmemiş kart/IBAN
  satırları, kasada olması gereken], Giderler [aylık eğilim, personel maliyeti oranı, gruplar, bölümler], Personel
  [çalışan bazında yıllık maliyet (maaş, avans, izin/mesai/diğer), izin günü, çalışılan ve ek mesai saati]) ve Ay sonu
  kontrolü (kontrol listesi, KPI'lar önceki aya göre, kart/IBAN x'lenmiş/bekleyen + IBAN kanala göre, en çok harcama,
  maaşlar net/ödenen/kalan, bakanlık bildirimi). Örnek veri (`mocks`) bu iki ekrandan kaldırıldı. Dört hâl, telefonda
  sekmeler açılır liste, tablolar kart/dar sütun; Ay sonu telefonda "Daha fazla"da (G-143).
- **Dönem çerçevesi**: Bu ay / Geçen ay / Bu yıl / tarih aralığı; "Bu ay" ve "Bu yıl" bugüne kadar sayılır ve önceki
  ayın/yılın **aynı günleriyle** karşılaştırılır (yarım ay bütün ayla kıyaslanmasın — (varsayılan)); karşılaştırma:
  önceki dönem / geçen yıl aynı dönem / yok.
- **Dışa aktarma**: her tablonun kartında CSV/Excel menüsü, raporun tamamı tek Excel (her tablo bir sayfa);
  programın penceresinde "Farklı kaydet", telefonda indirme; denetim kaydına `export` satırı. **Yazdır/PDF**: yalnız
  rapor tabloları (grafiklerin tablo görünümü), A4, her sayfanın başında otel adı + rapor + dönem, sayfa altında
  "1 / 2"; koyu temada da açık basılır.
- **Ay sonu "baktım" işaretleri** (Ciro ve En çok harcama) bu cihazda ay başına saklanır; kart/IBAN, maaş ve bakanlık
  adımları kayıtlardan kendiliğinden kapanır (varsayılan).
- **Yetki** (G-105): Raporlar menüsü `reports.operations`; para sekmeleri `reports.finance`; Personel `reports.staff`;
  dışa aktarma `reports.export` + raporun kendi yetkisi; Ay sonu menüsü artık `reports.finance` (eskiden `ledger`:
  resepsiyon görüyordu). Resepsiyonun doğrudan çağrısı serviste 403.
- **Kapsam dışı küçük dokunuşlar**: `navigation.ts` (Ay sonu yetkisi + telefon), `ledger-page.tsx` (`?day=` ile gün
  açılır), `hooks/use-mobile.ts` (yazdırırken telefon düzenine geçmez — yoksa ekran yeniden kurulup yazdırma düzeni
  kayboluyordu; gece listesi de bundan yararlanır), `services/index.ts` (servis kaydı), `contract/settings.ts` (yeni ayar).
- **Testler**: `reports-period.test.ts`, `reports-service.test.ts`, `export-tables.test.ts`, `reports-perf.test.ts`,
  `tests/unit/permissions-reports.test.ts`, `reports-page.test.tsx`, `month-end-page.test.tsx`, `use-mobile.test.tsx`;
  e2e `tests/e2e/electron/reports.spec.ts` (veri gir → ay sonu → özet → gün defterde → Excel → yazdır/printToPDF;
  resepsiyon) ve `tests/e2e/mobile/reports.spec.ts`.
- **Sahip onay paketine**: XLSX/CSV'nin Excel ve Numbers'ta açılışı; gerçek yazıcıda A4 çıktı.
- **Kalan / not**: koyu temanın grafik renkleri (`--chart-1`, `--chart-2`) dataviz doğrulayıcısında açıklık bandının
  biraz üstünde (L 0,70); tema belirteçleri bu paketin dışında, değiştirilmedi.

## Sonuç — Hata avı düzeltmeleri (P10fix; 2026-10-05)

Faz 10 hata avının 17 bulgusu (Faz 12'ninkiler dahil) düzeltildi; her biri kalıcı testle. Migrasyon
`0014_report_fixes`: `charges.amount_base_minor` (gece/ek hizmet ücretinin ana para birimi karşılığı, yazıldığı anda
dondurulur) ve `kbs_stay_rows.assigned_iso2` (uyruğu boş satırın atandığı ülke). Eski veri: ana para birimindeki
ücretlere `amount_base_minor = amount_minor` yazan tek `UPDATE` (yabancı para birimli eski ücretler boş kalır; rapor
onları o günün kuruyla çevirir ya da "kur yok" sayar).

| # | Bulgu | Düzeltme | Test |
|---|---|---|---|
| 1 | K-42 (2): rapor sorguları maaş süzgecini uygulamıyordu (Müdür havale maaşını görüyordu) | `expenseFacts` / `expensesForTop` defterle aynı `sectionAccess().where` (bölüm + K-42) | `reports-fixes.test.ts` "Müdür havale maaşını defterde de raporlarda da görmez: gider 500 her yerde" (defter = Özet = Aylık = Ay sonu = Giderler = Yıllık = Excel), "Sahip maaşı görür: defter ve raporlar 30.500" |
| 2 | Personel raporu yalnız `reports.staff` istiyordu | Para sütunları `staff.salary` + görünür bölümler; ciro `reports.finance`; oran ikisini ister; ekran ve Excel para sütunlarını gizler | `reports-fixes.test.ts` "maaş yetkisi olmayan rol para sütunlarını almaz…", "maaş yetkisi olmayanın Excel dosyasında para sütunu yok"; `reports-page.test.tsx` "personel raporu maaş yetkisi olmadan para sütunu ve maliyet göstermez" |
| 3 | Ay sonu maaş tablosu farklı para birimlerini toplayıp ₺ yazıyordu; "maaşlar tamam" toplamdan | Para birimi başına alt toplam; adım her satırın kalanı ≤ 0 iken kapanır; kalan tutar para birimi başına | `month-end-page.test.tsx` "maaş adımı her çalışanın kalanı sıfır ya da altındayken kapanır…", "farklı para birimindeki maaşlar toplanmaz…" |
| 4 | Uyruğu boş / "-" KBS satırı onaylanamıyordu, kopya kalıcı kapalıydı | Ayrı "Uyruğu boş satırlar" listesi; satır bazında ülke (`tourism.assignRow`, `country_map`'e yazılmaz); hepsi atanınca kopya açılır — (varsayılan, ana oturum kararı) | `tourism-stats-fixes.test.ts` "boş ya da "-" satırlar yazım onayına düşmez…", "uyruğu yazılı satır atanamaz; yetkisiz rol reddedilir"; `tourism-page.test.tsx` "uyruğu boş KBS satırı satır bazında bir ülkeye atanır…"; `permissions-tourism.test.ts` |
| 5 | Konaklama içinde oda değişikliği karşılaştırmada iki giriş | Aynı rezervasyonun ardışık parçaları tek kalış; kişi kaydı yoksa yedek kişi sayısı | `tourism-stats-fixes.test.ts` "konaklama içinde oda değişikliği tek kalıştır: fark yok" |
| 6 | Otelin eklediği ödeme yöntemi ay sonu ve x kontrolünde yoktu | Eklerken grup seçilir (nakit/kart/IBAN/diğer); ay sonu kart, IBAN, 0 olmayan diğer gruplar ve nakit; x bekleyenler nakit dışı her grup — (varsayılan, ana oturum kararı) | `reports-fixes.test.ts` "eklenirken grup seçilir; ay sonu bütün grupları gösterir…"; `lists-section.test.tsx` "yeni ödeme yöntemi eklenirken kasa grubu seçilir"; `month-end-page.test.tsx` "otelin eklediği yöntem grubu ay sonu tablosunda görünür" |
| 7 | Yabancı para birimli gece ücreti kur yoksa sessizce 0 | Ücret yazıldığında dondurulur; kur yoksa o günün (ya da yazıldığı anın) kuru aranır, yoksa "kur yok" sayısına girer ve Doluluk ekranında not çıkar; prim tabanı aynı kuralla — (varsayılan, ana oturum kararı) | `reports-fixes.test.ts` "kur biliniyorsa gece ücreti yazıldığı anda ana para birimine dondurulur", "kur yoksa sessizce 0 sayılmaz…" |
| 8 | Elle yazılan satır tutarı yuvarlanıp değişiyordu (2,75 kg = 1.000 → 1.000,01) | Yazılan tutar aynen saklanır (`expense_items.amount_minor`), birim fiyat bilgi | `supply-laundry-flows.test.ts` "elle yazılan satır tutarı aynen saklanır…"; `supply-page.test.tsx` "elle yazılan satır tutarı aynen gider…" |
| 9 | Personel Excel'inde izin günü tatilde çalışılan günü de sayıyordu | Ekran ve dosya tek kural (`staffLeaveDays`) | `reports-fixes.test.ts` "Excel'deki izin günü ekranla aynı…" |
| 10 | Yeniden içe almadan sonra turizm ekranı "Bildirilmedi", ay sonu "Bildirildi" | Yeni içe alma ayın işaretini devralır; ay sonu en yeni içe almaya bakar | `tourism-stats-fixes.test.ts` "aynı ay yeniden alınınca yeni dosya bildirilmiş sayılır…" |
| 11 | Karşılaştırma giriş yapılmamış kalışları ve sonradan gelen kişiyi kalışın tamamı kadar sayıyordu | Yalnız giriş yapılmış kalışlar; kişi kendi geliş/ayrılış gününden; oda+giriş eşleşmesi kişi bazında | `tourism-stats-fixes.test.ts` "giriş yapılmamış geçmiş kalış sayılmaz; sonradan gelen kişi kendi giriş gününden sayılır" |
| 12 | "Bu yıl" karşılaştırması artık yılda bir gün kayıyordu | Geçen yılın aynı ay-gününe kadar | `reports-page.test.tsx` ""bu yıl" geçen yılın aynı ay-gününe kadar karşılaştırılır…" |
| 13 | Yıllık sekmede süren yıl öbür yılın tamamıyla kıyaslanıyordu | Değişim iki yılın aynı aylarıyla (Ocak–bu ay); ipucu "aynı aylarına göre" | `reports-page.test.tsx` "yıllık özet iki yılı yan yana gösterir" (+%50) |
| 14 | Virgüllü CSV'de tırnaklı ad bölünüyordu; "Adı Soyadı" başlığı tanınmıyordu | Tırnağa duyarlı bölme (`splitCsvLine`), yaygın başlık sözcükleri | `contacts-csv.test.ts` "virgüllü dosyada tırnak içindeki virgül hücreyi bölmez", ""Adı Soyadı;Telefon;Kategori" gibi yaygın başlıklar atlanır…" |
| 15 | Excel'de tam sayı miktar "160," görünüyordu | Tam sayıya `#,##0`, kesire `#,##0.###` | `writers.test.ts` "tam sayı miktar ondalık işaretsiz…" |
| 16 | Ay sonu Excel'inde "Satır" sütunu ve "Kart ve IBAN" sayfasında nakit | Kart ve sayfa adı "Ödeme yöntemleri", sütun "Bekleyen satır" | `reports-fixes.test.ts` "sayfa adı "Ödeme yöntemleri", sütun "Bekleyen satır"" |
| 17 | Muhasebeci çamaşırhaneyi yalnız görüyordu | Faz-12 madde 5'e göre varsayılan `laundry: edit` (Resepsiyon da düzenlemeye devam eder) — (varsayılan, ana oturum kararı) | `permissions-supply.test.ts` "Muhasebeci tedarik ve çamaşırhaneyi düzenler…" |

- **Metin**: "Kart ve IBAN" yerine "Ödeme yöntemleri"; x bekleyen satır metinleri "nakit dışı"; turizm kopya uyarısı
  "Onay bekleyen N uyruk var" (yazım + boş uyruk birlikte).
- **Not**: rol izinleri kurulumda tohumlanır; daha önce kurulmuş bir veritabanında Muhasebeci'nin çamaşırhane düzeyi
  `view` kalır (sahip Roller ekranından değiştirir). Program henüz sahada olmadığından migrasyonla değiştirilmedi.

## Son kontrol düzeltmesi (QA-1, QA1b — 2026-10-05)

- **Ay sonu "baktım" işaretleri kişi tercihinde** (K-46 (6), karar denetimi #13; önceki "(varsayılan) bu cihazda"
  kararının yerini aldı): "Ciro" ve "En çok harcama" işaretleri ana bilgisayarda kişinin `user_preferences` satırında
  (`monthEnd.ticks.YYYY-MM`); `reports.monthEndTicks` / `reports.setMonthEndTicks` (`reports.finance` görme). Kişisel
  görünüm: denetim kaydına yazılmaz. Bu cihazdaki eski işaretler ekran ilk açıldığında bir kez kişinin tercihine eklenir
  (`merge`) ve buradan silinir. Testler: `month-end-ticks.test.ts` "aynı kullanıcının iki oturumu … aynı işareti görür;
  başka kullanıcı görmez", "denetim kaydına yazılmaz", yetki; `month-end-page.test.tsx` (ana bilgisayara yazılır, başka
  cihazda görünür, eski işaretler bir kez taşınır); `permissions-reports.test.ts` iki yeni yordam.

## Son kontrol düzeltmesi (QA-1, QA1c; 2026-10-05)

- **K-29 turizm karşılaştırması**: kişi kaydı olmayan konaklamada program tarafı artık rezervasyonun **yetişkin
  sayısı** kadar giriş sayar (çocuk ayrı giriş değil; önce yetişkin + çocuk sayılıyordu). Karşılaştırma bu yolla
  sayılan konaklama sayısını döner (`headCountStays`) ve ekran not düşer ("Kişi listesi olmayan N konaklamada yetişkin
  sayısı kadar giriş sayıldı; çocuklar ayrı sayılmadı (bakanlık kuralı)."). Turizm Excel/CSV'si yalnız KBS tablosunu
  verir (karşılaştırma dosyaya girmez), not bu yüzden yalnız ekranda. 607 / 840 / %73,68 testleri değişmedi.
  Testler: `tourism-stats-fixes.test.ts` "kişi kaydı yoksa yetişkin sayısı kadar giriş sayılır…",
  `tourism-page.test.tsx` "karşılaştırma ülke farkını…" (not satırı eklendi).
- Kur kaynakları ve tedarik giderleri kartları raporlara eklendi (ayrıntı: Faz 11 ve Faz 12 dosyalarının QA-1 notu).
- Örnek veri temizliği: turizm ekranının iki ay yardımcısı (`nextMonthStart`, `previousMonth`) `src/shared/date.ts`'e
  taşındı; örnek veriyle çalışan, hiçbir yerden kullanılmayan `features/ledger/derive.ts` silindi (`date.test.ts`
  "sonraki ayın ilk günü…", "önceki ay…").
