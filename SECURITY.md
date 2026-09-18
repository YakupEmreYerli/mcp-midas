# Güvenlik

## Bildirim

Güvenlik sorunlarını herkese açık issue olarak açma. Bunun yerine bu depodaki GitHub
[özel güvenlik açığı bildirimini](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
kullan.

## Bu yazılım neye dokunuyor

Bir aracı kurum hesabına açılmış oturumu tutar. Çalıştırmadan önce bilinmesi gereken
noktalar:

**Emir araçları varsayılan kapalıdır.** `place_order`, `update_order` ve `cancel_order`
yalnızca `MIDAS_ORDERS_ENABLED=1` verildiğinde kaydedilir; aksi hâlde MCP araç listesinde
hiç görünmez.

**İşlemler yerel insan onayı ister.** Emir araçları açıkken sunucu desteklenen emir
tiplerini verebilir, güncelleyebilir ve iptal edebilir; ama kendi süreci onay penceresini
göstermeden (tasarımlı PySide6 penceresi; açılamazsa `kdialog`/`zenity`) ve kullanıcı
**Evet**'i basılı tutmadan bu mutation'ları gönderemez. Varsayılan Hayır'dır; zaman aşımı,
ekranın olmaması ve pencere hataları reddedilir. Pencere hataları kullanıcının Hayır'ı
olarak değil, hata olarak bildirilir. MCP şemalarında onay ya da atlatma alanı yoktur;
sunucu onaydan sonra enstrümanı ve fiyatı birebir yeniden doğrular.

**Kimlik bilgileri makineden çıkmaz.** `MIDAS_PHONE` ve `MIDAS_PASSWORD` ortamdan okunur ve
tek bir yerde kullanılır: Midas'ın kendi SSO formunu doldurmak (`src/session.ts`).
Loglanmaz, önbelleğe alınmaz, başka bir yere gönderilmez. Koddaki tek ağ hedefleri
`atlas.getmidas.com` ve `api.atlas.getmidas.com`'dur.

**Üç dosya hassastır.** `.env` şifreni, `.midas-state.json` canlı oturum token'larını
tutar (bu dosyaya sahip olan herkes token'ların süresi dolana kadar hesabını okuyabilir),
`.midas-orders.log.jsonl` ise yerel emir denetim kayıtlarını içerir. Hepsi gitignore'ludur;
oturum ve denetim dosyaları 0600 izinle yazılır. `.midas-session/` altındaki tarayıcı
profili de yereldir. Bunları commit'leme ya da kopyalama.

**HTTP servisi yalnız yerelde dinler.** `dist/http.js` yalnızca `127.0.0.1` üzerinde açılır
ve `/mcp` isteklerini `~/.config/mcp-midas/token` dosyasındaki bearer token ile doğrular.

## Kapsam

Tarama, geriye dönük test ve puanlama koduyla (`docs/analiz-kurallari.md`, `METHOD.md`,
`src/backtest.ts`, `src/rescore.ts`, `src/positioning.ts`) ilgili bildirimler de kabul
edilir; ancak bu kod açıkça deneyseldir ve yatırım tavsiyesi üretmez.
