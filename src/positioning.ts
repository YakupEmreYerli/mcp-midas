/**
 * Reel VWAP konumlanma terimi (docs/analiz-kurallari.md v3.2).
 *
 * Bant (tape) terimi gibi, Q/P harmanından SONRA uygulanan sınırlı bir düzeltmedir. Fiyatın,
 * sahiplerin bugünün lirasıyla gerçekte ödediğine göre nerede durduğunu sorar — bir akış /
 * konumlanma sorusu. Reel VWAP fiyattan türediği ve onu adil değer çapası olarak kullanmak
 * döngüsel olacağı için Değerleme (Valuation) alt puanının bilerek dışında tutulur.
 *
 * Biçim monoton değildir ve doğrudan geriye dönük testten (backtest) gelir (29 BIST hissesi,
 * Kasım 2023 – Nisan 2026, 3.478 noktasal gözlem, aynı tarihteki emsal ortalamasına göre
 * getiriler):
 *
 *   z ≤ −2 (derin teslimiyet)   n=189    63g fazla getiri  +0.58%
 *   z −2..−1                    n=1139   63g fazla getiri  −3.15%   ← çalışmadaki en kötü grup
 *   z −1..0                     n=871    63g fazla getiri  −2.10%
 *   z 0..+1                     n=536    63g fazla getiri  +1.47%
 *   z +1..+2                    n=520    63g fazla getiri  +6.59%   ← en iyi grup
 *   z > +2                      n=223    63g fazla getiri  +4.90%
 *
 * ve aynı ucuzlukta asıl sinyali taşıyan ayrım:
 *   derin + dengeleniyor        n=529    63g fazla getiri  +0.08%
 *   derin + hâlâ düşüyor        n=158    63g fazla getiri  −3.97%
 *
 * Bu yüzden: uç kuyruğu yalnız teyit edildiğinde ödüllendir, hafif zayıflığı cezalandır
 * (paranın asıl kaybedildiği yer orası) ve teyitli gücü ödüllendir.
 *
 * −z ile 63 günlük getiri arasındaki ortalama bilgi katsayısı (IC) −0.159 idi; yani tüm
 * aralıkta momentum ortalamaya dönüşü (mean reversion) yendi. "Daha ucuz her zaman daha iyi"
 * biçiminin burada KULLANILMAMASININ nedeni bu.
 */
import type { Candle } from "./technicals.js";
import { realVwap, type VwapResult } from "./vwap.js";

export interface Positioning {
  vwap: VwapResult | null;
  z: number | null;
  premiumPct: number | null;
  /** Penceredeki hacmin reel olarak güncel fiyatın üstünde işlem gören payı. */
  volumeAbovePricePct: number | null;
  /** Reel VWAP'ın çok altında VE serbest düşüş yerine dip oluşturma davranışı gösteriyor. */
  stabilizing: boolean;
  stabilizingReasons: string[];
  /** Sınırlı düzeltme, −5 … +10; risk katmanından sonra FINAL puana eklenir. */
  term: number;
  bucket: string;
  rationale: string;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) g += d;
    else l -= d;
  }
  let ag = g / period;
  let al = l / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

/** Fiyatın altındaki en yakın salınım dibi desteği. */
function nearestSupport(candles: Candle[], price: number, span = 3) {
  const lows: number[] = [];
  for (let i = span; i < candles.length - span; i++) {
    let isLow = true;
    for (let j = i - span; j <= i + span; j++) {
      if (j !== i && candles[j].l <= candles[i].l) isLow = false;
    }
    if (isLow) lows.push(candles[i].l);
  }
  const tol = price * 0.02;
  const groups: { level: number; touches: number }[] = [];
  for (const p of [...lows].sort((a, b) => a - b)) {
    const g = groups.find((x) => Math.abs(x.level - p) <= tol);
    if (g) {
      g.level = (g.level * g.touches + p) / (g.touches + 1);
      g.touches += 1;
    } else {
      groups.push({ level: p, touches: 1 });
    }
  }
  return groups.filter((g) => g.level < price).sort((a, b) => b.level - a.level)[0] ?? null;
}

export function computePositioning(candles: Candle[], asOfMs?: number): Positioning {
  const v = realVwap(candles, 252, asOfMs);
  const price = candles[candles.length - 1].c;
  const closes = candles.map((c) => c.c);
  const vols = candles.map((c) => c.v);

  if (!v) {
    return {
      vwap: null,
      z: null,
      premiumPct: null,
      volumeAbovePricePct: null,
      stabilizing: false,
      stabilizingReasons: [],
      term: 0,
      bucket: "yetersiz geçmiş",
      rationale: "20 mumdan az — konumlanma terimi atlandı",
    };
  }

  const z = v.zScore;
  const reasons: string[] = [];

  const sup = nearestSupport(candles, price);
  if (sup && sup.touches >= 2 && price <= sup.level * 1.05) {
    reasons.push(`${sup.touches} temaslı ₺${sup.level.toFixed(2)} desteği tutuyor`);
  }
  const avg5 = mean(vols.slice(-5));
  const avg20 = mean(vols.slice(-20));
  if (avg5 > avg20) {
    reasons.push(`hacim artıyor (5g, 20g'ye göre ${(avg5 / avg20 - 1) * 100 >= 0 ? "+" : ""}%${((avg5 / avg20 - 1) * 100).toFixed(0)})`);
  }
  const rsiNow = rsi(closes);
  const rsiPrev = rsi(closes.slice(0, -5));
  if (rsiNow !== null && rsiPrev !== null && rsiPrev < 32 && rsiNow > rsiPrev + 3) {
    reasons.push(`RSI ${rsiPrev.toFixed(0)} seviyesinden yukarı dönüyor`);
  }

  const stabilizing = z <= -1.5 && reasons.length > 0;

  let term: number;
  let bucket: string;
  let rationale: string;

  if (z <= -2 && stabilizing) {
    term = 10;
    bucket = "derin teslimiyet, teyitli";
    rationale = `reel VWAP'ın ${z.toFixed(2)}σ altında, ${reasons.join(" + ")} — geriye dönük testte ucuz taraftaki en iyi grup`;
  } else if (z <= -2) {
    term = 2;
    bucket = "derin teslimiyet, teyitsiz";
    rationale = `reel VWAP'ın ${z.toFixed(2)}σ altında ama hâlâ düşüyor (destek tutmuyor, hacim artmıyor, RSI dönmüyor) — tarihsel olarak 63 günde −%3,97 fazla getiri`;
  } else if (z <= -0.5) {
    term = -5;
    bucket = "hafif zayıflık (tehlike bölgesi)";
    rationale = `reel VWAP'ın ${z.toFixed(2)}σ altında — geriye dönük testte en kötü performanslı grup (63 günde −%3,15 fazla getiri, n=1139): cazip görünecek kadar ucuz, teslimiyete varacak kadar değil`;
  } else if (z <= 1) {
    term = 0;
    bucket = "reel VWAP yakınında";
    rationale = `reel VWAP'a ${z.toFixed(2)}σ uzaklıkta — iki yönde de konumlanma avantajı yok`;
  } else if (z <= 2) {
    term = 5;
    bucket = "teyitli güç";
    rationale = `reel VWAP'ın ${z.toFixed(2)}σ üstünde — geriye dönük testin en iyi grubu (63 günde +%6,59 fazla getiri)`;
  } else {
    term = 0;
    bucket = "aşırı uzamış";
    rationale = `reel VWAP'ın ${z.toFixed(2)}σ üstünde — tarihsel olarak hâlâ pozitif ama sönümleniyor; parabolik uzama cezası tepe patlaması (blowoff) riskini zaten karşılıyor`;
  }

  return {
    vwap: v,
    z,
    premiumPct: v.premiumPct,
    volumeAbovePricePct: v.volumeAbovePricePct,
    stabilizing,
    stabilizingReasons: reasons,
    term,
    bucket,
    rationale,
  };
}
