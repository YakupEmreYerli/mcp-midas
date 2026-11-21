// Onay penceresini (onay/onay.html + onay.css + onay.js) tarayıcıda örnek bir emirle çizer.
// Banner (banner/render.mjs) ve vitrin (vitrin/render.mjs) pencere görüntülerini buradan alır;
// ayrı pencere görseli tutulmaz, pencere değişince görseller de onu gösterir.
// Pencereyi gözle denemek için: node docs/brand/pencere.mjs [klasör] → her işlem tipi × iki dil × iki tema PNG.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const burasi = path.dirname(fileURLToPath(import.meta.url));
export const depo = path.resolve(burasi, "../..");
const oku = (dosya) => fs.readFileSync(path.join(depo, dosya), "utf8");
const b64 = (dosya) => fs.readFileSync(path.join(depo, dosya)).toString("base64");

// Örnek emirler: semboller gerçek BIST kodu, fiyatlar ve kimlikler uydurma.
const hesap = "a1b2c3d4-örnek-hesap";
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
    degisiklikler: [], emirNo: null, hesap,
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
    degisiklikler: [], emirNo: null, hesap,
    soru: "Bu satış emri Midas'a gönderilsin mi?", evet: "Evet, sat", hayir: "Hayır", sureSn: 120,
  },
  degistir: {
    islem: "DEĞİŞTİR", ton: "dikkat", ozet: "Bekleyen THYAO alış emrinin değerleri değişecek.",
    sembol: "THYAO", ad: "Türk Hava Yolları A.O.", pazar: "TR HİSSE (BIST)", yon: "ALIŞ", emirTipi: "Limit",
    satirlar: [{ etiket: "Güncel fiyat", deger: "₺301,25" }],
    tutar: { etiket: "Tahmini tutar", deger: "₺11.800,00" }, tutarVurgulu: true,
    degisiklikler: [
      { etiket: "Adet", eski: "40", yeni: "40", degisti: false },
      { etiket: "Limit fiyatı", eski: "₺298,75", yeni: "₺295,00", degisti: true },
    ],
    emirNo: "7f3e9a21-örnek-emir", hesap,
    soru: "Bu değişiklik Midas'a gönderilsin mi?", evet: "Evet, değiştir", hayir: "Hayır", sureSn: 120,
  },
  iptal: {
    islem: "İPTAL", ton: "tehlike", ozet: "Bekleyen 5 adetlik ASELS satış emri iptal edilecek.",
    sembol: "ASELS", ad: "Aselsan Elektronik Sanayi ve Ticaret A.Ş.", pazar: "TR HİSSE (BIST)", yon: "SATIŞ",
    emirTipi: "Kâr al + zarar durdur",
    satirlar: [
      { etiket: "Adet", deger: "5" },
      { etiket: "Kâr al", deger: "₺122,50" },
      { etiket: "Zarar durdur", deger: "₺100,50" },
      { etiket: "Güncel fiyat", deger: "₺111,00" },
    ],
    tutar: { etiket: "Emrin güncel değeri", deger: "₺555,00" }, tutarVurgulu: false,
    degisiklikler: [{ etiket: "Durum", eski: "Bekliyor", yeni: "İptal edildi", degisti: true }],
    emirNo: "7f3c9e2a-örnek", hesap,
    soru: "Bu emir iptal edilsin mi?", evet: "Evet, iptal et", hayir: "Hayır", sureSn: 120,
  },
};
const enHesap = "a1b2c3d4-sample-account";
const EN = {
  alis: {
    ...TR.alis, dil: "en", islemYazi: "BUY", yonYazi: "BUY", ozet: "Buy 40 THYAO at a limit price of ₺298.75.",
    pazar: "TR stock (BIST)",
    satirlar: [
      { etiket: "Quantity", deger: "40" },
      { etiket: "Limit price", deger: "₺298.75" },
      { etiket: "Current price", deger: "₺301.25" },
    ],
    tutar: { etiket: "Estimated total", deger: "₺11,950.00" }, hesap: enHesap,
    soru: "Send this buy order to Midas?", evet: "Yes, buy", hayir: "No",
  },
  satis: {
    ...TR.satis, dil: "en", islemYazi: "SELL", yonYazi: "SELL", ozet: "Sell 25 ASELS at a limit price of ₺122.50.",
    pazar: "TR stock (BIST)",
    satirlar: [
      { etiket: "Quantity", deger: "25" },
      { etiket: "Limit price", deger: "₺122.50" },
      { etiket: "Current price", deger: "₺118.30" },
    ],
    tutar: { etiket: "Estimated total", deger: "₺3,062.50" }, hesap: enHesap,
    soru: "Send this sell order to Midas?", evet: "Yes, sell", hayir: "No",
  },
  degistir: {
    ...TR.degistir, dil: "en", islemYazi: "MODIFY", yonYazi: "BUY", ozet: "Modify the pending buy order for THYAO.",
    pazar: "TR stock (BIST)",
    satirlar: [{ etiket: "Current price", deger: "₺301.25" }],
    tutar: { etiket: "Estimated total", deger: "₺11,800.00" },
    degisiklikler: [
      { etiket: "Quantity", eski: "40", yeni: "40", degisti: false },
      { etiket: "Limit price", eski: "₺298.75", yeni: "₺295.00", degisti: true },
    ],
    emirNo: "7f3e9a21-sample-order", hesap: enHesap,
    soru: "Send this change to Midas?", evet: "Yes, modify", hayir: "No",
  },
  iptal: {
    ...TR.iptal, dil: "en", islemYazi: "CANCEL", yonYazi: "SELL", ozet: "Cancel the pending sell order for 5 ASELS.",
    pazar: "TR stock (BIST)", emirTipi: "Take profit + stop loss",
    satirlar: [
      { etiket: "Quantity", deger: "5" },
      { etiket: "Take profit", deger: "₺122.50" },
      { etiket: "Stop loss", deger: "₺100.50" },
      { etiket: "Current price", deger: "₺111.00" },
    ],
    tutar: { etiket: "Current order value", deger: "₺555.00" },
    degisiklikler: [{ etiket: "Status", eski: "Pending", yeni: "Canceled", degisti: true }],
    emirNo: "7f3c9e2a-sample", hesap: enHesap,
    soru: "Cancel this order?", evet: "Yes, cancel it", hayir: "No",
  },
};
export const ORNEK = { tr: TR, en: EN };

// Metin bulunamazsa sessizce geçme: onay dosyaları değişmiş demektir, çeviri de güncellenmeli.
function degistir(metin, eski, yeni) {
  if (!metin.includes(eski)) throw new Error(`onay dosyalarında bulunamadı: ${eski}`);
  return metin.replaceAll(eski, () => yeni);
}

/** onay.py'nin yaptığı gibi tek parça HTML kurar (fontlar data: URL). */
export function pencereHtml(dil, veri, tema = "koyu") {
  // Pencerenin dili modelden gelir (veri.dil); sabit metinler onay.js'teki tablodadır.
  let html = oku("onay/onay.html");
  const js = oku("onay/onay.js");
  let css = oku("onay/onay.css");
  for (const [yer, dosya] of [
    ["__GEIST__", "onay/fontlar/Geist.woff2"],
    ["__GEIST_MONO__", "onay/fontlar/GeistMono.woff2"],
    ["__TL__", "onay/fontlar/Inter-TL.woff2"],
  ]) css = degistir(css, yer, b64(dosya));
  const json = JSON.stringify(veri).replaceAll("<", "\\u003c");
  for (const [yer, deger] of [["__CSS__", css], ["__JS__", js], ["__NONCE__", "n0nce"], ["__TEMA__", tema], ["__DIL__", dil], ["__VERI__", json]]) {
    html = degistir(html, yer, deger);
  }
  return html;
}

/** Paneli PNG olarak çeker (Buffer). Sayaç 1:59'da, geri sayım rayı 1350 ms karesinde durur. */
export async function pencereCek(tarayici, { dil = "tr", tur, tema = "koyu", olcek = 1 }) {
  const sayfa = await tarayici.newPage({ viewport: { width: 584, height: 1000 }, deviceScaleFactor: olcek });
  await sayfa.setContent(pencereHtml(dil, ORNEK[dil][tur], tema), { waitUntil: "load" });
  await sayfa.evaluate(() => document.fonts.ready);
  const eksik = await sayfa.evaluate(() =>
    ["Geist", "Geist Mono", "Midas TL"].filter(
      (aile) => ![...document.fonts].some((f) => f.family.replaceAll('"', "") === aile && f.status === "loaded"),
    ),
  );
  if (eksik.length) throw new Error(`pencerede yüklenmeyen font: ${eksik.join(", ")}`);
  await sayfa.evaluate(() => window.midasGoster());
  await sayfa.waitForTimeout(1300);
  await sayfa.evaluate(() => {
    for (const animasyon of document.getAnimations()) {
      animasyon.pause();
      animasyon.currentTime = 1350;
    }
  });
  const png = await sayfa.locator("#panel").screenshot({ omitBackground: true });
  await sayfa.close();
  return png;
}

/** Depodaki PNG'ler Playwright'ın kendi Chromium'uyla üretildi; başka tarayıcı için CHROME_BIN. */
export async function tarayiciAc() {
  const { chromium } = await import("playwright");
  return chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cikti = path.resolve(process.argv[2] ?? "pencere-onizleme");
  fs.mkdirSync(cikti, { recursive: true });
  const tarayici = await tarayiciAc();
  for (const dil of ["tr", "en"]) {
    for (const tur of Object.keys(TR)) {
      for (const tema of ["acik", "koyu"]) {
        const dosya = path.join(cikti, `${tur}-${dil}-${tema}.png`);
        fs.writeFileSync(dosya, await pencereCek(tarayici, { dil, tur, tema }));
        console.log("yazıldı", dosya);
      }
    }
  }
  await tarayici.close();
}
