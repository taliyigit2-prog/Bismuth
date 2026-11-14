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
- [ ] Portföy ekranı yalnız owner; iki otelin takvimi, gelir-gider, doluluk ve kasa doğru (fabrika ile iki otel; rakamlar `ledger`/`reports` ile aynı).
- [ ] Geç çıkış ve no-show kalemleri folyoda; gece raporu yazdırılır (e2e print preview).
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
