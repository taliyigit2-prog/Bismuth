# Ek — Kamera, KVKK, lisans, PMS ve 21st.dev araştırma kaynakları

> Yardımcı araştırma ajanlarının 2026-11-12 tarihinde baktığı kaynaklar ve kısa bulgular. Hukuki tavsiye değildir.
> "İkincil" = hukuk bürosu/haber özeti; resmî metinle doğrulanmalı. "Doğrulanmadı" = sayfa okunamadı ya da yalnız
> arama özeti görüldü.

## A. KVKK

| Konu | Bulgu | Kaynak |
|---|---|---|
| Biyometrik veri özel nitelikli | 6698 m.6; Kurul rehberi yüz tanımayı kapsar | https://www.alomaliye.com/2021/09/16/biyometrik-verilerin-islenmesinde-dikkat-edilecek-hususlara-iliskin-rehber/ (ikincil) |
| 7499 sayılı Kanun değişiklikleri (01.06.2024) | Açık rıza diğer şartlarla eşit; şart sayısı arttı; "sözleşmenin ifası" m.6'da var mı doğrulanmadı | https://cakmak.av.tr/wp-content/uploads/2024/03/Kisisel-Verilerin-Korunmasi-Kanununda-onemli-degisiklikler.pdf ; https://www.hukukihaber.net/kvk-kanununda-ozel-nitelikli-kisisel-verilerin-islenmesi-ve-yurt-disina-veri-aktarimi-kapsaminda-yapilan-degisikliklere-iliskin-degerlendirmeler |
| Özel nitelikli veri rehberi (2025) | Tam metin okunmadı | https://www.kvkk.gov.tr/Icerik/8184/Ozel-Nitelikli-Kisisel-Verilerin-Islenmesine-Iliskin-Rehber |
| Mesai takibinde yüz tanıma ölçüsüz (2026/921) | Açık rıza olsa bile | https://www.alomaliye.com/2026/06/02/mesai-takibinde-biyometrik-veri-islenmesine-yeni-ilke-karari-kvkk/ (ikincil) |
| VERBİS muafiyeti (2025/1572, 01.10.2025) | <50 çalışan ve <100 milyon TL; ana faaliyet özel nitelikli veri ise 10 çalışan / 10 milyon TL | https://kvkk.gov.tr/Icerik/8388/KAMUOYU-DUYURUSU ; https://www.alomaliye.com/2025/10/01/ozel-nitelikli-kisisel-veri-isleme-veri-sorumlularinin-verbise-kayit-yukumlulugune-iliskin-istisna-kriteri/ |
| Yurt dışına aktarım (m.9, 2024 sonrası) | Yeterlilik kararı → uygun güvenceler (standart sözleşme, BŞK, taahhüt) → arızi haller | https://www.kvkk.gov.tr/Icerik/2053/Yurtdisina-Aktarim ; https://www.kvkk.gov.tr/Icerik/7938/... |
| Standart sözleşme bildirimi | 2024/959; imzadan sonra Kurum'a bildirim | https://www.alomaliye.com/2024/10/30/kvkk-standart-sozlesme-bildirim-modulu/ |
| WhatsApp emsali (2021/891) | Sunucusu yurt dışında olan hizmet = aktarım | https://www.erdem-erdem.av.tr/bilgi-bankasi/kisisel-verileri-koruma-kurulunun-whatsapp-hakkinda-resen-baslattigi-inceleme-sonuclandi |
| Kimlik fotokopisi ilke kararı (Aralık 2025) | Turizmde kimlik fotokopisi/tarama saklamak aykırı | https://www.mondaq.com/turkey/data-protection/1718008/... ; https://www.erdem-erdem.av.tr/en/insights/the-principle-decision-on-processing-identity-card-photocopies-in-the-tourism-and-hospitality-sector-has-been-published-1765289996278 |
| İş yeri kamera duyurusu (Haziran 2026) | "Yüz tanıma ve ses kaydından kaçının" — doğrulanmadı | arama özeti |

## B. Lisanslar

| Bileşen | Lisans | Kaynak |
|---|---|---|
| Ultralytics YOLO11 | AGPL-3.0; kapalı kaynak için Enterprise lisans (fiyat yayımlanmamış) | https://www.ultralytics.com/license |
| InsightFace kod / ağırlıklar | MIT / yalnız ticari olmayan araştırma; ticari lisans e-posta ile | https://raw.githubusercontent.com/deepinsight/insightface/master/README.md ; https://github.com/deepinsight/insightface/tree/master/python-package |
| ByteTrack | MIT | https://github.com/ifzhang/ByteTrack |
| YuNet (OpenCV Zoo) | MIT; WIDER Face AP 0.88/0.87/0.75 | https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet |
| SFace (OpenCV Zoo) | Apache-2.0 (eğitim verisi lisansı belirtilmemiş) | https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface |
| AuraFace v1 (fal) | Apache-2.0; ticari veriyle eğitilmiş; ResNet100 (ağır) | https://huggingface.co/fal/AuraFace-v1 |
| YOLOX | Apache-2.0; ONNX Runtime örneği var | https://github.com/Megvii-BaseDetection/YOLOX |
| RT-DETR (lyuwenyu) | Apache-2.0 (Ultralytics paketindeki sürüm AGPL) | https://github.com/lyuwenyu/RT-DETR |
| YOLO-NAS | ticari kullanım yasak | https://github.com/Deci-AI/super-gradients/blob/master/LICENSE.YOLONAS.md |
| MediaPipe | Apache-2.0; yüz tanıma yok | https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE |
| onnxruntime / opencv-python / FastAPI | MIT / Apache-2.0 (FFmpeg LGPL dinamik) / MIT | kendi bilgi, doğrulanmadı |

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
| MCP | "Magic MCP" → "21st MCP"; barındırılan uç nokta `https://21st.dev/api/mcp`; `npx @21st-dev/cli@latest init --client claude`; eski `@21st-dev/magic` vekil; anahtar değişkeni `API_KEY_21ST` (eski `TWENTY_FIRST_API_KEY`) | https://github.com/21st-dev/magic-mcp (ISC) |
| Kota | Ücretsiz: arama serbest, bileşen alma günde 2; Builder sınırsız; Builder+AI kredi | https://21st.dev/pricing (bakılmadı, llms.txt özeti) |
| Lisans | Bileşen başına yazar lisansı; bazıları "License: unknown"; ticari kullanım şartlarda açık değil | https://21st.dev/terms |
| Claude Code `.mcp.json` | `mcpServers` → `command/args/env` (stdio) ya da `type: "http"`, `url`, `headers`; `${VAR}` ve `${VAR:-vars}` genişletme; proje kapsamlı sunucu onay ister | https://code.claude.com/docs/en/mcp |
| Codespaces secret | Settings → Codespaces → New secret; ad yalnız harf/rakam/alt çizgi; çalışan codespace yeniden başlatılmalı | https://docs.github.com/en/codespaces/managing-your-codespaces/managing-your-account-specific-secrets-for-github-codespaces |
