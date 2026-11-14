# Son dalga ekran denetimi (azaltılmış matris)
Matris: 10 route (today, calendar, guests, ledger, reports, laundry, currency, settings, camera, staff) x TR/RU.
1280x720@1 açık+koyu (40), 1920x1080@1.25 açık (20), 3840x2160@1.5 açık (20) = 80 görüntü: `.tmp/son/screen/`. Ölçüm: `.tmp/son/m1.json`, `m2.json`, `m3.json`.
Betik kopyası `.tmp/son/shot.mjs` (yalnız temaları kısıtlar, telefonu atlar; kaynak değişmedi). BISMUTH_DRIVE_HOME geçici userData.
Not: Mac Retina'da görüntüler 2x (1280x720 -> 2560x1440); ölçek 1 gerçekte 2 DPR.

## Ölçüm
Yatay taşma 0, ekran dışı öğe 0, kesilen metin 0 (80/80). Yatay kaydırıcı: yalnız calendar tape-chart (bilinçli; 1280'de 974 px görünür/245600 px).

## Bulgular
| Önem | ekran@çözünürlük | sorun | öneri |
|---|---|---|---|
| Düşük | calendar@1280x720 (RU/TR) | Boş durum bandı + 2 satır araç çubuğu şerit ızgarasını 6 odaya sıkıştırıyor; lejant ekran dışı | boş durum bandı kapatılabilir/küçük, araç çubuğu tek satıra |
| Düşük | settings@1280x720 koyu RU | Sol menüde iki öğe aynı anda vurgulu (Общие aktif + Номера и типы, fare üzerinde artığı olabilir) | hover/aktif ayrımını güçlendir; doğrulanmadı |
| Düşük | ledger@1280x720 RU | "Закрыть день" kapalı notu ve araç düğmeleri ikinci satıra sarkıyor, hizasız | satır sarma hizası |
| Bilgi | Pencere/Tam ekran (macOS) | setFullScreen(true) 2,5 sn sonra isFullScreen=false kaldı (Playwright/Electron macOS'ta Space geçişi; kod toggleFullScreen + menü "Tam ekran" rolü var) | gerçek Mac'te elle doğrula; hata sayılmadı |

## Pencere davranışı
Başlangıç 1366x820; maximize ->1710x986 OK; unmaximize -> eski sınırlar OK; küçültme denemesi 300x200 -> min 960x600'e kenetlendi OK; 1500x900 ile kapat-aç -> window-state.json yazıldı ve geri yüklendi (y 144->120 macOS menü çubuğu kayması, önemsiz); tek BrowserWindow; menü Görünüm: Tam ekran var. Çoklu monitör/gerçek DPI: doğrulanmadı (yalnız kod).
Diyalog/menü açma: bu azaltılmış turda yapılmadı (yalnız ekran + ölçüm).

## Temiz route'lar
Tümü ölçüm açısından temiz; görsel olarak calendar, settings, ledger okundu (kalanı yalnız ölçümle).
