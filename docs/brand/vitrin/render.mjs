// Vitrin görsellerini üretir (docs/vitrin/): okuma.png ve emir-kapilari.png bu klasördeki HTML'den
// 2x, onay-iptal-acik/koyu.png onay penceresinden (docs/brand/pencere.mjs, örnek İPTAL emri) 1x.
// Çalıştır (depo kökünden): node docs/brand/vitrin/render.mjs [çıktı-klasörü]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { depo, pencereCek, tarayiciAc } from "../pencere.mjs";

const burasi = path.dirname(fileURLToPath(import.meta.url));
const cikti = path.resolve(process.argv[2] ?? path.join(depo, "docs/vitrin"));
fs.mkdirSync(cikti, { recursive: true });
const tarayici = await tarayiciAc();

for (const ad of ["okuma", "emir-kapilari"]) {
  const sayfa = await tarayici.newPage({ viewport: { width: 880, height: 400 }, deviceScaleFactor: 2 });
  await sayfa.goto(pathToFileURL(path.join(burasi, `${ad}.html`)).href);
  await sayfa.evaluate(() => document.fonts.ready);
  const eksik = await sayfa.evaluate(() =>
    ["Geist", "Geist Mono"].filter(
      (aile) => ![...document.fonts].some((f) => f.family.replaceAll('"', "") === aile && f.status === "loaded"),
    ),
  );
  if (eksik.length) throw new Error(`${ad}: yüklenmeyen font: ${eksik.join(", ")}`);
  const dosya = path.join(cikti, `${ad}.png`);
  await sayfa.locator("body").screenshot({ path: dosya });
  await sayfa.close();
  console.log("yazıldı", dosya);
}
for (const tema of ["acik", "koyu"]) {
  const dosya = path.join(cikti, `onay-iptal-${tema}.png`);
  fs.writeFileSync(dosya, await pencereCek(tarayici, { tur: "iptal", tema }));
  console.log("yazıldı", dosya);
}
await tarayici.close();
