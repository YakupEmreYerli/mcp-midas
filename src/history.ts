/**
 * Salt okunur hesap geçmişi: "İşlem geçmişi" listesi yapılandırılmış emir akışıyla
 * birleştirilir; ayrıca tüm bekleyen emirler tek çağrıda alınır. Buradan hiçbir mutation
 * gönderilmez.
 */
import { gql, MidasApiError } from "./api.js";
import { session } from "./session.js";
import * as Q from "./queries.js";
import {
  assignYears,
  dateFromDetailRows,
  parseMoney,
  parseTurkishDate,
  sideFromTitle,
  splitTimestamp,
  statusFromText,
  symbolFromTitle,
  type Currency,
  type TxStatus,
} from "./history-parse.js";

const HISTORY_PAGE = 50;
const MAX_HISTORY_PAGES = 40;
const ORDER_PAGE = 100;
const MAX_ORDER_PAGES = 20;

interface HistoryRow {
  uid: string;
  accountUid: string;
  type: string;
  typeV2: string;
  detail: {
    title: string;
    titleDescription?: { description?: string | null; subDescription?: { text?: string | null } | null } | null;
    trailing?: { text?: string | null; tagText?: string | null } | null;
  };
}

interface RecentOrder {
  accountUid: string;
  description: string | null;
  status: string;
  subDescription: string | null;
  symbol: string | null;
  timestamp: string | null;
  title: string;
  trailingDetail: string | null;
  type: string;
  uid: string;
  transactionDetails?: {
    __typename?: string;
    country?: string;
    createdAt?: string;
    currency?: Currency;
    filledAveragePrice?: number | null;
    filledQuantity?: number | null;
    investmentType?: string;
    clientOrderType?: string;
    limitPrice?: number | null;
    notional?: number | null;
    quantity?: number | null;
    side?: "BUY" | "SELL";
    stockUid?: string;
    stopPrice?: number | null;
    totalPrice?: number | null;
    type?: string;
  } | null;
}

export interface Transaction {
  uid: string;
  accountUid: string;
  /** Atlas satır türü: ORDER, JOURNAL_DEPOSIT, JOURNAL_WITHDRAWAL, EXCHANGE, FUND_INTEREST, DIVIDEND, INSTANT_CASH, OTHER… */
  category: string;
  /** İstanbul yerel takvim tarihi, YYYY-AA-GG; yalnız Atlas hiç tarih göstermiyorsa null. */
  date: string | null;
  time: string | null;
  /** Zaman damgasından ya da ayrıntı sayfasından alındıysa "exact", yıl listeden çıkarıldıysa "inferred". */
  dateSource: "exact" | "inferred" | null;
  title: string;
  symbol: string | null;
  side: "BUY" | "SELL" | null;
  orderType: string | null;
  investmentType: string | null;
  quantity: number | null;
  price: number | null;
  /** Gerçekleşen emirlerde gerçekleşen tutar, diğerlerinde Atlas'ın satırda gösterdiği tutar. */
  amount: number | null;
  /** Tutar bazlı emirlerde (TEFAS alışları) girilen tutar; artan nakit iade edilir. */
  requestedAmount: number | null;
  currency: Currency | null;
  limitPrice: number | null;
  stopPrice: number | null;
  status: TxStatus;
  statusText: string | null;
  note: string | null;
  details?: Record<string, string>;
}

export interface TransactionQuery {
  fromDate?: string;
  toDate?: string;
  status?: "ALL" | "COMPLETED" | "PENDING";
  /** Atlas filtre ağacından bir kimlik, ör. "orders", "o_buy", "journal", "interest", "dividend". */
  filter?: string;
  details?: boolean;
  limit?: number;
  offset?: number;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function filterPath(filter: string | undefined): Promise<string[]> {
  if (!filter) return [];
  const data = await gql("TransactionHistoryFilterTree", Q.TRANSACTION_FILTER_TREE);
  const filters: Array<{ id: string; parentId: string | null }> = data.transactionHistoryFilterTree?.filters ?? [];
  const byId = new Map(filters.map((f) => [f.id, f]));
  if (!byId.has(filter)) {
    throw new MidasApiError(
      `Bilinmeyen filtre "${filter}". Geçerli kimlikler: ${filters.map((f) => f.id).join(", ")}`
    );
  }
  const path: string[] = [];
  for (let node = byId.get(filter); node; node = node.parentId ? byId.get(node.parentId) : undefined) {
    path.unshift(node.id);
  }
  return path;
}

async function historyRows(
  memberUid: string,
  status: "COMPLETED" | "PENDING",
  selectedFilterPath: string[],
  stopBefore: string | null
): Promise<HistoryRow[]> {
  const rows: HistoryRow[] = [];
  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const data = await gql("TempTransactionHistory", Q.TRANSACTION_HISTORY, {
      memberUid,
      status,
      selectedFilterPath,
      page,
      size: HISTORY_PAGE,
    });
    const h = data.tempTransactionHistory;
    const items: HistoryRow[] = h?.items ?? [];
    rows.push(...items);
    if (!h?.hasMore || !items.length) break;
    if (stopBefore) {
      // Yıl çıkarımı baştan tüm satırları ister; eldeki satırlar üzerinde yeniden çalıştırılır.
      const dates = assignYears(rows.map((r) => parseTurkishDate(r.detail.titleDescription?.description)));
      const last = dates.filter(Boolean).at(-1);
      if (last && last < stopBefore) break;
    }
  }
  return rows;
}

async function recentOrders(memberUid: string, stopBefore: string | null) {
  const pending: RecentOrder[] = [];
  const history: RecentOrder[] = [];
  for (let page = 0; page < MAX_ORDER_PAGES; page++) {
    const data = await gql("RecentOrdersV2", Q.RECENT_ORDERS, { memberUid, page, size: ORDER_PAGE });
    const r = data.recentOrdersV2;
    if (r?.error) throw new MidasApiError(`Midas emir listesi hatası: ${r.error}`);
    if (page === 0) pending.push(...(r?.pendingOrders ?? []));
    const items: RecentOrder[] = r?.orderHistory ?? [];
    history.push(...items);
    if (items.length < ORDER_PAGE) break;
    const oldest = splitTimestamp(items.at(-1)?.timestamp)?.date;
    if (stopBefore && oldest && oldest < stopBefore) break;
  }
  return { pending, history };
}

type DetailPage = {
  subHeader?: { title?: string } | null;
  timeline?: Array<{ title?: string; subTitle?: string }> | null;
  items?: any[] | null;
  sectionItems?: Array<{ title?: string; items?: any[] }> | null;
};

function flattenDetail(page: DetailPage | null): Record<string, string> {
  const rows: Record<string, string> = {};
  if (!page) return rows;
  const put = (title?: string, trailing?: { text?: string; tagText?: string } | null) => {
    const value = trailing?.text ?? trailing?.tagText;
    if (title && value != null && !(title in rows)) rows[title] = value;
  };
  if (page.subHeader?.title) rows["Enstrüman"] = page.subHeader.title;
  for (const t of page.timeline ?? []) if (t.title && t.subTitle) rows[t.title] = t.subTitle;
  const walk = (items: any[] | null | undefined) => {
    for (const item of items ?? []) {
      if (item.parent) {
        put(item.parent.title, item.parent.trailing);
        for (const child of item.children ?? []) put(child.title, child.trailing);
      } else {
        put(item.title, item.trailing);
      }
    }
  };
  walk(page.items);
  for (const section of page.sectionItems ?? []) walk(section.items);
  return rows;
}

async function detailRows(memberUid: string, row: { uid: string; accountUid: string; typeV2: string }) {
  try {
    const data = await gql("TempDetailPage", Q.TRANSACTION_DETAIL, {
      accountUid: row.accountUid,
      memberUid,
      transactionDetailType: row.typeV2,
      uid: row.uid,
    });
    return flattenDetail(data.tempDetailPage ?? null);
  } catch {
    return {};
  }
}

function fromRow(row: HistoryRow, listStatus: "COMPLETED" | "PENDING", inferredDate: string | null, order?: RecentOrder): Transaction {
  const d = row.detail;
  const sub = d.titleDescription?.subDescription?.text ?? null;
  const trailing = d.trailing?.text ?? null;
  const trailingTag = d.trailing?.tagText ?? null;
  const money = parseMoney(trailing);
  const statusText = statusFromText(sub) ? sub : statusFromText(trailingTag) ? trailingTag : null;
  let status: TxStatus = listStatus === "PENDING" ? "PENDING" : statusFromText(statusText) ?? "COMPLETED";

  const tx: Transaction = {
    uid: row.uid,
    accountUid: row.accountUid,
    category: row.typeV2 ?? row.type,
    date: inferredDate,
    time: null,
    dateSource: inferredDate ? "inferred" : null,
    title: d.title,
    symbol: symbolFromTitle(row.typeV2, d.title),
    side: sideFromTitle(d.title),
    orderType: null,
    investmentType: null,
    quantity: null,
    price: null,
    amount: money?.amount ?? null,
    requestedAmount: null,
    currency: money?.currency ?? null,
    limitPrice: null,
    stopPrice: null,
    status,
    statusText: statusText ?? (listStatus === "PENDING" ? d.titleDescription?.description ?? null : null),
    note: sub && !statusText ? sub : null,
  };

  const od = order?.transactionDetails;
  if (order && od) {
    const ts = splitTimestamp(order.timestamp);
    if (ts) {
      tx.date = ts.date;
      tx.time = ts.time;
      tx.dateSource = "exact";
    }
    tx.symbol = order.symbol ?? tx.symbol;
    tx.side = od.side ?? tx.side;
    tx.orderType = od.clientOrderType ?? od.type ?? null;
    tx.investmentType = od.investmentType ?? null;
    tx.currency = od.currency ?? tx.currency;
    const filled = num(od.filledQuantity);
    tx.quantity = filled && filled > 0 ? filled : num(od.quantity);
    const avg = num(od.filledAveragePrice);
    tx.price = avg && avg > 0 ? avg : null;
    const total = num(od.totalPrice);
    tx.amount = total && total > 0 ? total : num(od.notional) ?? tx.amount;
    tx.requestedAmount = num(od.notional);
    tx.limitPrice = num(od.limitPrice);
    tx.stopPrice = num(od.stopPrice);
    if (listStatus === "PENDING") status = "PENDING";
    else status = statusFromText(order.subDescription) ?? status;
    tx.status = status;
  }
  return tx;
}

/** Hesap hareketleri, en yeni önce, İstanbul yerel tarihine göre süzülmüş. */
export async function getTransactions(query: TransactionQuery = {}) {
  const memberUid = await session.getMemberUid();
  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 30 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  const fromDate = query.fromDate ?? defaultFrom;
  const toDate = query.toDate ?? null;
  const status = query.status ?? "ALL";
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
  const offset = Math.max(query.offset ?? 0, 0);
  const path = await filterPath(query.filter);

  const [completedRows, pendingRows, orders] = await Promise.all([
    status === "PENDING" ? Promise.resolve([]) : historyRows(memberUid, "COMPLETED", path, fromDate),
    status === "COMPLETED" ? Promise.resolve([]) : historyRows(memberUid, "PENDING", path, null),
    recentOrders(memberUid, fromDate),
  ]);
  const orderByUid = new Map([...orders.pending, ...orders.history].map((o) => [o.uid, o]));

  const build = (rows: HistoryRow[], listStatus: "COMPLETED" | "PENDING") => {
    const inferred = listStatus === "COMPLETED"
      ? assignYears(rows.map((r) => parseTurkishDate(r.detail.titleDescription?.description)), today)
      : rows.map(() => null);
    return rows.map((row, i) => fromRow(row, listStatus, inferred[i], orderByUid.get(row.uid)));
  };
  const all = [...build(pendingRows, "PENDING"), ...build(completedRows, "COMPLETED")];

  // Bekleyen satırlar güncel durumdur ve hep tutulur; tamamlanan satırlar tarihe göre kesilir.
  const inRange = (tx: Transaction) =>
    tx.status === "PENDING" ||
    (tx.date !== null && tx.date >= fromDate && (!toDate || tx.date <= toDate));
  const candidates = all.filter(inRange);

  // Emir zaman damgası olmayan satırların ayrıntı sayfası istenirse ya da Atlas hiç tarih
  // göstermiyorsa alınır: sayfada yıllı tam tarih ve döküm bulunur.
  for (const tx of candidates) {
    if (!query.details && tx.date !== null) continue;
    const rows = await detailRows(memberUid, { uid: tx.uid, accountUid: tx.accountUid, typeV2: tx.category });
    if (!Object.keys(rows).length) continue;
    if (query.details) tx.details = rows;
    if (tx.dateSource !== "exact") {
      const exact = dateFromDetailRows(rows);
      if (exact) {
        tx.date = exact.date;
        tx.time = exact.time;
        tx.dateSource = "exact";
      }
    }
  }
  const selected = candidates.filter(inRange);
  selected.sort((a, b) => {
    if (a.status === "PENDING" && b.status !== "PENDING") return -1;
    if (b.status === "PENDING" && a.status !== "PENDING") return 1;
    return `${b.date ?? ""} ${b.time ?? ""}`.localeCompare(`${a.date ?? ""} ${a.time ?? ""}`);
  });

  const page = selected.slice(offset, offset + limit);
  return {
    fromDate,
    toDate,
    status,
    filter: query.filter ?? null,
    total: selected.length,
    offset,
    count: page.length,
    hasMore: offset + page.length < selected.length,
    transactions: page,
  };
}

/** get_transactions için kullanılabilir kategori filtreleri. */
export async function getTransactionFilters() {
  const data = await gql("TransactionHistoryFilterTree", Q.TRANSACTION_FILTER_TREE);
  return data.transactionHistoryFilterTree?.filters ?? [];
}

export interface PendingOrderSummary {
  orderId: string;
  accountUid: string;
  symbol: string | null;
  title: string;
  market: string | null;
  investmentType: string | null;
  side: "BUY" | "SELL" | null;
  orderType: string | null;
  quantity: number | null;
  amount: number | null;
  currency: Currency | null;
  limitPrice: number | null;
  stopPrice: number | null;
  stockUid: string | null;
  createdAt: string | null;
  statusText: string | null;
  note: string | null;
}

/** Tüm hesaplardaki (BIST, TEFAS, ABD) bekleyen emirler tek çağrıda; sembol gerekmez. */
export async function getAllPendingOrders(): Promise<PendingOrderSummary[]> {
  const memberUid = await session.getMemberUid();
  const data = await gql("RecentOrdersV2", Q.RECENT_ORDERS, { memberUid, page: 0, size: ORDER_PAGE });
  const r = data.recentOrdersV2;
  if (r?.error) throw new MidasApiError(`Midas emir listesi hatası: ${r.error}`);
  return ((r?.pendingOrders ?? []) as RecentOrder[]).map((o) => {
    const od = o.transactionDetails ?? {};
    const trailing = parseMoney(o.trailingDetail);
    return {
      orderId: o.uid,
      accountUid: o.accountUid,
      symbol: o.symbol,
      title: o.title,
      market: od.country ?? null,
      investmentType: od.investmentType ?? null,
      side: od.side ?? sideFromTitle(o.title),
      orderType: od.clientOrderType ?? od.type ?? null,
      quantity: num(od.quantity),
      amount: num(od.notional) ?? trailing?.amount ?? null,
      currency: od.currency ?? trailing?.currency ?? null,
      limitPrice: num(od.limitPrice),
      stopPrice: num(od.stopPrice),
      stockUid: od.stockUid ?? null,
      createdAt: od.createdAt ?? o.timestamp,
      statusText: o.description,
      note: o.subDescription,
    };
  });
}
