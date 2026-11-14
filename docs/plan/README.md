# Bismuth — Otel Yönetim Programı · Plan (v2)

> Hazırlayan: Fable (plan ve fazlar). Uygulayan: Opus oturumları, faz faz. Onaylayan: otel sahibi.
> **2026-10-02:** Faz 0 tamam; sahibin dördüncü tur cevapları işlendi (gereksinimler v4, mimari v4, K-19 kesin: C2 + NetBird Free + otelin Google Drive'ı).
> Dil: belgeler Türkçe, kod ve commit mesajları İngilizce, arayüz TR/EN/RU (Arapça ertelendi).
> **v2 (2026-10-01):** sahibin ikinci tur değişiklikleri işlendi (çoklu cihaz/uzaktan erişim, çok dil, piyasa kuru,
> sınırsız bayram, serbest renk/anlam, turizm istatistiği, rehber, tedarik/çamaşırhane, arıza bildirimi, misafir fiyat
> geçmişi, firma/fatura bilgileri, sürekli istekler).

## Ne yapıyoruz?

Yıllardır Google E‑Tablo ile yürütülen otel defteri, rezervasyon tablosu ve maaş tablosunun yerine geçecek;
**otel bilgisayarında internetsiz çalışan**, sahibin evdeki Mac'inden ve telefonundan da ulaşabildiği, Windows
(`Bismuth-Setup.exe`) ve macOS (`Bismuth.dmg`) için çift tıkla kurulan, roller/kara liste/gelir‑gider/personel/
rapor/istatistik içeren, üç dilli, **bitmiş** bir program. Genel bir otel ürünü: Lale'ya özgü her kural ayardır.

## Belgeler

| Dosya | İçerik |
|---|---|
| `01-gereksinimler.md` | Tüm istekler (`G-xx`), öncelikler, kapsam dışı, onay bekleyen öneriler (`Ö-xx`) |
| `02-excel-analizi.md` | 16 görsel + KBS Excel'inden çıkan davranışlar — ekranların ve veri modelinin referansı |
| `akislar.md` | Otelin bir günü ve ay sonu (sahibin anlatımı) → programdaki karşılıkları |
| `03-mimari.md` | Teknoloji yığını, sunucu/istemci/telefon yapısı, **veri modeli**, **yetki modeli**, **iş kuralları** (test senaryolu), dil/RTL |
| `04-arastirma/` | **`depo-secimi.md` (tek özet)**, Faz 0 prototip ve canlı doğrulama sonuçları, 13 araştırma raporu: shadcn, açık API'ler, Claude eklentileri, otel PMS özellikleri, masaüstü yığını, ödeme/oda tipi/hizmet tohumları, **piyasa kuru + uzaktan erişim**, **dil/RTL/mobil** |
| `05-sorular.md` | Sahibe sorulacak sorular (`S-xx`), fazlara göre, varsayılanlarıyla; cevaplananlar işaretli |
| `06-kararlar.md` | Karar kaydı (`K-xx`) ve sahibin cevapları |
| `fazlar/` | Faz 0–16 dosyaları + `DURUM.md` |

## Fazlar

| # | Faz | Çıktı | Sorular |
|---|---|---|---|
| 0 | Derin araştırma ve doğrulama ✅ | Boş Bismuth iki OS'ta paketlenir; kur/hava/bayram canlı doğrulanır; derin repo seçimi; uzaktan erişim mimarisi seçilir; kararlar kesinleşir | (cevaplandı) |
| 1 | Proje iskeleti, araç zinciri, CI, Claude düzeni | Paketlenebilir kabuk; tek kontrat–iki taşıma; üç dil (TR/EN/RU); tema | — |
| 2 | Veri modeli ve iş kuralları | Şema (v4 tabloları dahil), servisler, tüm iş kuralı testleri | — |
| 3 | UI tasarım sistemi ve ekran taslakları (**UI fazı 1**) | Durum etiketleri sistemi, masaüstü + mobil taslaklar, sahip onayı | — |
| 4 | Kurulum sihirbazı, giriş, roller | Çalışma modu seçimi; vardiyalar; varsayılan fiyat; **rol düzenleyici (ekran × select)** | — |
| 5 | Rezervasyon takvimi (açılış ekranı) | Sınırsız ızgara, etiketler + lejant, misafir geçmişi kartı, sürekli istek uyarısı, park, **odadaki kişiler + KBS işaretleri** | — |
| 6 | Misafir, kara liste, firma/fatura, sürekli istek, fiyat geçmişi | Misafir kartı (geçmiş sekmesi, VIP), firma kopyala (+IBAN), kara liste uyarısı | — |
| 7 | Defter, kasa, giderler | Günlük defter, teslim (x), kasa paneli, gizli giderler, serbest gider açıklaması + ürün satırları, gün kapatma | — |
| 8 | Personel | Maaş, avans, izin, mesai (geliş/çıkış saati), bayram, prim | — |
| 9 | Günlük operasyon: oda durumu (kat planı), **arıza**, **görevler**, **vardiya devri ve notlar**, **otelde kalanlar (KBS)**, takvim, Bugün | Arıza rozetleri her yerde; tekrarlı görevler; otomatik devir özeti; sınırsız bayram; yasal hatırlatıcılar | — |
| 10 | Raporlar + **Turizm istatistiği** | Ay sonu kontrol, KPI'lar, grafikler; KBS Excel → uyruk/geceleme tablosu (yazım hatası önlemi) + karşılaştırma | S-99 |
| 11 | Döviz (piyasa orta kur), **hava durumu**, bayram doğrulama | Kur zinciri + çevirici + otel kuru; şehir için anlık + haftalık simgeli hava (Bugün kartı) | — |
| 12 | **Rehber, tedarik, çamaşırhane, kayıp eşya** | Telefon rehberi; ürün fiyat geçmişi + zam uyarısı; çamaşır giden/gelen + mutabakat; kayıp eşya | — |
| 13 | **Sunucu / istemci / telefon** | Hono sunucu, Mac yedek kopya, şifreli Drive kutusu, devral, mobil arayüz, NetBird kılavuzu, cihaz yönetimi | S-97 |
| 14 | Yedek, geri yükleme, dışa/içe aktarma | Otomatik yedek (program klasörü + otel Drive'ı, şifreli, parçalı, 30 gün), Excel çıktısı, 2026 verisi içe alma | — |
| 15 | UI cilası + üç dil gözden geçirme (**UI fazı 2**) | Tutarlılık, klavye kısayolları, erişilebilirlik, mobil QA, **ayrıntılı program içi kılavuz** | — |
| 16 | Test, sertleştirme, paketleme, v1.0 | Gerçek cihaz testleri (uzaktan erişim dahil), kurulum kılavuzu, Release | — |

## Bir faz nasıl çalıştırılır? (Opus oturumu ritüeli)

1. Yeni oturum aç; `CLAUDE.md` otomatik yüklenir. "**Faz N'i uygula**" de (ya da `/phase-runner N`).
2. Opus `fazlar/faz-NN-*.md`, atıf yapılan `G-xx`/`K-xx` satırlarını ve `03-mimari.md` ilgili bölümlerini okur.
3. Fazın "Sorular" satırındaki soruları sahibe **basit dille, numaralı, tek seferde** sorar; cevapları `06-kararlar.md` → "Sahip cevapları"na yazar. Cevapsız soru = varsayılan + işaret.
4. Teslimatları görev listesine çevirir; her madde kod + test; `typecheck`, `lint`, `test` geçmeden madde kapanmaz.
5. UI içeren maddelerde `turkish-ui-copy` ve `ui-reviewer` ajanlarını çalıştırır; sahibe ekran görüntüsü gösterir (masaüstü + telefon).
6. Kabul ölçütlerini işaretler; faz dosyasına "Sonuç" ekler; `DURUM.md` günceller; commit + push.
7. Kapsam dışına çıkmaz; yeni fikir → `01-gereksinimler.md` §P (`/requirement-change`) + soru.

## Değişmez kurallar (özet; tamamı `CLAUDE.md`)

Çevrimdışı veri girişi bozulmaz · ağ kodu yalnızca üç klasörde · OTA entegrasyonu yok · fatura kesme yok · bizim
sunucumuz/telemetri/otomatik güncelleme yok · tek giriş · para tam sayı kuruş · yetki servis katmanında · metin dil
dosyalarında · migrasyon değişmez · otel kuralı = ayar · veri silinmez · tek yazıcı (sunucu makine).
