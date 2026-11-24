# Faz Durumu — Bismuth

> Her oturum başında okunur (SessionStart kancası bunu ekrana basar). Bir faz bitince satırı güncelleyin ve
> faz dosyasının sonuna "Sonuç" bölümü ekleyin.

| Faz | Dosya | Durum | Not |
|---|---|---|---|
| 0 | `faz-00-derin-arastirma.md` | ✅ tamam (2026-10-02) | araştırma + canlı doğrulama + prototipler; 4. tur cevapları işlendi; K-19 kesin (C2 + NetBird + Drive); gereksinimler v4 |
| 1 | `faz-01-proje-iskeleti.md` | ✅ tamam (2026-10-02) | Electron + React + SQLite iskeleti; tek kontrat (Hono) IPC + HTTP; tr/en/ru; tema; masaüstü + telefon kabuğu; CI'da Windows/macOS paketleri; sahibin denemesi S-80'de |
| 2 | `faz-02-veri-modeli-is-kurallari.md` | ✅ tamam (2026-10-03) | arayüzsüz çekirdek: 65 tablo (migrasyon 0001–0004), 52 yetki anahtarı, 26 servis, 15 iş kuralı modülü; 427 test, kapsam %97 satır / %85 dal; `npm run seed:demo` ile bir yıllık örnek otel |
| 3 | `faz-03-ui-tasarim-sistemi.md` | ✅ tamam (2026-10-04) | tasarım dili (`docs/gelistirici/tasarim.md`), tema + durum etiketleri (gerçek servis), masaüstü + telefon kabuğu, 31 ekran taslağı, bileşen kütüphanesi; 687 test + 12 e2e (TR/RU taşma yok); sahip onayı: `taslak-onay/2026-10-04.md` |
| 4 | `faz-04-kurulum-giris-roller.md` | ✅ tamam; ekran 2. turu son onay paketinde (K-39) | 1. turda 30/33 ekran onaylandı, 3 değişiklik yapıldı (döviz, satış kanalları, görevler); kurulum sihirbazı (12 adım), oturum/kilit/kurtarma, roller ve kullanıcılar, 14 bölümlü ayarlar, denetim kaydı; kişiye özel görünüm; migrasyon 0005–0007; 883 test + 32 e2e; ekran onayı: `taslak-onay/2026-10-04-faz4.md` |
| 5 | `faz-05-rezervasyon-takvimi.md` | ✅ kod tamam (2026-10-05); son kontrol + onay paketinde | programın kalbi |
| 6 | `faz-06-misafir-kara-liste.md` | ✅ kod tamam (2026-10-05); son kontrol + onay paketinde | + firma/fatura bilgileri, sürekli istekler, fiyat geçmişi |
| 7 | `faz-07-defter-kasa.md` | ✅ kod tamam (2026-10-05); son kontrol + onay paketinde | |
| 8 | `faz-08-personel.md` | ✅ kod tamam (2026-10-05); son kontrol + onay paketinde | |
| 9 | `faz-09-oda-durumu-bakim-takvim.md` | ✅ kod tamam (2026-10-05); son kontrol + onay paketinde | + arıza, **görevler**, **vardiya devri ve notlar**, **otelde kalanlar (KBS)**, kat planı |
| 10 | `faz-10-raporlar.md` | ✅ kod tamam (2026-10-05); son kontrol + onay paketinde | + turizm istatistiği (KBS) |
| 11 | `faz-11-doviz-dis-veri.md` | ✅ kod tamam (2026-10-05); son kontrol + onay paketinde | piyasa orta kur, **hava durumu**, bayram çevrimiçi doğrulama |
| 12 | `faz-12-rehber-tedarik-camasirhane.md` | ✅ kod tamam (2026-10-05); son kontrol + onay paketinde | + çamaşırhane giden/gelen, kayıp eşya |
| 13 | `faz-13-uzaktan-erisim.md` | ✅ kod tamam (2026-10-05; güvenlik düzeltmeleri K-45 dahil); son kontrol + onay paketinde | sunucu/istemci/telefon + Mac yedek kopya, şifreli Drive kutusu, devral, NetBird |
| 14 | `faz-14-yedek-aktarma.md` | ✅ kod tamam (2026-10-05); son kontrol + onay paketinde | program klasörü + otel Drive'ı, 30 gün, şifreli, parçalı |
| 15 | `faz-15-ui-cilasi.md` | ✅ kod tamam (2026-10-05); son kontrol + onay paketinde | UI fazı 2 + üç dil + **ayrıntılı program içi kılavuz** + kısayollar |
| 16 | `faz-16-test-paketleme-surum.md` | 🔄 sertleştirme, paketleme, belgeler tamam; uçtan uca testler (P16c) ve CI yeşili sürüyor | v1.0 |
| 17 | `faz-17-resepsiyon-duzeltmeleri.md` | ✅ kod tamam (dalgalar + Son kontrol, 2026-11-14) | resepsiyonun 4 maddesi: vazgeçme/iade, grup + toplu giriş, hızlı takvim, gündüz kullanımı 2.0, kritik hatalar (G-193…G-196) |
| 18 | `faz-18-ekran-ve-tam-ekran.md` | ✅ kod tamam (Son kontrol: screen-auditor + flow-tester, 2026-11-14) | çözünürlük/ölçek/tema/dil uyumu, pencere ve tam ekran, çalışmayan öğeler |
| 19 | `faz-19-kurulum-ve-dagitim.md` | ✅ kod tamam (2026-11-13; P19a–d); gerçek Windows/Mac denemesi sahip onay paketinde | sürüm iş akışı tekleştirme, kurulum belgeleri, depo temizliği, ajan bakımı |
| 20 | `faz-20-kamera-entegrasyonu.md` | ✅ kod tamam (2026-11-14; P20a–P20g); gerçek kamera/ek denemesi ve avukat görüşü sahip onay paketinde | otel-kamera Bismuth içinde sekme: yan süreç + Telegram (ayarlı), veri, mevcut modeller (telemetrisiz), aydınlatma, kurulum sihirbazı, paketleme |
| 21 | `faz-21-coklu-otel-ve-diger.md` | ✅ kod tamam (2026-11-14; P21b–P21e; P21a atlandı, otonom varsayılan) | istemci otel listesi + takvimli portföy (K-54), geç çıkış/no-show/gece raporu, orta/düşük bulgular, isteğe bağlı profiller |
| 22 | `faz-22-performans-ve-kabuk.md` | ✅ (2026-11-14) P22a–P22c; K-62 ölçümüyle Electron kalır, P22d/P22e açılmadı | Electron ölçüm/hafifletme, kabuk soyutlaması, Tauri 2 prototipi ve sahip kararı; tam Rust yok |

**Şu anki faz:** tüm dalgalar ve Son dalgası bitti (2026-11-14); **v1.0.1 yayında (2026-11-15)**, kamera eki sahibin gizli
"kamera" taslağında. 2026-11-24: proje Antigravity'ye devredildi (başlangıç `AGENTS.md`). Kalan sahip işleri: ekran onayı
(`taslak-onay/2026-11-14-son.md`), gerçek Windows kurulum denemesi (S-80), gerçek kamera denemesi, KVKK avukat görüşü.

**Açık küçük soru (fazları engellemez):** S-80 — Faz 1 paketini otel bilgisayarında (Windows) ve Mac'te açıp denemek +
otel bilgisayarının "Sistem türü" (sahip otele gidince). Paketler: GitHub → Actions → son yeşil `ci` → `Bismuth-Windows` /
`Bismuth-Mac` (14 gün).
