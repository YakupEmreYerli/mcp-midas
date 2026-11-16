/**
 * Reel (enflasyondan arındırılmış) hacim ağırlıklı ortalama fiyat.
 *
 * VWAP = Σ(tipik fiyat × hacim) / Σ(hacim), tipik fiyat = (yüksek + düşük + kapanış) / 3.
 * Reel sürümde her mumun tipik fiyatı önce serinin son mumunun tarihindeki liraya taşınır
 * (bkz. inflation.ts). Yüksek enflasyonda nominal VWAP, eski tarihlerde ödenen liraları
 * bugünküyle eş saydığı için ortalama maliyeti düşük gösterir; reel sürüm bunu düzeltir.
 *
 * Bantlar, reel fiyatların VWAP etrafındaki hacim ağırlıklı standart sapmasının 1, 2 ve 3
 * katıdır.
 */
import type { Candle } from "./technicals.js";
import { inflationFactor } from "./inflation.js";

export interface VwapResult {
  /** Hesaba giren mum sayısı. */
  bars: number;
  /** Pencerenin ilk ve son günü (YYYY-AA-GG). */
  from: string;
  to: string;
  /** Reel VWAP, son mumun tarihindeki TL ile. */
  realVwap: number;
  /** Enflasyon düzeltmesi olmadan aynı hesap. */
  nominalVwap: number;
  /** Reel tipik fiyatların hacim ağırlıklı standart sapması. */
  realStdev: number;
  bands: { upper1: number; lower1: number; upper2: number; lower2: number; upper3: number; lower3: number };
  /** Son kapanışın reel VWAP'tan yüzde farkı; eksi, ortalama reel maliyetin altı demek. */
  premiumPct: number;
  /** Son kapanışın reel VWAP'a uzaklığı, standart sapma cinsinden. */
  zScore: number;
  /** Reel tipik fiyatı son kapanışın üstünde kalan mumların hacim payı (%). */
  volumeAbovePricePct: number;
}

export interface RealVwapBundle {
  /** Son kapanış. */
  price: number;
  /** Son 252 mum (~1 yıl), son 504 mum (~2 yıl) ve eldeki bütün mumlar. */
  year1: VwapResult | null;
  year2: VwapResult | null;
  all: VwapResult | null;
  /** 252 mum önceki kapanış, bugünün lirasıyla. */
  realPriceOneYearAgo: number | null;
  realChange1yPct: number | null;
  nominalChange1yPct: number | null;
}

/** VWAP için gereken en az mum. */
const MIN_BARS = 20;

const to4 = (x: number) => Math.round(x * 1e4) / 1e4;
const to2 = (x: number) => Math.round(x * 100) / 100;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Mumların son `lookback` tanesi üzerinden reel VWAP.
 *
 * @param candles kronolojik mumlar
 * @param lookback pencere uzunluğu; verilmezse bütün mumlar
 * @param anchorMs reel fiyatların taşınacağı tarih; verilmezse son mumun tarihi
 */
export function realVwap(candles: Candle[], lookback?: number, anchorMs?: number): VwapResult | null {
  const window = lookback === undefined ? candles : candles.slice(-lookback);
  if (window.length < MIN_BARS) return null;

  const anchor = anchorMs ?? window[window.length - 1].t;
  const rows = window.map((c) => {
    const typical = (c.h + c.l + c.c) / 3;
    return {
      weight: Math.max(c.v, 0),
      nominal: typical,
      real: typical * inflationFactor(c.t, anchor),
    };
  });

  const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
  if (totalWeight === 0) return null;

  const weightedMean = (pick: (r: (typeof rows)[number]) => number) =>
    rows.reduce((s, r) => s + r.weight * pick(r), 0) / totalWeight;

  const center = weightedMean((r) => r.real);
  const sigma = Math.sqrt(weightedMean((r) => (r.real - center) ** 2));
  const last = window[window.length - 1].c;
  const weightAbove = rows.filter((r) => r.real > last).reduce((s, r) => s + r.weight, 0);

  const band = (k: number) => [to4(center + k * sigma), to4(center - k * sigma)] as const;
  const [upper1, lower1] = band(1);
  const [upper2, lower2] = band(2);
  const [upper3, lower3] = band(3);

  return {
    bars: window.length,
    from: isoDay(window[0].t),
    to: isoDay(window[window.length - 1].t),
    realVwap: to4(center),
    nominalVwap: to4(weightedMean((r) => r.nominal)),
    realStdev: to4(sigma),
    bands: { upper1, lower1, upper2, lower2, upper3, lower3 },
    premiumPct: to4(((last - center) / center) * 100),
    zScore: sigma > 0 ? to4((last - center) / sigma) : 0,
    volumeAbovePricePct: to4((weightAbove / totalWeight) * 100),
  };
}

/** get_technicals çıktısındaki `realVwap` bloğu. */
export function realVwapBundle(candles: Candle[]): RealVwapBundle {
  const latest = candles[candles.length - 1];
  const base = candles[Math.max(0, candles.length - 252)];
  const realBase = base.c * inflationFactor(base.t, latest.t);

  return {
    price: latest.c,
    year1: realVwap(candles, 252),
    year2: realVwap(candles, 504),
    all: realVwap(candles),
    realPriceOneYearAgo: to2(realBase),
    realChange1yPct: to2(((latest.c - realBase) / realBase) * 100),
    nominalChange1yPct: to2(((latest.c - base.c) / base.c) * 100),
  };
}
