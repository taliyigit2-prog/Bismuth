---
name: code-graph
description: Kodu dosya dosya okumadan önce graphify bilgi grafiğine sor — bir sembolün nerede tanımlandığı/kullanıldığı, iki modül arası yol, bir değişikliğin etkilediği dosyalar. Geniş arama, etki analizi ve ajan görev metni hazırlarken kullan (token tasarrufu).
---

# Kod grafiği (graphify)

Grafik `graphify-out/` (depoya girmez). Yoksa ya da 1 saatten eskiyse önce: `graphify update .` (LLM yok, ~40 sn).
CLI yoksa: `uv tool install graphifyy` (yalnız bu ortamda; ürün bağımlılığı değildir).

Önce grafiğe sor, sonra yalnız dönen dosyaların ilgili satırlarını oku:

- `graphify query "<soru>"` — ilgili düğümler/dosyalar
- `graphify explain <sembol>` — tanım + çağıranlar
- `graphify path <A> <B>` — iki sembol/modül arası bağ
- `graphify affected <dosya>` — değişikliğin etki alanı (test seçimi için)
- `graphify god-nodes` — en bağlı düğümler (riskli dosyalar)
- Genel harita: `graphify-out/GRAPH_REPORT.md` (tamamını okuma; `grep` ile)

Kurallar: çıktıyı ajan görev metnine dosya yolu listesi olarak koy, içerik kopyalama. Grafik eskiyse sonuçları
`rg` ile doğrula. Grafik yalnızca AST'dir; iş kuralı için kaynak dosyayı oku.
