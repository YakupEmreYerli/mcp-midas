/**
 * Saf gösterge hesapları. Hepsi kronolojik (eskiden yeniye) dizi alır, son değeri döner ve
 * veri yetmediğinde null verir. Yuvarlama burada yapılmaz; çağıran yapar.
 */

export interface Bar {
  h: number;
  l: number;
  c: number;
}

function mean(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Son `n` değerin aritmetik ortalaması. */
export function simpleAverage(xs: readonly number[], n: number): number | null {
  return xs.length >= n ? mean(xs.slice(xs.length - n)) : null;
}

/**
 * Üstel hareketli ortalama dizisi, α = 2 / (n + 1). İlk değer ilk `n` elemanın basit
 * ortalamasıdır; dizi bu yüzden girdiden `n - 1` kısa olur.
 */
export function exponentialSeries(xs: readonly number[], n: number): number[] {
  if (xs.length < n) return [];
  const alpha = 2 / (n + 1);
  const series = [mean(xs.slice(0, n))];
  for (let i = n; i < xs.length; i++) {
    const prev = series[series.length - 1];
    series.push(prev + alpha * (xs[i] - prev));
  }
  return series;
}

export function exponentialAverage(xs: readonly number[], n: number): number | null {
  const series = exponentialSeries(xs, n);
  return series.length ? series[series.length - 1] : null;
}

/**
 * Wilder RSI. İlk ortalama kazanç/kayıp ilk `n` değişimin basit ortalaması, sonrası
 * (önceki × (n − 1) + yeni) / n ile yumuşatılır. Hiç kayıp yoksa 100.
 */
export function relativeStrength(closes: readonly number[], n = 14): number | null {
  if (closes.length <= n) return null;
  let up = 0;
  let down = 0;
  closes.forEach((c, i) => {
    if (i === 0) return;
    const move = c - closes[i - 1];
    const gain = Math.max(move, 0);
    const loss = Math.max(-move, 0);
    if (i <= n) {
      up += gain / n;
      down += loss / n;
    } else {
      up = (up * (n - 1) + gain) / n;
      down = (down * (n - 1) + loss) / n;
    }
  });
  return down === 0 ? 100 : 100 - 100 / (1 + up / down);
}

export interface MacdValue {
  macd: number;
  signal: number;
  histogram: number;
}

/**
 * MACD(hızlı, yavaş, sinyal): hızlı EMA − yavaş EMA çizgisi ve onun EMA'sı olan sinyal.
 * Çizgi, yavaş EMA'nın başladığı günden itibaren kurulur.
 */
export function macdLine(closes: readonly number[], fast = 12, slow = 26, signalLen = 9): MacdValue | null {
  if (closes.length < slow + signalLen) return null;
  const fastEma = exponentialSeries(closes, fast);
  const slowEma = exponentialSeries(closes, slow);
  const lag = slow - fast; // hızlı dizi bu kadar erken başlar
  const line = slowEma.map((s, i) => fastEma[i + lag] - s);
  const signal = exponentialAverage(line, signalLen);
  if (signal === null) return null;
  const last = line[line.length - 1];
  return { macd: last, signal, histogram: last - signal };
}

/** Gerçek aralık: max(yüksek − düşük, |yüksek − önceki kapanış|, |düşük − önceki kapanış|). */
export function trueRanges(bars: readonly Bar[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const { h, l } = bars[i];
    const pc = bars[i - 1].c;
    out.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return out;
}

/** Ortalama gerçek aralık: son `n` gerçek aralığın basit ortalaması. */
export function averageTrueRange(bars: readonly Bar[], n = 14): number | null {
  return bars.length > n ? simpleAverage(trueRanges(bars), n) : null;
}

/**
 * Yıllık oynaklık (%): son `days` günlük logaritmik getirinin örneklem standart sapması
 * × √252 × 100.
 */
export function yearlyVolatilityPct(closes: readonly number[], days = 30): number | null {
  if (closes.length <= days) return null;
  const rets: number[] = [];
  for (let i = closes.length - days; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const m = mean(rets);
  const sampleVar = rets.reduce((s, r) => s + (r - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(sampleVar * 252) * 100;
}

/** Bollinger bantları: `n` günlük SMA ± k × (aynı pencerenin anakütle standart sapması). */
export function bollingerBands(closes: readonly number[], n = 20, k = 2) {
  if (closes.length < n) return null;
  const window = closes.slice(closes.length - n);
  const middle = mean(window);
  const sd = Math.sqrt(mean(window.map((x) => (x - middle) ** 2)));
  return { middle, upper: middle + k * sd, lower: middle - k * sd };
}

export interface PriceLevel {
  level: number;
  touches: number;
}

/**
 * Fraktal dönüş noktaları: yükseği iki yanındaki `reach` mumun hepsinden kesin büyük olan
 * mum tepe, düşüğü hepsinden kesin küçük olan dip sayılır. Serinin iki ucundaki `reach`
 * mum aday olamaz.
 */
export function swingPoints(bars: readonly Bar[], reach = 3): { peaks: number[]; troughs: number[] } {
  const peaks: number[] = [];
  const troughs: number[] = [];
  for (let i = reach; i + reach < bars.length; i++) {
    const neighbours = [...bars.slice(i - reach, i), ...bars.slice(i + 1, i + reach + 1)];
    if (neighbours.every((b) => b.h < bars[i].h)) peaks.push(bars[i].h);
    if (neighbours.every((b) => b.l > bars[i].l)) troughs.push(bars[i].l);
  }
  return { peaks, troughs };
}

/**
 * Yakın fiyatları tek seviyede toplar. Değerler küçükten büyüğe gezilir; her değer, ortalaması
 * kendisine `tolerance` kadar yakın ilk kümeye katılır (küme ortalaması güncellenir), yoksa
 * yeni küme açar.
 */
export function groupLevels(values: readonly number[], tolerance: number): PriceLevel[] {
  const groups: PriceLevel[] = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    const g = groups.find((x) => Math.abs(x.level - v) <= tolerance);
    if (!g) {
      groups.push({ level: v, touches: 1 });
      continue;
    }
    g.level += (v - g.level) / (g.touches + 1);
    g.touches++;
  }
  return groups;
}
