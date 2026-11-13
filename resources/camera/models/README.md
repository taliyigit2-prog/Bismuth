# Kamera model dosyaları (K-57)

Bu klasör kamera yan sürecinin (`otel-kamera/`) YEREL model dosyalarını taşır. **Dosyaların kendisi depoya girmez**
(CLAUDE.md yasak 14, `camera-data-guard` kancası; `.gitignore` yalnız bu README ve `SHA256SUMS` dosyasına izin verir).
Paketleme (P20f) dosyaları kurulum paketine `resources/camera/models/` olarak koyar. Yan süreç hiçbir model indirmez
(G-01, G-07): dosya yoksa `model_loader.ModelMissingError` ile açık hata verir ve Kamera sekmesi "başlatılamadı" gösterir.

## Beklenen yerleşim

```
resources/camera/models/
  yolo11n.pt
  insightface/models/buffalo_s/det_500m.onnx
  insightface/models/buffalo_s/w600k_mbf.onnx
  SHA256SUMS          (isteğe bağlı; varsa açılışta doğrulanır)
```

| Dosya                                         | Ne için                                        | Nereden (paketleyen bir kez indirir)                                                                                        | Lisans                                                              | sha256                                             |
| --------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| `yolo11n.pt`                                  | Kişi tespiti (YOLO11n)                         | Ultralytics GitHub sürümleri: `https://github.com/ultralytics/assets/releases` (varlık adı `yolo11n.pt`)                    | **AGPL-3.0** (Ultralytics)                                          | P20f paketlerken hesaplanıp `SHA256SUMS`'a yazılır |
| `insightface/models/buffalo_s/det_500m.onnx`  | Yüz tespiti (SCRFD-500M)                       | InsightFace model paketi `buffalo_s.zip`: `https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_s.zip` | **Yalnız ticari olmayan araştırma** (InsightFace model ağırlıkları) | aynı                                               |
| `insightface/models/buffalo_s/w600k_mbf.onnx` | Yüz tanıma (ArcFace, MobileFaceNet, 512 boyut) | aynı zip                                                                                                                    | aynı                                                                | aynı                                               |

`buffalo_s.zip` içindeki `1k3d68.onnx`, `2d106det.onnx` ve `genderage.onnx` dosyaları **pakete konmaz**: yan süreç yalnız
`detection` + `recognition` modüllerini yükler (`INSIGHTFACE_MODULES`); yaş/cinsiyet çıkarımı yapılmaz, RAM ve CPU azalır.

`sha256` sütunu bilerek boş: değerler dosyalar indirildiği gün hesaplanır (`sha256sum yolo11n.pt insightface/...`) ve
`SHA256SUMS` dosyasına `<sha256>  <göreli yol>` satırlarıyla yazılır; uydurma değer yazılmaz. `SHA256SUMS` varsa yan süreç
açılışta doğrular, uyuşmazlıkta yüklemeyi reddeder.

## Lisans uyarısı (sahip kararı K-57, 2026-11-13; ayrıntı `docs/analiz/06-kamera-entegrasyonu.md` §6.3)

- Sahip mevcut modelleri bilerek korudu ve programı **yalnız kendi otelinde** kullanıyor; satmayı düşünmüyor.
- InsightFace `buffalo_*` ağırlıkları "ticari olmayan araştırma" lisanslıdır; otelde güvenlik kullanımı bu tanıma girmez,
  yani risk vardır. Çözüm: lisans sahibinden yazılı izin (`06` §6.4 e-posta taslağı) ya da açık lisanslı modellere geçiş.
- Ultralytics AGPL-3.0'dır; kod değiştirilmez, yan süreç olarak ayrı çalışır, program başka bir otele verilmez. Şirketin kendi
  lisans sayfası iç kullanım için de Enterprise lisans ister (metinden katı bir ticari tutum); bağlayıcılığı hukuki sorudur.
- **Programı bir başkasına satmak ya da vermek bu modellerle yapılamaz.** O gün `06` §6.2'deki geçiş planı (YuNet ve SFace
  modelleri, ByteTrack benzeri izleme) uygulanır; bu klasörün içeriği değişir, kod yapısı aynı kalır.
- Hiçbir model uzak sunucudan indirilmez; `ultralytics` telemetrisi (`settings.sync`) kapalıdır ve çevrimdışı ortam değişkenleri
  (`YOLO_OFFLINE=1`, `YOLO_AUTOINSTALL=false`, `HF_HUB_OFFLINE=1`) yan süreç tarafından zorlanır.
