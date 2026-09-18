/**
 * Pure helpers that turn Atlas' display-shaped history rows into structured records.
 * No I/O here so the parsing rules stay unit-testable.
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
 * Parse an Atlas money string. Most rows use Turkish formatting ("₺1.001,09"), but some
 * detail sheets use a dot decimal ("₺317.40"), so a lone dot followed by 1–2 digits is
 * read as a decimal point and any other dot as a thousands separator.
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

/** "17 Eylül", "17 Eylül 2026" or "17 Eylül 2026, 15:48:05". */
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
 * The history list shows "17 Eylül" without a year. Rows arrive newest first, so walk
 * them in order: the first row belongs to the current year unless its month lies more
 * than a month ahead (value dates can be a few days in the future), and each time the
 * month jumps forward while walking back in time a year boundary was crossed.
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

/** Map the grey sub-line / tag text of a row to a status; null when it says nothing. */
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

/** Side from a Turkish action label: "piyasa alış", "USD/TL satış", "fon alış". */
export function sideFromTitle(title: string): "BUY" | "SELL" | null {
  const t = title.toLocaleLowerCase("tr-TR");
  if (/(^|\s)alış(\s|$)/.test(t)) return "BUY";
  if (/(^|\s)satış(\s|$)/.test(t)) return "SELL";
  return null;
}

/** ASCII, lower-case label: "TCELL kâr al, zarar durdur" action → "kar al zarar durdur". */
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

/** "2026-09-17 15:48:06" (Istanbul local) → date and time parts. */
export function splitTimestamp(ts: string | null | undefined): { date: string; time: string | null } | null {
  const m = ts?.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/);
  return m ? { date: m[1], time: m[2] ?? null } : null;
}

/** Title → symbol for row kinds whose title starts with the ticker. */
export function symbolFromTitle(typeV2: string, title: string): string | null {
  if (typeV2 !== "ORDER" && typeV2 !== "DIVIDEND") return null;
  const first = title.trim().split(/\s+/)[0];
  return /^[A-Z0-9.]{1,12}$/.test(first) ? first : null;
}

/** First detail row whose title names a date, parsed to ISO date and time. */
export function dateFromDetailRows(rows: Record<string, string>): { date: string; time: string | null } | null {
  const preferred = ["Gerçekleşme tarihi", "İşlem tarihi", "Ödenme tarihi", "Emir tarihi", "Tarih"];
  const keys = [...preferred.filter((k) => k in rows), ...Object.keys(rows).filter((k) => /tarih/i.test(k))];
  for (const key of keys) {
    const d = parseTurkishDate(rows[key]);
    if (d?.year) return { date: isoDate(d.year, d.month, d.day), time: d.time };
  }
  return null;
}
