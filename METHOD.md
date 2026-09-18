# BIST Tarama Yöntemi — Hızlı Başvuru (v3.1)

> Puanlama yönteminin kısa özeti. Taramaların uyduğu bağlayıcı kural setinin tamamı
> `docs/analiz-kurallari.md` içindedir; bu kart mantığı bir bakışta kontrol etmek içindir.

## İşlem hattı

```
6 veri bloğunu topla  →  Q, P, R puanla  →  FINAL = 100·(Q/100)^0.45·(P/100)^0.55·R ± Tape  →  duruş
```

## 1. Her taramada toplanan veri

| Blok | Kaynak | Beslediği |
|---|---|---|
| Makro (TCMB faizi, enflasyon, TL, fon akışları) | web, tarihli | Kalite %10 |
| Sektör (talep, düzenleme, döviz maruziyeti, XU100'e göre) | web | Kalite %20 |
| Temel veriler — **Sağlık** (marjlar, özsermaye kârlılığı (ROE), reel büyüme, borç, nakit) | web/KAP | Kalite %45 |
| Temel veriler — **Değerleme** (içsel gerçeğe uygun değere (intrinsic fair value) göre iskonto, emsal çarpanları) | web + fiyat | Fiyat %45 |
| Bağlantılar (son pazar eğilimi, değer zinciri, temalar) | web | Kalite %15 |
| Haberler ve yönetişim (KAP, sözleşmeler, sulandırma (dilution), içeridekiler (insiders)) | web | Kalite %10 + Risk; katalizörler → Fiyat %15 |
| Teknik göstergeler (RSI, hareketli ortalamalar (MA), MACD, ATR, destek/direnç, hacim, 52 hafta) | `get_technicals` aracı | Fiyat %40 |

## 2. Üç puan

**KALİTE — "bu işletmeye sahip olmaya değer mi?"** (değerleme hariç)

```
Q = 0.45·Health + 0.20·Sector + 0.15·Connections + 0.10·News + 0.10·Macro
    üst sınır Health + 20      (çevre koşulları hasta bir şirketi taşıyamaz)
```

**FİYAT — "fiyat ve zamanlama cazip mi?"** (çoğunluk ekseni)

```
P = 0.45·Valuation + 0.40·Technicals + 0.15·Catalysts
```

- Değerleme = yalnızca **içsel** gerçeğe uygun değere göre iskonto (emsal F/K × normalize
  HBK, gerekçeli PD/DD × defter değeri, FD/FAVÖK; zarar edenlerde defter değerine kesinti
  uygulanır). Asla destek/dirençten türetilmez — bu döngüsel olurdu. İçsel değer
  düşüyorsa (−10) ya da eriyorsa (−20) dürüstlük kesintisi uygulanır.
- Teknik puan `src/backtest.ts` içinde kodlanmıştır: serbest düşüş (freefall) cezası −13,
  parabolik uzama cezası −10, **yalnızca aşırı satım (oversold) için ceza yok** (geriye
  dönük test (backtest): BIST'te RSI<30 hafif olumluydu).

**RİSK — kademeli kesintiler, ani eleme (kill-switch) yok** (R = 1.00'dan 0.55'e kadar)

12 ay içinde bedelli: −0.05…−0.15 · süregelen zararlar: −0.05…−0.15 · SPK/VBTS: −0.10…−0.20 ·
işletmenin sürekliliği (going-concern) şüphesi: −0.20 · sığ likidite: −0.05 · yönetişim: −0.05…−0.15

## 3. Formül

```
FINAL = 100 × (Q/100)^0.45 × (P/100)^0.55 × R  + TapeAdjustment
```

- **TapeAdjustment (dönüşlülük (reflexivity) terimi):** hareket teyitliyse +7 (teknik puan
  ≥ 70, hacim ≥ 20 günlük ortalama, parabolik değil) · serbest düşüş etkinse −7 · aksi hâlde 0.
- **Spekülatif tavan:** Q < 45 → FINAL en fazla **55**. Fiyat ve akışlar zayıf bir hisseyi
  *ilginç* kılabilir — asla *Al* notlu yapamaz.

## 4. Duruşlar

| FINAL | Duruş |
|---|---|
| 75–100 | Güçlü Al (Strong Buy) |
| 60–74 | Al / Biriktir (Buy / Accumulate) |
| 45–59 | Tut / Nötr (Hold / Neutral) |
| 32–44 | Spekülatif / Zayıf Tut (Speculative / Weak Hold) (+ zorunlu toparlanma koşulları) |
| < 32 | Cazip Değil / yükselişte azalt (Unattractive / reduce-into-strength) — asla satış komutu değildir |

Her tarama ayrıca şunları verir: içsel gerçeğe uygun değer bandı (düşük/baz/yüksek), giriş,
ATR tabanlı zarar durdur (stop), T1/T2 hedefleri, risk/getiri oranı, boğa ve ayı senaryoları.

## 5. Kalıcı kurallar

- **Taramalar asla emir vermez.** İşlem yalnızca ayrı ve açık bir talimatla yapılır;
  her emir yine de masaüstü onayından ve `MAX_ORDER_VALUE_TRY` tavanından geçer.
- Her rakam tarihli; büyüme enflasyondan arındırılmış; eksik veri → nötr 50 +
  düşük güven işareti.
- Geriye dönük test kanıtı (29 hisse, Kas 2023 → Nis 2026, 3.479 zaman noktası (point-in-time)
  gözlem): ≥65 teknik puanlar 63 işlem gününde aynı tarihli emsallerini **+%1,7** geçti;
  <35 puanlar **−%2,3** geride kaldı; ortalama kesitsel bilgi katsayısı (IC) ≈ **0,06**.
  Serbest düşüş örüntüsü düşük performans gösterdi (−%1,4); düz aşırı satım göstermedi.
  İki kalibrasyon (aşırı satım cezasının kaldırılması, parabolik ceza) örneklem içidir
  (in-sample) — `npm run backtest` ile üç ayda bir yeniden doğrulanmalı.

**Tek satırda felsefe:** fiyat çoğunluk ortağıdır (dönüşlülük — ve geriye dönük testle
doğrulanmış tek üstünlüktür), ama kalite çarpan olarak girer; dolayısıyla fiyatın
satın alabileceği şey, işletmenin ne olduğuyla sınırlıdır.

## Sürüm geçmişi

- **v1** — altı bloğun ağırlıklı ortalaması. Kusur: telafi edici (ucuzluk bozuk
  işletmeleri kurtarıyordu).
- **v2** — katı kapılar + kalite/giriş matrisi. Kusur: ikili elemeler fiyatı tamamen
  yok sayıyordu.
- **v3** — kademeli risk katmanıyla sürekli çarpımsal karışım Q^0.55·P^0.45.
- **v3.1 (güncel)** — fiyat çoğunluk ekseni yapıldı (Q^0.45·P^0.55), teknik göstergeler
  P'nin %40'ına çıkarıldı, ±7 bant teyidi (tape-confirmation) terimi, spekülatif tavan
  (Q<45 → FINAL ≤ 55); geriye dönük testle kalibre edilmiş teknik cezalar.
