# Faz 17 — Resepsiyon düzeltmeleri (vazgeçme ve iade, grup, hızlı takvim, gündüz kullanımı 2.0)

> Kaynak: resepsiyonun gerçek kullanımdan dört maddesi (`docs/analiz/03-resepsiyon-geri-bildirimi.md`), paket kartları
> `docs/analiz/08-gelistirme-plani.md` §1. Yürütme `/orkestra`, dalgalar 1–4 (`YURUTME.md`).

## Amaç

Resepsiyonun "çalışmıyor" dediği dört durumu kapatmak: girişten sonra vazgeçen misafirin iadesi, iptal edilen kaydın
takvimden ve paradan doğru biçimde çıkması, grup/toplu giriş ve sade takvim, aynı odanın aynı gün tekrar satılması.

## Gereksinimler
G-193 (vazgeçme ve iade, ZORUNLU), G-194 (grup ve toplu giriş, ZORUNLU), G-195 (hızlı takvim, ÖNEMLİ), G-196 (gündüz
kullanımı 2.0, ZORUNLU); G-37, G-39, G-42, G-43, G-46, G-60. Kararlar: K-44, K-48 (taslak), K-55 (taslak).

## Ön koşul
Faz 5–16 kodu (`main` ile aynı taban), `npm run check` yeşil, migrasyon sırası 0019 (P17b) ve 0020 (P17d).

## Sorular
S-100 (iade yetkisi), S-101 ("ortak görünüyor"), S-102…S-105 (gündüz kuralları), S-106 (grup folyosu). Cevapsız =
`05-sorular.md` varsayılanı + "(varsayılan)".

## Teslimatlar
1. **P17a Vazgeçme ve iade** — `booking.undoCheckIn`; `in_house` menüsünde "Vazgeçme ve iade" (aynı gün çıkış + iade /
   girişi geri al + iptal / erken çıkış); iptal ve çıkış pencerelerinde tahsilat özeti ve iade satırı ya da "İade
   bekliyor" parkı; `checked_out` panelde üç nokta menüsü (İade gir, Geçmiş, Not); iade satırı defter + kasa teslimi;
   raporlarda iade satırı; kılavuz §3–4 güncel.
2. **P17b Grup rezervasyonu** — migrasyon 0019 (`reservation_groups`, `reservations.group_id`); oda başına misafir adı;
   grup paneli; `booking.checkInMany/checkOutMany` (atomik); takvimde grup deseni + lejant; folyo kipi ayarı (S-106).
3. **P17c Hızlı takvim** — sağ tık / uzun basma menüsü; hızlı rezervasyon çubuğu; Ctrl/Shift çoklu seçim + toplu
   işlemler; bugün şeridi; panel başlığında Giriş yap · Ödeme al · Çıkış yap düğmeleri.
4. **P17d Gündüz kullanımı 2.0** — migrasyon 0020 (`room_nights.start_time/end_time`, indeks, `room_types.day_use_price_minor`);
   `dayUse.*` ayarları; saat çakışma kuralı; ikinci tur çıkışında gece yuvası boşalır (hata C); takvimde yarım çubuk;
   rapor satırı; doluluğa katılım ayarı.
5. **P17e Kritik/Yüksek hata düzeltmeleri** — `docs/analiz/02-hata-raporu.md` §2'de "P17e" işaretli bulgular
   (akış testi ve kod incelemesi); her biri için yeniden üretim testi.

## Kabul ölçütleri
- [ ] `in_house` rezervasyonda "Vazgeçme ve iade" menüsü üç seçeneği sunar; `checked_out` rezervasyonda üç nokta menüsü
      görünür (vitest `reservation-panel` durum × menü matrisi, 7 durum).
- [ ] `undoCheckIn`: yalnız giriş günü, yetki, audit; yetkisiz rol reddi (servis testi).
- [ ] İptal penceresi tahsilat varsa tutar + üç seçenek; iade satırı `ledger.day`'de ve kasa tesliminde (servis + e2e).
- [ ] "Girdi, vazgeçti, iade" e2e masaüstü + telefon yeşil.
- [ ] 3 odalı grup: oda başına ad, toplu giriş atomik, takvimde desen (migrasyon + servis + grid + e2e).
- [ ] Sağ tık menüsü ve hızlı çubuk klavyeyle erişilebilir; telefonda uzun basma (e2e).
- [ ] Betik C senaryosu: ikinci tur çıkışından sonra oda o gece satılabilir (servis testi, kırmızıdan yeşile).
- [ ] Aynı gün iki gündüz satışı saat çakışmazsa olur, çakışırsa saatli `roomOccupied` (domain testi 8 senaryo).
- [ ] Gündüz fiyat kipi ve rapor satırı ayarlara uyar; turizm istatistiği kuralı değişmedi (mevcut testler yeşil).
- [ ] P17e listesindeki her bulgu için test kırmızıdan yeşile.
- [ ] `npm run check`, hedefli e2e, `ui-reviewer` + `turkish-ui-copy` + `db-reviewer` + `decision-auditor` bulgularında Kritik/Yüksek yok.

## Teknik notlar
- Durum makinesi değişmezleri `endReservation`/`settleStatus` korunur; yeni geçişler tabloya eklenir (03 §1.1).
- `room_nights` benzersizliği 0020'de `(room_id, date, slot, start_time)`; eski satırlarda `start_time` null = tüm gün.
- Para `amount_minor`; iade `payments.kind='refund'`, `assertRefundCovered` korunur; silme yok.
- Takvim ızgarası sanallaştırılmış; `dir="ltr"` adası; inline style yalnız konum/boyut.
- i18n: `booking.*`, `calendar.*`, `errors.*`, `settings.dayUse.*`; `tr-copy-guide` sözlüğü.

## Yapılmayacaklar
"Sil" düğmesi; OTA/kanal bağlantısı; fatura; gündüz kullanımı için saatlik ücretin otomatik hesabı dışında dinamik
fiyatlama; kamera (Faz 20).

## Sonuç
(Opus doldurur: yapılanlar, karşılanan G-xx, varsayılanlar, ölçümler, kalanlar.)
