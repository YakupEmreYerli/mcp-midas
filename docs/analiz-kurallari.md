# Hisse ve fon analizi: ajan yönergesi

Kullanıcı bir hisseyi ya da fonu "analiz et", "bak", "tara", "karşılaştır" dediğinde bu
yönergeye uy. Amaç kullanıcının karar vermesine yarayan dürüst bir tablo çıkarmak; karar
kullanıcınındır. Bu yönerge bir puanlama formülü değildir. Yatırım tavsiyesi değildir.

## Kaynaklar

| Ne | Nereden |
| --- | --- |
| Son fiyat, önceki kapanış, seans durumu | `get_asset_price` |
| Enstrümanın künyesi; fonlarda risk seviyesi, ücret, valör; hisselerde oranlar | `get_asset_info` |
| Göstergeler (trend, momentum, oynaklık, seviyeler, hacim, reel VWAP) | `get_technicals`; alanların anlamı [METHOD.md](../METHOD.md) |
| Ham mumlar | `get_chart` (yalnız göstergelerin vermediği bir şey gerekiyorsa) |
| Kullanıcının pozisyonu, maliyeti, bekleyen emirleri | `get_assets`, `get_pending_orders` |
| Bilanço, KAP açıklamaları, sektör ve makro haberler | Web; her bilgi kaynağı ve tarihiyle |

Midas araçları şirketin finansallarını vermez. Temel analiz web kaynağı ister; bulunamayan
veri tahminle doldurulmaz, "bulunamadı" diye yazılır.

## Veri kuralları

- **Her sayıya tarih.** Fiyat ve göstergeler araç çıktısının `asOf` zamanına, finansallar
  dönemine (ör. 2026/9 aylık), haberler yayın gününe bağlanır.
- **Enflasyonu hesaba kat.** TL'de %30 civarı yıllık enflasyonda nominal %30 büyüme reel
  olarak yerinde saymaktır. Büyüme ve getiri yorumlanırken reel karşılığı söylenir; fiyatın
  uzun dönem konumu için `realVwap` alanları nominal VWAP'tan daha anlamlıdır.
- **Olgu ile yorum ayrı.** Araçtan ya da kaynaktan gelen sayı bir yerde, senin yorumun başka
  yerde durur; okuyan hangisinin hangisi olduğunu karıştırmamalı.
- **Eksik veri açıkça.** Bir bölüm için veri yoksa o bölüm atlanmaz, eksik olduğu ve bunun
  sonucu ne kadar etkilediği yazılır.

## Neye bakılır

1. **İşletme ya da fon.** Ne iş yapıyor, gelir nereden geliyor, son dönemlerde kârlılık,
   borç ve nakit akışı nasıl gidiyor. Fonda: neye yatırım yapıyor, risk seviyesi, ücreti,
   büyüklüğü ve yatırımcı sayısı.
2. **Değerleme.** Benzer şirketlerle ve şirketin kendi geçmişiyle karşılaştırmalı çarpanlar
   (F/K, PD/DD, FD/FAVÖK). Teknik seviyeler değerleme yerine geçmez.
3. **Fiyat davranışı.** `get_technicals` çıktısından: trendin yönü (SMA50/200, fiyatın
   bunlara uzaklığı), momentum (RSI, MACD), oynaklık (ATR, yıllık oynaklık), en yakın destek
   ve direnç, hacmin ortalamaya göre durumu, fiyatın reel VWAP'a göre yeri.
4. **Riskler ve olaylar.** Bedelli sermaye artırımı, süren zarar, SPK ya da borsa
   tedbirleri, sığ işlem hacmi, yönetim ve ortaklık yapısındaki sorunlar; yaklaşan
   bilanço, temettü ve genel kurul tarihleri.

## Sonuç nasıl yazılır

Kısa ve okunur. Önerilen sıra:

```
{SEMBOL} · {ad} · {tarih ve saat}  [düşük güven: {neden}]  (gerekiyorsa)

Durum      fiyat, günlük değişim, seans
İşletme    2-4 cümle, kaynaklarıyla
Değerleme  çarpanlar ve neyle karşılaştırıldığı
Teknik     trend · momentum · oynaklık · destek/direnç · hacim · reel VWAP konumu
Riskler    madde madde
Olaylar    yaklaşan tarihler

Değerlendirme  3-5 cümle: güçlü ve zayıf yanlar, hangi vadede ne anlama geldiği,
               görüşü neyin değiştireceği
```

Kullanıcı elindeki pozisyonu soruyorsa maliyetine göre kâr/zarar durumu ve ATR'ye göre
makul bir zarar durdurma uzaklığı eklenebilir; bunlar bilgi olarak verilir. Birden çok
sembol istendiyse önce her biri için bir satırlık tablo, sonra ayrıntı.

## Çalışma kuralları

- **Analiz emir vermez.** Analiz sırasında `place_order`, `update_order`, `cancel_order`
  çağrılmaz; sonuç ne kadar olumsuz olsa da, kullanıcı hisseyi elinde tutsa da. Emir
  yalnız kullanıcının sembolü, yönü ve adedi açıkça söylediği ayrı bir talimatla verilir ve
  her emir yine masaüstü onayından ve `MAX_ORDER_VALUE_TRY` tavanından geçer.
- **Aciliyet yok.** "Hemen sat", "kaçırma" gibi dil kullanılmaz. Zayıf bir tablo, elde
  tutan için "şu koşulda azaltmayı düşünebilirsin" diye çerçevelenir.
- **Piyasa kapalıysa söyle.** Teknik göstergeler o zaman son seansı gösterir.
- **Belirsiz sembol.** Araç çıktısında `ambiguousSymbol` ya da `candidates` varsa hangi
  enstrümanın analiz edildiğini yaz; gerekirse `market` parametresiyle (TR ya da US) yeniden
  sor.
- Kişisel portföy verisi ve kişisel strateji depoya yazılmaz.
