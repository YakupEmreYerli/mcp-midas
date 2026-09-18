# mcp-midas

[MCP](https://modelcontextprotocol.io) server for the **Midas** brokerage
([atlas.getmidas.com](https://atlas.getmidas.com/)). It lets an AI assistant read your
portfolio and market data, and prepare, update or cancel supported orders only after
an independent confirmation on your local desktop.

Midas has no public API. This server drives the Atlas web app with
[Playwright](https://playwright.dev): it keeps one authenticated browser session and
issues the same GraphQL calls the web app makes, from inside the page, so the session
cookies are attached automatically.

## Order safety model

Every write tool resolves the instrument and account from Midas, builds its preview from
that trusted data, then asks the MCP server process itself to open a confirmation window:
a designed local window (`onay/onay.py`, PySide6 + QtWebEngine, preview passed on stdin,
no network), falling back to `kdialog --menu` and then `zenity` only when the previous one
could not open at all. The default is **No**; **Yes** must be pressed and held, Enter never
approves, and Esc, closing the window or 120 seconds of silence answer No. Missing display,
missing dialog programs and dialog errors reject the operation too, but are reported as
"confirmation window could not open", never as a user rejection. Confirmations are serialized, so only one is visible at a time.

There is no `confirmed`, `approve` or bypass argument, environment variable or config
switch in the MCP interface. After approval the server re-resolves the exact symbol and
current price; an instrument mismatch or a price move over 2% aborts the operation. A
separate `MAX_ORDER_VALUE_TRY` ceiling defaults to ₺10,000 but never replaces desktop
confirmation. Attempts and results are appended to `.midas-orders.log.jsonl` with mode
0600 and credential-like fields redacted.

## Tools

| Tool | Arguments | What you get |
| --- | --- | --- |
| `get_portfolio` | – | Total value in TRY, today's P/L, and cash and buying power per account (TRY / USD / EUR) |
| `get_assets` | – | Every open position: quantity, average cost, price, market value, P/L |
| `get_asset_price` | `symbol`, optional `currency` | Last price, previous close, % change, session status |
| `get_asset_info` | `symbol` | Instrument name, market and description, current price, and the Atlas instrument-page stats (TEFAS funds: risk level, value dates, tax, management fee; stocks: daily band, 52-week range, ratios). `exactMatch` flags fuzzy symbol hits |
| `get_pending_orders` | `symbol?` | Orders still waiting to execute; without `symbol`, every pending order on every account in one call |
| `get_transactions` | `from_date?`, `to_date?`, `status?`, `filter?`, `details?`, `limit?`, `offset?` | Account activity (Atlas "İşlem geçmişi"): stock/ETF/fund trades, TL transfers, FX, fund interest, withholding tax, dividends; date, symbol, side, quantity, average price, amount, currency, status. Default: last 30 days |
| `get_transaction_filters` | – | Category ids usable as `get_transactions` `filter` |
| `get_technicals` | `symbol`, optional `interval` | RSI(14), SMA/EMA (20/50/200), MACD, Bollinger Bands, ATR, annualized volatility, 52-week range, swing pivots, volume vs average |
| `get_chart` | `symbol`, optional `interval`, `limit` | Raw OHLCV candles (max 500) |
| `place_order` | exact `symbol`, `side`, optional `order_type`, `quantity`, `amount_try`, `limit_price` | BIST stock MARKET/LIMIT orders and TEFAS DEMAND sell orders, after desktop confirmation |
| `update_order` | `order_id`, exact `symbol`, changed quantity/prices | Update supported pending LIMIT/STOP/TP/SL orders, after desktop confirmation |
| `cancel_order` | `order_id`, exact `symbol` | Cancel an eligible pending order, after desktop confirmation |

BIST stocks, US stocks and ETFs, and Turkish mutual funds are all readable, including
instruments you do not hold.

> **Read symbol resolution is fuzzy.** Symbols are looked up by search, and an unknown ticker
> silently resolves to the closest match rather than failing: asking for `VOO` can return
> the fund `IOO`, and `TTE` can return TotalEnergies instead of the Turkish fund of the
> same code. Always check the `name` and `currency` in a read response. Write tools add an
> exact returned-symbol check and reject a fuzzy mismatch.

TEFAS fund sells are supported with a `DEMAND` order and quantity. Fund buys currently
fail closed: the captured Atlas bundle did not prove whether the request must contain a
TRY amount or a quantity, so the server does not guess.

## Setup

Requires Node.js 20+.

```bash
git clone https://github.com/<you>/mcp-midas.git
cd mcp-midas
npm install
npx playwright install chromium
cp .env.example .env    # then fill in your credentials
npm run build
```

`.env`:

```ini
MIDAS_PHONE=5XXXXXXXXX      # Turkish mobile number, no country code
MIDAS_PASSWORD=your-password
HEADLESS=true
MAX_ORDER_VALUE_TRY=10000  # Additional ceiling; desktop confirmation is always required
```

Any secret manager that can inject environment variables works instead of `.env` — the
config only reads `process.env`.

### Authentication

Midas requires approving a push notification in the mobile app, so the first login is
interactive:

```bash
npm run login          # opens a visible browser, then approve the prompt on your phone
npm run smoke          # prints your portfolio, positions and a quote
```

After that it runs silently. Atlas keeps its auth in `access_token` (~15 min) and
`refresh_token` (~24 h) cookies, which Chromium does **not** write to the profile's
cookie database — a persistent profile alone comes back logged out. The session is
therefore snapshotted with Playwright's `storageState()` into `.midas-state.json`
(mode 0600, gitignored) after every successful start, and replayed on the next one.

Each use refreshes the token. If the server goes unused for longer than the refresh
token's lifetime, it logs in again on its own: a headless process briefly reopens the
browser visibly to complete the SSO form, then returns to headless. That relogin may
ask for a push approval again. A read request rejected with HTTP 401/403 is retried once
after this shared relogin flow. A mutation is never retried automatically: it fails and
a new tool call must pass through a fresh desktop confirmation.

### Register with an MCP client

```bash
claude mcp add midas -- node /absolute/path/to/mcp-midas/dist/index.js
```

Or, for any client that reads a JSON config:

```json
{
  "mcpServers": {
    "midas": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-midas/dist/index.js"]
    }
  }
}
```

## Extras: BIST scanning

`CLAUDE.md` and `METHOD.md` carry a quantitative ruleset for scoring BIST stocks, and
`src/` holds the scan, backtest and positioning code it drives (`positions-scan.ts`,
`backtest.ts`, `rescore.ts`, `positioning.ts`, `vwap.ts`, `inflation.ts`). These are
**experimental and unverified** — the scoring model has not been validated beyond its
own backtest, and nothing here is investment advice. The MCP server does not depend on
any of it.

## How it works

`src/session.ts` launches a persistent Chromium profile, handles login and the state
snapshot. Auth is cookie-based, so `src/api.ts` runs each GraphQL request via
`page.evaluate` inside the authenticated page rather than reimplementing the token flow.

Two details are easy to miss when working on this:

- The API gateway requires an `x-midas-rid` header. It is a stable per-profile request
  id generated by the web app, so the session observes it on the app's own requests
  instead of trying to recompute it.
- The gateway routes on `x-apollo-operation-name`, which must be the **root field name**,
  not the operation name. When a document's first selection is an alias, the real field
  name has to be passed explicitly.

Headless Chromium is rejected with a 403 unless it presents a normal user agent and
client hints; `session.ts` sets these.

`scripts/` holds the tooling used to map the API, kept for when Midas changes it:
`browser-daemon.ts` (logging browser with a CDP port), `analyze.ts` (summarise captured
GraphQL traffic), `dump-panel-bundles.ts` (download lazy-loaded chunks), and
`extract-ops.ts` / `extract-document.ts` (recover GraphQL documents from the minified
bundle's embedded AST — introspection is disabled server-side).

## Disclaimer

Unofficial, not affiliated with or endorsed by Midas. It depends on undocumented
internal endpoints that can change without notice. Use at your own risk.

## License

MIT — see [LICENSE](LICENSE).
