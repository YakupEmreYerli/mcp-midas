<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/yazi-koyu.svg">
    <img src="docs/brand/yazi-acik.svg" alt="Midas-MCP" height="40">
  </picture>
</h1>

[![CI](https://github.com/YakupEmreYerli/mcp-midas/actions/workflows/ci.yml/badge.svg)](https://github.com/YakupEmreYerli/mcp-midas/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-4959EA)](LICENSE) [![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-0A0D2A?logo=nodedotjs&logoColor=22D67E)](https://nodejs.org) [![Orders: off by default](https://img.shields.io/badge/orders-off%20by%20default-F4C24D)](#turning-on-order-tools) [![Midas: unofficial](https://img.shields.io/badge/Midas-unofficial-8E95C8)](#unofficial)

**The agent reads the board and drafts the order. The order never reaches Midas until you approve it.**

An [MCP](https://modelcontextprotocol.io) server for [Atlas](https://atlas.getmidas.com/),
the web app of the Turkish brokerage Midas. It lets an AI assistant read your portfolio,
positions, transaction history and market data. Order tools are off by default; when
enabled, every order waits for your approval on the desktop.

> Türkçe (primary documentation): [README.md](README.md). Tool descriptions and messages
> are in Turkish.

![Midas-MCP: two equally sized confirmation windows, a green BUY and a red SELL, between two ticker strips on a dark board](docs/vitrin/hero.png)

## Unofficial

> [!WARNING]
> **Unofficial.** Not affiliated with, endorsed or supported by Midas Menkul Değerler A.Ş.
> or Midas Finansal Teknolojiler A.Ş. The name "Midas" only says which service this works
> with; no Midas logo or branding is used.
>
> **Not investment advice.** Data and calculations (including technical indicators) are
> informational. Provided as is, without warranty.
>
> **Your own account only, at your own risk.** The Midas framework agreement (art. 1.11)
> forbids consenting to unauthorized third-party intervention in the trading platform and
> expects the customer alone to use it. Do not use this to manage anyone else's account or
> offer it as a service.
>
> **Credentials stay local.** Phone number, password and session file stay on your machine
> and are sent only to Midas's own login form.

## Features

- **Read tools.** Portfolio value, cash and buying power, open positions, prices and
  instrument info for BIST stocks, US stocks and ETFs, and TEFAS funds.
- **Transaction history.** The full Atlas "İşlem geçmişi" screen: trades, TRY and FX
  transfers, dividends, interest and withholding, filtered by date, category and status.
- **Technical analysis.** RSI, moving averages, MACD, Bollinger, ATR, volatility, support
  and resistance in one call; raw OHLCV candles separately.
- **Desktop approval gate.** With order tools on, every order, update and cancel opens a
  window on your screen. Default is No; Yes has to be pressed and held.
- **Orders off by default.** Without the flag, order tools are not even listed.

![Illustrative agent session: the user asks about September trades and the portfolio; the agent calls get_transactions and get_portfolio and answers without placing any order. The data is made up.](docs/vitrin/okuma.png)

## Setup

Requires Node.js 20+, a Linux desktop (for order approval), a Midas account and the Midas
app on your phone.
On Wayland the approval window opens as a native Wayland window (falls back to X11); run
`onay/masaustu-kur.sh` once so the desktop shows the Midas-MCP logo as its icon.

```bash
git clone https://github.com/YakupEmreYerli/mcp-midas.git
cd mcp-midas
npm ci
npx playwright install chromium
npm run build
cp .env.example .env   # MIDAS_PHONE, MIDAS_PASSWORD; any secret manager that sets env vars works
npm run login          # visible browser; approve the push notification on your phone
claude mcp add midas -- node /absolute/path/mcp-midas/dist/index.js
```

For a persistent service, `dist/http.js` serves Streamable HTTP on `127.0.0.1:8766` with
a bearer token from `~/.config/mcp-midas/token`; a systemd user unit example is in the
[Turkish README](README.md#kurulum).

### Login window and keep-alive

The Midas refresh token lives a fixed 24 hours from login; refreshing the access token
(~15 min) neither rotates nor extends it, so one phone approval per day is still needed.
The login browser is headed (the SSO form has a Cloudflare Turnstile check), but by default
it stays out of sight. `MIDAS_LOGIN_WINDOW` picks the mode:

- `hidden` (default): Chromium runs on XWayland with the window class `mcp-midas-login`; on
  KDE Plasma a temporary KWin script minimizes it, moves it off-screen, makes it transparent
  and hides it from the taskbar (without KWin it is minimized over CDP). A desktop
  notification asks you to approve on your phone. If the check does not pass on its own
  within 30 s, the window is brought forward.
- `visible`: the old behaviour, a normal visible window.
- `headless` (experimental): fills the form in Chromium's new headless mode; if Turnstile
  does not pass within 20 s it falls back to `hidden` without submitting (no push is sent).

The HTTP service also runs a keep-alive every `MIDAS_KEEPALIVE_HOURS` hours (default 4,
`0` disables; first run one minute after start): it opens the saved session headless if
needed, sends a harmless read query, reloads once on 401 and saves `storageState`. It never
starts a login; a dropped session is only logged, and the next real tool call logs in.

### Turning on order tools

Order tools (`place_order`, `update_order`, `cancel_order`) are registered only when
`MIDAS_ORDERS_ENABLED=1` exactly. The flag only decides whether the tools exist; it never
relaxes the approval gate.

## Tools

| Read (always on) | Orders (off by default) |
| --- | --- |
| `get_portfolio`, `get_assets`, `get_asset_price`, `get_asset_info`, `get_pending_orders`, `get_transactions`, `get_transaction_filters`, `get_technicals`, `get_chart` | `place_order`, `update_order`, `cancel_order` |

Symbol lookup for read tools is fuzzy (check `name` and `currency` in the reply); order
tools require an exact symbol. When several instruments share a symbol (e.g. `GTM`: a TEFAS
fund and ZoomInfo on NASDAQ), the one you hold wins; otherwise read tools return
`ambiguousSymbol` with `candidates` and accept an optional `market` hint (`TR` or `US`),
while order tools refuse and list the candidates instead of guessing. `place_order` also
places take-profit/stop-loss sell orders (`take_profit_price`, `stop_loss_price`); Midas does
not allow updating an existing TP/SL order, so cancel it and place a new one. Full argument
tables are in the [Turkish README](README.md#araçlar).

## Security

![The five gates every order passes: flag, preview resolved from Midas, your approval on the desktop, revalidation after approval, Midas; an audit log records every step](docs/vitrin/emir-kapilari.png)

Default No; Yes is press-and-hold, Enter never approves; Esc, closing the window or 120 s
of silence mean No. No argument, environment variable or setting bypasses the window.
After approval the server re-resolves the instrument and price and aborts if either changed
(price by more than 2%). Every attempt is written to `.midas-orders.log.jsonl` (0600,
credentials stripped). Reporting a vulnerability: [SECURITY.md](SECURITY.md).

## Documentation

| Document | Covers |
| --- | --- |
| [METHOD.md](METHOD.md) | One-page summary of the BIST screening method (Turkish) |
| [docs/analiz-kurallari.md](docs/analiz-kurallari.md) | Full rule set for screening and scoring (Turkish) |
| [docs/brand](docs/brand/README.md) | Brand kit: logo, colours, type, voice (Turkish) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, pre-submit commands, repository pitfalls (Turkish) |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting, sensitive files (Turkish) |

## Source and license

Forked from [ahmetdenizyilmaz/midas-mcp](https://github.com/ahmetdenizyilmaz/midas-mcp) at
upstream commit `a1bf39c`. Upstream has no `LICENSE` file; its license is declared as MIT in
`package.json` and its README. This repository is MIT as well; see [LICENSE](LICENSE).
