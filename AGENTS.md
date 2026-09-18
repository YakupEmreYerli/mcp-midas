# mcp-midas — ajan kuralları

Midas Atlas API'sine erişen MCP sunucusu. Portföy, pozisyon ve işlem geçmişini okur;
desteklenen emirleri yalnızca yerel insan onayından sonra gönderebilir.

> **İkiz dosya:** bu dosyanın eşi `CLAUDE.md`. Birini değiştirirsen diğerini de değiştir.

## Bağlayıcı kurallar

- **Onay kapısı atlanamaz.** Her emir oluşturma, güncelleme ve iptal işlemi mutation'dan
  önce sunucu sürecinin açtığı onay penceresinde onay ister: tasarımlı pencere
  (`onay/onay.py`, PySide6 + QtWebEngine, veri stdin'den) → açılamazsa `kdialog --menu`
  → `zenity`. Varsayılan Hayır; Evet basılı tutularak verilir, Enter onaylamaz; Esc, kapatma
  ve 120 sn zaman aşımı Hayır'dır. Araç hatası kullanıcı reddi sayılmaz: sonuç `error`
  ("pencere açılamadı: …") olarak döner ve yine rettir; hangi pencerenin açıldığı denetim
  günlüğüne yazılır. Bir sonraki pencereye yalnız önceki hiç açılamadıysa geçilir.
  Araç şemasına, ortama veya yapılandırmaya `confirmed`, `approve`, test modu ya da
  sayfanın/ajanın cevap verebileceği bir kanal (HTTP, dosya, env) eklenmez.
- **Canlı emir testi yapılmaz.** Geliştirme, test ve inceleme sırasında mutation çalıştırma,
  Midas'a gerçek emir gönderme veya canlı `order-test` yazma/çalıştırma. Bir mutation 401
  alırsa oturumu yenile ama otomatik yeniden gönderme; yeni çağrı yeni onay ister.
- **Emir verisi doğrulanır.** Yazma araçlarında sembol birebir eşleşir; önizleme Midas'tan
  çözümlenen ad, piyasa, hesap ve fiyatla kurulur. Onay sonrası anlamlı değişiklik reddedilir.
  Her deneme `.midas-orders.log.jsonl` dosyasına 0600 izinle ve kimlik bilgileri ayıklanarak
  yazılır.
- **Emir araçları varsayılan kapalı.** `place_order`, `update_order`, `cancel_order` yalnız
  `MIDAS_ORDERS_ENABLED=1` verildiğinde kaydedilir (`src/tool-flags.ts`); yoksa araç
  listesinde hiç görünmez. Bayrak yalnız aracın var olup olmadığını belirler, onay kapısını
  gevşetmez. Bayrağı açan başka bir değer ya da yol eklenmez.
- **Kimlik bilgisi yalnız ortamda.** `MIDAS_PHONE` ve `MIDAS_PASSWORD` ortam değişkeniyle
  (sır yöneticisi ya da gitignore'lu `.env`) verilir; koda, loga, commit'e yazılmaz.
- **Oturum `storageState` ile açılır.** Okumada 401 sonrası sunucu içinde tek paylaşılan
  görünür giriş akışı çalışır ve istek bir kez yinelenir; mutation otomatik yinelenmez.

## BIST analiz kuralları

Hisse tarama ve puanlama çerçevesi `docs/analiz-kurallari.md` içinde (özeti `METHOD.md`;
ikisi de upstream `ahmetdenizyilmaz/midas-mcp`'den gelir). Tarama, analiz ya da puanlama
istendiğinde o dosyayı aç ve uygula. `src/backtest.ts`, `rescore.ts`, `positioning.ts`,
`positions-scan.ts`, `snapshot.ts`, `vwap.ts`, `inflation.ts` bu çerçevenin deneysel
kodudur; MCP sunucusu bunlara bağlı değildir. Yatırım tavsiyesi değildir. Kişisel portföy
verisi ya da kişisel strateji depoya girmez.
