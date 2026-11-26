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
- **Başka makinede onay yalnız operatör açarsa.** `MIDAS_CONFIRM_REMOTE` (aynı pencereyi
  başka yerde de açar, gösterilen pencerede ilk Evet/Hayır/zaman aşımı karar olur) ve
  `MIDAS_CONFIRM_LOCAL` (yerel pencere komutunun yerine geçer, kdialog/zenity çalışmaz)
  yalnız sunucunun başlangıç ortamından okunur; kendiliğinden algılama ya da başka yol
  eklenmez. Komut öteki makinede aynı `onay/onay.py`'yi çalıştırır ve çıktısı aynı katı
  protokolle okunur. Kullanılan komut ve kararı veren pencere (`onay`/`onay-remote`) denetim
  günlüğüne yazılır. Geçersiz değer yok sayılmaz, onay hata (ret) döner. Güven modeli
  SECURITY.md ve README'de; değiştirirsen üçünü birlikte güncelle.
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
- **Komut satırı (`midas`) ikinci emir yolu değildir.** `src/cli/` her iki kipte de MCP istemcisidir
  (yerel: süreç içi `createServer()`, uzak: `--server` ile HTTP servisi); araçları doğrudan
  `midas.ts`'ten çağırmaz. Emir komutları `--confirm` olmadan yalnız okuma araçlarıyla önizleme
  basar, yazma aracı çağırmaz. `--confirm` onay değildir, onay kapısını gevşetmez; yazma çağrısı
  yinelenmez. Hesap adları koda yazılmaz, kullanıcının `accounts.json` dosyasından gelir.
- **Kimlik bilgisi yalnız ortamda.** `MIDAS_PHONE` ve `MIDAS_PASSWORD` ortam değişkeniyle
  (sır yöneticisi ya da gitignore'lu `.env`) verilir; koda, loga, commit'e yazılmaz.
- **Oturum `storageState` ile açılır.** Okumada 401 sonrası sunucu içinde tek paylaşılan
  giriş akışı çalışır (tarayıcı `MIDAS_LOGIN_WINDOW` kipine göre, varsayılan gizli pencere)
  ve istek bir kez yinelenir; mutation otomatik yinelenmez. Canlı tutma döngüsü hiçbir
  koşulda giriş başlatmaz, düşmüş oturumu yalnız loglar. `get_session_status` da hiçbir
  koşulda giriş başlatmaz; `MIDAS_KEEPALIVE_HOURS=0` iken servis kendi kendine tarayıcı
  açmaz. Boştaki tarayıcı `MIDAS_IDLE_CLOSE_MINUTES` (varsayılan 10) sonra durumu kaydedip
  kapanır; giriş sürerken kapanmaz. SMS kodu (`MIDAS_LOGIN_METHOD=sms`) SMS kodu penceresiyle
  (`onay/sms.py`) ya da `MIDAS_SMS_CODE_COMMAND` ile sorulur; kod loga, bildirime, hata
  mesajına girmez.
- **Hesaplar karışmaz.** Birden çok hesap ayrı süreçtir (`MIDAS_DATA_DIR`, port, token,
  kimlik bilgisi). `MIDAS_ACCOUNT_LABEL` sunucu adında, yönergede, her araç sonucunda (JSON'dan
  sonra ayrı parça; `content[0]` saf JSON kalır) ve onay penceresinde görünür.
- **Metinler iki dilde.** Kullanıcının ya da ajanın gördüğü her metin (pencereler,
  bildirimler, araç açıklamaları, hata mesajları) Türkçe ve İngilizce yazılır ve iki tabloya da
  girer: TypeScript'te `defineMessages(tr, en)`, pencerelerde `onay.js`/`sms.js` ve
  `onay.py`/`sms.py` içindeki `METIN`. Türkçe turkish-humanizer'a, iki dil de ux-writing'e
  uyar. Hiçbir metin kullanıcının kurulumunu varsaymaz (ev sunucusu, ikinci makine, aile
  hesabı gibi düzenler yalnız belgede "örneğin" diye geçer).

## Hisse ve fon analizi

Analiz yönergesi `docs/analiz-kurallari.md` içinde; `get_technicals` göstergelerinin
formülleri `METHOD.md` içinde. Analiz, tarama ya da karşılaştırma istendiğinde yönergeyi aç
ve uygula. Yatırım tavsiyesi değildir. Kişisel portföy verisi ya da kişisel strateji depoya
girmez.
