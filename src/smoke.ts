#!/usr/bin/env node
/**
 * Salt okuma araç yollarını canlı oturuma karşı çalıştırır ve sonuçları yazdırır.
 * Kullanım: node dist/smoke.js [sembol]
 */
import { session } from "./session.js";
import * as midas from "./midas.js";

const symbol = process.argv[2] ?? "TUCLK";

async function show(label: string, fn: () => Promise<unknown>) {
  process.stdout.write(`\n=== ${label} ===\n`);
  try {
    console.log(JSON.stringify(await fn(), null, 2));
  } catch (error) {
    console.log("BAŞARISIZ:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

try {
  await show("get_portfolio", () => midas.getPortfolio());
  await show("get_assets", () => midas.getPositions());
  await show(`get_asset_price(${symbol})`, () => midas.getAssetPrice(symbol));
  await show(`get_asset_info(${symbol})`, () => midas.getAssetInfo(symbol));
  await show(`get_pending_orders(${symbol})`, () => midas.getPendingOrders(symbol));
} finally {
  await session.close();
}
