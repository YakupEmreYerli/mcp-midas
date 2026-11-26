/** Araç sonuçlarının kısa düz metin hâli. Ham veri için `--json`. */
import { defineMessages, language, locale } from "../i18n.js";

const M = defineMessages(
  {
    session: "Oturum",
    refreshUntil: "yenileme bitişi",
    portfolio: "Portföy",
    day: "gün",
    cash: "nakit",
    buyingPower: "alım gücü",
    withdrawable: "çekilebilir",
    noPositions: "Açık pozisyon yok.",
    noOrders: "Bekleyen emir yok.",
    noTransactions: "Bu aralıkta hareket yok.",
    previousClose: "önceki kapanış",
    session2: "seans",
    notTradable: "Atlas'ta emir verilemez",
    ambiguous: (list: string) => `Sembol birden çok enstrümanla eşleşiyor (--market ile seçin): ${list}`,
    more: (n: number) => `… ${n} satır daha (--offset ile devam)`,
    candles: (n: number, interval: string) => `${n} mum (${interval}), son 10:`,
    headPositions: ["SEMBOL", "ADET", "MALİYET", "FİYAT", "DEĞER", "K/Z %"],
    headOrders: ["EMİR", "SEMBOL", "YÖN", "TİP", "ADET", "FİYAT", "DURUM"],
    headHistory: ["TARİH", "SEMBOL/AÇIKLAMA", "YÖN", "ADET", "FİYAT", "TUTAR", "DURUM"],
  },
  {
    session: "Session",
    refreshUntil: "refresh expires",
    portfolio: "Portfolio",
    day: "day",
    cash: "cash",
    buyingPower: "buying power",
    withdrawable: "withdrawable",
    noPositions: "No open positions.",
    noOrders: "No pending orders.",
    noTransactions: "No activity in this range.",
    previousClose: "previous close",
    session2: "session",
    notTradable: "can't be traded in Atlas",
    ambiguous: (list) => `The symbol matches several instruments (pick one with --market): ${list}`,
    more: (n) => `… ${n} more rows (continue with --offset)`,
    candles: (n, interval) => `${n} candles (${interval}), last 10:`,
    headPositions: ["SYMBOL", "QTY", "AVG COST", "PRICE", "VALUE", "P/L %"],
    headOrders: ["ORDER", "SYMBOL", "SIDE", "TYPE", "QTY", "PRICE", "STATUS"],
    headHistory: ["DATE", "SYMBOL/TITLE", "SIDE", "QTY", "PRICE", "AMOUNT", "STATUS"],
  }
);

type Row = Record<string, any>;

/** Sayı yerel biçimde; null/undefined "-". */
export function num(value: unknown, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString(locale(language()), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Adet: kesirli değilse ondalıksız. */
export function qty(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString(locale(language()), { maximumFractionDigits: 6 });
}

export function pct(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${num(value)}%`;
}

/** Sütunları hizalı basit tablo. */
export function table(head: string[], rows: string[][]): string {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => (c ?? "").padEnd(widths[i])).join("  ").trimEnd();
  return [line(head), ...rows.map(line)].join("\n");
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") return Number.isInteger(value) ? qty(value) : num(value, Math.abs(value) < 10 ? 4 : 2);
  return String(value);
}

/** Bilinmeyen yapıdaki veriyi girintili "anahtar: değer" satırlarına çevirir. */
export function generic(value: unknown, indent = ""): string {
  if (value === null || typeof value !== "object") return indent + scalar(value);
  if (Array.isArray(value)) {
    if (!value.length) return indent + "-";
    if (value.every((v) => v === null || typeof v !== "object")) return indent + value.map(scalar).join(", ");
    return value.map((v) => `${indent}-\n${generic(v, indent + "  ")}`).join("\n");
  }
  const lines: string[] = [];
  for (const [key, v] of Object.entries(value)) {
    if (v !== null && typeof v === "object" && !(Array.isArray(v) && v.every((x) => x === null || typeof x !== "object"))) {
      lines.push(`${indent}${key}:`);
      lines.push(generic(v, indent + "  "));
    } else {
      lines.push(`${indent}${key}: ${Array.isArray(v) ? v.map(scalar).join(", ") || "-" : scalar(v)}`);
    }
  }
  return lines.join("\n");
}

function ambiguity(data: Row): string[] {
  if (!data?.ambiguousSymbol || !Array.isArray(data.candidates)) return [];
  const list = data.candidates.map((c: Row) => [c.symbol, c.market ?? c.country, c.name ?? c.title].filter(Boolean).join(" ")).join("; ");
  return [M().ambiguous(list)];
}

export function formatStatus(data: Row): string {
  const until = data.refreshExpiresAt ? ` · ${M().refreshUntil} ${String(data.refreshExpiresAt).replace("T", " ").slice(0, 16)} UTC` : "";
  return `${M().session}: ${data.status}${until}`;
}

export function formatPortfolio(data: Row): string {
  const day = data.dayProfitLoss;
  const lines = [
    `${M().portfolio}: ${num(data.portfolioValueTry)} TRY` +
      (day ? ` · ${M().day}: ${num(day.value)} TRY (${pct(day.percentage)})` : ""),
  ];
  for (const acc of data.accounts ?? []) {
    lines.push(
      `${acc.assetVertical} ${acc.currency}: ${M().cash} ${num(acc.cash)} · ${M().buyingPower} ${num(acc.buyingPower)} · ${M().withdrawable} ${num(acc.withdrawableCash)}`
    );
  }
  return lines.join("\n");
}

export function formatPositions(data: Row[]): string {
  if (!Array.isArray(data) || !data.length) return M().noPositions;
  const rows = data.map((p) => [
    `${p.symbol}${p.market === "US" ? " (US)" : ""}`,
    qty(p.quantity),
    num(p.averageCost, 4),
    num(p.price, 4),
    `${num(p.marketValue)} ${p.currency ?? ""}`.trim(),
    pct(p.profitLossPercent),
  ]);
  return table(M().headPositions, rows);
}

export function formatPrice(data: Row): string {
  const lines = [
    `${data.symbol}${data.name ? ` (${data.name})` : ""}: ${num(data.price, 4)} ${data.currency ?? ""} (${pct(data.changePercent)})` +
      ` · ${M().previousClose} ${num(data.previousClose, 4)}` +
      (data.sessionStatus ? ` · ${M().session2} ${data.sessionStatus}` : "") +
      (data.tradable === false ? ` · ${M().notTradable}` : ""),
    ...ambiguity(data),
  ];
  return lines.join("\n");
}

export function formatInfo(data: Row): string {
  const { stats, digest } = data;
  const summary = { market: data.market, investmentType: data.investmentType, riskLevel: data.riskLevel, description: data.description };
  const parts = [formatPrice(data), generic(Object.fromEntries(Object.entries(summary).filter(([, v]) => v != null)))];
  if (stats && Object.keys(stats).length) parts.push(generic(stats));
  if (digest?.comment) parts.push(`${digest.direction ?? ""} ${digest.comment}`.trim());
  return parts.join("\n");
}

export function formatChart(data: Row): string {
  const candles: Row[] = data.candles ?? [];
  const rows = candles.slice(-10).map((k) => [
    new Date(k.t).toISOString().slice(0, 16).replace("T", " "),
    num(k.o, 4), num(k.h, 4), num(k.l, 4), num(k.c, 4), qty(k.v),
  ]);
  return [`${data.symbol}: ${M().candles(data.count ?? candles.length, data.interval)}`, table(["t", "o", "h", "l", "c", "v"], rows)].join("\n");
}

/** Bekleyen emir satırı: hem tüm hesap özeti (orderId) hem enstrüman listesi (uid) biçimi. */
export function orderId(o: Row): string {
  return String(o.orderId ?? o.uid ?? "-");
}

export function formatOrders(data: Row): string {
  const orders: Row[] = data.orders ?? [];
  if (!orders.length) return [M().noOrders, ...ambiguity(data)].join("\n");
  const rows = orders.map((o) => [
    orderId(o),
    o.symbol ?? data.symbol ?? "-",
    o.side ?? "-",
    o.orderType ?? o.type ?? "-",
    qty(o.quantity),
    num(o.limitPrice ?? o.stopPrice ?? o.profitPrice ?? o.lossPrice, 4),
    o.statusText ?? o.status ?? "-",
  ]);
  return [table(M().headOrders, rows), ...ambiguity(data)].join("\n");
}

export function formatTransactions(data: Row): string {
  const txs: Row[] = data.transactions ?? [];
  if (!txs.length) return M().noTransactions;
  const rows = txs.map((t) => [
    [t.date, t.time].filter(Boolean).join(" ") || "-",
    t.symbol ?? t.title ?? "-",
    t.side ?? "-",
    qty(t.quantity),
    num(t.price, 4),
    `${num(t.amount)} ${t.currency ?? ""}`.trim(),
    t.status ?? "-",
  ]);
  const out = [table(M().headHistory, rows)];
  if (data.hasMore) out.push(M().more(data.total - data.offset - data.count));
  return out.join("\n");
}

export function formatFilters(data: Row[]): string {
  if (!Array.isArray(data)) return generic(data);
  return data.map((f) => `${f.parentId ? "  " : ""}${f.id}  ${f.name ?? ""}`.trimEnd()).join("\n");
}
