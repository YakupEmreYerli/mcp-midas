/**
 * TÜFE (Tüketici Fiyat Endeksi, CPI) deflatörü.
 *
 * Geçmiş bir tarihte gözlenen nominal TL tutarını bugünün satın alma gücüne çevirir;
 * böylece yüksek enflasyonlu bir dönemdeki fiyatlar dürüstçe karşılaştırılabilir.
 *
 * Seri aylık bir endekstir (baz keyfîdir — yalnız oranlar önemlidir). `source: "reported"`
 * işaretli değerler yayımlanmış TÜİK/TradingEconomics rakamlarına çapalıdır; `"interpolated"`
 * aylar çapalar arasında geometrik olarak doldurulur. Deflatör birikimli kullanıldığı için
 * bu güvenlidir — iki komşu ay arasındaki küçük bir dağıtım hatası yüzlerce günlük ağırlıklı
 * ortalamayı neredeyse kıpırdatmaz.
 *
 * Aylık güncelle: yeni açıklanan değeri CPI_SERIES'e ekle ve "reported" olarak işaretle.
 */

export interface CpiPoint {
  /** Ayın ilk günü, YYYY-MM. */
  month: string;
  index: number;
  source: "reported" | "interpolated" | "estimated";
  note?: string;
}

export const CPI_SERIES: CpiPoint[] = [
  { month: "2024-12", index: 84.34, source: "estimated", note: "Ocak-25 aylık +%5,03 değerinden geriye hesaplandı" },
  { month: "2025-01", index: 88.58, source: "estimated", note: "TÜİK aylık +%5,03" },
  { month: "2025-02", index: 90.59, source: "estimated", note: "TÜİK aylık +%2,27" },
  { month: "2025-03", index: 92.82, source: "reported", note: "= Mart-26 endeksi / (1+%30,87 yıllık)" },
  { month: "2025-04", index: 95.60, source: "reported", note: "= Nisan-26 endeksi / (1+%32,37 yıllık)" },
  { month: "2025-05", index: 97.07, source: "reported", note: "= Mayıs-26 128.72 / 1.3261" },
  { month: "2025-06", index: 98.39, source: "reported", note: "= Haziran-26 129.99 / 1.3211" },
  { month: "2025-07", index: 100.77, source: "interpolated" },
  { month: "2025-08", index: 103.21, source: "interpolated" },
  { month: "2025-09", index: 105.71, source: "interpolated" },
  { month: "2025-10", index: 108.27, source: "interpolated" },
  { month: "2025-11", index: 110.89, source: "interpolated" },
  { month: "2025-12", index: 113.57, source: "interpolated" },
  { month: "2026-01", index: 116.32, source: "interpolated" },
  { month: "2026-02", index: 119.16, source: "reported", note: "= Mart-26 121.47 / 1.0194" },
  { month: "2026-03", index: 121.47, source: "reported", note: "= Nisan-26 126.55 / 1.0418" },
  { month: "2026-04", index: 126.55, source: "reported", note: "= Mayıs-26 128.72 / 1.0171" },
  { month: "2026-05", index: 128.72, source: "reported", note: "TradingEconomics TÜFE düzeyi, yıllık %32,61" },
  { month: "2026-06", index: 129.99, source: "reported", note: "TradingEconomics TÜFE düzeyi, yıllık %32,11, aylık +%0,99" },
  { month: "2026-07", index: 132.59, source: "estimated", note: "TCMB temmuzda geçici bir artışa işaret etti; aylık +%2,0 varsayıldı" },
  { month: "2026-08", index: 134.31, source: "estimated", note: "aylık +%1,3 varsayıldı" },
];

/** Bilinen son 6 ayın ortalama aylık enflasyonu — serinin uçlarının dışına taşırken kullanılır. */
function tailMonthlyRate(): number {
  const n = CPI_SERIES.length;
  const a = CPI_SERIES[n - 7].index;
  const b = CPI_SERIES[n - 1].index;
  return (b / a) ** (1 / 6);
}

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Bir zaman damgası için TÜFE endeksi. Seri içindeki aylar, çevreleyen ay başı değerleri
 * arasında doğrusal olarak ara değerlenir (ay içi kayma pürüzsüz olsun diye); seri dışındaki
 * aylar son dönemin ortalama oranıyla dışa taşınır.
 */
export function cpiAt(timestampMs: number): number {
  const key = monthKey(timestampMs);
  const first = CPI_SERIES[0];
  const last = CPI_SERIES[CPI_SERIES.length - 1];
  const rate = tailMonthlyRate();

  if (key < first.month) return first.index * rate ** monthsBetween(first.month, key);
  if (key >= last.month) return last.index * rate ** monthsBetween(last.month, key);

  const i = CPI_SERIES.findIndex((p) => p.month === key);
  if (i === -1) {
    // ay tabloda hiç yok — önceki bilinen aydan hesapla
    const before = [...CPI_SERIES].reverse().find((p) => p.month < key)!;
    return before.index * rate ** monthsBetween(before.month, key);
  }

  // ay içinde, sonraki ayın düzeyine doğru doğrusal
  const next = CPI_SERIES[i + 1] ?? { index: CPI_SERIES[i].index * rate };
  const d = new Date(timestampMs);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const frac = (d.getUTCDate() - 1) / daysInMonth;
  return CPI_SERIES[i].index + (next.index - CPI_SERIES[i].index) * frac;
}

/** "Bugün" olarak kullanılan endeks düzeyi — serinin son kaydı. */
export function currentCpi(): number {
  return CPI_SERIES[CPI_SERIES.length - 1].index;
}

/**
 * `timestampMs` tarihindeki nominal TL tutarını bugünün TL'sine çeviren çarpan.
 * Bir yıl önceki fiyat yaklaşık (1 + yıllık enflasyon) ile çarpılır.
 */
export function deflatorToToday(timestampMs: number): number {
  return currentCpi() / cpiAt(timestampMs);
}
