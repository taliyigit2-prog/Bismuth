# Faz 21 — Çoklu otel ve diğer iyileştirmeler

> Kaynak: `docs/analiz/10-coklu-otel.md` (K-54), `04-otel-ihtiyaclari.md` §5, `02-hata-raporu.md` (Orta/Düşük);
> paket kartları `08-gelistirme-plani.md` §5. Dalgalar 11–13. Ön koşul: S-114…S-117 cevapları ya da varsayılanlar.

## Amaç
Sahibin birden fazla oteli tek programdan, her otel kendi bilgisayarında ve kendi veritabanıyla (çevrimdışı ilke
bozulmadan) yönetilir; sahip tüm otellerin özetini tek ekranda görür. Küçük otel pratiklerinden eksik kalanlar tamamlanır.

## Gereksinimler
Ö-21 (çoklu otel; kabulüyle G-198), Ö-22 (geç çıkış, no-show bedeli, gece raporu), K-19 (otel bilgisayarı tek yazıcı),
K-32 (yedek), K-54 (taslak), G-140…G-146 (çoklu cihaz).

## Sorular
S-114…S-117.

## Teslimatlar
1. **P21a Profil altyapısı** — `userData/hotels/<kod>/` (db, attachments, backups, logs); ilk açılışta taşıma (onaylı);
   giriş ekranında otel seçici; Ayarlar → Oteller (ekle/yeniden adlandır); sahip hesabı kopyalama; Drive yolu
   `Bismuth/<kod>/yedekler`; `window-state` ve kişisel tercihler kökte.
2. **P21b İstemci çoklu ana bilgisayar** — Bağlan ekranında kayıt listesi (ad + adres + parmak izi); kopya klasörleri
   `replica/<kod>`; otel değiştirince oturum yenilenir.
3. **P21c Portföy özeti** — `features/portfolio/` (owner): otel başına bugün doluluk, gelen/giden, kasa, ayın
   gelir/gider, açık arızalar; kaynak kopya ya da canlı bağlantı; para birimi otel başına, toplam için otel kuru; telefon düzeni.
4. **P21d Küçük otel pratikleri** — geç çıkış ücreti (saat + tutar kalemi), no-show bedeli kalemi, hasar depozitosu
   (iade edilecek emanet) kalemi, yazdırılabilir tek sayfa gece raporu (gelen/giden/kalan/kasa).
5. **P21e Orta/Düşük bulgular** — 02 raporunda "P21e" işaretli bulgular: H-13 telefon "çıkış yaptı" rozeti; H-16 telefon
   sheet'i geri tuşuyla kapanmıyor; 04 §3: mükerrer misafir kartı uyarısı (ad yazılınca mevcut kart önerisi), Ayarlar
   "sık kullanılan" sekmesi; akış testi 2. oturum Orta/Düşük maddeleri (02 §2 "P21e").

## Kabul ölçütleri
- [ ] Mevcut tek otel kurulumu yükseltmede veri kaybı olmadan `hotels/<kod>/` altına taşınır; yedekler açılır (migrasyon/taşıma testi).
- [ ] İki profil arasında geçiş ≤ 3 sn; açık otelin verisi diğerine sızmaz (servis testi: iki DB, ayrı `change_log`).
- [ ] İstemci iki ana bilgisayar kaydı tutar; yanlış parmak izinde bağlanmaz (mevcut QA3d testi iki kayıtla).
- [ ] Portföy ekranı yalnız owner; otel başına özet doğru (fabrika ile iki otel; rakamlar `ledger`/`reports` ile aynı).
- [ ] Geç çıkış ve no-show kalemleri folyoda; gece raporu yazdırılır (e2e print preview).
- [ ] `db-reviewer`, `security-reviewer` (profil yolu, kopya), `decision-auditor` (K-54) temiz.

## Teknik notlar
Tek DB'de `hotel_id` yapılmaz (K-54 gerekçesi). `app/paths.ts` profil kökü; `openDatabase` profil başına; sunucu modu
seçili profili sunar. Portföy verisi için her otelin günlük özet JSON'u (`backups/summary-YYYY-MM-DD.json`) seçeneği
değerlendirilir (ağ gerektirmez).

## Yapılmayacaklar
Merkezi bulut veritabanı; oteller arası ortak misafir kartı (ileride öneri); konsolide bordro.

## Sonuç
