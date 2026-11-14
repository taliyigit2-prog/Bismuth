# Otel Kamera (Bismuth kamera yan süreci)

Otel güvenlik kamerasından gelen görüntüyü yerelde işleyen Python hizmeti: **kayıtlı misafirleri yüz imzasıyla tanır**,
kayıtsız girişleri yakalar. Bismuth içindeki **Kamera sekmesi** bu hizmeti kullanır; hizmeti Bismuth başlatır ve durdurur
(Faz 20, `docs/analiz/06-kamera-entegrasyonu.md`).

> Teknik ayrıntı, dosya düzeni, sözleşme ve test: **[AI_GELISTIRICI_NOTLARI.md](AI_GELISTIRICI_NOTLARI.md)**.

## Nasıl çalışır?

- Bismuth (Electron) hizmeti `python web_app.py` ile **yan süreç** olarak başlatır: her seferinde rastgele 32 baytlık
  belirteç (`BISMUTH_CAMERA_TOKEN`), boş bir port ve ayarlar JSON olarak (`BISMUTH_CAMERA_CONFIG`) ortam değişkeniyle verilir.
- Hizmet yalnız **127.0.0.1**'e bağlanır; her istek `X-Bismuth-Token` ister; `Host` ve `Origin` denetlenir; CORS yoktur.
- Hizmet **dış servise bağlanmaz**. Telegram bildirimi Bismuth'tadır (`src/main/network/telegram/`, ayarlı).
- Bismuth kapanınca ya da çökünce hizmet de kapanır (stdin borusu kapanır).
- Ayarlar Bismuth'ta (Ayarlar → Kamera, `camera.*`); `.env` dosyası yoktur.

## Geliştirici kurulumu (Python 3.12)

```bash
python3 -m venv venv
./venv/bin/pip install -r requirements-dev.txt   # ağır modeller (ultralytics, insightface) ayrıca kurulur
./venv/bin/python -m pytest                      # sentetik görüntülerle birim testler, model gerekmez
./venv/bin/ruff check .
```

Modeller ve paketleme: Faz 20 P20d/P20f. Model ağırlıkları (`yolo11n.pt`, `buffalo_s`) ve kamera görüntüleri, yüz vektörleri,
`.env`, `*.db` depoya **girmez** (`camera-data-guard` kancası).

## Eski bağımsız başlatıcılar

`Baslat_Mac`, `Durdur_Mac`, `Otel_*_Windows.bat` ve `static/index.html` (tarayıcı paneli) bağımsız çalışma dönemindendir.
Belirteç zorunluluğu nedeniyle artık tek başına çalışmazlar; Kamera sekmesi (P20b) ve paketleme (P20f) ile kaldırılacaktır.
