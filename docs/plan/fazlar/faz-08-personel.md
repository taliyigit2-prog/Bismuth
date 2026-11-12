# Faz 8 · Personel: Maaş, Avans, İzin, Mesai, Prim

**Amaç:** Sahibin "Maaşlar" sayfasını ve defterdeki "x maaş / x izin parası" satırlarını, ayarlanabilir kurallarla
otomatik hesaplayan bir modüle dönüştürmek. Pandora kuralı (4 izin/ay, kullanılmayan ödenir, ÷30) bir **ayar setidir**.

**Gereksinimler:** G-80 … G-88, G-25, G-69, G-85.
**Ön koşul:** Faz 7 (giderler), Faz 9'un takvim bayram verisi (bayram mesaisi için; Faz 9 sonra geliyorsa bayram tablosu tohum verisinden okunur).
**Sorular:** yok — S-34…S-39 cevaplandı (oranları Sahip + Müdür belirler; Pandora'da ek mesai ücreti yok; izin devretmez, ödenir; kasadan avans; ek mesaiyi yalnız Müdür girer, çalışan kendi geliş/çıkış saatini girer).

## Teslimatlar

1. **Çalışan listesi ve kartı**: ad, görev, işe giriş/çıkış, aktif/pasif, maaş + para birimi + geçerlilik tarihi (**maaş geçmişi**: Kenan 30.000 → 40.000), iletişim, notlar, kullanıcı hesabı bağlantısı (varsa).
   - **Ödeme kuralları** (çalışan bazında, otel varsayılanından devralır): aylık izin hakkı; kullanılmayan izin ödenir mi; günlük ücret böleni (30 / ayın gün sayısı); devir; günlük standart saat (8); mesai ücreti türü (**yok** / saatlik sabit / normal saatin %X fazlası — Pandora: yok); bayram oranı; prim türü (yüzde / sabit) ve tabanı (tüm oda geliri / kanal / ek hizmet); kesinti kalemleri; **kasadan avans** açık/kapalı. Oranları ve tabanları yalnız **Sahip + Müdür** değiştirir (K-38).
   - Çalışan çıkarma: pasife alma (geçmiş korunur), çıkış tarihi, son ay hesabı.
2. **Avans**: tarih, tutar, para birimi, not → anında defter gideri (kategori: Avans, çalışan bağlı) + o ayın maaş tablosunda düşer.
3. **İzin**: gün bazlı kayıt (tür: izin / hastalık / ücretsiz / bayramda çalıştı); ay içinde kullanılan/kalan otomatik; defterin gün notuna isteğe bağlı yansıma.
4. **Mesai**: çalışan kendi **geliş ve çıkış saatini** girer (yalnız kendi kaydı; süre hesaplanır, gece yarısını aşan vardiya desteklenir); **ek mesai saatini yalnız Müdür/Sahip** girer; tür (normal / bayram), not, giren kullanıcı (S-39).
5. **Aylık maaş tablosu** (Excel ile birebir sütunlar + yeni sütunlar): Personel · Maaş · Avans · İzin Hak · Kul. İzin · Kalan · İzin Parası · Mesai (saat, tutar) · Bayram Mesaisi · Prim · Kesinti · **Net Ödenecek** · Ödenen · Kalan Borç.
   - Hesap tek fonksiyonda (`computeSalaryPeriod`), kuralları parametre alır; Excel örnekleri test verisi olur (40.000 − 12.500 + 4.000 = 31.500; 35.000 − 35.005 + 2.333 = 2.328).
   - **Ödeme kaydı**: parça parça (S-38) → defterde gider (kategori: Maaş); kalan borç görünür.
   - Ay kilitleme (G-88): "ödendi" sonrası değişiklik yetkiye bağlı, audit.
6. **Personel durumu paneli** (defterin sağ üstündeki Excel panelinin karşılığı): bu ay avans, izin hak/kullanılan/kalan — Bugün ekranında da küçük kart.
7. Rol kuralları: maaş tutarlarını Resepsiyon görmez; Muhasebeci görür/düzenler; Müdür S-09'a göre.

## Kabul ölçütleri

- [x] Excel'deki 12 aylık tablo aynı girdilerle aynı sonuçları verir (test verisi olarak yazılır).
- [x] Avans girince defter ve maaş tablosu aynı anda güncellenir; avans silinince ikisi de geri alınır.
- [x] 10 saat çalışan (8 standart) için 2 saat mesai, seçilen kurala göre doğru tutar; bayram gününde çarpan uygulanır.
- [x] Prim: ay sonu seçilen tabandan yüzde hesaplanır; taban raporla aynı rakamı kullanır.
- [x] Çalışan rolü başka çalışanın verisini göremez (servis katmanı testi).
- [x] Maaş geçmişi: Ocak'ta eski maaş, Eylül'de yeni maaş ile hesap.

## Sonuç (2026-10-05)

P8 paketi (dalga 2). Personel ekranı taslak veriden gerçek servise geçti; kurallar ayardan (`pay_policies`) okunur.

- **Hesap tek fonksiyonda**: `computeSalaryPeriod` (shared/domain/salary.ts) Excel örnekleriyle (31.500; 2.328;
  6.667) ve 12 aylık tabloyla test edilir; servis üzerinden de 12 ay (Ocak 30.000 eski maaş, Eylül 40.000 yeni maaş)
  `staff-payroll.test.ts`'te. Yeni: ay içinde başlayan/ayrılanın **son ay hesabı** (maaş ÷ bölen × çalışılan gün,
  izin hakkı orantılı, aşağı yuvarlanır) (varsayılan) ve `suggestedOvertimeMinutes` (10 saat çalışan, 8 standart → 2 saat
  öneri; ek mesaiyi Müdür/Sahip onaylar, K-38).
- **Sözleşme** `procedures/staff.ts` (24 yordam) + `handlers/staff.ts`; çekirdekteki `staff.getPolicy/setPolicy/
  listEmployees` değişmedi. Bugün kartı (P9c) için okuma: **`staff.panel`** `{year, month}` → çalışan başına bu ayın
  avansı (yalnız maaş görebilene), izin hak/kullanılan/kalan.
- **Para defterde**: avans, maaş/izin/mesai/prim ödemesi `expenses` (kind=staff, kilitli) satırı yazar; iptal iki
  tarafı birlikte geri alır. Prim/kesinti yalnız neti değiştirir.
- **Prim tabanı** `services/revenue-base.ts`: raporlar (Faz 10) aynı fonksiyonu okumalı; satırda `commissionBaseMinor`.
- **Ay kilidi**: `staff.lockMonth` ayın açık satırlarını anlık görüntüyle dondurur, `staff.unlockMonth` gerekçe ister;
  ikisi de denetim kaydına yazar.
- **Ekran**: Çalışanlar (bugünkü durum, hesap, maaş), Maaş tablosu (Excel sütunları; mesai/bayram/prim/kesinti
  sütunları yalnız bir değer varsa), İzin ve çizelge (14 gün; dolu güne tıklayınca iptal), Mesai (Müdür/Sahip), kart
  (bu ay, hareketler + iptal, maaş geçmişi, maaşı değiştir, çalışana özel ödeme kuralları, işten ayrılış/yeniden işe
  alma), "Çalışma saatlerim" kartı (kartı olan herkes kendi geliş/çıkışını girer).
- **Testler**: domain + servis + `tests/unit/permissions-staff.test.ts` (çalışan başkasını göremez; rol matrisi),
  ekran testi, e2e `electron/staff.spec.ts` (ekle → avans → tablo → kısmi ödeme → kalan borç) ve `mobile/staff.spec.ts`.
- **Kapandı** (son kontrol): çalışan rolü (yalnız `staff.own_hours`) Personel ekranına giremez; kendi saat girişi için
  `MyHoursCard` Bugün ekranında (`today-page.tsx:31, 200`) ve Personel ekranında (`staff-page.tsx:297`) durur.
- **Açık**: İznin defter gün notuna yansıması (isteğe bağlı) yapılmadı; defter (P7) personel giderinde türü `staff_txn_id`
  üzerinden gösterebilir.

### Hata avı düzeltmeleri (P7fix, 2026-10-05)

Servis testleri `src/main/services/staff-fixes.test.ts`, domain `src/shared/domain/salary.test.ts` ("erken hata avı
düzeltmeleri"), ekran `src/renderer/features/staff/staff-fixes.test.tsx`.

- **B3** ücretsiz izin günü × günlük ücret maaştan düşer (`03-mimari.md` §6.6) — "ücretsiz izin günleri günlük ücretle
  maaştan düşer: 30.000, 5 gün → 30.000 − 5.000 + 4.000 = 29.000 (B3)", "…Excel örneğini değiştirmez (B3)"; maaş
  tablosunda kesinti sütununda "Ücretsiz izin: N gün".
- **B6** çalışma dönemleri (`employment_periods`, migrasyon `0012_employment_periods`, eski kartlar bir döneme
  taşınır) ve `staff.rehire` — "31 Mart çıkışlı, 16 Haziran yeniden alınan: Nisan–Mayıs boş, Haziran yarım ay,
  Ocak–Mart korunur", "birden çok çalışma dönemi…", "0012: var olan her çalışan kartı…", ekran "çıkış tarihli çalışan
  yeni giriş tarihiyle yeniden işe alınır (B6)", yetki "yeniden işe almayı… Müdür, Resepsiyon ve çalışan yapamaz".
- **B7** hata değil: kısmi ayda takvim günü × aylık/30 (en çok 30), SGK kıstelyevm (varsayılan); dokunulmadı.
- **B8** kapalı günde Sahip gerekçeyle yazar/iptal eder (iptal gerekçesi kapalı gün gerekçesi sayılır; formlar
  reddedilince gerekçe alanı açar) — "Sahip gerekçeyle kapalı güne avans yazar ve iptal eder; Muhasebeci yazamaz",
  "kapalı günde Sahip gerekçe yazar ve ödeme kaydedilir (B8)".
- **B9** maaş "Kasadan (nakit)" ödenebilir, kasadan düşer — "kasadan ödenen maaş kasadan düşer; ikramiye kasadan
  "ödenemez"", "maaş "Kasadan (nakit)" ödenince kasadan düşer… (B9)".
- **B13** mesai saati en çok 2 ondalık — "ek mesai dakikası en çok iki ondalıklı saat olarak yazılır…".
- **B15** "bayramda çalıştı" bayram mesaisi sayılır — "…günlük modda 1 gün, saatlik modda standart gün (B15)".
- **B18** maaş tablosu satır kendi para biriminde, toplamlar para birimi başına — "farklı para birimindeki maaş…".
- **B22** Müdürün dakika düzeltmesi korunur — "çalışan saatini yeniden girince Müdürün düzelttiği dakika ezilmez…".
- **B27** personel yazması defter/kasa/Bugün okumalarını yeniler — "personel yazması defteri, kasa düğmesini ve
  Bugün kartını da yeniler (B27)".
- **B28** sabah girilen gece vardiyası başladığı güne — `staff-page.test.tsx` "…sabah girilen gece vardiyası
  başladığı güne yazılır (B28)" (beklenti 4 → 3 Ekim olarak güncellendi).
- **B29** ödeme kuralları ilk açılışta `pay_policies` otel satırları olarak tohumlanır (`seed/lists.ts`
  PAY_POLICY_SEED); koddaki değerler yalnız güvenli yedek — "ilk açılışta pay_policies otel satırları tohumlanır…".

### Son kontrol düzeltmesi (QA2a, akış testi A)

- **Maaş öde / Avans ver**: "abc" kalan maaşı ödemiyor, eksi tutar alanın altında söyleniyor (servis 0 ve eksiyi
  zaten reddediyor, üst sınır eklendi); kalan maaşı aşan avans ya da ödeme onay sorar (varsayılan, K-46); metinler
  "bu ay" yerine ayın adını yazar — `staff-qa2a.test.tsx`, `money-limit.test.ts`.
- **Kendi saati**: Çalışan kendi geliş/çıkışını yalnız bugün ve `staff.ownHoursBackDays` gün geriye (varsayılan 7,
  Ayarlar → Personel kuralları → "Çalışanın kendi saati") yazar, gelecek güne yazamaz; Müdür/Sahip sınırsız
  (varsayılan, K-46) — `permissions-staff.test.ts` "kendi saati: yalnız bugün ve son günler (QA2a, K-46)".
- Yeni maaşın varsayılan tarihi: maaşı hiç olmayanda bu ayın 1'i, olanda gelecek ayın 1'i; yeni çalışanda maaş 0/boş
  uyarısı (kaydı engellemez); çıkış tarihinden sonraki çizelge günleri boş; telefonda çizelge hücreleri 44 × 44 px
  (e2e telefon `staff.spec.ts`).
- Değişen beklentiler: `staff-service.test.ts`, `staff-payroll.test.ts` ve `permissions-staff.test.ts` kendi saatini
  günün kendisinde (test saatiyle) yazar; `staff-page.test.tsx` "Eylül 2026 için kalan maaş".

