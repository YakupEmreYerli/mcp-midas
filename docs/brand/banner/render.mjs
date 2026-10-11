// Banner'ı iki dilde üretir: docs/banner.tr.png ve docs/banner.en.png (1280×640).
// Çalıştır (depo kökünden): node docs/brand/banner/render.mjs [çıktı-klasörü]
//
// Onay pencereleri ayrı görsel olarak tutulmaz. onay/onay.html örnek bir emirle açılır,
// panel 1x çekilir ve banner.html'deki img[data-pencere] yuvalarına konur; böylece
// pencere değişince banner da onu gösterir. İngilizce metin banner.html'de data-en'de.
// Depodaki PNG'ler yüklü Google Chrome ile üretildi (channel "chrome"); başka bir
// tarayıcı için CHROME_BIN verilebilir, yazı kırılımı biraz değişebilir.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const burasi = path.dirname(fileURLToPath(import.meta.url));
const depo = path.resolve(burasi, "../../..");
const cikti = path.resolve(process.argv[2] ?? path.join(depo, "docs"));
const oku = (dosya) => fs.readFileSync(path.join(depo, dosya), "utf8");

// Örnek emirler: semboller gerçek BIST kodu, fiyatlar ve hesap kimliği uydurma.
const TR = {
  alis: {
    islem: "ALIŞ", ton: "alis", ozet: "40 adet THYAO, ₺298,75 limit fiyatla alınacak.",
    sembol: "THYAO", ad: "Türk Hava Yolları A.O.", pazar: "TR HİSSE (BIST)", yon: "ALIŞ", emirTipi: "Limit",
    satirlar: [
      { etiket: "Adet", deger: "40" },
      { etiket: "Limit fiyatı", deger: "₺298,75" },
      { etiket: "Güncel fiyat", deger: "₺301,25" },
    ],
    tutar: { etiket: "Tahmini tutar", deger: "₺11.950,00" }, tutarVurgulu: true,
    degisiklikler: [], emirNo: null, hesap: "a1b2c3d4-örnek-hesap",
    soru: "Bu alış emri Midas'a gönderilsin mi?", evet: "Evet, al", hayir: "Hayır", sureSn: 120,
  },
  satis: {
    islem: "SATIŞ", ton: "tehlike", ozet: "25 adet ASELS, ₺122,50 limit fiyatla satılacak.",
    sembol: "ASELS", ad: "Aselsan Elektronik Sanayi ve Ticaret A.Ş.", pazar: "TR HİSSE (BIST)", yon: "SATIŞ", emirTipi: "Limit",
    satirlar: [
      { etiket: "Adet", deger: "25" },
      { etiket: "Limit fiyatı", deger: "₺122,50" },
      { etiket: "Güncel fiyat", deger: "₺118,30" },
    ],
    tutar: { etiket: "Tahmini tutar", deger: "₺3.062,50" }, tutarVurgulu: true,
    degisiklikler: [], emirNo: null, hesap: "a1b2c3d4-örnek-hesap",
    soru: "Bu satış emri Midas'a gönderilsin mi?", evet: "Evet, sat", hayir: "Hayır", sureSn: 120,
  },
};
const EN = {
  alis: {
    ...TR.alis, islem: "BUY", ozet: "40 THYAO shares will be bought at a ₺298,75 limit.", pazar: "TR STOCK (BIST)",
    satirlar: [
      { etiket: "Quantity", deger: "40" },
      { etiket: "Limit price", deger: "₺298,75" },
      { etiket: "Current price", deger: "₺301,25" },
    ],
    tutar: { etiket: "Estimated total", deger: "₺11.950,00" }, hesap: "a1b2c3d4-sample-account",
    soru: "Send this buy order to Midas?", evet: "Yes, buy", hayir: "No",
  },
  satis: {
    ...TR.satis, islem: "SELL", ozet: "25 ASELS shares will be sold at a ₺122,50 limit.", pazar: "TR STOCK (BIST)",
    satirlar: [
      { etiket: "Quantity", deger: "25" },
      { etiket: "Limit price", deger: "₺122,50" },
      { etiket: "Current price", deger: "₺118,30" },
    ],
    tutar: { etiket: "Estimated total", deger: "₺3.062,50" }, hesap: "a1b2c3d4-sample-account",
    soru: "Send this sell order to Midas?", evet: "Yes, sell", hayir: "No",
  },
};
const ORNEK = { tr: TR, en: EN };

// Pencere yalnız Türkçe yazılmış; İngilizce görsel için sabit metinleri değiştir.
const HTML_EN = [
  ['<html lang="tr"', '<html lang="en"'],
  ["<title>Midas-MCP emir onayı</title>", "<title>Midas-MCP order approval</title>"],
  ["ajanın isteği · senin kararın", "the agent asks · you decide"],
  ['aria-label="Kapat: Hayır" title="Kapat: Hayır"', 'aria-label="Close: No" title="Close: No"'],
  ['aria-label="Kalan süre"', 'aria-label="Time left"'],
  ['<span class="sayac-not">sonra Hayır</span>', '<span class="sayac-not">then No</span>'],
  [
    '<th scope="col" class="d-eski">Şimdi</th><th scope="col" class="d-alan"><span class="gorunmez">Alan</span></th><th scope="col" class="d-yeni">Sonra</th>',
    '<th scope="col" class="d-eski">Now</th><th scope="col" class="d-alan"><span class="gorunmez">Field</span></th><th scope="col" class="d-yeni">After</th>',
  ],
  ['<span class="evet-not" id="evet-not">basılı tutun</span>', '<span class="evet-not" id="evet-not">press and hold</span>'],
  [
    "Esc, pencereyi kapatmak ya da süre dolması: <strong>Hayır</strong>. Evet için düğmeyi basılı tutun; Enter onaylamaz.",
    "Esc, closing the window or running out of time: <strong>No</strong>. Press and hold for Yes; Enter never approves.",
  ],
];
const JS_EN = [
  ['etiket(veri.yon === "SATIŞ" ? "Satış" : "Alış", veri.yon);', 'etiket(veri.yon === "SATIŞ" ? "Sell" : "Buy", veri.yon);'],
  ['kimlikSatiri("Emir", veri.emirNo);', 'kimlikSatiri("Order", veri.emirNo);'],
  ['kimlikSatiri("Hesap", veri.hesap);', 'kimlikSatiri("Account", veri.hesap);'],
];

// Metin bulunamazsa sessizce geçme: onay.html değişmiş demektir, çeviri de güncellenmeli.
function degistir(metin, eski, yeni) {
  if (!metin.includes(eski)) throw new Error(`onay dosyalarında bulunamadı: ${eski}`);
  return metin.replaceAll(eski, () => yeni);
}

function pencereHtml(dil, veri) {
  let html = oku("onay/onay.html");
  let js = oku("onay/onay.js");
  if (dil === "en") {
    for (const [eski, yeni] of HTML_EN) html = degistir(html, eski, yeni);
    for (const [eski, yeni] of JS_EN) js = degistir(js, eski, yeni);
  }
  const font = fs.readFileSync(path.join(depo, "onay/fontlar/MartianMono.woff2")).toString("base64");
  const css = degistir(oku("onay/onay.css"), "__MARTIAN__", font);
  const json = JSON.stringify(veri).replaceAll("<", "\\u003c");
  for (const [yer, deger] of [["__CSS__", css], ["__JS__", js], ["__NONCE__", "n0nce"], ["__TEMA__", "koyu"], ["__VERI__", json]]) {
    html = degistir(html, yer, deger);
  }
  return html;
}

const tarayici = await chromium.launch(
  process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: "chrome" },
);

async function pencere(dil, tur) {
  const sayfa = await tarayici.newPage({ viewport: { width: 584, height: 1000 }, deviceScaleFactor: 1 });
  await sayfa.setContent(pencereHtml(dil, ORNEK[dil][tur]), { waitUntil: "load" });
  await sayfa.evaluate(() => document.fonts.ready);
  await sayfa.evaluate(() => window.midasGoster());
  // Sayaç 1:59'a insin, Evet kilidi (700 ms) kalksın. Geri sayım rayı 1350 ms'de durdurulur:
  // depodaki PNG'ler bu karede çekildi, ray her çekimde aynı yerde biter.
  await sayfa.waitForTimeout(1300);
  await sayfa.evaluate(() => {
    for (const animasyon of document.getAnimations()) {
      animasyon.pause();
      animasyon.currentTime = 1350;
    }
  });
  const png = await sayfa.locator("#panel").screenshot();
  await sayfa.close();
  return png.toString("base64");
}

fs.mkdirSync(cikti, { recursive: true });
for (const dil of ["tr", "en"]) {
  const pencereler = { alis: await pencere(dil, "alis"), satis: await pencere(dil, "satis") };
  const sayfa = await tarayici.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
  await sayfa.goto(pathToFileURL(path.join(burasi, "banner.html")).href);
  const eksik = await sayfa.evaluate(
    async ({ dil, pencereler }) => {
      if (dil === "en") {
        document.documentElement.lang = "en";
        for (const oge of document.querySelectorAll("[data-en]")) oge.textContent = oge.dataset.en;
      }
      for (const img of document.querySelectorAll("img[data-pencere]")) {
        img.src = "data:image/png;base64," + pencereler[img.dataset.pencere];
        await img.decode();
      }
      await document.fonts.ready;
      const font = [...document.fonts].some((f) => f.family.replaceAll('"', "") === "Martian Mono" && f.status === "loaded");
      return font ? null : "Martian Mono yüklenmedi (onay/fontlar/MartianMono.woff2)";
    },
    { dil, pencereler },
  );
  if (eksik) throw new Error(eksik);
  const dosya = path.join(cikti, `banner.${dil}.png`);
  await sayfa.screenshot({ path: dosya });
  await sayfa.close();
  console.log("yazıldı", path.relative(process.cwd(), dosya) || dosya);
}
await tarayici.close();
