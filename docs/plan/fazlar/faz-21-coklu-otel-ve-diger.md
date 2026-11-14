# Faz 21 — Çoklu otel ve diğer iyileştirmeler

> Kaynak: `docs/analiz/10-coklu-otel.md` (K-54), `04-otel-ihtiyaclari.md` §5, `02-hata-raporu.md` (Orta/Düşük);
> paket kartları `08-gelistirme-plani.md` §5. Dalgalar 11–13 (P21b + P21d → P21c → P21e + P21a isteğe bağlı). Ön koşul: S-114…S-117 cevapları ya da varsayılanlar.

## Amaç
Sahibin birden fazla oteli tek programdan, her otel kendi bilgisayarında ve kendi veritabanıyla (çevrimdışı ilke
bozulmadan) yönetilir; sahip tüm otellerin özetini tek ekranda görür. Küçük otel pratiklerinden eksik kalanlar tamamlanır.

## Gereksinimler
Ö-21 (çoklu otel; kabulüyle G-198), Ö-22 (geç çıkış, no-show bedeli, gece raporu), K-19 (otel bilgisayarı tek yazıcı),
K-32 (yedek), K-54 (taslak), G-140…G-146 (çoklu cihaz).

## Sorular
Cevaplandı (2026-11-13): 2 otel, aynı şehir; her otelin kendi ana bilgisayarı, birbirine bağlanabilir (NetBird); portföy:
takvim, gelir-gider, bugünkü doluluk, kasa; ortak personel yok. K-54 kesin.

## Teslimatlar
1. **P21a Profil altyapısı (isteğe bağlı, dalga 13)** — `userData/hotels/<kod>/` (db, attachments, backups, logs); ilk
   açılışta taşıma (onaylı); giriş ekranında otel seçici; Ayarlar → Oteller; sahip hesabı kopyalama; Drive yolu
   `Bismuth/<kod>/yedekler`. Sahip her otelde ayrı bilgisayar dediği için öncelik düşük; bütçe yetmezse atlanır.
2. **P21b İstemci çoklu ana bilgisayar** — Bağlan ekranında kayıt listesi (ad + adres + parmak izi); adres doğrulama ve
   nedenli bağlantı hatası (H-33); kopya klasörleri
   `replica/<kod>`; otel değiştirince oturum yenilenir.
3. **P21c Portföy özeti** — `features/portfolio/` (owner): S-116'ya göre **iki otelin takvimi** (otel seçici ya da yan
   yana salt-okunur takvim), gelir-gider özeti, bugünkü doluluk, kasa; kaynak canlı bağlantı (P21b) ya da kopya; para
   birimi otel başına; telefon düzeni.
4. **P21d Küçük otel pratikleri** — geç çıkış ücreti (saat + tutar kalemi), no-show bedeli kalemi, hasar depozitosu
   (iade edilecek emanet) kalemi, yazdırılabilir tek sayfa gece raporu (gelen/giden/kalan/kasa).
5. **P21e Orta/Düşük bulgular** — 02 raporunda "P21e" işaretli bulgular: H-13 telefon "çıkış yaptı" rozeti; H-16 telefon
   sheet'i geri tuşuyla kapanmıyor; 04 §3: mükerrer misafir kartı uyarısı (ad yazılınca mevcut kart önerisi), Ayarlar
   "sık kullanılan" sekmesi; akış testi 2. oturum Orta/Düşük maddeleri (02 §2 "P21e": H-20 denetim paneli etiketleri,
   H-22, H-23, H-26, H-27, H-29, H-30, H-31, H-32; 2. grup: H-37…H-43, H-45…H-47).

## Kabul ölçütleri
- [ ] (P21a yapılırsa) tek otel kurulumu veri kaybı olmadan `hotels/<kod>/` altına taşınır; iki profil arasında geçiş ≤ 3 sn; veri sızmaz.
- [x] İstemci iki ana bilgisayar kaydı tutar; yanlış parmak izinde bağlanmaz (mevcut QA3d testi iki kayıtla). — `tests/unit/hotel-list.test.ts` «oteller arasında geçince…yanlış parmak izinde bağlanmaz», e2e `tests/e2e/electron/hotels.spec.ts`
- [x] Portföy ekranı yalnız owner; iki otelin takvimi, gelir-gider, doluluk ve kasa doğru (fabrika ile iki otel; rakamlar `ledger`/`reports` ile aynı). — `tests/unit/portfolio.test.ts` «bugünkü doluluk, kasa ve dönem gelir-gider ekran servisleriyle aynı sayıdır», «kullanımdaki otel canlı, öteki kopyadan gelir…», `tests/unit/permissions-portfolio.test.ts`, `tests/e2e/electron/portfolio.spec.ts`, `tests/e2e/mobile/portfolio.spec.ts`
- [x] Geç çıkış ve no-show kalemleri folyoda; gece raporu yazdırılır (e2e print preview). — `tests/e2e/electron/fees.spec.ts` (kalemler, depozito, gece raporu A4 PDF = 1 sayfa), `tests/e2e/mobile/fees.spec.ts`, `src/main/services/fees-service.test.ts`
- [ ] `db-reviewer`, `security-reviewer` (profil yolu, kopya), `decision-auditor` (K-54) temiz.

## Teknik notlar
Tek DB'de `hotel_id` yapılmaz (K-54 gerekçesi). `app/paths.ts` profil kökü; `openDatabase` profil başına; sunucu modu
seçili profili sunar. Portföy verisi için her otelin günlük özet JSON'u (`backups/summary-YYYY-MM-DD.json`) seçeneği
değerlendirilir (ağ gerektirmez).

## Yapılmayacaklar
Merkezi bulut veritabanı; oteller arası ortak misafir kartı (ileride öneri); konsolide bordro.

## Sonuç

### P21b İstemci çoklu ana bilgisayar (2026-11-13)
- **Yapılanlar:** bağlan ekranında *Kayıtlı oteller* listesi (ad, adres, parmak izi, son kullanım; son kullanılan üstte; düzenle/kaldır;
  boş/yükleniyor/hata durumları; telefon düzeni). Liste `connection.json` içinde (`hotels`, `activeHotel`, `parked`);
  şifre yok. Kullanımdaki otelin cihaz çerezi, kimliği ve kopya izni üst düzeyde, diğerlerininki `parked` altında
  bekler; otel değişince yer değiştirir (kimlik ve çerez karışmaz). Bağlanınca otel adı ana bilgisayardan gelir; aynı
  ana bilgisayar yeni adresle gelirse aynı otel sayılır. Otel değişince pencere oturumu biter, önbellek (TanStack
  Query dahil) temizlenir (`sessionEvents.hotelChanged`). Kopya klasörü `replica/<kod>/`; eski tek kopya ilk açılışta
  taşınır (`migrateLegacyCopy`). H-33: adres doğrulama (yazarken nedenli) ve bağlantı hataları ayrı: ulaşılamadı,
  zaman aşımı, yetki (401/403/429), Bismuth değil, parmak izi değişti, sürüm farklı.
- **Yeni yordamlar** (`remote.*`, yalnız istemci modu, ana bilgisayarda "istemci değil"): `remote.hotels`, `remote.hotelUpdate`,
  `remote.hotelRemove`. Otele bağlanmak = `remote.connect` (adresiyle). `remote.forgetHost` artık oteli listede bırakır.
- **Belge:** `docs/uzaktan-erisim.md` → "İkinci otelin ana bilgisayarına bağlanın" (uydurma NetBird adresleri).
- **Karşılanan:** G-140…G-146 (istemci modu), K-54, S-114…S-117, H-33. Kabul: iki kayıt, yanlış parmak izinde bağlanmaz.
- **Varsayılanlar (otonom varsayılan):** otel kodu adın ASCII kısaltmasıdır (çakışırsa `-2`); kullanımdaki otelin adresi
  düzenlenemez; listeden kaldırınca o otelin salt okunur kopyası bu bilgisayardan silinir (otelin kendi verisine dokunulmaz);
  "tek başına kur"a dönünce liste silinir (dosya yeniden yazılır).
- **Kalan:** gerçek iki otelde NetBird ile deneme (sahip onay paketine). Ana bilgisayar adı/ikonu P21c'de (portföy) kullanılabilir.

### P21d Küçük otel pratikleri (2026-11-14)
- **Yapılanlar:** (1) **Geç çıkış kalemi**: çıkış penceresinde saat eşiği aşılmışsa "Geç çıkış ücreti ekle" önerisi (tutar
  değiştirilebilir/kapatılabilir); Para sekmesinde "Geç çıkış ekle" (saat + tutar + not, oda seçimi). (2) **Gelmeme bedeli**:
  "Gelmedi" diyaloğunda kuralın önerdiği tutar (boş = bedel yok); kalem aynı işlemde folyoya yazılır (`penalty`).
  (3) **Hasar depozitosu**: yeni `damage_deposits` tablosu; alınınca gelir/bakiye/ödeme değişmez; çıkışta iade (`payments.refund`)
  ya da gerekçeyle gelire çevirme (hasar kalemi + ödeme yazılır, gelire o gün girer). (4) **Gece raporu**: Raporlar → "Gece
  raporu" (gelen/giden/kalan/gelmeyen, oda durumu, kasa özeti + emanetteki depozito); tek A4 yazdırma. Kalemler iptal edilir
  (`voided_at`), silinmez; her yazma audit'te.
- **Kurallar ayar** (Ayarlar → Otel → Ücretler): `fees.lateCheckout` (yok/sabit/gecelik fiyatın yüzdesi + saat eşiği),
  `fees.noShow` (yok/ilk gece/sabit), `fees.damageDepositMinor`. Yüzde `src/shared/money.ts` `multiplyRatio` ile (kuruş tam sayı).
- **Migrasyon:** `0023_damage_deposits` (yalnız eklemeli). Tohum: `extra_services` içine `no_show_fee`, `damage_fee`
  (`late_checkout` zaten vardı).
- **Yeni yordamlar:** `booking.feeQuote`, `booking.addLateCheckout`, `booking.voidFee`, `booking.folioLines`,
  `booking.takeDeposit`, `booking.settleDeposit`; `booking.noShow` girdisine `feeMinor`; `reports.nightReport`.
- **Yetki:** geç çıkış/gelmeme bedeli/kalem iptali `extras` (edit); depozito alma ve gelire çevirme `payments` (edit), iade
  `payments.refund`; gece raporu `reports.operations` (kasa bölümü `ledger`/`cash` görünümü ister).
- **Karşılanan:** Ö-22; faz kabul ölçütü "Geç çıkış ve no-show kalemleri folyoda; gece raporu yazdırılır".
- **Varsayılanlar (otonom varsayılan):** varsayılan kurallar "yok" (otel kendi ayarlar); gelmeme bedeli kalemi `penalty`
  türünde, geç çıkış `extra`; depozito folyo para birimindedir (kur dönüşümü yok); gelire çevirmede tüm depozito çevrilir
  (kısmi çevirme yok); gece raporu giderlerinden yalnız genel bölüm sayılır (sahip bölümü sızmaz).
- **Kalan / ana oturuma:** depozito "Defter ve kasa" ekranındaki çekmece panelinde ve "x" teslim akışında görünmez (yalnız
  Gece raporu ve rezervasyon Para sekmesinde); gerekirse ayrı paket. Kullanılmayan i18n anahtarı yok.

### P21c Portföy özeti (2026-11-14)
- **Yapılanlar:** `features/portfolio/` ekranı (menü: Raporlar grubu, telefonda "Daha fazla"; route `/portfolio`). Her kayıtlı otel için
  kart: bu gece doluluk, kasada olması gereken, dönem doluluğu, gelir, gider, kâr; rakamın kaynağı rozeti (canlı ya da "Yedek kopya ·
  son eşitleme tarih saat"); dönem seçici (bu ay / geçen ay / bu yıl). Para her otelin kendi para biriminde; yalnız aynı para biriminde
  ≥ 2 otel varsa "Toplam" satırı, değilse "kur çevirisi yapılmaz" notu. Takvim: otel seçici + masaüstünde takvim ızgarası
  (`CalendarGrid`, tıklama/sürükleme/menü verilmediği için salt okunur), telefonda gün listesi (gelen/çıkan/kalan/boş oda).
  Boş / yükleniyor / hata / yetkisiz durumları, kopyası olmayan otel için "kopya yok + nasıl açılır" boş durumu, ana bilgisayarda
  "diğer otel için kendi cihazınızdan bağlanın" notu.
- **Veri yolu:** yeni yordamlar `portfolio.overview`, `portfolio.grid` (`procedures/portfolio.ts`, `api/handlers/portfolio.ts`);
  rakamlar `services/portfolio-service.ts` içinde mevcut servislerle (`occupants.dayLists`, `ledger.cashPanel`, `reports.summary`,
  `calendar.grid`) üretilir — yeni hesap yok. Ana bilgisayar yalnız kendi oteli (canlı). İstemci bilgisayarda
  `server/portfolio-client.ts` (client-app içinden): kullanımdaki otel ana bilgisayardan canlı, ana bilgisayara ulaşılamazsa ve diğer
  oteller `replica/<kod>` salt-okunur kopyasından (`ReplicaStore.readable()`, otel başına ayrı mağaza). Yetki: `remote.settings`
  görüntüleme + `reports.finance` görüntüleme (varsayılanda yalnız sahip), servis katmanında (`requirePortfolio`).
- **Karşılanan:** G-23, G-141 (kopya salt okunur), K-54, S-114…S-117 (2 otel, aynı şehir, her otelin kendi ana bilgisayarı).
- **Varsayılanlar (otonom varsayılan):** otel seçici + tek takvim (yan yana değil); takvim bugünden 1 ay önce, ~14 ay sonrasına;
  takvimde otelin kendi renk etiketleri yok (yerleşik durumlar); kopya "son eşitleme" = kopyanın `asOf` zamanı; başka otelin "bugünü"
  bu bilgisayarın otel günüdür (aynı şehir/saat dilimi); kopyası olmayan otel için ayrı bir "kopya iste" düğmesi yok (otele bir kez
  bağlanıp sahip olarak giriş yapınca kopya kendiliğinden hazırlanır).
- **Küçük değişiklik:** `calendar-service.ts` `ensureGenerated`: salt-okunur bağlamda (kopya) yılın tatilleri üretilmeye çalışılmaz
  (eskiden kopyada o yıl hiç üretilmemişse takvim 409 verirdi).
- **Ölçümler:** ui:shot metrik: yatay taşma 0, 44 px altı hedef 0 (tr+ru, açık+koyu, masaüstü+telefon).
- **Kalan (sahip onay paketine):** gerçek iki otelde (NetBird) iki kopya ile deneme. İki ana bilgisayarlı istemci e2e senaryosu
  birim testlerle (`portfolio.test.ts`, `portfolio-wiring.test.ts`) karşılandı.
