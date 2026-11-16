# get_technicals nasıl hesaplıyor

`get_technicals` aracının döndürdüğü her sayının kaynağı ve formülü. Kod:
[`src/indicators.ts`](src/indicators.ts) (saf hesaplar),
[`src/technicals.ts`](src/technicals.ts) (özetin kurulması),
[`src/vwap.ts`](src/vwap.ts) ve [`src/inflation.ts`](src/inflation.ts) (reel VWAP).
Hesapların doğruluğu `test/indicators.test.ts` içinde elle hesaplanmış küçük serilerle
sınanır.

## Veri

Sembol önce Midas aramasıyla bir enstrümana çözülür, sonra Atlas'ın grafik verisinden
(`chart` sorgusu) mumlar çekilir: günlük (`1d`, varsayılan) ya da haftalık (`1w`), en çok
400 mum, seans dışı işlemler dahil. Mumlar eskiden yeniye sıralıdır. 30 mumdan az geçmişi
olan enstrüman için araç hata döner. Aşağıda "fiyat" son mumun kapanışıdır.

Fiyatlar 4, yüzdeler 2 basamağa yuvarlanır. Veri yetmeyen gösterge `null` gelir.

## Trend (`trend`)

| Alan | Hesap |
| --- | --- |
| `sma20`, `sma50`, `sma200` | Son 20/50/200 kapanışın aritmetik ortalaması |
| `ema20` | 20 günlük üstel ortalama, α = 2/21; ilk değer ilk 20 kapanışın ortalaması |
| `priceVsSma50Pct`, `priceVsSma200Pct` | Fiyatın ortalamadan yüzde farkı |
| `goldenCross` | SMA50 > SMA200 ise `true` |

## Momentum (`momentum`)

- **RSI(14)**, Wilder yöntemi: ilk 14 değişimin ortalama kazancı ve kaybı, sonra her gün
  `(önceki × 13 + yeni) / 14`. RSI = 100 − 100 / (1 + kazanç/kayıp); hiç kayıp yoksa 100.
  `rsiZone`: 30'un altı `oversold`, 70'in üstü `overbought`, arası `neutral`.
- **MACD(12, 26, 9)**: 12 ve 26 günlük EMA farkı çizgiyi, çizginin 9 günlük EMA'sı sinyali
  verir; histogram = çizgi − sinyal. En az 35 kapanış gerekir. `macdCrossover`, histogram
  sıfır ya da üstündeyse `bullish`, altındaysa `bearish`.
- **`roc20Pct`**: fiyatın 20 mum önceki kapanışa göre yüzde değişimi.

## Oynaklık (`volatility`)

- **ATR(14)**: gerçek aralık her mum için
  `max(yüksek − düşük, |yüksek − önceki kapanış|, |düşük − önceki kapanış|)`; ATR son 14
  gerçek aralığın **basit** ortalamasıdır (Wilder yumuşatması değil). `atrPctOfPrice`
  fiyata oranıdır.
- **`annualizedPct`**: son 30 günlük logaritmik getirinin örneklem standart sapması
  × √252 × 100. Haftalık mumda da aynı çarpan kullanılır; o zaman sayı yıllık değil,
  karşılaştırma içindir.
- **Bollinger(20, 2)**: orta bant SMA20, üst ve alt bant ± 2 × (son 20 kapanışın anakütle
  standart sapması). `bollingerPosition` fiyatın bantlara göre yerini söyler:
  `above_upper`, `upper_half`, `lower_half`, `below_lower`.

## Seviyeler (`levels`)

- **52 hafta**: son 252 mumun en yüksek yükseği ve en düşük düşüğü; fiyatın bunlardan yüzde
  uzaklığı.
- **Destek ve direnç**: yükseği iki yanındaki üçer mumun hepsinden büyük olan mum tepe,
  düşüğü hepsinden küçük olan mum dip sayılır. Birbirine fiyatın %2'si kadar yakın tepeler
  (ya da dipler) tek seviyede toplanır; `touches` o seviyede kaç dönüş noktası olduğudur.
  Fiyatın üstündeki seviyeler direnç (yakından uzağa), altındakiler destek; her birinden en
  çok dört tane döner, en yakını ayrıca `nearestSupport` / `nearestResistance` alanındadır.

## Hacim (`volume`)

Son mumun hacmi, son 20 mumun ortalama hacmi (tam sayıya yuvarlanmış) ve son hacmin bu
ortalamaya göre yüzde farkı.

## Reel VWAP (`realVwap`)

Hacim ağırlıklı ortalama fiyat: VWAP = Σ(tipik fiyat × hacim) / Σ hacim, tipik fiyat =
(yüksek + düşük + kapanış) / 3. Reel sürümde her mumun tipik fiyatı önce TÜFE ile son mumun
tarihindeki liraya taşınır. Yüksek enflasyonda bir yıl önce ödenen 100 TL bugünün 100
TL'siyle aynı değildir; nominal VWAP bu yüzden ortalama maliyeti düşük gösterir.

Üç pencere hesaplanır: son 252 mum (`year1`), son 504 mum (`year2`) ve eldeki bütün mumlar
(`all`; varsayılan 400 mumla `year2` da fiilen bütün seridir). Her pencere için:

| Alan | Anlamı |
| --- | --- |
| `realVwap`, `nominalVwap` | Enflasyon düzeltmeli ve düzeltmesiz VWAP |
| `realStdev`, `bands` | Reel fiyatların VWAP etrafındaki hacim ağırlıklı standart sapması; ±1, ±2, ±3 sapma bantları |
| `premiumPct` | Fiyatın reel VWAP'tan yüzde farkı; eksi, pencerede işlem görenlerin ortalama reel maliyetinin altı |
| `zScore` | Aynı fark, standart sapma cinsinden |
| `volumeAbovePricePct` | Reel tipik fiyatı bugünkü fiyatın üstünde kalan hacmin payı: kabaca, o pencerede alıp hâlâ zararda olan hacim |

Ayrıca 252 mum önceki kapanışın bugünün lirasıyla karşılığı (`realPriceOneYearAgo`) ve bir
yıllık değişimin reel ve nominal hâli verilir. 20 mumdan kısa ya da hacmi sıfır olan pencere
`null` döner.

**TÜFE verisi.** [`src/inflation.ts`](src/inflation.ts), TÜİK'in açıkladığı aylık TÜFE
değişimlerini (TCMB "Tüketici Fiyatları" tablosu, Ocak 2023'ten itibaren) zincirleyerek bir
fiyat düzeyi kurar. Her ayın düzeyi ayın ortasına konur, aradaki günler doğrusal geçişle
bulunur. Tablonun son ayından sonrası son altı ayın ortalama aylık artışıyla tahmin edilir;
yeni ay açıklanınca tabloya eklenmesi gerekir. Testler, zincirin TÜİK'in açıkladığı yıllık
oranları (%32,87 ve %29,77) tuttuğunu denetler.

## Sınırlar

- Göstergeler yalnız fiyat ve hacimden çıkar; şirketin ya da fonun değeri hakkında bir şey
  söylemez. Analiz yönergesi: [`docs/analiz-kurallari.md`](docs/analiz-kurallari.md).
- Piyasa kapalıyken son mum son seansı gösterir.
- Hiçbir çıktı yatırım tavsiyesi değildir.
