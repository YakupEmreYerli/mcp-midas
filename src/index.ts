#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { session } from "./session.js";
import * as midas from "./midas.js";
import { getTechnicals, getCandles } from "./technicals.js";

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
  "Get descriptive information about an instrument (full name, market, description) together with its current price.",
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
  "List orders for a symbol that are still waiting to execute, including their order ids for cancellation.",
  { symbol: z.string().describe("Ticker whose pending orders to list") },
  ({ symbol }) => midas.getPendingOrders(symbol),
  READ_ONLY
);

const shutdown = async () => {
  await session.close().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.connect(new StdioServerTransport());
