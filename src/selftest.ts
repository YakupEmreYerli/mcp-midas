#!/usr/bin/env node
/** Tek oturumda kapsam testi: sahip olunmayan enstrümanlar Midas'tan okunabiliyor mu? */
import { session } from "./session.js";
import * as midas from "./midas.js";
import { getTechnicals } from "./technicals.js";

const show = async (label: string, fn: () => Promise<unknown>) => {
  try {
    const r: any = await fn();
    console.log(`OK   ${label}:`, JSON.stringify(r).slice(0, 220));
  } catch (e) {
    console.log(`FAIL ${label}:`, e instanceof Error ? e.message : String(e));
  }
};

await show("fon TTE (sahip degil)", () => midas.getAssetPrice("TTE"));
await show("fon IPB (sahip degil)", () => midas.getAssetPrice("IPB"));
await show("hisse THYAO (sahip degil)", () => midas.getAssetPrice("THYAO"));
await show("ETF VOO (sahip degil)", () => midas.getAssetPrice("VOO"));
await show("teknik THYAO 1d", async () => {
  const t: any = await getTechnicals("THYAO", "1d");
  return { price: t.price, rsi: t.rsi, sma200: t.sma200 ?? t.sma?.sma200, atr: t.atr };
});
await session.close();
