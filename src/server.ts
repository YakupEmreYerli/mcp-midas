import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as midas from "./midas.js";
import { getTechnicals, getCandles } from "./technicals.js";
import { getTransactions, getTransactionFilters } from "./history.js";

/**
 * Builds a fresh MCP server with every Midas tool registered. The browser session is a
 * module singleton, so stdio (one client) and the HTTP daemon (a server per request)
 * all share the same logged-in Chromium.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "midas-mcp", version: "0.1.0" });

  /** Tools return JSON text so the model gets structured, unambiguous data. */
  function json(value: unknown) {
    return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
  }

  function failure(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }

  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: S,
    handler: (args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<unknown>,
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean }
  ) {
    server.registerTool(name, { description, inputSchema, annotations }, (async (args: any) => {
      try {
        return json(await handler(args));
      } catch (error) {
        return failure(error);
      }
    }) as any);
  }

  const READ_ONLY = { readOnlyHint: true, openWorldHint: true };
  const WRITING = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };

  tool(
    "get_portfolio",
    "Get overall portfolio value in TRY, today's profit/loss, and cash balances and buying power for the Turkish (BIST/TRY) and US (USD) accounts.",
    {},
    () => midas.getPortfolio(),
    READ_ONLY
  );

  tool(
    "get_assets",
    "List all open positions (BIST stocks, US stocks, Turkish funds, US options) with quantity, average cost, current price, market value and profit/loss.",
    {},
    () => midas.getPositions(),
    READ_ONLY
  );

  tool(
    "get_asset_price",
    "Get the current trade price for a symbol, with previous close, percent change and whether the market session is open.",
    {
      symbol: z.string().describe("Ticker, e.g. TUCLK, THYAO, AAPL"),
      currency: z
        .enum(["TRY", "USD"])
        .optional()
        .describe("Convert the price to this currency instead of the instrument's native one"),
    },
    ({ symbol, currency }) => midas.getAssetPrice(symbol, currency),
    READ_ONLY
  );

  tool(
    "get_asset_info",
    "Get descriptive information about an instrument (full name, market, description) together with its current price, " +
      "plus the Atlas instrument-page stats: for TEFAS funds risk level (riskLevel), value dates, tax, annual management fee " +
      "and investor count; for stocks daily band, 52-week range and ratios. Symbol search is fuzzy: check exactMatch and name.",
    { symbol: z.string().describe("Ticker or company name to look up") },
    ({ symbol }) => midas.getAssetInfo(symbol),
    READ_ONLY
  );

  tool(
    "get_technicals",
    "Compute a full technical-analysis snapshot for a symbol from its daily price history: " +
      "RSI(14), SMA/EMA (20/50/200), MACD, Bollinger Bands, ATR and annualized volatility, " +
      "52-week range, swing-pivot support/resistance levels, and volume-vs-average. " +
      "Feed this into the scan scoring formula in CLAUDE.md.",
    {
      symbol: z.string().describe("Ticker to analyze, e.g. TUCLK, ASELS, THYAO"),
      interval: z
        .enum(["1d", "1w"])
        .optional()
        .describe("Candle interval; defaults to daily (1d)"),
    },
    ({ symbol, interval }) => getTechnicals(symbol, interval ?? "1d"),
    READ_ONLY
  );

  tool(
    "get_chart",
    "Get raw OHLCV candles for a symbol (open, high, low, close, volume, timestamp). " +
      "Use get_technicals for computed indicators; use this only when you need the raw series.",
    {
      symbol: z.string().describe("Ticker to fetch candles for"),
      interval: z
        .enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"])
        .optional()
        .describe("Candle interval; defaults to daily (1d)"),
      limit: z.number().int().positive().max(500).optional().describe("Number of candles (max 500)"),
    },
    async ({ symbol, interval, limit }) => {
      const asset = await midas.resolveSymbol(symbol);
      const candles = await getCandles(asset.uid, interval ?? "1d", limit ?? 200);
      return { symbol: asset.symbol, interval: interval ?? "1d", count: candles.length, candles };
    },
    READ_ONLY
  );

  tool(
    "get_pending_orders",
    "List orders still waiting to execute, with their order ids. Omit symbol to get every pending order on every " +
      "account (BIST, TEFAS, US) in one call; with a symbol only that instrument's orders.",
    { symbol: z.string().optional().describe("Optional ticker; omit for all pending orders") },
    ({ symbol }) => midas.getPendingOrders(symbol),
    READ_ONLY
  );

  tool(
    "get_transactions",
    "Account activity history (Atlas 'İşlem geçmişi'), newest first: stock/ETF/TEFAS fund buys and sells, TL deposits " +
      "and withdrawals, FX buys/sells, fund interest (nema), withholding tax (stopaj), dividends, instant cash. Each row has " +
      "date/time, category, symbol, side, order type, quantity, average price, amount, currency and status " +
      "(COMPLETED, PENDING, CANCELLED, REJECTED, EXPIRED). Pending rows are always included. Defaults to the last 30 days.",
    {
      from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Inclusive start date YYYY-MM-DD (default: 30 days ago)"),
      to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Inclusive end date YYYY-MM-DD (default: today)"),
      status: z.enum(["ALL", "COMPLETED", "PENDING"]).optional().describe("Default ALL"),
      filter: z
        .string()
        .optional()
        .describe(
          "Atlas category id: orders, o_buy, o_sell, journal, j_try, j_usd, exchange, e_usd, interest, i_try, dividend, instant_cash, other. " +
            "get_transaction_filters lists all"
        ),
      details: z
        .boolean()
        .optional()
        .describe("Also fetch each row's detail sheet (exact time, FX rate, commission, bank…); one extra request per row"),
      limit: z.number().int().positive().max(500).optional().describe("Rows per page, default 100"),
      offset: z.number().int().min(0).optional().describe("Rows to skip for paging"),
    },
    ({ from_date, to_date, status, filter, details, limit, offset }) =>
      getTransactions({ fromDate: from_date, toDate: to_date, status, filter, details, limit, offset }),
    READ_ONLY
  );

  tool(
    "get_transaction_filters",
    "List the Atlas transaction-history category tree (id, name, parentId) usable as get_transactions filter.",
    {},
    () => getTransactionFilters(),
    READ_ONLY
  );

  tool(
    "place_order",
    "Place a BIST stock MARKET/LIMIT order or a TEFAS fund DEMAND sell order. " +
      "Every accepted request opens a local desktop confirmation window; no schema argument can bypass it. " +
      "TEFAS buys are currently rejected because the Atlas bundle did not prove whether PlaceOrderRequest expects amount or quantity.",
    {
      symbol: z.string().min(1).describe("Exact Midas ticker; fuzzy matches are rejected"),
      side: z.enum(["BUY", "SELL"]),
      order_type: z.enum(["MARKET", "LIMIT", "DEMAND"]).optional(),
      quantity: z.number().positive().optional().describe("Share/fund-unit count"),
      amount_try: z.number().positive().optional().describe("TRY amount; reserved for TEFAS buy once its request field is proven"),
      limit_price: z.number().positive().optional().describe("Required for LIMIT stock orders"),
    },
    ({ symbol, side, order_type, quantity, amount_try, limit_price }) =>
      midas.placeOrder({
        symbol,
        side,
        orderType: order_type,
        quantity,
        amountTry: amount_try,
        limitPrice: limit_price,
      }),
    WRITING
  );

  tool(
    "update_order",
    "Update a pending order after a mandatory local desktop confirmation. Supports LIMIT, STOP, STOP_LIMIT, " +
      "TAKE_PROFIT, STOP_LOSS and TAKE_PROFIT_AND_STOP_LOSS; for TP/SL use take_profit_price and stop_loss_price.",
    {
      order_id: z.string().min(1).describe("Pending order uid"),
      symbol: z.string().min(1).describe("Exact ticker belonging to the order"),
      new_quantity: z.number().positive().optional(),
      new_limit_price: z.number().positive().optional(),
      new_stop_price: z.number().positive().optional(),
      take_profit_price: z.number().positive().optional(),
      stop_loss_price: z.number().positive().optional(),
    },
    ({ order_id, symbol, new_quantity, new_limit_price, new_stop_price, take_profit_price, stop_loss_price }) =>
      midas.updateOrder({
        orderId: order_id,
        symbol,
        newQuantity: new_quantity,
        newLimitPrice: new_limit_price,
        newStopPrice: new_stop_price,
        takeProfitPrice: take_profit_price,
        stopLossPrice: stop_loss_price,
      }),
    WRITING
  );

  tool(
    "cancel_order",
    "Cancel a pending order after showing its current Midas OrderDetail in a mandatory local desktop confirmation window.",
    {
      order_id: z.string().min(1).describe("Pending order uid"),
      symbol: z.string().min(1).describe("Exact ticker belonging to the order"),
    },
    ({ order_id, symbol }) => midas.cancelOrder(order_id, symbol),
    WRITING
  );

  return server;
}
