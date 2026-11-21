import assert from "node:assert/strict";
import { test } from "node:test";

// Bu dosyadaki beklentiler Türkçe metinleri sabitler; dil sistem yerelinden bağımsız seçilir.
process.env.MIDAS_LANG = "tr";

// technicals.ts midas.ts üzerinden config.ts'i yükler; o da kimlik bilgisini ister.
process.env.MIDAS_PHONE ??= "test-only";
process.env.MIDAS_PASSWORD ??= "test-only";
const { computeTechnicals } = await import("../src/technicals.js");

const t0 = Date.UTC(2026, 0, 5);
/** Kapanışı 1, 2, …, n olan; yüksek = kapanış + 0.5, düşük = kapanış − 0.5 olan mumlar. */
const ramp = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ o: i + 1, h: i + 1.5, l: i + 0.5, c: i + 1, v: 100 + i, t: t0 + i * 86_400_000 }));

test("30 mumluk düz yükselişte özet", () => {
  const t = computeTechnicals("DENEME", ramp(30), "1d");
  assert.equal(t.price, 30);
  assert.equal(t.bars, 30);
  assert.equal(t.trend.sma20, 20.5); // (11+…+30)/20
  assert.equal(t.trend.sma50, null);
  assert.equal(t.trend.goldenCross, null);
  assert.equal(t.momentum.rsi14, 100);
  assert.equal(t.momentum.rsiZone, "overbought");
  assert.equal(t.momentum.macd, null); // 35 kapanış gerekir
  assert.equal(t.momentum.roc20Pct, 200); // 30, 20 mum önceki 10'a göre
  assert.equal(t.volatility.atr14, 1.5); // her gün |yüksek − önceki kapanış| = 1.5
  assert.equal(t.volatility.atrPctOfPrice, 5);
  assert.equal(t.levels.high52w, 30.5);
  assert.equal(t.levels.low52w, 0.5);
  assert.equal(t.volume.latest, 129);
  assert.equal(t.volume.avg20, 120); // (110+…+129)/20 = 119.5 → 120
  assert.equal(t.asOf, new Date(t0 + 29 * 86_400_000).toISOString());
  assert.ok(t.realVwap.year1);
});

test("30 mumdan azında hata verir", () => {
  assert.throws(() => computeTechnicals("DENEME", ramp(29), "1d"), /yetecek fiyat geçmişi yok \(29 mum\)/);
});
