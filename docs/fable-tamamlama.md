# Fable — Analiz turunu tamamlama talimatı (2. oturum)

Önceki Fable oturumu codespace boşta kaldığı için kapandı. Raporlar, plan ve ajan sistemi `claude/fable-analiz`
dalında duruyor (son commit `90dd8b0`). Sahip Opus'a geçmeden önce **senin işini eksiksiz bitirmeni** istiyor.

## 1. Başlarken

1. `claude/fable-analiz` dalında olduğundan emin ol: `git checkout claude/fable-analiz && git pull`.
2. `docs/fable-talimati.md` dosyasını yeniden oku. Bu, ana talimattır ve hâlâ geçerlidir.
3. Kendi çıktılarını gözden geçir. Ayrıntıya girmeden, yapıyı ve iddiaları kontrol et:
   - `docs/analiz/` altındaki tüm raporlar
   - `docs/plan/fazlar/faz-17…21`
   - `YURUTME.md`
   - `.claude/` değişiklikleri
   - `docs/analiz/OPUS-BASLANGIC.md`

## 2. Ana talimata göre eksikleri bul

Ana talimatın §2–§8 maddelerini tek tek işaretle ve her birinin yapılıp yapılmadığını yaz:

- Her rapor tabloda istenen içeriği karşılıyor mu?
- Her bulgunun bir plan paketi var mı?
- Her paketin bir ajanı ve modeli var mı?
- Kancalar testli mi?
- `npm run check` geçiyor mu?

Eksik olan her şeyi tamamla.

## 3. "Doğrulanmadı" diye bıraktığın maddeleri doğrula

Raporlarda "doğrulanmadı" diye bıraktığın maddeleri, codespace'te yapılabildiği kadar doğrula. Sonucu ilgili
rapora "doğrulandı" ya da "doğrulanamadı + neden" olarak yaz. Bilinen maddeler:

| Madde | Nerede yazıyor | Nasıl doğrulanır |
|---|---|---|
| İptalden sonra takvim ızgarasının tazelenmesi | `03` | Gerçek uygulamada, Playwright ile |
| `grid.test.ts` iptal ve park kapsamı | `02` | Testleri incele |
| `reservations-service.ts:1408-1410` 0 değeri sözleşmede kabul ediliyor mu | `03` | Sözleşme şemasına bak |
| İade raporlarda ayrı satır olarak görünüyor mu | `03`, `04` | `reports/queries.ts` ve `reports-service.ts` |
| Oda değişikliğinde kirli/temiz durumu | `04` | Kodu izle |
| `?` kısayolu | H-15 | Gerçek uygulamada |
| Telefon defterindeki ekleme sheet'inin Esc ile ya da kapatma düğmesiyle kapanması | H-16, `05` #13 | Telefon görünümünde |
| Linux'ta Windows paketi üretilebiliyor mu (`npm run package:win`, wine gerekirse kur) | `07` | Gerçekten dene; boyutu ve süreyi yaz |
| `bypassPermissions` modunda `permissions.deny` kuralları uygulanıyor mu | `09` | Küçük bir deneme ile |
| 21st.dev Magic MCP başlık adı ve kurulum komutu | `05` | Resmi kaynaktan |
| OpenCV/FFmpeg ve diğer kamera bağımlılıklarının lisansları | `06` | Resmi kaynaklardan |

Bunların dışında "doğrulanmadı" ya da "bakılmadı" yazan başka satır varsa onları da ele al. Bulmak için:

```bash
grep -rniE "doğrulanmadı|bakılmadı|yapılamadı" docs/analiz
```

## 4. Akış testinin kapsamı

`05-ekran-ve-tam-ekran-uyumu.md` raporunda hangi modüllerin gerçek uygulamada uçtan uca tıklanarak denendiğini
listele. Denenmemiş modül kaldıysa `flow-tester` ajanıyla tamamla. Codespace 4 çekirdekliyse aynı anda en çok 2 ajan
çalıştır.

## 5. Sahip cevapları

Sahip, S-100…S-118 sorularını ayrı bir sohbette cevaplıyor. Cevaplar terminale yapıştırılınca:

1. `06-kararlar.md` → "Sahip cevapları" bölümüne yaz.
2. `05-sorular.md` durumlarını güncelle.
3. Taslak K-xx kararlarını kesinleştir ya da değiştir.
4. Etkilenen faz dosyalarını, paket kartlarını, maliyet tahminini ve `OPUS-BASLANGIC.md`'yi güncelle.

Cevaplar gelmeden de §2–§4'ü yap. Cevap bekleyen işleri en sona bırak.

## 6. Bitiş

Ana talimatın §8 ve §8.1 kuralları aynen geçerli:

- Her aşamada commit ve push et.
- İş bitince mesajın başına `✅ FABLE İŞİ BİTTİ`, yarım kalırsa `⏸️ FABLE İŞİ HENÜZ BİTMEDİ` yaz.
- Son mesajda bu oturumda neyin eklendiğini ve neyin değiştiğini kısaca listele.
