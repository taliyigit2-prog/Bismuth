# 04 — Butik ve küçük otellerin gerçek ihtiyaçlarıyla karşılaştırma

> Hazırlayan: Fable (2026-11-12). Kaynaklar: kod (`01-mimari-ve-kod-haritasi.md`), `docs/plan/akislar.md`,
> `docs/otel/kullanim-kilavuzu.md`, `docs/plan/04-arastirma/otel-pms-ozellikleri.md`, rakip PMS belgeleri
> (`ekler/kamera-kaynaklar.md` §C, 2026-11-12). Çoklu otel: `10-coklu-otel.md`. Önem: Kritik / Yüksek / Orta / Düşük; büyüklük S/M/L.

## 1. Günlük resepsiyon işleri — var / eksik / fazla

| İhtiyaç | Bismuth'ta | Durum | Eksik / sorun | Önem | Büyüklük |
|---|---|---|---|---|---|
| Rezervasyon alma (telefon/walk-in) | Takvimde boş hücre → diyalog; çok oda; kanal etiketi; öneri fiyat | ✅ | Hızlı giriş çubuğu yok (5–6 alanlı diyalog); sağ tık yok | Orta | M |
| Check-in | Panelde oda başına "Giriş yap"; Kişiler + KBS işaretleri | ✅ | Toplu/grup giriş yok; giriş geri alınamaz | Yüksek | M |
| Check-out ve ödeme | "Çıkış yap"; bakiye uyarısı; erken çıkışta geceler boşalır (K-44) | ✅ | Çıkış penceresinde ödeme/iade adımı yok; ikinci tur aynı gün satış hatası (03 §5 C) | Yüksek | M |
| İptal, gelmedi, park | Menü; neden zorunlu; park nedenleri | ✅ | Check-in sonrası vazgeçme/iade akışı yok; iptal penceresi ödemeyi sormuyor (03 §2, §4) | **Kritik** | M |
| İade | Ödeme türü "İade"; tutar tahsilatı aşamaz | ✅ | Resepsiyon yetkisiz; iade çıkış/iptal akışına bağlı değil; raporda ayrı satır **yok** (doğrulandı: `reports/queries.ts:69,299` yalnız net toplam; P17a) | Yüksek | S |
| No-show ücreti | Gelmedi durumu; ödeme kalır | ✅ | "No-show bedeli" kalemi yok (tahsilat kalınca folyo alacaklı görünür) | Orta | S |
| Depozito / kapora | Kapora ödeme türü; takvimde simge | ✅ | Hasar depozitosu (iade edilecek emanet) ayrı değil | Düşük | S |
| Oda değiştirme | "Taşı" (sürükle ya da diyalog), doluysa uyarı | ✅ | Doğrulandı: `changeRoom` girişli konaklamada eski odayı kirli yapıyor (`reservations-service.ts:1079`, bölünmede `:1133`), yeni odanın durumu değişmiyor (çıkışta `markRoomDirtyAfterCheckout`) — uygun; bakım/arızalı oda kalıyor | Düşük | S |
| Uzatma / kısaltma | Geceler sekmesi | ✅ | — | — | — |
| Erken / geç çıkış | Erken çıkış var; geç çıkış saati yok | ⚠ | "Geç çıkış 14:00, ücret X" kaydı yok (gündüz kullanımı 2.0 ile çözülür, 03 §5) | Orta | M |
| Gündüz kullanımı (day-use) | Tek gündüz yuvası, gecelik fiyat | ⚠ | Saatli/çoklu gündüz, ayrı fiyat, temizlik arası yok | Yüksek | L |
| Grup rezervasyonu | Çok odalı tek rezervasyon | ⚠ | Grup kimliği, oda başına misafir, toplu işlemler yok | Yüksek | L |
| Misafir kartı, geçmiş, VIP, kara liste | Var (G-46, G-52) | ✅ | Ad eşleştirme yok → mükerrer kart; birleştirme var | Orta | S |
| Kat hizmetleri | Oda durumu tahtası, kat planı, arıza, görevler | ✅ | Kat görevlisi telefonu reddedildi (Ö-19); temizlik arası süresi yok | Düşük | — |
| Kasa, gün kapatma, teslim (x) | Defter, teslim, gün kilidi | ✅ | Gece denetimi yok (19 odada gerekmez; gün kapatma yeterli) | — | — |
| Gece raporu | Bugün ekranı + vardiya devri özeti | ✅ | Yazdırılabilir "gece raporu" (gelen/giden/kalan/kasa) tek sayfa yok | Orta | S |
| KBS | Kişi başına "bildirildi" işareti; otelde kalanlar listesi; turizm istatistiği içe aktarma | ✅ | KBS'ye otomatik bildirim yok (bilinçli, yasal/teknik) | — | — |
| Bildirimler | `notifications` tablosu, Bugün rozetleri | ✅ | Kamera alarmı (06) için kanal hazır | — | — |
| Telefon arayüzü | Gün listesi, alt çubuk | ✅ | Takvim ızgarası telefonda yok (bilinçli) | — | — |

## 2. Rakip PMS pratikleri (özet; kaynaklar ekte)

- **Day-use:** Protel ayrı fiyat kodu + oda/gün bir; Mews ayrı hizmet, sabah/öğleden sonra; Opera 0 gece + fiyat kodu;
  HotelRunner aynı gün + çıkış saati. Ortak: geceleme sayılmaz, gece satışını engellemez, ayrı rapor satırı.
- **Erken çıkış / check-in sonrası iptal:** rGuest "rezervasyondan hemen sonra" ve "check-in sonrası" ayrı politikalar;
  çoğu otel bir gece bedeli alır; iade ters kayıtla.
- **Grup:** oda bloğu + grup master; toplu check-in; oda başına misafir adı (mevcut araştırma §5/§10).
- **Gece denetimi:** küçük otelde kasa kapanışı + gün kilidi + gelmedi listesi yeterli (Bismuth'ta var).

## 3. Gereksiz karmaşık ya da fazla görünen yerler

| Yer | Gözlem | Öneri | Önem |
|---|---|---|---|
| Yeni rezervasyon diyaloğu | Her rezervasyon için tam form (kişi, kanal, fiyat, not) | Hızlı çubuk + "ayrıntı" | Orta |
| Panel sekmeleri (Özet / Geceler / Para / Kişiler) | Sık işlem (giriş, ödeme, çıkış) sekmelerin içinde dağınık | Panel başlığında üç büyük düğme | Orta |
| Park alanı | Resepsiyon "silinmedi" diye algılıyor | Park nedeni etiketi ve "nereye gitti" açıklaması (P17c) | Orta |
| 14 bölümlü ayarlar | Otel sahibi için çok; çoğu bir kez ayarlanır | "Sık kullanılan" sekmesi; sihirbazda yapılanları işaretle (P21e) | Düşük |
| Durum etiketleri (iki katman) | Güçlü ama lejant olmadan anlaşılmıyor | Lejant varsayılan açık, ilk açılış turu (var) | Düşük |
| Uzaktan erişim kurulumu (NetBird) | Sahip için teknik | Belge ayrı; kurulum rehberi sade (07 §4 #7, P19b) | Orta |

## 4. Çoklu otel (özet; ayrıntı `10-coklu-otel.md`)

Öneri: otel başına ayrı veritabanı profili + program içinde otel değiştirme + sahip için salt-okunur portföy özeti
(K-54 taslağı). Tek veritabanında `hotel_id` reddedilir (migrasyon riski yüksek, çevrimdışı ilkeye aykırı).

## 5. Öncelikli eksikler (plana giren)

1. Vazgeçme/iade akışı ve iptalde ödeme uyarısı (P17a) — Kritik.
2. Gündüz kullanımı 2.0 + ikinci tur hatası (P17d) — Yüksek.
3. Grup rezervasyonu + toplu giriş (P17b) — Yüksek.
4. Hızlı rezervasyon ve sağ tık (P17c) — Orta.
5. Geç çıkış ücreti, no-show bedeli kalemi, gece raporu yazdırma (P21d, "diğer iyileştirmeler") — Orta.
6. Çoklu otel (P21a–c) — sahip kararına bağlı.
