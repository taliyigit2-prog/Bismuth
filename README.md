# Bismuth

Küçük ve orta oteller için **masaüstü otel yönetim programı**: rezervasyon takvimi, kasa, misafirler, personel, raporlar.
İnternet olmadan çalışır; veriler otelin kendi bilgisayarında, tek bir SQLite dosyasındadır. Arayüz Türkçe, İngilizce ve
Rusça. Windows (`Bismuth-Setup.exe`) ve macOS (`Bismuth.dmg` Apple çipli Mac için, `Bismuth-Intel.dmg` Intel Mac için)
kurulum dosyaları üretilir; sürüm numarası dosya adında değil, sürüm sayfasının başlığında ve programın **Hakkında**
ekranındadır.

- Bizim sunucumuz, telemetri, otomatik güncelleme, lisans sunucusu **yoktur**.
- Kanal yöneticisi / OTA entegrasyonu ve fatura kesme **yoktur** (fatura bilgisi saklanır ve kopyalanır).
- Otele özgü her kural bir **ayar**dır.

## Belgeler

Hangi belgenin kimin için olduğu: [`docs/README.md`](docs/README.md).

- **Otel çalışanı ve sahibi:** [`docs/otel/`](docs/otel/). Kurulum, kullanım kılavuzu, yedek, uzaktan erişim.
- **Geliştirici:** [`docs/gelistirici/`](docs/gelistirici/).
- **Plan ve kararlar:** [`docs/plan/`](docs/plan/).
- **Yapay zekâ ajanları:** [`AGENTS.md`](AGENTS.md) ve [`ANTIGRAVITY.md`](ANTIGRAVITY.md).

## Durum

Geliştirme fazlar hâlinde ilerler: `docs/plan/fazlar/DURUM.md`. Plan ve kararlar `docs/plan/` altında
(gereksinimler `01`, mimari `03`, sorular `05`, kararlar `06`).

Son analiz raporları ve geliştirme planı: [`docs/analiz/00-ozet.md`](docs/analiz/00-ozet.md).

## Kurulum (sahip için)

Ayrıntılı, adım adım kılavuz: [`docs/otel/kurulum.md`](docs/otel/kurulum.md).

Tıklayınca en yeni sürüm iner:

| Bilgisayar                                                | İndir                                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Windows 10 / 11** (otel bilgisayarı ve çoğu bilgisayar) | [Bismuth-Setup.exe](https://github.com/taliyigit2-prog/Bismuth/releases/latest/download/Bismuth-Setup.exe)             |
| Mac, Apple çipli (M1, M2, M3, M4)                         | [Bismuth.dmg](https://github.com/taliyigit2-prog/Bismuth/releases/latest/download/Bismuth.dmg)                         |
| Mac, Intel işlemcili                                      | [Bismuth-Intel.dmg](https://github.com/taliyigit2-prog/Bismuth/releases/latest/download/Bismuth-Intel.dmg)             |
| Windows, ARM işlemcili (az rastlanır)                     | [Bismuth-Setup-arm64.exe](https://github.com/taliyigit2-prog/Bismuth/releases/latest/download/Bismuth-Setup-arm64.exe) |

- **Sürümler:** GitHub → **Releases** → en yeni sürüm → **Assets**. Yanında `SHA256SUMS.txt` (dosyanın bozulmadan indiğini
  denetlemek için) vardır.
- **Yeni sürüm yayınlamak (sahip):** `package.json` sürümünü artırın, `docs/surum-notlari/vX.Y.Z.md` yazın, sonra GitHub →
  **Actions** → **release** → **Run workflow** → dal `main`, **Sürümü yayınla** kutusunu işaretleyin → **Run workflow**. Yaklaşık
  30 dakikada kurulum dosyaları **Releases** sayfasına ve yukarıdaki bağlantılara gelir. Kutu işaretsizse yalnız deneme paketi
  üretilir (Actions → çalışma → **Artifacts**, 14 gün).
- **Windows:** kurulum dosyası imzasız olduğu için "Windows bilgisayarınızı korudu" uyarısı çıkar: **Ek bilgi → Yine de
  çalıştır**. Kurulum yalnız sizin kullanıcınıza yapılır, yönetici şifresi istemez; masaüstüne ve Başlat menüsüne
  kısayol koyar.
- **Mac (macOS 15 ve sonrası):** `.dmg`'yi açıp Bismuth'u **Uygulamalar**'a sürükleyin. İlk açılışta "Bismuth açılmadı"
  uyarısında **Bitti**'ye basın, sonra **Sistem Ayarları → Gizlilik ve Güvenlik** → en altta **Yine de aç** → **Aç**.
  (Eski "sağ tık → Aç" yolu macOS 15'ten beri işe yaramaz.)
- **Kaldırmak** kayıtları silmez: veriler ayrı bir veri klasöründe kalır (bkz. kılavuz).

## Geliştirici

Node 22.12+ gerekir.

```bash
npm ci
npm run dev          # uygulamayı geliştirme modunda açar
npm run check        # typecheck + lint + birim testleri (commit öncesi zorunlu)
npm run build && npm run e2e && npm run e2e:mobile
npm run package:dir  # paketlenmiş uygulama (kurulumsuz klasör)
```

Ayrıntılar: [`docs/gelistirici/README.md`](docs/gelistirici/README.md) · Bağımlılıklar: [`docs/plan/bagimliliklar.md`](docs/plan/bagimliliklar.md) ·
Üçüncü taraf lisansları: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) · Ajan çalışma kuralları: [`ANTIGRAVITY.md`](ANTIGRAVITY.md).

## Lisans

Özel yazılım (`UNLICENSED`). İçerdiği açık kaynak bileşenlerin lisansları `THIRD_PARTY_NOTICES.md` dosyasında ve programın
**Hakkında** ekranındadır.
