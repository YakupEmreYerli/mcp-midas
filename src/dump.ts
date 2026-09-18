#!/usr/bin/env node
/**
 * Tek girişte hesabın tam fotoğrafı: portföy özeti, bütün pozisyonlar ve her
 * pozisyonun bekleyen emirleri. Her şeyi tek oturumda toplar; oturum yeniden giriş
 * isterse telefonda tek bir bildirim onayı yeter.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { PROJECT_ROOT } from "./config.js";
import { session } from "./session.js";
import * as midas from "./midas.js";

const out: Record<string, unknown> = { fetchedAt: new Date().toISOString() };
try {
  out.portfolio = await midas.getPortfolio();
  const positions = await midas.getPositions();
  out.positions = positions;
  const pending: Record<string, unknown> = {};
  for (const p of positions as any[]) {
    try { pending[p.symbol] = (await midas.getPendingOrders(p.symbol)).orders; }
    catch (e) { pending[p.symbol] = { error: e instanceof Error ? e.message : String(e) }; }
  }
  out.pendingOrders = pending;
} finally {
  await session.close().catch(() => {});
}
const file = path.join(PROJECT_ROOT, "discovery", "dump.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.log("yazildi:", file);
