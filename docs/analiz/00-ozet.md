# 00 — Yönetici özeti (sahip için)

> Fable, 2026-11-12. Bu klasördeki raporların kısa hâli. Ayrıntı için her başlıkta dosya adı var. Sorular en sonda tek liste.

## 1. Projenin durumu (bir bakışta)

- **Program bitmeye yakın ve sağlam:** 179 bin satır kod, 73 tablo, ~326 işlem, **2.427 birim test** ve 89 kanca testi
  **hepsi geçiyor**; tip ve stil denetimleri temiz. Faz 0–15 kod olarak tamam, Faz 16 (uçtan uca testler, CI) sürüyordu.
- **Her ekran her boyutta çalışıyor:** 1280×720'den 4K'ya, Windows %100/%125/%150, açık/koyu, TR/EN/RU'da hiçbir
  ekranda taşma ya da açılmayan pencere yok (111 ekran görüntüsü, `05-…`). Kalan sorunlar küçük (takvimde üç kaydırma
  çubuğu, telefonda tarih seçici, tam ekranın hatırlanmaması).
- **Resepsiyonun dört şikâyeti gerçek ve hepsi açıklandı** (`03-…`): ikisi eksik akış (girişten sonra vazgeçme/iade;
  iptalde paranın ne olacağı), biri tasarım sınırı (bir oda günde yalnız bir gündüz + bir gece), biri eksik özellik
  (grup/toplu giriş, sade takvim). Dördü için uygulanabilir tasarım ve plan paketi yazıldı (Faz 17).
- **Kamera sistemi tek programa alınabilir ama bugünkü hâliyle satılamaz:** kullandığı iki model lisans olarak
  kapalı kaynak ürüne gömülemez (YOLO11 AGPL, InsightFace "ticari olmayan"); Telegram'a fotoğraf göndermek KVKK'da
  yurt dışı aktarım riski. Açık lisanslı modellerle, Bismuth'un içinde sekme olarak, veriyi tek kaynaktan alan bir plan
  hazır (`06-…`, Faz 20).
- **Kurulum:** çift tıkla kurulum var; macOS/Windows imzasız uyarıları belgede. Sürüm iş akışı pahalı (Mac runner 10×);
  ucuz düzen önerildi; tek sayfalık basit kurulum rehberi yazıldı (`docs/kurulum-rehberi-basit.md`, `07-…`).
- **Ajan sistemi** Opus'un planı kendi başına yürütebileceği hâle getirildi: `/orkestra`, 6 yeni uzman ajan, iki yeni
  güvenlik kancası, hızlı belge commit'i, Opus devir notu (`09-…`, `OPUS-BASLANGIC.md`).

## 2. En kritik 10 bulgu

| # | Önem | Bulgu | Nerede | Çözüm paketi |
|---|---|---|---|---|
| 1 | Kritik | Odaya giren misafir vazgeçince iptal yapılamıyor; çıkıştan sonra üç nokta menüsü kayboluyor; resepsiyon iade giremiyor | 03 §2, 02 H-01 | P17a |
| 2 | Yüksek | İptal ve çıkış pencereleri alınan parayı göstermiyor; kapora iptalden sonra "eksi bakiye" olarak kalıyor, iade hatırlatması yok | 03 §4, 02 H-02 | P17a |
| 3 | Yüksek | Aynı gün ikinci tur çıkışında oda o gece satılamıyor (program "satılabilir" yazıyor); bir oda günde tek gündüz satışı | 03 §5, 02 H-03 | P17d |
| 4 | Yüksek | Grup rezervasyonu ve toplu giriş yok; takvimde sağ tık/hızlı işlem yok | 03 §3, 02 H-12 | P17b, P17c |
| 5 | Yüksek | Telefonda tarih seçici ekrandan taşıyor (Pazar seçilemiyor) | 02 H-04 | P18d |
| 6 | Yüksek | Telefon numarası alanı +90/0 ile başlayan numarayı bozuyor | 02 H-05 | P17e |
| 7 | Yüksek | Kamera: YOLO11 (AGPL) ve InsightFace modelleri satılacak ürüne gömülemez; Telegram'a yüz fotoğrafı + misafir adı gidiyor; panelde şifre yok | 06 §6–7 | P20a, P20d |
| 8 | Orta | Takvim küçük ekranda (1280×720) 19 odanın 9'unu gösteriyor, üç kaydırma çubuğu; panel ızgarayı örtüyor | 05 #1–2 | P18b |
| 9 | Orta | Tam ekran hatırlanmıyor, F11 yok, menü gizli → kullanıcı tam ekranı bulamıyor; yakınlaştırma kalıcı değil | 05 #8–10 | P18c |
| 10 | Orta | Sürüm iş akışı: paketleme iki yerde, Mac runner her elle çalıştırmada 100–150 dakika yakıyor; tag öncesi test şartı yok | 07 §1–2 | P19a |

Tam liste: `02-hata-raporu.md` (18 hata, 9 çelişki), `06-…` §7 ve `ekler/kamera-kod-bulgulari.md` (kamera, 28 madde).

## 3. Önerilen yol haritası (Faz 17–21; `08-gelistirme-plani.md`, `docs/plan/fazlar/YURUTME.md`)

| Dalga | İçerik | Tahmini maliyet |
|---|---|---|
| 1–4 | **Faz 17 Resepsiyon:** vazgeçme/iade, gündüz kullanımı 2.0, grup + toplu giriş, hızlı takvim, kritik hatalar; + depo temizliği, ekran betiği, düzen düzeltmeleri | $95–135 |
| 5 | **Faz 18 Ekran:** pencere/tam ekran, çalışmayan öğeler | $20–30 |
| 6 | **Faz 19 Kurulum:** sürüm iş akışı, belgeler, ajan bakımı | $15–25 |
| 7–9 | **Faz 20 Kamera:** yan süreç, sekme, veri, açık lisanslı modeller, KVKK, paketleme | $85–130 |
| 10–11 | **Faz 21 Çoklu otel + diğer:** otel profilleri, portföy özeti, geç çıkış/no-show/gece raporu | $40–60 |
| Son | Tam kontrol sürüsü + sahip onay sayfası | $40–60 |
| **Toplam** | | **$300–440** (Opus orkestra ≈ $90–130, Sonnet ≈ $190–280, Haiku ≈ $10–20) |

Kısa bütçeyle: yalnız dalga 1–4 resepsiyonun dört maddesini kapatır. Opus `node tools/ajan/ajan.mjs --model claude-opus-5-5
--butce 150 "…"` ile başlar (`OPUS-BASLANGIC.md`); bütçe bitince `--devam` ile sürer.

## 4. Sizin yapmanız gerekenler (program dışı)
1. Aşağıdaki soruları cevaplayın (cevapsız = yazılı varsayılan).
2. Otel bilgisayarında Windows paketini bir kez açıp deneyin (S-80; kurulum belgesindeki `<!-- doğrula -->` işaretleri bununla kapanır).
3. Kamera modülü satışa çıkmadan önce bir KVKK avukatına danışın (06 §6; hukuki tavsiye değildir).
4. Sürüm etiketini (v1.0.x) siz atarsınız; ajanlar GitHub Actions'ı tetikleyemez.

## 5. ❓ Sahibe sorular (tek liste; cevap gelmezse yanındaki varsayılan uygulanır)

**Resepsiyon ve takvim**
1. (S-100) Resepsiyon kendi başına **iade** girebilsin mi, yoksa her iade müdür/sahip onayı mı istesin? — *Varsayılan: giremez; "İade bekliyor" diye park eder, siz telefondan onaylarsınız.*
2. (S-101) "Bir müşterinin ismine kayıtlı bütün rezervasyonlar ortak görünüyor" derken hangisini kastettiniz: (a) bir isimle alınan birden çok oda tek panelde/tek iptal; (b) aynı misafirin eski konaklamaları panelde listeleniyor; (c) başka bir şey? Ekran görüntüsü gönderebilir misiniz? — *Varsayılan: (a); grup rezervasyonu + oda başına misafir adı yapılır.*
3. (S-106) Grup rezervasyonunda ödeme **tek folyo** mu (lider öder), **oda başına** mı? — *Varsayılan: tek folyo; oda başına seçeneği ayar.*

**Gündüz kullanımı (aynı gün giriş-çıkış)**
4. (S-102) Gündüz için **sabit fiyat** mı, **saatlik** mi, gecelik fiyat mı alıyorsunuz? — *Varsayılan: sabit gündüz fiyatı (oda tipine göre ayar).*
5. (S-103) Aynı odada aynı gün **kaç** gündüz satışı olabilir; temizlik için ara kaç dakika? — *Varsayılan: en çok 2; 60 dk (yalnız uyarı).*
6. (S-104) Gündüz müşterisi **KBS'ye bildiriliyor mu**; muhasebeciniz istatistikte geceleme sayılıp sayılmadığını söyleyebilir mi? — *Varsayılan: bildirilir; istatistikte aynı gün = 1 gece kuralı kalır.*
7. (S-105) Gündüz geliri doluluk ve oda başına gelir raporlarına **girsin mi**? — *Varsayılan: ayrı satır, doluluğa girmez.*

**Kamera**
8. (S-107) Kameralar **personeli** de görüyor mu? — *Varsayılan: evet; personel yüz tanımadan dışlanır.*
9. (S-108) Kamera görüntüsü **telefonda/Mac'te** de görünsün mü, yoksa yalnız alarm listesi mi? — *Varsayılan: yalnız alarm listesi.*
10. (S-109) **Telegram** tamamen kaldırılsın mı (alarm Bismuth bildirimi + telefon arayüzü)? — *Varsayılan: kaldırılır; fotoğrafsız metin bildirimi ileride isteğe bağlı.*
11. (S-110) **Açık lisanslı modellere** geçelim mi, yoksa Ultralytics/InsightFace'ten ticari lisans teklifi mi alacaksınız? — *Varsayılan: açık lisanslı modeller.*
12. (S-111) Misafirden **yazılı rıza** alıp rıza vermeyene kamerasız giriş sunmayı kabul ediyor musunuz? — *Varsayılan: evet; rızasız yüz kaydı yok.*
13. (S-112) Kaç kamera, hangi marka/RTSP; otel bilgisayarının işlemcisi ve RAM'i? — *Varsayılan: 1 kamera, i5 / 8 GB.*

**Kurulum ve çoklu otel**
14. (S-113) Windows'ta program **tüm kullanıcılar** için mi kurulsun (yönetici ister), yoksa yalnız kuran kullanıcı için mi? — *Varsayılan: kuran kullanıcı (bugünkü).*
15. (S-114) Kaç oteliniz var/olacak; aynı şehirde mi? — *Varsayılan: 2, farklı adres.*
16. (S-115) İkinci otelin resepsiyonu **kendi bilgisayarını** mı kullanacak? — *Varsayılan: evet.*
17. (S-116) Tüm oteller için tek ekranda görmek istediğiniz ilk **üç bilgi**? — *Varsayılan: bugünkü doluluk, kasa, ayın geliri.*
18. (S-117) Aynı personel iki otelde de çalışıyor mu? — *Varsayılan: hayır.*
19. (S-118) 21st.dev için ücretsiz anahtar alıp denemeyi onaylıyor musunuz (günde 2 bileşen; `API_KEY_21ST` secret)? — *Varsayılan: denenmez.*
20. (Ç-01) Hafta sonu: fiyat için **Cuma + Cumartesi**, takvim vurgusu **Cumartesi + Pazar** — bilinçli mi? — *Varsayılan: bilinçli; belgeye not düşülür.*

Cevaplarınızı Opus'a yazarsanız `docs/plan/06-kararlar.md` 7. tur tablosuna işler ve ilgili K-48…K-55 kararlarını kesinleştirir.
