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

**Başka makinede onay isteğe bağlıdır ve güveni taşır.** Varsayılan söz şudur: bir emir yalnız
sunucunun çalıştığı makinedeki bir pencerede onaylanır. Operatör servis ortamında
`MIDAS_CONFIRM_REMOTE` (pencereyi başka bir yerde de açar) ya da `MIDAS_CONFIRM_LOCAL` (yerel
pencere komutunun yerine geçer) verirse bu komut yerel pencere kadar güvenilir sayılır. Başka
bir yol ya da kendiliğinden algılama yoktur. Komut öteki makinede aynı `onay/onay.py`
penceresini çalıştırmalıdır; sunucu çıktıyı aynı katı protokolle okur (yalnız `ACILDI`,
`SONUC evet` ve 0 çıkış kodu birlikte Evet'tir). Hangi pencerenin karar verdiği ve komutun
kendisi denetim günlüğüne yazılır. Bundan sonra onayları servis yapılandırmasını
değiştirebilen herkes, öteki makineyi yöneten herkes ve iki makine arasındaki bağlantıyı
yöneten her şey (ör. ssh anahtarları) belirler. Komutu yazan kişi pencere yerine Evet basan
bir betik de yazabilir; bunu kod değil, servis yapılandırmasına kimin dokunabildiği engeller.
ssh kullanılıyorsa yalnız bu işe ayrılmış, öteki makinede `authorized_keys` içinde
`command="…/onay/onay.py",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty`
ile tek komuta kilitlenmiş bir anahtar önerilir. Ayarlar yalnız süreç başlarken ortamdan
okunur; araç şemasında, MCP isteğinde ya da çalışma anında değişen bir dosyada karşılığı
yoktur. `MIDAS_SMS_CODE_COMMAND` için de aynısı geçerlidir: o komut SMS kodunu verir ve giriş
oturumunu açabilir, emir onaylayamaz.

**Onay penceresi yalnız kendine dokunur.** Pencere çerçevesizdir; başlık çubuğu sayfanın
künye şerididir. Şeritteki kapat düğmesi, Esc ve pencereyi kapatmak yalnız Hayır üretir;
Evet'e giden tek yol düğmeyi basılı tutmaktır. Wayland'de KWin'e yüklenen geçici betik
(`onay/onay.py`, `KWIN_SCRIPT`) yalnız onay sürecinin PID'ine ait pencereyi üstte tutar,
ortalar ve öne alır; karar sonunda kaldırılır. `onay/masaustu-kur.sh` yalnız kullanıcı
dizinine bir `.desktop` dosyası ve simge yazar (`~/.local/share/`), root istemez.

**Kimlik bilgileri makineden çıkmaz.** `MIDAS_PHONE` ve `MIDAS_PASSWORD` ortamdan okunur ve
tek bir yerde kullanılır: Midas'ın kendi SSO formunu doldurmak (`src/session.ts`).
Loglanmaz, önbelleğe alınmaz, başka bir yere gönderilmez. Koddaki tek ağ hedefleri
`atlas.getmidas.com` ve `api.atlas.getmidas.com`'dur.

**Üç dosya hassastır.** `.env` şifreni, `.midas-state.json` canlı oturum token'larını
tutar (bu dosyaya sahip olan herkes token'ların süresi dolana kadar hesabını okuyabilir),
`.midas-orders.log.jsonl` ise yerel emir denetim kayıtlarını içerir. Hepsi gitignore'ludur;
oturum ve denetim dosyaları 0600 izinle yazılır. `.midas-session/` altındaki tarayıcı
profili de yereldir. Bunları commit'leme ya da kopyalama. `MIDAS_DATA_DIR` verilirse bu
dosyalar ve profil o dizindedir (0700 izinle kurulur); her hesabın dizini ayrıdır.

**HTTP servisi yalnız yerelde dinler.** `dist/http.js` yalnızca `127.0.0.1` üzerinde açılır
ve `/mcp` isteklerini `~/.config/mcp-midas/token` dosyasındaki bearer token ile doğrular.

## Kapsam

Teknik gösterge hesaplarıyla (`src/technicals.ts`, `src/vwap.ts`, `src/inflation.ts`) ve
analiz yönergesiyle (`docs/analiz-kurallari.md`, `METHOD.md`) ilgili bildirimler de kabul
edilir; bunlar yatırım tavsiyesi üretmez.
