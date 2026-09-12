import { gql, MidasApiError } from "./api.js";
import { config } from "./config.js";
import { session } from "./session.js";
import * as Q from "./queries.js";

export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";

export interface Account {
  accountUid: string;
  assetVertical: "TR" | "US";
  currency: string;
  buyingPower: number;
  cash: number;
  withdrawableCash: number;
}

export interface Position {
  symbol: string;
  name: string;
  assetUid: string;
  accountUid: string;
  market: "TR" | "US";
  quantity: number;
  averageCost: number;
  price: number | null;
  currency: string;
  marketValue: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  sessionStatus: string | null;
}

/** Portfolio value, day P/L, and per-market cash balances. */
export async function getPortfolio() {
  const memberUid = await session.getMemberUid();
  const data = await gql("GetPortfolioOverview", Q.PORTFOLIO_OVERVIEW, {
    memberUid,
    currencyCode: "TRY",
    timeRange: "DAY",
  });
  const o = data.overviewV2;
  return {
    portfolioValueTry: o.portfolioValue,
    dayProfitLoss: o.profitLosses?.find((p: any) => p.timeRange === "DAY") ?? null,
    accounts: (o.accounts ?? []) as Account[],
  };
}

async function getAccounts(): Promise<Account[]> {
  return (await getPortfolio()).accounts;
}

async function accountFor(market: "TR" | "US"): Promise<Account> {
  const account = (await getAccounts()).find((a) => a.assetVertical === market);
  if (!account) throw new MidasApiError(`No ${market} account found on this Midas profile`);
  return account;
}

/** All open positions across BIST stocks, US stocks, TR funds and US options. */
export async function getPositions(): Promise<Position[]> {
  const memberUid = await session.getMemberUid();
  const data = await gql(
    "OverviewAllPositions",
    Q.ALL_POSITIONS,
    {
      memberUid,
      includeUsStocks: true,
      includeTrStocks: true,
      includeTrFunds: true,
      includeUsOptions: true,
    },
    "overviewPositionsV2"
  );

  const groups = [data.trStocks, data.usStocks, data.trFunds, data.usOptions];
  const positions: Position[] = [];
  for (const group of groups) {
    for (const p of group ?? []) {
      const price: number | null = p.tradePriceV3?.price ?? null;
      const multiplier = p.multiplier ?? 1;
      const marketValue = price === null ? null : price * p.quantity * multiplier;
      const costBasis = p.averageCost * p.quantity * multiplier;
      positions.push({
        symbol: p.symbol,
        name: p.displayName ?? p.symbol,
        assetUid: p.assetUid,
        accountUid: p.accountUid,
        market: p.assetVertical,
        quantity: p.quantity,
        averageCost: p.averageCost,
        price,
        currency: p.currency,
        marketValue,
        profitLoss: marketValue === null ? null : marketValue - costBasis,
        profitLossPercent:
          marketValue === null || costBasis === 0 ? null : ((marketValue - costBasis) / costBasis) * 100,
        sessionStatus: p.tradePriceV3?.tradingSessionStatus ?? null,
      });
    }
  }
  return positions;
}

export interface ResolvedAsset {
  uid: string;
  symbol: string;
  title: string;
  subtitle: string;
  country: "TR" | "US";
}

/**
 * Resolve a ticker to a Midas instrument uid. Prefers an exact symbol match;
 * falls back to the first search hit so partial names still work.
 */
export async function resolveSymbol(symbol: string): Promise<ResolvedAsset> {
  const data = await gql("Search", Q.SEARCH, {
    query: symbol,
    searchItemTypes: ["MARKET_INSTRUMENTS", "INVESTMENT_FUNDS"],
    page: 0,
    size: 30,
  });
  const results = (data.Search?.results ?? []).filter((r: any) => r.symbol);
  if (!results.length) throw new MidasApiError(`No instrument found for "${symbol}"`);

  const wanted = symbol.trim().toUpperCase();
  const hit = results.find((r: any) => r.symbol.toUpperCase() === wanted) ?? results[0];
  return {
    uid: hit.uid,
    symbol: hit.symbol,
    title: hit.title,
    subtitle: hit.subtitle,
    country: hit.country,
  };
}

/** Last trade price for a symbol, optionally converted to another currency. */
export async function getAssetPrice(symbol: string, currency?: "TRY" | "USD") {
  const asset = await resolveSymbol(symbol);
  const data = await gql("GetAssetSnapshot", Q.ASSET_SNAPSHOT, {
    uid: asset.uid,
    currency: currency ?? null,
  });
  const a = data.asset;
  const price = a.tradePrice?.price ?? null;
  const previousClose = a.previousClosePrice ?? null;
  return {
    symbol: asset.symbol,
    name: a.name,
    uid: a.uid,
    price,
    currency: a.tradePrice?.currency ?? a.currency,
    previousClose,
    changePercent:
      price === null || !previousClose ? null : ((price - previousClose) / previousClose) * 100,
    sessionStatus: a.tradePrice?.tradingSessionStatus ?? null,
    tradable: a.orderFlowEnabled ?? false,
  };
}

/** Descriptive info plus current pricing for a symbol. */
export async function getAssetInfo(symbol: string) {
  const asset = await resolveSymbol(symbol);
  const price = await getAssetPrice(asset.symbol);
  return {
    ...price,
    market: asset.country === "TR" ? "BIST" : "US",
    description: asset.subtitle,
  };
}

export async function getPendingOrders(symbol: string) {
  const asset = await resolveSymbol(symbol);
  const account = await accountFor(asset.country === "TR" ? "TR" : "US");
  const data = await gql("PendingOrders", Q.PENDING_ORDERS, {
    accountUid: account.accountUid,
    stockUid: asset.uid,
  });
  return {
    symbol: asset.symbol,
    accountUid: account.accountUid,
    stockUid: asset.uid,
    orders: data.pendingOrders?.orders ?? [],
  };
}
