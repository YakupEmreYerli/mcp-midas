/**
 * get_technicals ve get_chart'ın veri katmanı: Midas'tan mum çeker ve göstergeleri
 * (indicators.ts) tek bir özet nesnesinde toplar.
 */
import { gql } from "./api.js";
import { resolveSymbol } from "./midas.js";
import { candidateSummary } from "./symbol-resolution.js";
import { realVwapBundle, type RealVwapBundle } from "./vwap.js";
import {
  averageTrueRange,
  bollingerBands,
  exponentialAverage,
  groupLevels,
  macdLine,
  relativeStrength,
  simpleAverage,
  swingPoints,
  yearlyVolatilityPct,
  type MacdValue,
  type PriceLevel,
} from "./indicators.js";
import { defineMessages } from "./i18n.js";

const M = defineMessages(
  {
    notEnough: (symbol: string, count: number) => `${symbol} için teknik göstergeleri hesaplamaya yetecek fiyat geçmişi yok (${count} mum)`,
  },
  {
    notEnough: (symbol, count) => `Not enough price history for ${symbol} to compute technical indicators (${count} candles)`,
  }
);

/** Midas'ın grafik verisindeki tek mum: açılış, yüksek, düşük, kapanış, hacim, zaman (ms). */
export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: number;
}

// Kök alan `chart`; mum alanları Atlas'ın grafik bileşeninin istediğiyle aynı.
const CANDLES_DOC = `query getChart($request: CandleRequest!) {
  chart(request: $request) { interval candles { o h l c v t } }
}`;

/** Bir enstrümanın `before` anından geriye en çok `limit` mumu (eskiden yeniye). */
export async function getCandles(uid: string, interval = "1d", limit = 400): Promise<Candle[]> {
  const request = { uid, interval, limit, before: Date.now(), ethIncluded: true };
  const res = await gql<{ chart?: { candles?: Candle[] } }>("getChart", CANDLES_DOC, { request });
  return res.chart?.candles ?? [];
}

export interface Technicals {
  symbol: string;
  asOf: string;
  bars: number;
  interval: string;
  price: number;
  trend: {
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    ema20: number | null;
    priceVsSma50Pct: number | null;
    priceVsSma200Pct: number | null;
    goldenCross: boolean | null;
  };
  momentum: {
    rsi14: number | null;
    rsiZone: "oversold" | "neutral" | "overbought" | null;
    macd: MacdValue | null;
    macdCrossover: "bullish" | "bearish" | null;
    roc20Pct: number | null;
  };
  volatility: {
    atr14: number | null;
    atrPctOfPrice: number | null;
    annualizedPct: number | null;
    bollinger: { middle: number; upper: number; lower: number } | null;
    bollingerPosition: "above_upper" | "upper_half" | "lower_half" | "below_lower" | null;
  };
  levels: {
    high52w: number;
    low52w: number;
    pctFrom52wHigh: number;
    pctFrom52wLow: number;
    nearestSupport: PriceLevel | null;
    nearestResistance: PriceLevel | null;
    supports: PriceLevel[];
    resistances: PriceLevel[];
  };
  volume: {
    latest: number;
    avg20: number | null;
    avg20RelativePct: number | null;
  };
  /** Enflasyondan arındırılmış VWAP (1 yıl, 2 yıl, tüm seri); bkz. vwap.ts. */
  realVwap: RealVwapBundle;
}

/** Göstergeler için gereken en az mum. */
const MIN_CANDLES = 30;
/** Yaklaşık bir yıllık işlem günü. */
const YEAR_BARS = 252;

const dp = (x: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};
const price4 = (x: number | null) => (x === null ? null : dp(x, 4));
/** `x`'in `ref`'e göre yüzde farkı, 2 basamak. */
const diffPct = (x: number, ref: number) => dp(((x - ref) / ref) * 100, 2);

function zoneOf(rsi: number): "oversold" | "neutral" | "overbought" {
  if (rsi < 30) return "oversold";
  if (rsi > 70) return "overbought";
  return "neutral";
}

function bandPosition(
  close: number,
  b: { middle: number; upper: number; lower: number }
): Technicals["volatility"]["bollingerPosition"] {
  if (close > b.upper) return "above_upper";
  if (close >= b.middle) return "upper_half";
  if (close >= b.lower) return "lower_half";
  return "below_lower";
}

/**
 * Dönüş noktalarından destek ve direnç: birbirine son fiyatın %2'si kadar yakın noktalar tek
 * seviyede toplanır; fiyatın üstündekiler direnç (yakından uzağa), altındakiler destek.
 */
function supportAndResistance(candles: Candle[], close: number) {
  const { peaks, troughs } = swingPoints(candles, 3);
  const tolerance = close * 0.02;
  const finish = (xs: PriceLevel[]) => xs.map((g) => ({ level: dp(g.level, 4), touches: g.touches }));

  const above = finish(groupLevels(peaks, tolerance))
    .filter((g) => g.level > close)
    .sort((a, b) => a.level - b.level);
  const below = finish(groupLevels(troughs, tolerance))
    .filter((g) => g.level < close)
    .sort((a, b) => b.level - a.level);

  return {
    nearestSupport: below[0] ?? null,
    nearestResistance: above[0] ?? null,
    supports: below.slice(0, 4),
    resistances: above.slice(0, 4),
  };
}

/** Mum dizisinden teknik özet. */
export function computeTechnicals(symbol: string, candles: Candle[], interval: string): Technicals {
  if (candles.length < MIN_CANDLES) {
    throw new Error(M().notEnough(symbol, candles.length));
  }
  const closes = candles.map((k) => k.c);
  const vols = candles.map((k) => k.v);
  const last = candles[candles.length - 1];
  const close = last.c;

  const sma50 = simpleAverage(closes, 50);
  const sma200 = simpleAverage(closes, 200);
  const rsi = relativeStrength(closes, 14);
  const rawMacd = macdLine(closes);
  const macd = rawMacd && {
    macd: dp(rawMacd.macd, 4),
    signal: dp(rawMacd.signal, 4),
    histogram: dp(rawMacd.histogram, 4),
  };
  const rawBands = bollingerBands(closes, 20, 2);
  const bands = rawBands && {
    middle: dp(rawBands.middle, 4),
    upper: dp(rawBands.upper, 4),
    lower: dp(rawBands.lower, 4),
  };
  const atr = averageTrueRange(candles, 14);
  const vol = yearlyVolatilityPct(closes, 30);
  const avgVol = simpleAverage(vols, 20);

  const lastYear = candles.slice(-YEAR_BARS);
  const yearHigh = Math.max(...lastYear.map((k) => k.h));
  const yearLow = Math.min(...lastYear.map((k) => k.l));

  return {
    symbol,
    asOf: new Date(last.t).toISOString(),
    bars: candles.length,
    interval,
    price: dp(close, 4),
    trend: {
      sma20: price4(simpleAverage(closes, 20)),
      sma50: price4(sma50),
      sma200: price4(sma200),
      ema20: price4(exponentialAverage(closes, 20)),
      priceVsSma50Pct: sma50 === null ? null : diffPct(close, sma50),
      priceVsSma200Pct: sma200 === null ? null : diffPct(close, sma200),
      goldenCross: sma50 !== null && sma200 !== null ? sma50 > sma200 : null,
    },
    momentum: {
      rsi14: rsi === null ? null : dp(rsi, 2),
      rsiZone: rsi === null ? null : zoneOf(rsi),
      macd,
      macdCrossover: macd ? (macd.histogram < 0 ? "bearish" : "bullish") : null,
      roc20Pct: closes.length > 20 ? diffPct(close, closes[closes.length - 21]) : null,
    },
    volatility: {
      atr14: price4(atr),
      atrPctOfPrice: atr === null ? null : dp((atr / close) * 100, 2),
      annualizedPct: vol === null ? null : dp(vol, 2),
      bollinger: bands,
      bollingerPosition: bands ? bandPosition(close, bands) : null,
    },
    levels: {
      high52w: dp(yearHigh, 4),
      low52w: dp(yearLow, 4),
      pctFrom52wHigh: diffPct(close, yearHigh),
      pctFrom52wLow: diffPct(close, yearLow),
      ...supportAndResistance(candles, close),
    },
    volume: {
      latest: last.v,
      avg20: avgVol === null ? null : Math.round(avgVol),
      avg20RelativePct: avgVol ? diffPct(last.v, avgVol) : null,
    },
    realVwap: realVwapBundle(candles),
  };
}

/** Sembolü çözer, mumlarını çeker ve teknik özeti döner. */
export async function getTechnicals(
  symbol: string,
  interval = "1d",
  limit = 400,
  market?: "TR" | "US"
): Promise<Technicals & { candidates?: ReturnType<typeof candidateSummary> }> {
  const asset = await resolveSymbol(symbol, { market });
  const summary = computeTechnicals(asset.symbol, await getCandles(asset.uid, interval, limit), interval);
  // Aynı sembolü birden çok enstrüman taşıyorsa hangisinin analiz edildiği görünsün.
  if (asset.candidates.length < 2) return summary;
  return { ...summary, candidates: candidateSummary(asset.candidates) };
}
