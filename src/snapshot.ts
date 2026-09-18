#!/usr/bin/env node
/**
 * Bir sembol listesi için teknik gösterge + fiyat anlık görüntülerini önceden hesaplayıp
 * scans/_technicals/<SEMBOL>.json dosyalarına yazar; böylece tarama ajanları canlı oturuma
 * eşzamanlı yüklenmek yerine dosyalardan çalışır.
 * Kullanım: node dist/snapshot.js SEMBOL1,SEMBOL2,...
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { session } from "./session.js";
import { getAssetPrice, resolveSymbol } from "./midas.js";
import { getCandles, computeTechnicals } from "./technicals.js";
import { PROJECT_ROOT } from "./config.js";

const symbols = (process.argv[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!symbols.length) throw new Error("sembol verilmedi");

const OUT = path.join(PROJECT_ROOT, "scans", "_technicals");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchOne(sym: string) {
  const asset = await resolveSymbol(sym);
  const price = await getAssetPrice(asset.symbol);
  const candles = await getCandles(asset.uid, "1d", 400);
  const technicals = computeTechnicals(asset.symbol, candles, "1d");
  return { asset, price, technicals };
}

let ok = 0;
let failed = 0;
for (const sym of symbols) {
  let done = false;
  for (let attempt = 0; attempt < 3 && !done; attempt++) {
    try {
      const snapshot = await fetchOne(sym);
      fs.writeFileSync(path.join(OUT, `${sym}.json`), JSON.stringify(snapshot, null, 2));
      ok++;
      done = true;
      console.error(`${sym} ok (${ok + failed}/${symbols.length})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429") && attempt < 2) {
        console.error(`${sym} hız sınırına takıldı, ${(attempt + 1) * 30} sn geri çekiliniyor...`);
        await sleep((attempt + 1) * 30_000);
        continue;
      }
      failed++;
      fs.writeFileSync(path.join(OUT, `${sym}.json`), JSON.stringify({ error: msg }, null, 2));
      console.error(`${sym} BAŞARISIZ: ${msg}`);
      done = true;
    }
  }
  await sleep(2000); // API hız sınırının altında kal
}
console.log(JSON.stringify({ ok, failed }));
await session.close();
