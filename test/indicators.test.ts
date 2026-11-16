import assert from "node:assert/strict";
import { test } from "node:test";
import {
  averageTrueRange,
  bollingerBands,
  exponentialSeries,
  groupLevels,
  macdLine,
  relativeStrength,
  simpleAverage,
  swingPoints,
  trueRanges,
  yearlyVolatilityPct,
} from "../src/indicators.js";
import { inflationFactor } from "../src/inflation.js";
import { realVwap } from "../src/vwap.js";

// Beklenen değerler elle hesaplandı; hesap her testin yanında.

const near = (actual: number | null, expected: number, eps = 1e-6) => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual as number) - expected) <= eps, `${actual} ≠ ${expected}`);
};

test("SMA son n değerin ortalaması; veri yetmezse null", () => {
  assert.equal(simpleAverage([1, 2, 3, 4, 5], 3), 4); // (3+4+5)/3
  assert.equal(simpleAverage([1, 2], 3), null);
});

test("EMA ilk n değerin ortalamasıyla başlar, α = 2/(n+1)", () => {
  // n=3 → α=0.5; tohum (1+2+3)/3=2; 2+0.5·(4−2)=3; 3+0.5·(5−3)=4
  assert.deepEqual(exponentialSeries([1, 2, 3, 4, 5], 3), [2, 3, 4]);
  assert.deepEqual(exponentialSeries([1, 2], 3), []);
});

test("Wilder RSI", () => {
  // n=2, değişimler +1 +1 −1 +1. Tohum: kazanç (1+1)/2=1, kayıp 0.
  // −1: kazanç (1·1+0)/2=0.5, kayıp (0·1+1)/2=0.5. +1: kazanç (0.5+1)/2=0.75, kayıp 0.25.
  // RS=3 → RSI = 100 − 100/4 = 75
  near(relativeStrength([1, 2, 3, 2, 3], 2), 75);
  assert.equal(relativeStrength([1, 2, 3, 4], 2), 100); // hiç kayıp yok
  assert.equal(relativeStrength([1, 2], 2), null); // n+1 kapanış gerekir
});

test("MACD küçük parametrelerle", () => {
  // Kapanış 1,2,4,8,16,32; hızlı=2 (α=2/3), yavaş=3 (α=1/2), sinyal=2.
  // Hızlı EMA: 3/2, 19/6, 115/18, 691/54, 4147/162. Yavaş EMA: 7/3, 31/6, 127/12, 511/24.
  // Çizgi (hızlı[i+1] − yavaş[i]): 5/6, 11/9, 239/108, 2791/648.
  // Sinyal: tohum (5/6+11/9)/2 = 37/36; 37/36 + 2/3·(239/108 − 37/36) = 589/324;
  //         589/324 + 2/3·(2791/648 − 589/324) = 6760/1944.
  const m = macdLine([1, 2, 4, 8, 16, 32], 2, 3, 2)!;
  near(m.macd, 2791 / 648);
  near(m.signal, 6760 / 1944);
  near(m.histogram, 2791 / 648 - 6760 / 1944);
  assert.equal(macdLine([1, 2, 4, 8], 2, 3, 2), null); // yavaş + sinyal = 5 kapanış gerekir
});

test("MACD sabit seride sıfır; varsayılan 12/26/9 için 35 kapanış gerekir", () => {
  const flat = Array(35).fill(7);
  assert.deepEqual(macdLine(flat), { macd: 0, signal: 0, histogram: 0 });
  assert.equal(macdLine(flat.slice(1)), null);
});

test("gerçek aralık ve ATR", () => {
  const bars = [
    { h: 10, l: 8, c: 9 },
    { h: 11, l: 9, c: 10 }, // max(2, |11−9|, |9−9|) = 2
    { h: 12, l: 9.5, c: 11 }, // max(2.5, |12−10|, |9.5−10|) = 2.5
    { h: 11, l: 7, c: 8 }, // max(4, |11−11|, |7−11|) = 4
  ];
  assert.deepEqual(trueRanges(bars), [2, 2.5, 4]);
  near(averageTrueRange(bars, 2), 3.25); // (2.5+4)/2
  near(averageTrueRange(bars, 3), 8.5 / 3);
  assert.equal(averageTrueRange(bars, 4), null);
});

test("Bollinger anakütle standart sapmasıyla", () => {
  // ortalama 3, varyans (4+1+0+1+4)/5 = 2
  const b = bollingerBands([1, 2, 3, 4, 5], 5, 2)!;
  near(b.middle, 3);
  near(b.upper, 3 + 2 * Math.SQRT2);
  near(b.lower, 3 - 2 * Math.SQRT2);
});

test("yıllık oynaklık: log getirilerin örneklem sapması × √252", () => {
  // getiriler ln1.1, ln0.9, ln1.1 → ortalama 0.0284200; kareli sapmalar toplamı 0.0268458;
  // /2 = 0.0134229; ×252 = 3.38257; karekök 1.83918 → %183.918
  near(yearlyVolatilityPct([100, 110, 99, 108.9], 3), 183.918, 1e-3);
  assert.equal(yearlyVolatilityPct([100, 110, 99], 3), null);
});

test("fraktal dönüş noktaları kesin büyüklük/küçüklük ister", () => {
  const bars = [1, 3, 2, 5, 4].map((h, i) => ({ h, l: [0.5, 2, 1, 4, 3][i], c: h }));
  assert.deepEqual(swingPoints(bars, 1), { peaks: [3, 5], troughs: [1] });
  const tie = [1, 3, 3, 1].map((h) => ({ h, l: h, c: h }));
  assert.deepEqual(swingPoints(tie, 1).peaks, []);
});

test("seviye kümeleme", () => {
  // 10 → yeni; 10.1 → (10+10.1)/2 = 10.05; 10.5 ile 10.05 arası 0.45 > 0.3 → yeni; 12 → yeni
  const g = groupLevels([12, 10.1, 10, 10.5], 0.3);
  assert.equal(g.length, 3);
  near(g[0].level, 10.05);
  assert.equal(g[0].touches, 2);
  assert.deepEqual(g.slice(1), [{ level: 10.5, touches: 1 }, { level: 12, touches: 1 }]);
});

test("TÜFE çarpanı açıklanan oranlarla uyumlu", () => {
  const mid = (y: number, m: number) => (Date.UTC(y, m - 1, 1) + Date.UTC(y, m, 1)) / 2;
  near(inflationFactor(mid(2026, 1), mid(2026, 2)), 1.0296); // Şubat 2026 aylık %2,96
  // Yıllık oranlar TÜİK'in açıkladığı değerlerle (%29,77 ve %32,87) yuvarlama payıyla tutmalı
  near(inflationFactor(mid(2025, 10), mid(2026, 10)), 1.2977, 2e-3);
  near(inflationFactor(mid(2024, 10), mid(2025, 10)), 1.3287, 2e-3);
  near(inflationFactor(mid(2026, 3), mid(2026, 3)), 1);
});

const day = Date.UTC(2026, 5, 15);
const flatBar = (price: number, v: number, t = day) => ({ o: price, h: price, l: price, c: price, v, t });

test("VWAP, bantlar ve z-puanı (enflasyon etkisiz: hepsi aynı gün)", () => {
  // 10 mum 20 TL × 3 hacim, ardından 10 mum 10 TL × 1 hacim; son kapanış 10.
  // VWAP = (20·30 + 10·10)/40 = 17.5; varyans = (30·2.5² + 10·7.5²)/40 = 18.75; σ = 4.3301
  const candles = [...Array(10).fill(flatBar(20, 3)), ...Array(10).fill(flatBar(10, 1))];
  const r = realVwap(candles)!;
  near(r.realVwap, 17.5, 1e-4);
  near(r.nominalVwap, 17.5, 1e-4);
  near(r.realStdev, Math.sqrt(18.75), 1e-4);
  near(r.bands.upper2, 17.5 + 2 * Math.sqrt(18.75), 1e-4);
  near(r.premiumPct, ((10 - 17.5) / 17.5) * 100, 1e-4);
  near(r.zScore, -7.5 / Math.sqrt(18.75), 1e-4);
  near(r.volumeAbovePricePct, 75); // 30/40 hacim 10 TL'nin üstünde
  assert.equal(realVwap(candles.slice(1)), null); // 20 mumdan az
});

test("reel VWAP eski mumu son mumun tarihine taşır", () => {
  // Ocak 2026 ortasındaki 100 TL, Şubat ortasında 100 × 1.0296 = 102.96 eder.
  // Reel VWAP = (102.96 + 19·100)/20 = 100.148; nominal 100.
  const jan = (Date.UTC(2026, 0, 1) + Date.UTC(2026, 1, 1)) / 2;
  const feb = (Date.UTC(2026, 1, 1) + Date.UTC(2026, 2, 1)) / 2;
  const candles = [flatBar(100, 1, jan), ...Array(19).fill(flatBar(100, 1, feb))];
  const r = realVwap(candles)!;
  near(r.realVwap, 100.148, 1e-4);
  near(r.nominalVwap, 100, 1e-4);
});
