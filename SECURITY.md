**Türkçe** · [English](SECURITY.en.md)

# Güvenlik

Bu proje bir aracı kurum hesabına açılmış oturumu tutar ve emir gönderebilir. İki söz verir:
emir, değiştirme ve iptal insan onayı olmadan Midas'a gitmez; kimlik bilgileri ve oturum
token'ları makineden çıkmaz. Bu iki sözü bozan her şey güvenlik açığıdır.

## Bildirim

Açığı herkese açık issue, pull request ya da tartışma olarak yazma. Deponun Security
sekmesindeki **Report a vulnerability** düğmesini kullan:
<https://github.com/YakupEmreYerli/mcp-midas/security/advisories/new>
([GitHub'ın özel bildirim belgesi](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).
Düğmeyi göremiyorsan ayrıntı vermeden "güvenlik bildirimi için özel kanal" başlıklı bir
issue aç; sana özel bir kanal açarız.

Bildirime şunları ekle:

- etkilenen sürüm ya da commit,
- yayımlanmış bir sürümde tekrarlanabilen küçük bir kanıt (birim testi biçiminde olması en iyisi),
- gördüğün etki ve varsa düzeltme önerin.

Yapay zekâ aracı kullandıysan söyle ve sonucu kendin doğruladığını belirt. Tekrarlanabilir
kanıtı olmayan bildirimler kapatılabilir.

**Kanıtı canlı hesapla kurma.** Midas'a gerçek emir göndermek ya da başkasının hesabını ve
Midas'ın sistemlerini denemek gerekmez, yapma. Emir yolu birim testlerinde sahte onaylayıcıyla
sınanır (`test/order-approval.test.ts`, `test/desktop-confirmation.test.ts`); onay kapısını aşan bir yol bu testlerde de gösterilebilir.

## Ne beklemelisin

Projeyi tek kişi gönüllü olarak yürütüyor; süreler buna göre konuldu.

- **Alındı yanıtı:** en geç 5 iş günü.
- **İlk karar** (kabul, açık değil ya da ek bilgi gerekli): en geç 14 gün.
- **Açıklama:** düzeltilmiş sürümü ve danışma notunu bildirimden sonraki 90 gün içinde
  yayımlamayı hedefleriz; tarihi seninle birlikte belirleriz. Düzeltilmiş sürüm çıkmadan
  danışma notu yayımlanmaz.

## Desteklenen sürümler

Güvenlik düzeltmeleri yalnız en son yayımlanan sürüme gelir. Hangi sürümlerin düzeltme
aldığı [RELEASES.md](RELEASES.md) içindeki tabloda yazar; eski sürümde görülen açık, son
sürümde de tekrarlanıyorsa kabul edilir.

## Kapsam

Kapsamda olanlar, belgelendiği gibi kullanılan son sürümde:

- onay penceresinde Evet verilmeden bir emir, değiştirme ya da iptal isteğinin Midas'a
  gitmesi; pencere hatasının, zaman aşımının ya da Esc'in Evet sayılması; onay protokolünün
  (`ACILDI`, `SONUC evet`, çıkış kodu 0) yanlış okunması,
- onaydan sonra önizlemeden farklı bir emrin (sembol, yön, miktar, fiyat, hesap) gönderilmesi,
- `MIDAS_ORDERS_ENABLED=1` verilmeden emir araçlarının listelenmesi ya da çalışması,
- emir isteğinin kendiliğinden yinelenmesi,
- `midas` komutunun `--confirm` olmadan bir yazma aracı (`place_order`, `update_order`,
  `cancel_order`) çağırması ya da `--confirm`'ün sunucudaki onayı atlatması,
- şifrenin, SMS kodunun ya da oturum token'larının loga, denetim günlüğüne, hata mesajına
  veya araç sonucuna sızması; hassas dosyaların belgelenenden geniş izinle yazılması,
- HTTP servisinin `127.0.0.1` dışında dinlemesi ya da `/mcp` isteğini geçerli token olmadan kabul etmesi,
- önizleme verisinin onay ya da SMS penceresinde betik çalıştırabilmesi,
- birden çok hesap kurulumunda bir hesabın verisinin ya da emrinin başka hesabın sürecine karışması.

Kapsam dışı olanlar:

- servis yapılandırmasını (ortam değişkenleri, `.env`, systemd birimi) değiştirebilen birinin
  yapabildikleri; `MIDAS_CONFIRM_REMOTE`, `MIDAS_CONFIRM_LOCAL` ve `MIDAS_SMS_CODE_COMMAND`
  komutlarının yapılandırıldığı gibi çalışması. Bu güvenin nereye taşındığı aşağıdaki güven
  modelinde yazar.
- aynı kullanıcı hesabına ya da root yetkisine sahip yerel bir saldırganın okuyabildikleri
  (ör. `.midas-state.json`),
- Midas'ın kendi uygulamasındaki ve sunucularındaki açıklar; bunları Midas'a bildir,
- Midas'ın belgelenmemiş API'sinin değişmesiyle oluşan bozulmalar (normal issue aç),
- teknik gösterge hesaplarındaki ve analiz yönergesindeki hatalar (`src/technicals.ts`,
  `src/vwap.ts`, `src/inflation.ts`, `docs/analiz-kurallari.md`, `METHOD.md`); bunlar yatırım
  tavsiyesi üretmez, normal issue olarak aç,
- kodumuzun ulaşmadığı bağımlılık açıkları, desteklenmeyen sürümler, doğrulanmış kanıtı
  olmayan otomatik tarayıcı çıktıları.

## Danışma notları ve CVE

Kabul edilen açıklar için danışma notunu deponun
[Security Advisories](https://github.com/YakupEmreYerli/mcp-midas/security/advisories)
sayfasında yayımlarız, CVE numarasını GitHub üzerinden isteriz ve önem derecesini CVSS 3.1
temel ölçütleriyle veririz.

## Teşekkür

İstemediğin sürece adını danışma notunda ve [CHANGELOG.md](CHANGELOG.md) içinde anarız.
Projenin ödül programı yoktur, bildirim için ödeme yapılmaz.

## Bu yazılım neye dokunuyor

Bir aracı kurum hesabına açılmış oturumu tutar. Çalıştırmadan önce bilinmesi gereken
noktalar:

**Emir araçları varsayılan kapalıdır.** `place_order`, `update_order` ve `cancel_order`
yalnızca `MIDAS_ORDERS_ENABLED=1` verildiğinde kaydedilir; aksi hâlde MCP araç listesinde
hiç görünmez.

**İşlemler insan onayı ister.** Emir araçları açıkken sunucu desteklenen emir
tiplerini verebilir, güncelleyebilir ve iptal edebilir; ama kendi süreci onay penceresini
göstermeden (tasarımlı PySide6 penceresi; açılamazsa `kdialog`/`zenity`) ve kullanıcı
**Evet**'i basılı tutmadan bu mutation'ları gönderemez. Varsayılan Hayır'dır; zaman aşımı,
ekranın olmaması ve pencere hataları reddedilir. Pencere hataları kullanıcının Hayır'ı
olarak değil, hata olarak bildirilir. MCP şemalarında onay ya da atlatma alanı yoktur;
sunucu onaydan sonra enstrümanı ve fiyatı birebir yeniden doğrular. Pencere
varsayılan olarak sunucunun çalıştığı makinede açılır; başka bir yerde açılması yalnız
aşağıdaki ayarlarla olur.

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
Loglanmaz, önbelleğe alınmaz, başka bir yere gönderilmez. İkisi de isteğe bağlıdır;
verilmezlerse giriş gerektiğinde Midas'ın giriş penceresi açılır ve bilgileri sen yazarsın. Koddaki tek ağ hedefleri
`atlas.getmidas.com` ve `api.atlas.getmidas.com`'dur.

**Üç dosya hassastır.** `.env` şifreni, `.midas-state.json` canlı oturum token'larını
tutar (bu dosyaya sahip olan herkes token'ların süresi dolana kadar hesabını okuyabilir),
`.midas-orders.log.jsonl` ise yerel emir denetim kayıtlarını içerir. Hepsi gitignore'ludur;
oturum ve denetim dosyaları 0600 izinle yazılır. `.midas-session/` altındaki tarayıcı
profili de yereldir. Bunları commit'leme ya da kopyalama. `MIDAS_DATA_DIR` verilirse bu
dosyalar ve profil o dizindedir (0700 izinle kurulur); her hesabın dizini ayrıdır.

**HTTP servisi yalnız yerelde dinler.** `dist/http.js` yalnızca `127.0.0.1` üzerinde açılır
ve `/mcp` isteklerini bearer token ile doğrular. Token varsayılan olarak
`~/.config/mcp-midas/token` dosyasındadır (`MIDAS_TOKEN_FILE` ile değişir); birden çok hesapta
her sürecin portu ve token dosyası ayrıdır.
