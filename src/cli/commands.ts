/**
 * `midas` komutları. Okuma komutu bir araç çağırıp sonucu biçimler. Emir komutları (buy, sell, modify,
 * cancel) `--confirm` olmadan yalnız okuma araçlarıyla önizleme kurar ve hiçbir yazma aracı çağırmaz.
 * `--confirm` onay değildir: yalnız yazma aracını çağırır; onayı sunucudaki kapı ayrıca ister.
 */
import { defineMessages } from "../i18n.js";
import { parseArgs, parseNumber, type Flags } from "./args.js";
import { resolveTarget, type Target, type TargetOptions } from "./accounts.js";
import { WRITE_TIMEOUT_MS, type ToolCaller, type ToolResult } from "./connect.js";
import * as F from "./format.js";

const M = defineMessages(
  {
    usage: `Kullanım: midas <komut> [seçenekler]

Okuma
  status                                  oturum açık mı (giriş başlatmaz)
  portfolio                               toplam değer, günlük K/Z, nakit
  positions                               açık pozisyonlar
  price <SEMBOL> [--currency TRY|USD] [--market TR|US]
  info <SEMBOL> [--market TR|US]
  technicals <SEMBOL> [--interval 1d|1w] [--market TR|US]
  chart <SEMBOL> [--interval 1d] [--limit N] [--market TR|US]
  orders [SEMBOL] [--market TR|US]        bekleyen emirler
  history [--from YYYY-AA-GG] [--to YYYY-AA-GG] [--status ALL|COMPLETED|PENDING]
          [--filter ID] [--details] [--limit N] [--offset N]
  filters                                 history için kategori kimlikleri

Emir (önce önizleme; göndermek için --confirm)
  buy|sell <SEMBOL> <ADET> [--limit FİYAT] [--tp FİYAT] [--sl FİYAT] [--type TİP]
  modify <EMİR_ID> <SEMBOL> [--quantity N] [--limit F] [--stop F] [--tp F] [--sl F]
  cancel <EMİR_ID> <SEMBOL>

Genel
  --account, --hesap <ad>   hesap dosyasındaki hesap
  --server <URL>            çalışan HTTP MCP servisine bağlan (--token-file <dosya>)
  --local                   paketi bu süreçte çalıştır
  --json                    ham JSON

--confirm onay değildir: emri sunucuya iletir, onay yine masaüstü penceresinde ya da açıksa
telefonda ayrıca istenir.`,
    unknownCommand: (name: string) => `Bilinmeyen komut: ${name}. Komutlar için: midas --help`,
    badArity: (usage: string) => `Kullanım: midas ${usage}`,
    flagNotHere: (flag: string, command: string) => `--${flag} seçeneği "${command}" komutunda kullanılmaz`,
    quantityWord: "adet",
    notInteger: (what: string, value: string) => `${what} tam sayı olmalı: "${value}"`,
    preview: "ÖNİZLEME, gönderilmedi",
    sendHint: "Göndermek için aynı komutu --confirm ile çalıştırın. Onay ayrıca masaüstü penceresinde (ya da açıksa telefonda) istenir.",
    ordersDisabled: (tool: string) =>
      `Bu sunucuda emir araçları kapalı (${tool} yok). Sunucuyu çalıştıran kişi MIDAS_ORDERS_ENABLED=1 ile açabilir.`,
    notExact: (asked: string, got: string) => `Sembol birebir eşleşmedi: ${asked} yerine ${got} bulundu. Emir için birebir Midas sembolü gerekir.`,
    orderNotFound: (id: string, symbol: string) => `${symbol} için bekleyen emirler arasında ${id} yok (midas orders ${symbol})`,
    nothingToModify: "Değiştirilecek bir şey verilmedi (--quantity, --limit, --stop, --tp, --sl)",
    buy: "ALIŞ",
    sell: "SATIŞ",
    modify: "DEĞİŞTİR",
    cancel: "İPTAL",
    current: "güncel fiyat",
    estimate: "tahmini tutar",
    type: "tip",
    serverDecides: "sunucu belirler",
    now: "şimdi",
    after: "sonra",
    sent: "Gönderildi.",
  },
  {
    usage: `Usage: midas <command> [options]

Read
  status                                  is the session open (never starts a login)
  portfolio                               total value, day P/L, cash
  positions                               open positions
  price <SYMBOL> [--currency TRY|USD] [--market TR|US]
  info <SYMBOL> [--market TR|US]
  technicals <SYMBOL> [--interval 1d|1w] [--market TR|US]
  chart <SYMBOL> [--interval 1d] [--limit N] [--market TR|US]
  orders [SYMBOL] [--market TR|US]        pending orders
  history [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--status ALL|COMPLETED|PENDING]
          [--filter ID] [--details] [--limit N] [--offset N]
  filters                                 category IDs for history

Orders (preview first; add --confirm to send)
  buy|sell <SYMBOL> <QTY> [--limit PRICE] [--tp PRICE] [--sl PRICE] [--type TYPE]
  modify <ORDER_ID> <SYMBOL> [--quantity N] [--limit P] [--stop P] [--tp P] [--sl P]
  cancel <ORDER_ID> <SYMBOL>

General
  --account <name>          account from the accounts file
  --server <URL>            connect to a running HTTP MCP service (--token-file <file>)
  --local                   run the package in this process
  --json                    raw JSON

--confirm is not an approval: it passes the order to the server, which still asks for approval
in the desktop window or, when enabled, on the phone.`,
    unknownCommand: (name) => `Unknown command: ${name}. For the list: midas --help`,
    badArity: (usage) => `Usage: midas ${usage}`,
    flagNotHere: (flag, command) => `--${flag} isn't used with "${command}"`,
    quantityWord: "quantity",
    notInteger: (what, value) => `${what} must be a whole number: "${value}"`,
    preview: "PREVIEW, not sent",
    sendHint: "To send it, run the same command with --confirm. Approval is still asked in the desktop window (or on the phone, when enabled).",
    ordersDisabled: (tool) =>
      `Order tools are off on this server (no ${tool}). Whoever runs the server can turn them on with MIDAS_ORDERS_ENABLED=1.`,
    notExact: (asked, got) => `The symbol didn't match exactly: found ${got} instead of ${asked}. Orders need the exact Midas symbol.`,
    orderNotFound: (id, symbol) => `${id} isn't among the pending orders for ${symbol} (midas orders ${symbol})`,
    nothingToModify: "Nothing to change was given (--quantity, --limit, --stop, --tp, --sl)",
    buy: "BUY",
    sell: "SELL",
    modify: "MODIFY",
    cancel: "CANCEL",
    current: "current price",
    estimate: "estimated value",
    type: "type",
    serverDecides: "set by the server",
    now: "now",
    after: "after",
    sent: "Sent.",
  }
);

const GLOBAL_FLAGS = ["account", "server", "token-file", "local", "json", "help"];

interface ReadCommand {
  kind: "read";
  usage: string;
  positionals: [min: number, max: number];
  flags: string[];
  tool: string;
  args: (pos: string[], flags: Flags) => Record<string, unknown>;
  format: (data: any) => string;
}

interface OrderCommand {
  kind: "order";
  usage: string;
  positionals: [min: number, max: number];
  flags: string[];
}

const str = (v: string | true | undefined) => (typeof v === "string" ? v : undefined);
const int = (v: string | true | undefined, what: string) => {
  if (typeof v !== "string") return undefined;
  if (v === "0") return 0;
  const n = parseNumber(v, what);
  if (!Number.isInteger(n)) throw new Error(M().notInteger(what, v));
  return n;
};
const price = (v: string | true | undefined, what: string) => (typeof v === "string" ? parseNumber(v, what) : undefined);

/** Tanımsız alanlar araç argümanına girmez. */
function defined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

const COMMANDS: Record<string, ReadCommand | OrderCommand> = {
  status: { kind: "read", usage: "status", positionals: [0, 0], flags: [], tool: "get_session_status", args: () => ({}), format: F.formatStatus },
  portfolio: { kind: "read", usage: "portfolio", positionals: [0, 0], flags: [], tool: "get_portfolio", args: () => ({}), format: F.formatPortfolio },
  positions: { kind: "read", usage: "positions", positionals: [0, 0], flags: [], tool: "get_assets", args: () => ({}), format: F.formatPositions },
  price: {
    kind: "read", usage: "price <SYMBOL> [--currency TRY|USD] [--market TR|US]", positionals: [1, 1], flags: ["currency", "market"],
    tool: "get_asset_price", args: ([s], f) => defined({ symbol: s, currency: str(f.currency), market: str(f.market) }), format: F.formatPrice,
  },
  info: {
    kind: "read", usage: "info <SYMBOL> [--market TR|US]", positionals: [1, 1], flags: ["market"],
    tool: "get_asset_info", args: ([s], f) => defined({ symbol: s, market: str(f.market) }), format: F.formatInfo,
  },
  technicals: {
    kind: "read", usage: "technicals <SYMBOL> [--interval 1d|1w] [--market TR|US]", positionals: [1, 1], flags: ["interval", "market"],
    tool: "get_technicals", args: ([s], f) => defined({ symbol: s, interval: str(f.interval), market: str(f.market) }), format: (d) => F.generic(d),
  },
  chart: {
    kind: "read", usage: "chart <SYMBOL> [--interval 1d] [--limit N] [--market TR|US]", positionals: [1, 1], flags: ["interval", "limit", "market"],
    tool: "get_chart",
    args: ([s], f) => defined({ symbol: s, interval: str(f.interval), limit: int(f.limit, "--limit"), market: str(f.market) }),
    format: F.formatChart,
  },
  orders: {
    kind: "read", usage: "orders [SYMBOL] [--market TR|US]", positionals: [0, 1], flags: ["market"],
    tool: "get_pending_orders", args: ([s], f) => defined({ symbol: s, market: str(f.market) }), format: F.formatOrders,
  },
  history: {
    kind: "read", usage: "history [--from D] [--to D] [--status S] [--filter ID] [--details] [--limit N] [--offset N]", positionals: [0, 0],
    flags: ["from", "to", "status", "filter", "details", "limit", "offset"], tool: "get_transactions",
    args: (_p, f) =>
      defined({
        from_date: str(f.from), to_date: str(f.to), status: str(f.status), filter: str(f.filter),
        details: f.details === true ? true : undefined, limit: int(f.limit, "--limit"), offset: int(f.offset, "--offset"),
      }),
    format: F.formatTransactions,
  },
  filters: { kind: "read", usage: "filters", positionals: [0, 0], flags: [], tool: "get_transaction_filters", args: () => ({}), format: F.formatFilters },
  buy: { kind: "order", usage: "buy <SYMBOL> <QTY> [--limit P] [--tp P] [--sl P] [--type T] [--confirm]", positionals: [2, 2], flags: ["limit", "tp", "sl", "type", "confirm"] },
  sell: { kind: "order", usage: "sell <SYMBOL> <QTY> [--limit P] [--tp P] [--sl P] [--type T] [--confirm]", positionals: [2, 2], flags: ["limit", "tp", "sl", "type", "confirm"] },
  modify: { kind: "order", usage: "modify <ORDER_ID> <SYMBOL> [--quantity N] [--limit P] [--stop P] [--tp P] [--sl P] [--confirm]", positionals: [2, 2], flags: ["quantity", "limit", "stop", "tp", "sl", "confirm"] },
  cancel: { kind: "order", usage: "cancel <ORDER_ID> <SYMBOL> [--confirm]", positionals: [2, 2], flags: ["confirm"] },
};

/** Komutun yazma aracı ve argümanları (önizleme ve gönderim aynı argümanı kullanır). */
export function writeCall(command: string, pos: string[], flags: Flags): { tool: string; args: Record<string, unknown> } {
  if (command === "buy" || command === "sell") {
    const [symbol, quantity] = pos;
    return {
      tool: "place_order",
      args: defined({
        symbol,
        side: command === "buy" ? "BUY" : "SELL",
        quantity: parseNumber(quantity, M().quantityWord),
        order_type: str(flags.type),
        limit_price: price(flags.limit, "--limit"),
        take_profit_price: price(flags.tp, "--tp"),
        stop_loss_price: price(flags.sl, "--sl"),
      }),
    };
  }
  const [order_id, symbol] = pos;
  if (command === "cancel") return { tool: "cancel_order", args: { order_id, symbol } };
  const changes = defined({
    new_quantity: price(flags.quantity, "--quantity"),
    new_limit_price: price(flags.limit, "--limit"),
    new_stop_price: price(flags.stop, "--stop"),
    take_profit_price: price(flags.tp, "--tp"),
    stop_loss_price: price(flags.sl, "--sl"),
  });
  if (!Object.keys(changes).length) throw new Error(M().nothingToModify);
  return { tool: "update_order", args: { order_id, symbol, ...changes } };
}

class CliError extends Error {}

function unwrap(result: ToolResult): any {
  if (result.isError) throw new CliError(result.raw);
  return result.data;
}

/** Sunucunun bildirdiği emir tipi çıkarımının önizlemedeki karşılığı (midas.placeOrder ile aynı sıra). */
function inferredType(args: Record<string, unknown>, isFund: boolean): string {
  if (args.order_type) return String(args.order_type);
  const tp = args.take_profit_price != null;
  const sl = args.stop_loss_price != null;
  if (tp && sl) return "TAKE_PROFIT_AND_STOP_LOSS";
  if (tp) return "TAKE_PROFIT";
  if (sl) return "STOP_LOSS";
  if (isFund) return "DEMAND";
  return args.limit_price != null ? "LIMIT" : "MARKET";
}

/** Yalnız okuma araçlarıyla kurulan önizleme. Hiçbir yazma aracı çağrılmaz. */
async function buildPreview(caller: ToolCaller, command: string, call: { tool: string; args: Record<string, any> }): Promise<string[]> {
  const m = M();
  const a = call.args;
  if (call.tool === "place_order") {
    const info = unwrap(await caller.call("get_asset_info", { symbol: a.symbol }));
    if (!info.exactMatch || String(info.symbol).toUpperCase() !== String(a.symbol).trim().toUpperCase()) {
      throw new CliError(m.notExact(a.symbol, info.symbol));
    }
    const type = inferredType(a, info.investmentType === "INVESTMENT_FUNDS");
    const ref = a.limit_price ?? info.price;
    const lines = [
      `${a.side === "BUY" ? m.buy : m.sell} ${info.symbol}${info.name ? ` (${info.name})` : ""} · ${info.market ?? ""}`.trimEnd(),
      `${m.quantityWord}: ${F.qty(a.quantity)} · ${m.type}: ${type}${a.order_type ? "" : ` (${m.serverDecides})`}` +
        (a.limit_price != null ? ` @ ${F.num(a.limit_price, 4)}` : ""),
    ];
    if (a.take_profit_price != null || a.stop_loss_price != null) {
      lines.push(`TP: ${F.num(a.take_profit_price, 4)} · SL: ${F.num(a.stop_loss_price, 4)}`);
    }
    lines.push(
      `${m.current}: ${F.num(info.price, 4)} ${info.currency ?? ""} · ${m.estimate}: ${typeof ref === "number" ? F.num(ref * a.quantity) : "-"} ${info.currency ?? ""}`.trimEnd()
    );
    return lines;
  }

  const pending = unwrap(await caller.call("get_pending_orders", { symbol: a.symbol }));
  const order = (pending.orders ?? []).find((o: any) => F.orderId(o) === a.order_id);
  if (!order) throw new CliError(m.orderNotFound(a.order_id, a.symbol));
  const head = `${command === "cancel" ? m.cancel : m.modify} ${a.order_id} · ${order.symbol ?? pending.symbol ?? a.symbol}`;
  const now = {
    side: order.side, type: order.orderType ?? order.type, quantity: order.quantity,
    limit: order.limitPrice, stop: order.stopPrice, tp: order.profitPrice, sl: order.lossPrice,
  };
  const describe = (o: Record<string, any>) =>
    [
      o.side, o.type,
      `${m.quantityWord} ${F.qty(o.quantity)}`,
      o.limit != null ? `limit ${F.num(o.limit, 4)}` : null,
      o.stop != null ? `stop ${F.num(o.stop, 4)}` : null,
      o.tp != null ? `TP ${F.num(o.tp, 4)}` : null,
      o.sl != null ? `SL ${F.num(o.sl, 4)}` : null,
    ].filter(Boolean).join(" · ");
  if (command === "cancel") return [head, `${m.now}: ${describe(now)}`];
  const next = {
    ...now,
    quantity: a.new_quantity ?? now.quantity,
    limit: a.new_limit_price ?? now.limit,
    stop: a.new_stop_price ?? now.stop,
    tp: a.take_profit_price ?? now.tp,
    sl: a.stop_loss_price ?? now.sl,
  };
  return [head, `${m.now}:   ${describe(now)}`, `${m.after}: ${describe(next)}`];
}

export interface RunDeps {
  connect: (target: Target) => Promise<ToolCaller>;
  resolveTarget?: (options: TargetOptions) => Target;
  out: (text: string) => void;
  err: (text: string) => void;
}

/** CLI'yı çalıştırır; çıkış kodunu döner. */
export async function run(argv: string[], deps: RunDeps): Promise<number> {
  let caller: ToolCaller | null = null;
  try {
    const { positionals, flags } = parseArgs(argv);
    const [name, ...pos] = positionals;
    if (!name || flags.help) {
      deps.out(M().usage);
      return name || flags.help ? 0 : 2;
    }
    const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
    if (!command) throw new CliError(M().unknownCommand(name));
    for (const flag of Object.keys(flags)) {
      if (!GLOBAL_FLAGS.includes(flag) && !command.flags.includes(flag)) throw new CliError(M().flagNotHere(flag, name));
    }
    const [min, max] = command.positionals;
    if (pos.length < min || pos.length > max) throw new CliError(M().badArity(command.usage));

    // Argümanlar bağlanmadan önce doğrulanır: hatalı sayı için sunucuya gidilmez.
    const read = command.kind === "read" ? { tool: command.tool, args: command.args(pos, flags) } : null;
    const write = command.kind === "order" ? writeCall(name, pos, flags) : null;

    const target = (deps.resolveTarget ?? resolveTarget)({
      local: flags.local === true,
      server: str(flags.server),
      tokenFile: str(flags["token-file"]),
      account: str(flags.account),
    });
    caller = await deps.connect(target);

    if (read) {
      const result = await caller.call(read.tool, read.args);
      if (result.isError) {
        deps.err(result.raw);
        return 1;
      }
      if (flags.json) deps.out(result.raw);
      else deps.out([result.accountLine, (command as ReadCommand).format(result.data)].filter(Boolean).join("\n"));
      return 0;
    }

    const call = write!;
    if (!(await caller.toolNames()).includes(call.tool)) throw new CliError(M().ordersDisabled(call.tool));

    if (flags.confirm !== true) {
      const lines = await buildPreview(caller, name, call);
      if (flags.json) deps.out(JSON.stringify({ preview: true, sent: false, tool: call.tool, arguments: call.args }, null, 2));
      else deps.out([M().preview, ...lines, M().sendHint].join("\n"));
      return 0;
    }

    // Tek çağrı, otomatik yineleme yok: yeni deneme yeni onay ister.
    const result = await caller.call(call.tool, call.args, { timeoutMs: WRITE_TIMEOUT_MS });
    if (result.isError) {
      deps.err(result.raw);
      return 1;
    }
    if (flags.json) deps.out(result.raw);
    else deps.out([result.accountLine, M().sent, F.generic(result.data)].filter(Boolean).join("\n"));
    return 0;
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await caller?.close();
  }
}
