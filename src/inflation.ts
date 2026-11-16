/**
 * Türkiye TÜFE fiyat düzeyi: geçmiş bir tarihteki TL tutarını başka bir tarihin
 * satın alma gücüne taşımak için.
 *
 * Kaynak, TÜİK'in açıkladığı aylık TÜFE değişim oranlarıdır (TCMB "Tüketici Fiyatları"
 * tablosu). Düzey bu oranların zincirlenmesiyle kurulur; tabanın bir anlamı yoktur, yalnız
 * iki tarihin oranı kullanılır. TÜİK'in 2026'da 2025=100 tabanına geçmesi oranları
 * değiştirmez.
 *
 * Her ayın endeksi o ayın ortalama fiyat düzeyidir; bu yüzden ayın ortasına yerleştirilir
 * ve iki ay ortası arasında zamana göre doğrusal geçilir. Tablonun bittiği yerden sonrası
 * (ve öncesi) son altı ayın ortalama aylık artışıyla uzatılır.
 *
 * Yeni ay açıklandığında `MONTHLY_CHANGE_PCT` sonuna eklenir.
 */

/** İlk oranın ait olduğu ay. */
const FIRST_MONTH = { year: 2023, month: 1 };

/** Aylık TÜFE değişimi (%), FIRST_MONTH'tan başlayarak ardışık aylar. */
const MONTHLY_CHANGE_PCT: readonly number[] = [
  // 2023
  6.65, 3.15, 2.29, 2.39, 0.04, 3.92, 9.49, 9.09, 4.75, 3.43, 3.28, 2.93,
  // 2024
  6.7, 4.53, 3.16, 3.18, 3.37, 1.64, 3.23, 2.47, 2.97, 2.88, 2.24, 1.03,
  // 2025
  5.03, 2.27, 2.46, 3.0, 1.53, 1.37, 2.06, 2.04, 3.23, 2.55, 0.87, 0.89,
  // 2026
  4.84, 2.96, 1.94, 4.18, 1.71, 0.99, 1.78, 1.84, 1.84, 2.58,
];

const DAY_MS = 86_400_000;

/** Zincirlenmiş aylık düzeyler; ilk ay 100. */
const LEVELS: number[] = MONTHLY_CHANGE_PCT.reduce<number[]>((acc, pct, i) => {
  acc.push(i === 0 ? 100 : acc[i - 1] * (1 + pct / 100));
  return acc;
}, []);

/** Tablonun ucundan dışarı taşırken kullanılan aylık çarpan (son 6 ayın geometrik ortalaması). */
const TAIL_FACTOR = (() => {
  const recent = MONTHLY_CHANGE_PCT.slice(-6);
  const product = recent.reduce((p, pct) => p * (1 + pct / 100), 1);
  return product ** (1 / recent.length);
})();

/** Tablodaki i. ayın ortasının zaman damgası (UTC). */
function monthMidpoint(i: number): number {
  const y = FIRST_MONTH.year;
  const m = FIRST_MONTH.month - 1 + i;
  const start = Date.UTC(y, m, 1);
  const end = Date.UTC(y, m + 1, 1);
  return (start + end) / 2;
}

/** Ortalama ay uzunluğu; tablo dışına taşırken ay sayısını kesirli hesaplamak için. */
const AVG_MONTH_MS = 30.4375 * DAY_MS;

/** Verilen andaki TÜFE düzeyi (göreli birim). */
export function priceLevelAt(timestampMs: number): number {
  const lastIdx = LEVELS.length - 1;
  const firstMid = monthMidpoint(0);
  const lastMid = monthMidpoint(lastIdx);

  if (timestampMs <= firstMid) {
    return LEVELS[0] * TAIL_FACTOR ** ((timestampMs - firstMid) / AVG_MONTH_MS);
  }
  if (timestampMs >= lastMid) {
    return LEVELS[lastIdx] * TAIL_FACTOR ** ((timestampMs - lastMid) / AVG_MONTH_MS);
  }

  // timestampMs iki ay ortası arasında: hangi aralıkta olduğunu bul, doğrusal geç.
  let lo = 0;
  while (monthMidpoint(lo + 1) < timestampMs) lo++;
  const a = monthMidpoint(lo);
  const b = monthMidpoint(lo + 1);
  const w = (timestampMs - a) / (b - a);
  return LEVELS[lo] + (LEVELS[lo + 1] - LEVELS[lo]) * w;
}

/** `fromMs` tarihindeki 1 TL'nin `toMs` tarihindeki karşılığı. */
export function inflationFactor(fromMs: number, toMs: number): number {
  return priceLevelAt(toMs) / priceLevelAt(fromMs);
}
