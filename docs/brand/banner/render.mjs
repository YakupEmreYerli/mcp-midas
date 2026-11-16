// Banner'ı iki dilde üretir: docs/banner.tr.png ve docs/banner.en.png (1280×640).
// Çalıştır (depo kökünden): node docs/brand/banner/render.mjs [çıktı-klasörü]
//
// Onay pencereleri ayrı görsel olarak tutulmaz: docs/brand/pencere.mjs onay/onay.html'i örnek
// bir emirle açar, paneli 2x çeker; banner.html'deki img[data-pencere] yuvalarına konur.
// Böylece pencere değişince banner da onu gösterir. İngilizce metin banner.html'de data-en'de.
// Depodaki PNG'ler Playwright'ın kendi Chromium'uyla üretildi (npx playwright install chromium);
// başka bir tarayıcı için CHROME_BIN verilebilir, yazı kırılımı biraz değişebilir.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { depo, pencereCek, tarayiciAc } from "../pencere.mjs";

const burasi = path.dirname(fileURLToPath(import.meta.url));
const cikti = path.resolve(process.argv[2] ?? path.join(depo, "docs"));

const tarayici = await tarayiciAc();
fs.mkdirSync(cikti, { recursive: true });
for (const dil of ["tr", "en"]) {
  const pencereler = {};
  for (const tur of ["alis", "satis"]) {
    pencereler[tur] = (await pencereCek(tarayici, { dil, tur, tema: "koyu", olcek: 2 })).toString("base64");
  }
  const sayfa = await tarayici.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
  await sayfa.goto(pathToFileURL(path.join(burasi, "banner.html")).href);
  const eksik = await sayfa.evaluate(
    async ({ dil, pencereler }) => {
      if (dil === "en") {
        document.documentElement.lang = "en";
        for (const oge of document.querySelectorAll("[data-en]")) oge.textContent = oge.dataset.en;
        for (const oge of document.querySelectorAll("[data-en-html]")) oge.innerHTML = oge.dataset.enHtml;
      }
      for (const img of document.querySelectorAll("img[data-pencere]")) {
        img.src = "data:image/png;base64," + pencereler[img.dataset.pencere];
        await img.decode();
      }
      await document.fonts.ready;
      return ["Geist", "Geist Mono"].filter(
        (aile) => ![...document.fonts].some((f) => f.family.replaceAll('"', "") === aile && f.status === "loaded"),
      );
    },
    { dil, pencereler },
  );
  if (eksik.length) throw new Error(`banner'da yüklenmeyen font: ${eksik.join(", ")} (onay/fontlar/)`);
  const dosya = path.join(cikti, `banner.${dil}.png`);
  await sayfa.screenshot({ path: dosya });
  await sayfa.close();
  console.log("yazıldı", path.relative(process.cwd(), dosya) || dosya);
}
await tarayici.close();
