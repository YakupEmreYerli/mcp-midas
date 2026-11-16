#!/usr/bin/env node
/**
 * `npm run smoke [sembol]`: okuma araçlarının arkasındaki çağrıları canlı oturumla bir kez
 * çalıştırıp sonuçları basar. Emir göndermez. Bir adım başarısızsa çıkış kodu 1 olur.
 */
import * as midas from "./midas.js";
import { session } from "./session.js";

const symbol = process.argv[2] ?? "TUCLK";

const steps: Array<[string, () => Promise<unknown>]> = [
  ["get_portfolio", midas.getPortfolio],
  ["get_assets", midas.getPositions],
  [`get_asset_price(${symbol})`, () => midas.getAssetPrice(symbol)],
  [`get_asset_info(${symbol})`, () => midas.getAssetInfo(symbol)],
  [`get_pending_orders(${symbol})`, () => midas.getPendingOrders(symbol)],
];

try {
  for (const [name, run] of steps) {
    console.log(`\n--- ${name}`);
    const outcome = await run().then(
      (value) => JSON.stringify(value, null, 2),
      (error: unknown) => {
        process.exitCode = 1;
        return `BAŞARISIZ: ${error instanceof Error ? error.message : String(error)}`;
      }
    );
    console.log(outcome);
  }
} finally {
  await session.close();
}
