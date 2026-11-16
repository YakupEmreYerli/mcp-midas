/**
 * Atlas'ın görüntüleme biçimindeki geçmiş satırlarını yapılandırılmış kayıtlara çeviren saf
 * yardımcılar. Ayrıştırma kuralları birim testlenebilsin diye burada G/Ç yoktur.
 */

const MONTHS: Record<string, number> = {
  ocak: 1,
  şubat: 2,
  mart: 3,
  nisan: 4,
  mayıs: 5,
  haziran: 6,
  temmuz: 7,
  ağustos: 8,
  eylül: 9,
  ekim: 10,
  kasım: 11,
  aralık: 12,
};

export type Currency = "TRY" | "USD" | "EUR";
export type TxStatus = "COMPLETED" | "PENDING" | "CANCELLED" | "REJECTED" | "EXPIRED";

export interface Money {
  amount: number;
  currency: Currency | null;
}

/**
 * Atlas para metnini ayrıştırır. Çoğu satır Türkçe biçim kullanır ("₺1.001,09"), ama bazı
 * ayrıntı sayfaları ondalık nokta kullanır ("₺317.40"); bu yüzden ardından 1–2 basamak gelen
 * tek nokta ondalık ayırıcı, diğer noktalar binlik ayırıcı sayılır.
 */
export function parseMoney(text: string | null | undefined): Money | null {
  if (!text) return null;
  const currency: Currency | null = text.includes("₺")
    ? "TRY"
    : text.includes("$")
      ? "USD"
      : text.includes("€")
        ? "EUR"
        : null;
  const match = text.match(/-?[\d.,]+/);
  if (!match || !/\d/.test(match[0])) return null;
  let raw = match[0];
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (!/^-?\d+\.\d{1,2}$/.test(raw)) raw = raw.replace(/\./g, "");
  const amount = Number(raw);
  return Number.isFinite(amount) ? { amount, currency } : null;
}

export interface DayMonth {
  day: number;
  month: number;
  year: number | null;
  time: string | null;
}

/** "17 Eylül", "17 Eylül 2026" ya da "17 Eylül 2026, 15:48:05". */
export function parseTurkishDate(text: string | null | undefined): DayMonth | null {
  if (!text) return null;
  const m = text
    .trim()
    .toLocaleLowerCase("tr-TR")
    .match(/^(\d{1,2})\s+([a-zçğıöşü]+)(?:\s+(\d{4}))?(?:,?\s+(\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (!month) return null;
  return { day: Number(m[1]), month, year: m[3] ? Number(m[3]) : null, time: m[4] ?? null };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Geçmiş listesi "17 Eylül" gösterir, yıl yoktur. Satırlar en yeni önce gelir, sırayla
 * gezilir: ayı bir aydan fazla ileride değilse ilk satır bu yıla aittir (valör tarihleri
 * birkaç gün ileride olabilir); geçmişe doğru giderken ay her ileri sıçradığında bir yıl
 * sınırı geçilmiştir.
 */
export function assignYears(
  dates: Array<DayMonth | null>,
  today: Date = new Date()
): Array<string | null> {
  let year = today.getFullYear();
  const thisMonth = today.getMonth() + 1;
  let previousMonth: number | null = null;
  return dates.map((d) => {
    if (!d) return null;
    if (d.year) {
      year = d.year;
    } else if (previousMonth === null) {
      if (d.month > thisMonth + 1) year -= 1;
    } else if (d.month > previousMonth) {
      year -= 1;
    }
    previousMonth = d.month;
    return isoDate(d.year ?? year, d.month, d.day);
  });
}

/** Satırın gri alt satırını ya da etiket metnini duruma eşler; bir şey söylemiyorsa null. */
export function statusFromText(text: string | null | undefined): TxStatus | null {
  if (!text) return null;
  const t = text.toLocaleLowerCase("tr-TR");
  if (t.includes("iptal")) return "CANCELLED";
  if (t.includes("redd") || t.includes("başarısız")) return "REJECTED";
  if (t.includes("süresi dol") || t.includes("zaman aşımı")) return "EXPIRED";
  if (t.includes("bekliyor") || t.includes("işlemde")) return "PENDING";
  if (t.includes("gerçekleşti") || t.includes("ödendi") || t.includes("tamamlandı")) return "COMPLETED";
  return null;
}

/** Türkçe işlem etiketinden yön: "piyasa alış", "USD/TL satış", "fon alış". */
export function sideFromTitle(title: string): "BUY" | "SELL" | null {
  const t = title.toLocaleLowerCase("tr-TR");
  if (/(^|\s)alış(\s|$)/.test(t)) return "BUY";
  if (/(^|\s)satış(\s|$)/.test(t)) return "SELL";
  return null;
}

/** ASCII, küçük harfli etiket: "TCELL kâr al, zarar durdur" işlemi → "kar al zarar durdur". */
export function asciiLabel(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[âà]/g, "a")
    .replace(/[îì]/g, "i")
    .replace(/[ûù]/g, "u")
    .replace(/usd\/tl/g, "usdtry")
    .replace(/eur\/tl/g, "eurtry")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "2026-09-17 15:48:06" (İstanbul yerel) → tarih ve saat parçaları. */
export function splitTimestamp(ts: string | null | undefined): { date: string; time: string | null } | null {
  const m = ts?.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/);
  return m ? { date: m[1], time: m[2] ?? null } : null;
}

/** Başlığı sembolle başlayan satır türlerinde başlık → sembol. */
export function symbolFromTitle(typeV2: string, title: string): string | null {
  if (typeV2 !== "ORDER" && typeV2 !== "DIVIDEND") return null;
  const first = title.trim().split(/\s+/)[0];
  return /^[A-Z0-9.]{1,12}$/.test(first) ? first : null;
}

/** Başlığı bir tarih adlandıran ilk ayrıntı satırı, ISO tarih ve saate ayrıştırılmış. */
export function dateFromDetailRows(rows: Record<string, string>): { date: string; time: string | null } | null {
  const preferred = ["Gerçekleşme tarihi", "İşlem tarihi", "Ödenme tarihi", "Emir tarihi", "Tarih"];
  const keys = [...preferred.filter((k) => k in rows), ...Object.keys(rows).filter((k) => /tarih/i.test(k))];
  for (const key of keys) {
    const d = parseTurkishDate(rows[key]);
    if (d?.year) return { date: isoDate(d.year, d.month, d.day), time: d.time };
  }
  return null;
}
