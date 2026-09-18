#!/usr/bin/env node
/**
 * docs/analiz-kurallari.md v3 TechnicalTiming alt puanının (Fiyat ekseninin mekanik kısmı)
 * geriye dönük testi (backtest). Her sembol ve her geçmiş tarih için (haftalık adımlarla)
 * puan YALNIZCA o tarihe kadarki veriyle hesaplanır, sonra 5/21/63 işlem günü sonraki
 * gerçekleşen ileri getiriyle karşılaştırılır.
 *
 * Neyi doğrular: teknik kurallar (trend filtreleri, RSI ele alışı, serbest düşüş cezası,
 * desteğe yakınlık, hacim). Neyi doğrulayamaz: Kalite/Haber/Makro; bunlar ileriye bakma
 * yanlılığı (look-ahead bias) olmadan yeniden kurulamayan noktasal temel veriler ister.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { gql } from "./api.js";
import { session } from "./session.js";
import { resolveSymbol } from "./midas.js";
import { computeTechnicals, type Candle } from "./technicals.js";
import { realVwap } from "./vwap.js";
import { PROJECT_ROOT } from "./config.js";

const SYMBOLS = [
  // likit büyük şirketler
  "THYAO", "ASELS", "TUPRS", "GARAN", "AKBNK", "ISCTR", "YKBNK", "EREGL", "SISE",
  "BIMAS", "FROTO", "TOASO", "TCELL", "PGSUS", "SAHOL", "KCHOL", "ARCLK", "PETKM",
  "ENKAI", "HEKTS", "ASTOR",
  // kullanıcının küçük/orta ölçekli hisseleri
  "KONTR", "SASA", "TUCLK", "TSKB", "TKNSA", "CANTE", "BEGYO", "ETILR", "UCAYM",
];

const CHART_QUERY = /* GraphQL */ `
  query getChart($request: CandleRequest!) {
    chart(request: $request) {
      candles { o h l c v t }
    }
  }
`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHistory(uid: string, targetBars: number): Promise<Candle[]> {
  let all: Candle[] = [];
  let before = Date.now();
  for (let page = 0; page < 4 && all.length < targetBars; page++) {
    const data = await gql("getChart", CHART_QUERY, {
      request: { uid, interval: "1d", before, limit: 500, ethIncluded: true },
    });
    const batch = (data.chart?.candles ?? []) as Candle[];
    if (!batch.length) break;
    all = [...batch, ...all];
    before = batch[0].t - 1;
    if (batch.length < 100) break;
    await sleep(1500); // grafik uç noktası agresif sayfalamayı hız sınırına takar
  }
  // zaman damgasına göre tekilleştir, kronolojik sırayı koru
  const seen = new Set<number>();
  return all.filter((c) => (seen.has(c.t) ? false : (seen.add(c.t), true)));
}

// ---- kodlanmış TechnicalTiming puanı (docs/analiz-kurallari.md v3'ün referans uygulaması) ----

function localRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  let ag = g / period, al = l / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

interface ScoredPoint {
  score: number;
  freefall: boolean;
  oversoldRecovery: boolean;
  rsi: number | null;
  /** Fiyatın son bir yılın enflasyondan arındırılmış VWAP'ına göre noktasal z-puanı. */
  vwapZ: number | null;
  vwapPremium: number | null;
  /** VWAP'ın çok altında VE dip oluşturma belirtisi gösteriyor (destek/hacim/RSI dönüşü). */
  stabilizing: boolean;
}

function technicalTimingScore(window: Candle[]): ScoredPoint {
  const t = computeTechnicals("X", window, "1d");
  const closes = window.map((c) => c.c);
  const vols = window.map((c) => c.v);
  const price = t.price;
  let s = 50;

  // trend
  if (t.trend.sma200 !== null) s += price > t.trend.sma200 ? 10 : -10;
  if (t.trend.sma50 !== null) s += price > t.trend.sma50 ? 8 : -8;
  if (t.trend.goldenCross !== null) s += t.trend.goldenCross ? 7 : -7;

  // momentum
  if (t.momentum.macd) s += t.momentum.macd.histogram >= 0 ? 6 : -6;
  const rsi = t.momentum.rsi14;
  if (rsi !== null) {
    if (rsi > 75) s -= 10;
    else if (rsi > 65) s -= 3;
    else if (rsi >= 40) s += 5;
    // geriye dönük test bulgusu: tek başına RSI<30 BIST'te hafifçe POZİTİFTİ (%60 21g isabet
    // oranı, +%0,4 fazla getiri) — tehlike aşırı satım değil, serbest düşüş örüntüsü. Ceza yok.
  }
  const rsiPrev = localRsi(closes.slice(0, -5));
  const oversoldRecovery =
    rsi !== null && rsiPrev !== null && rsiPrev < 32 && rsi > rsiPrev + 3;
  if (oversoldRecovery) s += 8;

  // hacim
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const avg5 = avg(vols.slice(-5));
  const avg20 = avg(vols.slice(-20));
  const avg60 = vols.length >= 60 ? avg(vols.slice(-60)) : avg20;
  if (avg20 > avg60) s += 5;
  const lastUp = closes[closes.length - 1] > closes[closes.length - 2];
  if (vols[vols.length - 1] > 1.5 * avg20 && lastUp) s += 4;

  // yapı
  const sup = t.levels.nearestSupport;
  if (sup && sup.touches >= 2 && price <= sup.level * 1.03) s += 6;
  const res = t.levels.nearestResistance;
  if (res && price >= res.level * 0.97) s -= 4;
  if (t.levels.pctFrom52wHigh > -5) s += 4;
  if (t.levels.pctFrom52wLow < 5) s -= 4;

  // parabolik uzama cezası (geriye dönük test bulgusu: TUCLK Mayıs-2024 ve CANTE Kasım-2025'teki
  // 86+ puanlı tepe patlamaları 63 günde −%17..−%31 hareketlerden önce geldi — SMA50'nin çok
  // üstünde, sıcak RSI'lı fiyat küçük şirket tepelerini işaret eder, momentum puanları onu kovalamamalı)
  if (t.trend.sma50 !== null && price > t.trend.sma50 * 1.35 && rsi !== null && rsi > 60) {
    s -= 10;
  }

  // serbest düşüş (freefall) cezası: fiyat < SMA50 < SMA200, 20 günlük dip son 5 mumda
  // yapılmış ve hacim artmıyor
  const lows20 = window.slice(-20).map((c) => c.l);
  const minIdx = lows20.indexOf(Math.min(...lows20));
  const newLow = minIdx >= 15;
  const freefall =
    t.trend.sma50 !== null &&
    t.trend.sma200 !== null &&
    price < t.trend.sma50 &&
    t.trend.sma50 < t.trend.sma200 &&
    newLow &&
    avg5 <= avg20;
  if (freefall) s -= 13;

  // reel VWAP konumlanması, değerlendirme tarihinin satın alma gücüyle
  const asOf = window[window.length - 1].t;
  const rv = realVwap(window, 252, asOf);
  const vwapZ = rv ? rv.zScore : null;
  const vwapPremium = rv ? rv.premiumPct : null;

  // "dengeleniyor" = reel VWAP'ın çok altında ama artık serbest düşüşte değil:
  // çok temaslı bir desteğin üstünde, ya da hacim artıyor, ya da RSI dipten dönüyor
  const nearSupport = !!(sup && sup.touches >= 2 && price <= sup.level * 1.05);
  const volumeImproving = avg5 > avg20;
  const stabilizing =
    vwapZ !== null && vwapZ <= -1.5 && (nearSupport || volumeImproving || oversoldRecovery);

  return {
    score: Math.max(0, Math.min(100, s)),
    freefall,
    oversoldRecovery,
    rsi,
    vwapZ,
    vwapPremium,
    stabilizing,
  };
}

// ---- çalıştır --------------------------------------------------------------------

interface Obs {
  symbol: string;
  t: number;
  score: number;
  freefall: boolean;
  oversoldRecovery: boolean;
  rsi: number | null;
  vwapZ: number | null;
  vwapPremium: number | null;
  stabilizing: boolean;
  f5: number;
  f21: number;
  f63: number;
}

const observations: Obs[] = [];
const WINDOW = 320; // her puanın gördüğü geçmiş mum sayısı
const STEP = 5; // haftalık örnekleme

const CANDLE_CACHE = path.join(PROJECT_ROOT, "scans", "_bt_candles");
fs.mkdirSync(CANDLE_CACHE, { recursive: true });

for (const symbol of SYMBOLS) {
  try {
    const cacheFile = path.join(CANDLE_CACHE, `${symbol}.json`);
    let candles: Candle[];
    if (fs.existsSync(cacheFile)) {
      candles = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    } else {
      const asset = await resolveSymbol(symbol);
      candles = await fetchHistory(asset.uid, 900);
      fs.writeFileSync(cacheFile, JSON.stringify(candles));
      await sleep(2500);
    }
    if (candles.length < WINDOW + 70) {
      console.error(`${symbol}: yalnız ${candles.length} mum — atlandı`);
      continue;
    }
    let n = 0;
    for (let i = WINDOW; i < candles.length - 63; i += STEP) {
      const window = candles.slice(i - WINDOW, i + 1);
      const point = technicalTimingScore(window);
      const c0 = candles[i].c;
      observations.push({
        symbol,
        t: candles[i].t,
        ...point,
        f5: (candles[i + 5].c / c0 - 1) * 100,
        f21: (candles[i + 21].c / c0 - 1) * 100,
        f63: (candles[i + 63].c / c0 - 1) * 100,
      });
      n++;
    }
    console.error(`${symbol}: ${candles.length} mum → ${n} gözlem`);
  } catch (e) {
    console.error(`${symbol}: BAŞARISIZ — ${e instanceof Error ? e.message : e}`);
  }
}

// kesitsel ortalamadan arındırma: o tarihteki tüm hisselerin ortalamasına göre fazla getiri
const byDate = new Map<number, Obs[]>();
for (const o of observations) {
  if (!byDate.has(o.t)) byDate.set(o.t, []);
  byDate.get(o.t)!.push(o);
}
const excess = (o: Obs, k: "f5" | "f21" | "f63") => {
  const peers = byDate.get(o.t)!;
  const mean = peers.reduce((a, b) => a + b[k], 0) / peers.length;
  return o[k] - mean;
};

function bucketStats(filter: (o: Obs) => boolean, label: string) {
  const rows = observations.filter(filter);
  if (!rows.length) return { label, n: 0 };
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    label,
    n: rows.length,
    avgF21: +mean(rows.map((o) => o.f21)).toFixed(2),
    avgExcess21: +mean(rows.map((o) => excess(o, "f21"))).toFixed(2),
    avgExcess63: +mean(rows.map((o) => excess(o, "f63"))).toFixed(2),
    hitRate21: +((rows.filter((o) => o.f21 > 0).length / rows.length) * 100).toFixed(1),
  };
}

function spearman(pairs: [number, number][]): number {
  const rank = (vals: number[]) => {
    const idx = vals.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
    const r = new Array(vals.length);
    idx.forEach(([, orig], pos) => (r[orig] = pos));
    return r;
  };
  const xs = rank(pairs.map((p) => p[0]));
  const ys = rank(pairs.map((p) => p[1]));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

// ortalama kesitsel bilgi katsayısı (IC; puan ile 21 günlük ileri getiri, tarih başına)
const ics: number[] = [];
const vwapIcs: number[] = [];
for (const [, rows] of byDate) {
  if (rows.length >= 10) {
    ics.push(spearman(rows.map((o) => [o.score, o.f21] as [number, number])));
    const withZ = rows.filter((o) => o.vwapZ !== null);
    if (withZ.length >= 10) {
      // ters işaretli: hipotez, DÜŞÜK z'nin (reel VWAP'a göre daha ucuz) YÜKSEK getiriyi öngördüğü
      vwapIcs.push(spearman(withZ.map((o) => [-o.vwapZ!, o.f63] as [number, number])));
    }
  }
}
const meanIC = ics.reduce((a, b) => a + b, 0) / ics.length;
const meanVwapIC = vwapIcs.reduce((a, b) => a + b, 0) / (vwapIcs.length || 1);

const summary = {
  totalObservations: observations.length,
  symbols: [...new Set(observations.map((o) => o.symbol))].length,
  dateRange: [
    new Date(Math.min(...observations.map((o) => o.t))).toISOString().slice(0, 10),
    new Date(Math.max(...observations.map((o) => o.t))).toISOString().slice(0, 10),
  ],
  scoreBuckets: [
    bucketStats((o) => o.score < 35, "puan <35 (zayıf/yıkıcı)"),
    bucketStats((o) => o.score >= 35 && o.score < 45, "puan 35-45"),
    bucketStats((o) => o.score >= 45 && o.score < 55, "puan 45-55 (nötr)"),
    bucketStats((o) => o.score >= 55 && o.score < 65, "puan 55-65"),
    bucketStats((o) => o.score >= 65, "puan ≥65 (yapıcı)"),
  ],
  rules: [
    bucketStats((o) => o.freefall, "SERBEST DÜŞÜŞ işaretli"),
    bucketStats((o) => !o.freefall && o.score < 45, "puan<45 ama serbest düşüş yok"),
    bucketStats((o) => o.rsi !== null && o.rsi < 30 && !o.oversoldRecovery, "yalnız RSI<30 (düşen bıçak?)"),
    bucketStats((o) => o.oversoldRecovery, "aşırı satımdan TOPARLANMA (RSI yukarı dönüyor)"),
    bucketStats((o) => o.rsi !== null && o.rsi > 70, "RSI>70 aşırı alım"),
  ],
  realVwapBuckets: [
    bucketStats((o) => o.vwapZ !== null && o.vwapZ <= -2, "vwap z <= -2 (derin teslimiyet)"),
    bucketStats((o) => o.vwapZ !== null && o.vwapZ > -2 && o.vwapZ <= -1, "vwap z -2..-1"),
    bucketStats((o) => o.vwapZ !== null && o.vwapZ > -1 && o.vwapZ <= 0, "vwap z -1..0"),
    bucketStats((o) => o.vwapZ !== null && o.vwapZ > 0 && o.vwapZ <= 1, "vwap z 0..+1"),
    bucketStats((o) => o.vwapZ !== null && o.vwapZ > 1 && o.vwapZ <= 2, "vwap z +1..+2"),
    bucketStats((o) => o.vwapZ !== null && o.vwapZ > 2, "vwap z > +2 (aşırı uzamış)"),
  ],
  capitulationSplit: [
    bucketStats((o) => o.vwapZ !== null && o.vwapZ <= -1.5 && o.stabilizing, "derin + DENGELENİYOR"),
    bucketStats((o) => o.vwapZ !== null && o.vwapZ <= -1.5 && !o.stabilizing, "derin + hâlâ düşüyor"),
  ],
  meanCrossSectionalIC_f21: +meanIC.toFixed(4),
  icDates: ics.length,
  /** Pozitif = reel VWAP'a göre ucuzluk daha yüksek 63 günlük getiriyi öngördü (ortalamaya dönüş kazanır). */
  meanIC_negVwapZ_vs_f63: +meanVwapIC.toFixed(4),
};

console.log(JSON.stringify(summary, null, 2));

// vaka çalışmaları için sembol başına iz
const csv = ["symbol,date,score,freefall,rsi,f5,f21,f63"];
for (const o of observations) {
  csv.push(
    `${o.symbol},${new Date(o.t).toISOString().slice(0, 10)},${o.score},${o.freefall ? 1 : 0},${o.rsi?.toFixed(1) ?? ""},${o.f5.toFixed(2)},${o.f21.toFixed(2)},${o.f63.toFixed(2)}`
  );
}
fs.writeFileSync(path.join(PROJECT_ROOT, "discovery", "backtest.csv"), csv.join("\n"));
console.error(`\ndiscovery/backtest.csv yazıldı (${observations.length} satır)`);

await session.close();
