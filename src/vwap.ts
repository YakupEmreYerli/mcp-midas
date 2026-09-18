/**
 * Enflasyondan arındırılmış (reel) VWAP — hacim ağırlıklı ortalama fiyat.
 *
 * TradingView VWAP göstergesini izler — kaynak `hlc3`, değer `Σ(hacim·kaynak)/Σ(hacim)`,
 * bantlar N hacim ağırlıklı standart sapmada — tek farkla: her mumun fiyatı önce TÜFE
 * deflatörüyle bugünün lirasına çevrilir.
 *
 * Bir Türk hissesinin nominal VWAP'ı çok yıllık bir pencerede neredeyse anlamsızdır:
 * 2025 başında ödenen bir lira bugünkünden ~%35 daha fazla şey alıyordu, bu yüzden nominal
 * VWAP sahiplerin gerçekte ödediğini sistematik olarak olduğundan düşük gösterir. Reel VWAP
 * dürüst soruyu yanıtlar — "bugünün parasıyla, işlem gören ortalama lira bu hisse için ne ödedi?"
 */
import type { Candle } from "./technicals.js";
import { cpiAt, currentCpi } from "./inflation.js";

export interface VwapResult {
  /** Gerçekte kullanılan mum sayısı. */
  bars: number;
  from: string;
  to: string;
  /** Enflasyondan arındırılmış hlc3'ün hacim ağırlıklı ortalaması, bugünün TL'siyle. */
  realVwap: number;
  /** Aynı hesap, deflate etmeden — TradingView'un göstereceği değer. */
  nominalVwap: number;
  /** Reel serinin hacim ağırlıklı standart sapması. */
  realStdev: number;
  bands: { upper1: number; lower1: number; upper2: number; lower2: number; upper3: number; lower3: number };
  /** Güncel fiyatın reel VWAP'a göre farkı. Negatif = reel ortalama maliyetin altında işlem görüyor. */
  premiumPct: number;
  /** Güncel fiyatın reel VWAP'tan kaç hacim ağırlıklı σ uzakta olduğu. */
  zScore: number;
  /** Toplam hacmin reel olarak güncel fiyatın ÜSTÜNDE işlem gören payı. */
  volumeAbovePricePct: number;
}

const hlc3 = (c: Candle) => (c.h + c.l + c.c) / 3;

/**
 * @param candles kronolojik günlük mumlar
 * @param lookback sondan kaç muma çapalanacağı (undefined = tüm geçmiş)
 * @param asOfMs her şeyi bugünün yerine bu tarihin satın alma gücüyle değerle.
 *   Zamanda noktasal geriye dönük test (point-in-time backtest) için gerekir — 2024
 *   penceresinde bugünün TÜFE'sini kullanmak geleceğin enflasyonunu geçmiş puana sızdırır.
 */
export function realVwap(
  candles: Candle[],
  lookback?: number,
  asOfMs?: number
): VwapResult | null {
  const bars = lookback ? candles.slice(-lookback) : candles;
  if (bars.length < 20) return null;
  const anchorCpi = asOfMs === undefined ? currentCpi() : cpiAt(asOfMs);
  const deflatorToToday = (t: number) => anchorCpi / cpiAt(t);

  let sumVol = 0;
  let sumRealPV = 0;
  let sumNomPV = 0;
  const realPrices: number[] = [];

  for (const c of bars) {
    const vol = c.v > 0 ? c.v : 0;
    const src = hlc3(c);
    const real = src * deflatorToToday(c.t);
    realPrices.push(real);
    sumVol += vol;
    sumRealPV += vol * real;
    sumNomPV += vol * src;
  }
  if (sumVol === 0) return null;

  const realVwapValue = sumRealPV / sumVol;
  const nominalVwapValue = sumNomPV / sumVol;

  // hacim ağırlıklı varyans; ta.vwap'ın standart sapma bandı kurgusuyla aynı
  let weightedSqDev = 0;
  for (let i = 0; i < bars.length; i++) {
    const vol = bars[i].v > 0 ? bars[i].v : 0;
    weightedSqDev += vol * (realPrices[i] - realVwapValue) ** 2;
  }
  const stdev = Math.sqrt(weightedSqDev / sumVol);

  const price = bars[bars.length - 1].c;
  let volAbove = 0;
  for (let i = 0; i < bars.length; i++) {
    if (realPrices[i] > price) volAbove += bars[i].v > 0 ? bars[i].v : 0;
  }

  const r = (n: number) => Math.round(n * 10000) / 10000;
  return {
    bars: bars.length,
    from: new Date(bars[0].t).toISOString().slice(0, 10),
    to: new Date(bars[bars.length - 1].t).toISOString().slice(0, 10),
    realVwap: r(realVwapValue),
    nominalVwap: r(nominalVwapValue),
    realStdev: r(stdev),
    bands: {
      upper1: r(realVwapValue + stdev),
      lower1: r(realVwapValue - stdev),
      upper2: r(realVwapValue + 2 * stdev),
      lower2: r(realVwapValue - 2 * stdev),
      upper3: r(realVwapValue + 3 * stdev),
      lower3: r(realVwapValue - 3 * stdev),
    },
    premiumPct: r(((price - realVwapValue) / realVwapValue) * 100),
    zScore: r((price - realVwapValue) / stdev),
    volumeAbovePricePct: r((volAbove / sumVol) * 100),
  };
}

export interface RealVwapBundle {
  price: number;
  /** Son bir yıla, son iki yıla ve mevcut tüm geçmişe çapalanmış. */
  year1: VwapResult | null;
  year2: VwapResult | null;
  all: VwapResult | null;
  /** Bir yıl önceki reel (bugünün TL'siyle) fiyat; eşdeğer karşılaştırma için. */
  realPriceOneYearAgo: number | null;
  realChange1yPct: number | null;
  nominalChange1yPct: number | null;
}

export function realVwapBundle(candles: Candle[]): RealVwapBundle {
  const price = candles[candles.length - 1].c;
  const oneYearIdx = Math.max(0, candles.length - 252);
  const yearAgo = candles[oneYearIdx];
  const realYearAgo = yearAgo ? yearAgo.c * (currentCpi() / cpiAt(yearAgo.t)) : null;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    price,
    year1: realVwap(candles, 252),
    year2: realVwap(candles, 504),
    all: realVwap(candles),
    realPriceOneYearAgo: realYearAgo === null ? null : round2(realYearAgo),
    realChange1yPct: realYearAgo === null ? null : round2(((price - realYearAgo) / realYearAgo) * 100),
    nominalChange1yPct: yearAgo === null ? null : round2(((price - yearAgo.c) / yearAgo.c) * 100),
  };
}
