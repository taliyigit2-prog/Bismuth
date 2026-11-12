# Ek — Kamera, KVKK, lisans, PMS ve 21st.dev araştırma kaynakları

> Yardımcı araştırma ajanlarının 2026-11-12 tarihinde baktığı kaynaklar ve kısa bulgular. Hukuki tavsiye değildir.
> "İkincil" = hukuk bürosu/haber özeti; resmî metinle doğrulanmalı. "Doğrulanmadı" = sayfa okunamadı ya da yalnız
> arama özeti görüldü.

## A. KVKK

| Konu | Bulgu | Kaynak |
|---|---|---|
| Biyometrik veri özel nitelikli | 6698 m.6; Kurul rehberi yüz tanımayı kapsar | https://www.alomaliye.com/2021/09/16/biyometrik-verilerin-islenmesinde-dikkat-edilecek-hususlara-iliskin-rehber/ (ikincil) |
| 7499 sayılı Kanun değişiklikleri (RG 12.03.2024, yürürlük 01.06.2024) | **Doğrulandı (Resmî Gazete):** m.33 ile KVKK m.6/3 yedi şart: (a) açık rıza, (b) kanunda açıkça öngörülme, (c) fiili imkânsızlıkta hayat/beden bütünlüğü, (ç) alenileştirme, (d) hak tesisi/kullanımı/korunması, (e) sağlık hizmetleri, (f) istihdam/İSG/sosyal güvenlik, (g) vakıf-dernek-sendika. Açık rıza eşit alternatiflerden biri; "sözleşmenin ifası" **yok** | https://www.resmigazete.gov.tr/eskiler/2024/03/20240312-1.htm |
| Özel nitelikli veri rehberi (2025) | Tam metin okunmadı | https://www.kvkk.gov.tr/Icerik/8184/Ozel-Nitelikli-Kisisel-Verilerin-Islenmesine-Iliskin-Rehber |
| Mesai takibinde yüz tanıma ölçüsüz (2026/921, 29.04.2026) | **Doğrulandı (resmî duyuru sayfası, 27.08.2026 listesi):** açık rıza olsa bile ölçülülük/gereklilik/veri minimizasyonuna aykırı; işçi-işveren güç dengesizliği nedeniyle rıza serbest sayılmayabilir; PIN/kart/imza çizelgesi alternatifi; yalnız mesai takibini kapsar, misafir tanımayı ele almaz | https://www.kvkk.gov.tr/Icerik/8121/Mesai-Takibi-Amaciyla-Biyometrik-Veri-Islenmesi-Hakkinda-Kamuoyu-Duyurusu ; özet https://www.alomaliye.com/2026/06/02/mesai-takibi-amaciyla-biyometrik-veri-islenmesi-hakkinda-kvkk-duyurusu/ (ikincil) |
| VERBİS muafiyeti (2025/1572, 01.10.2025) | <50 çalışan ve <100 milyon TL; ana faaliyet özel nitelikli veri ise 10 çalışan / 10 milyon TL | https://kvkk.gov.tr/Icerik/8388/KAMUOYU-DUYURUSU ; https://www.alomaliye.com/2025/10/01/ozel-nitelikli-kisisel-veri-isleme-veri-sorumlularinin-verbise-kayit-yukumlulugune-iliskin-istisna-kriteri/ |
| Yurt dışına aktarım (m.9, 2024 sonrası) | Yeterlilik kararı → uygun güvenceler (standart sözleşme, BŞK, taahhüt) → arızi haller | https://www.kvkk.gov.tr/Icerik/2053/Yurtdisina-Aktarim ; https://www.kvkk.gov.tr/Icerik/7938/... |
| Standart sözleşme bildirimi | 2024/959; imzadan sonra Kurum'a bildirim | https://www.alomaliye.com/2024/10/30/kvkk-standart-sozlesme-bildirim-modulu/ |
| WhatsApp emsali (2021/891) | Sunucusu yurt dışında olan hizmet = aktarım | https://www.erdem-erdem.av.tr/bilgi-bankasi/kisisel-verileri-koruma-kurulunun-whatsapp-hakkinda-resen-baslattigi-inceleme-sonuclandi |
| Kimlik fotokopisi ilke kararı (Aralık 2025) | Turizmde kimlik fotokopisi/tarama saklamak aykırı | https://www.mondaq.com/turkey/data-protection/1718008/... ; https://www.erdem-erdem.av.tr/en/insights/the-principle-decision-on-processing-identity-card-photocopies-in-the-tourism-and-hospitality-sector-has-been-published-1765289996278 |
| İş yeri kamera duyurusu (Haziran 2026) | **Doğrulanamadı:** kvkk.gov.tr'de ayrı bir "iş yeri kamera" duyurusu bulunamadı; Haziran 2026'daki metin yukarıdaki 2026/921 duyurusudur (yalnız mesai takibi). Genel kamera izleme için ayrı rehber yok, biyometrik rehber (Eylül 2021, KVKK Yayınları; PDF 10 MB üstü, okunamadı) geçerli | https://www.kvkk.gov.tr/SharedFolderServer/CMSFiles/bd06f5f4-e8cc-487e-abe1-d32dc18e2d7e.pdf |

## B. Lisanslar

| Bileşen | Lisans | Kaynak |
|---|---|---|
| Ultralytics YOLO11 | AGPL-3.0 (LICENSE doğrulandı); resmî sayfa: "An Enterprise License is required if you want to use Ultralytics YOLO without open-sourcing your entire project" — ticari ürün, kapalı kaynak, gömülü kamera/cihaz dahil (doğrulandı); `settings.sync=True` varsayılan anonim analitik (docs.ultralytics.com/usage/settings, doğrulandı); `insightface` 0.7.3 PyPI'de yalnız sdist (02.04.2023; doğrulandı), 2.1 (Ekim 2026) `py3-none-any.whl` ile geliyor | https://www.ultralytics.com/license ; https://docs.ultralytics.com/usage/settings/ ; https://pypi.org/project/insightface/0.7.3/ |
| InsightFace kod / ağırlıklar | MIT / yalnız ticari olmayan araştırma; ticari lisans e-posta ile | https://raw.githubusercontent.com/deepinsight/insightface/master/README.md ; https://github.com/deepinsight/insightface/tree/master/python-package |
| ByteTrack | MIT (LICENSE dosyası doğrulandı) | https://github.com/ifzhang/ByteTrack/blob/main/LICENSE |
| YuNet (OpenCV Zoo) | MIT (LICENSE doğrulandı: Shiqi Yu 2020); WIDER Face AP 0.88/0.87/0.75 | https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet |
| SFace (OpenCV Zoo) | Apache-2.0 (LICENSE doğrulandı; eğitim verisi lisansı belirtilmemiş) | https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface |
| AuraFace v1 (fal) | Apache-2.0; ticari veriyle eğitilmiş; ResNet100 (ağır) | https://huggingface.co/fal/AuraFace-v1 |
| YOLOX | Apache-2.0; ONNX Runtime örneği var | https://github.com/Megvii-BaseDetection/YOLOX |
| RT-DETR (lyuwenyu) | Apache-2.0 (Ultralytics paketindeki sürüm AGPL) | https://github.com/lyuwenyu/RT-DETR |
| YOLO-NAS | ticari kullanım yasak | https://github.com/Deci-AI/super-gradients/blob/master/LICENSE.YOLONAS.md |
| MediaPipe | Apache-2.0; yüz tanıma yok | https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE |
| onnxruntime / OpenCV / opencv-python / FastAPI | MIT / Apache-2.0 / wheel'ler FFmpeg LGPL 2.1 ("All wheels ship with FFmpeg licensed under the LGPLv2.1"; Linux Qt yalnız headless olmayan wheel'de) / MIT — **doğrulandı** 2026-11-12 | https://github.com/microsoft/onnxruntime/blob/main/LICENSE ; https://github.com/opencv/opencv/blob/4.x/LICENSE ; https://github.com/opencv/opencv-python/blob/4.x/README.md ; https://ffmpeg.org/legal.html ; https://github.com/fastapi/fastapi/blob/master/LICENSE |

## C. Rakip PMS'lerde gündüz kullanımı (day-use)

| PMS | Bulgu | Kaynak |
|---|---|---|
| Protel | Ayrı "Day Use" fiyat kodu; oda başına günde bir; müsaitlik/geceleme sayılmaz; takvimde kırmızı + saat simgesi; raporda ayrı satır; uzatmak için iptal + yeniden açma | https://connect.protel.net/files/source/pairexthelp/en_US/res-day-use.htm |
| Mews | Day-use ayrı "bookable service"; aynı oda hem day-use hem gece; sabah/öğleden sonra iki hizmet; saatlik hizmet ayrı | https://help.mews.com/s/article/bookable-services-for-day-use ; https://mews-systems.gitbook.io/connector-api/concepts/time-units |
| Opera | Day-use fiyat kodu + 0 gece; 5.6 rapor formülü ADR'ye day-use dahil (Cloud doğrulanmadı) | https://docs.oracle.com/cd/E81346_01/doc.183/e81527/t_booking_reservations_booking_a_reservation.htm (arama özeti) |
| Cloudbeds | Oda day-use bulunamadı; "Spaces" saatlik, doluluk/ADR/RevPAR'a girmez | https://myfrontdesk.cloudbeds.com/hc/en-us/articles/42466888994203 ; .../34435170665627 (arama özeti) |
| HotelRunner | Aynı gün giriş-çıkış + çıkış saatini ilerletme; folyoda "day_posting" | http://support.hotelrunner.com/en/manage-day-use-accommodations/?p=1346 |
| GuestPoint | Doğal destek yok; çıkış yapılmış rezervasyon üstüne yeni rezervasyon | https://help.guestpoint.com/portal/en/kb/articles/day-use-bookings |
| Kwentra | Çıkış günü oda değiştirme ile day-use | https://help.kwentra.com/front-office/reservations/individual-reservations/departure-day-room-move |
| Hotelogix | Saatlik rezervasyon / zaman bloğu fiyatı (blog) | https://blog.hotelogix.com/flexible-stay-options-hotel-pms-trend/ (arama özeti) |
| Erken çıkış politikaları | "Rezervasyondan hemen sonra" ve "check-in sonrası" ayrı ücret politikası | https://help.rguest.com/stay/PropertySetup/Early%20Departure%20Policies.htm (arama özeti) ; https://www.uponarriving.com/hotel-early-departure-fee |
| Little Hotelier, Elektraweb, Sedna, Otelyo, Kobil, Asyasoft, eZee | day-use belgesi bulunamadı (doğrulanmadı) | — |

## D. 21st.dev ve MCP

| Konu | Bulgu | Kaynak |
|---|---|---|
| Ne sunuyor | shadcn/ui uyumlu React + Tailwind bileşen kataloğu (12.000+), shadcn CLI ile kurulum | https://21st.dev/llms.txt ; https://21st.dev/mcp |
| MCP | "Magic MCP" → "21st MCP" ("same tool, renamed"); barındırılan uç nokta `https://21st.dev/api/mcp`, başlık **`x-api-key`** (resmî README; llms.txt "or Bearer token" da diyor); kurulum `npx @21st-dev/cli@latest init --client claude` ya da Claude Code eklentisi `claude plugin marketplace add 21st-dev/magic-mcp` + `/plugin install 21st`; eski `@21st-dev/magic` stdio vekili; anahtar değişkeni `API_KEY_21ST` (eski `TWENTY_FIRST_API_KEY`) — **doğrulandı** 2026-11-12 | https://github.com/21st-dev/magic-mcp (ISC) ; https://21st.dev/mcp.md |
| Kota | **Doğrulandı:** ücretsiz plan günde 2 bileşen alma (Web+MCP+CLI toplam), arama serbest; Builder $6/ay (yıllık) – $8 (üç aylık); Builder+AI 500 kredi $15/ay … 2.000 kredi $60/ay; Team $7,50/koltuk | https://21st.dev/pricing ; https://21st.dev/llms.txt |
| Lisans | Şartlar §2: bileşenler yazarların ve 21st Labs'ın mülkü, kullanım yalnız platform üzerinden; §3: yetkisiz yeniden dağıtım/satış yasak; §3.1: izin verici lisansta bile yazar kredisi. Kapalı kaynak ticari masaüstü uygulamada kullanım şartlarda **düzenlenmemiş** (doğrulanamadı; hukukçu görüşü) | https://21st.dev/terms |
| Claude Code `.mcp.json` | `mcpServers` → `command/args/env` (stdio) ya da `type: "http"`, `url`, `headers`; `${VAR}` ve `${VAR:-vars}` genişletme; proje kapsamlı sunucu onay ister | https://code.claude.com/docs/en/mcp |
| Codespaces secret | Settings → Codespaces → New secret; ad yalnız harf/rakam/alt çizgi; çalışan codespace yeniden başlatılmalı | https://docs.github.com/en/codespaces/managing-your-codespaces/managing-your-account-specific-secrets-for-github-codespaces |
