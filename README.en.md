<h1>
  <img src="docs/brand/yazi-acik.svg#gh-light-mode-only" alt="midas-mcp" height="40">
  <img src="docs/brand/yazi-koyu.svg#gh-dark-mode-only" alt="midas-mcp" height="40">
</h1>

[![CI](https://github.com/YakupEmreYerli/mcp-midas/actions/workflows/ci.yml/badge.svg)](https://github.com/YakupEmreYerli/mcp-midas/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-4959EA)](LICENSE) [![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-0A0D2A?logo=nodedotjs&logoColor=22D67E)](https://nodejs.org) [![Orders: off by default](https://img.shields.io/badge/orders-off%20by%20default-F4C24D)](#turning-on-order-tools) [![Midas: unofficial](https://img.shields.io/badge/Midas-unofficial-8E95C8)](#unofficial)

**The agent reads the board and drafts the order. The order never reaches Midas until you approve it.**

An [MCP](https://modelcontextprotocol.io) server for [Atlas](https://atlas.getmidas.com/),
the web app of the Turkish brokerage Midas. It lets an AI assistant read your portfolio,
positions, transaction history and market data. Order tools are off by default; when
enabled, every order waits for your approval on the desktop.

> Türkçe (primary documentation): [README.md](README.md). Tool descriptions and messages
> are in Turkish.

![midas-mcp: the agent drafts the order; it waits at the gate until you approve. Beside it, a green BUY and a red SELL confirmation window](docs/banner.en.png)

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
`onay/masaustu-kur.sh` once so the desktop shows the midas-mcp logo as its icon.

```bash
git clone https://github.com/YakupEmreYerli/mcp-midas.git
cd mcp-midas
npm ci
npx playwright install chromium
npm run build
cp .env.example .env   # MIDAS_PHONE, MIDAS_PASSWORD (optional: leave empty to type them in the login window)
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

`MIDAS_LOGIN_METHOD=sms` switches the second step from the phone push to an SMS code (for
accounts where approving the push fails with "geçersiz imza"). On the mobile-approval screen
the server picks "SMS ile giriş yap" and waits up to 8 minutes for the code:

- With a local desktop, the code is asked in the SMS code window (`onay/sms.py`), built like
  the approval window: digits only (4-8), Enter submits, Esc/close/timeout cancel. The server
  types the code into the login page and never logs it.
- `MIDAS_SMS_CODE_COMMAND` (JSON array) replaces that window with a command of your choice. It
  gets `{"hesapEtiketi": …, "sureSn": …}` on stdin and prints the code on stdout with exit 0;
  anything else counts as cancel. For example `["python3", "/absolute/path/mcp-midas/onay/sms.py"]`,
  or `["ssh", "user@desktop", "python3", "/absolute/path/mcp-midas/onay/sms.py"]` to ask on
  another machine.
- If no window opens or it is cancelled, the Midas browser window is brought forward and you
  type the code there.

The HTTP service also runs a keep-alive every `MIDAS_KEEPALIVE_HOURS` hours (default 4,
`0` disables; first run one minute after start): it opens the saved session headless if
needed, sends a harmless read query, reloads once on 401 and saves `storageState`. It never
starts a login; a dropped session is only logged, and the next real tool call logs in.

The browser does not stay open while idle: `MIDAS_IDLE_CLOSE_MINUTES` minutes after the last
tool call (default 10, `0` disables) it saves the latest tokens and closes. The next call
reopens the saved session headless; while the session is still valid no new login is needed.
The keep-alive also closes a browser it opened only to probe.

### Turning on order tools

Order tools (`place_order`, `update_order`, `cancel_order`) are registered only when
`MIDAS_ORDERS_ENABLED=1` exactly. The flag only decides whether the tools exist; it never
relaxes the approval gate.

### Several accounts

You can run more than one Midas account on one machine, for example your own and a minor's
account you manage. Each account is its own process; credentials, data directory, port and
token are never shared:

- `MIDAS_DATA_DIR`: directory for the browser profile, `.midas-state.json` and the order log
  (absolute path, `~/` allowed, created 0700). Defaults to the project root.
- `MIDAS_ACCOUNT_LABEL`: short account name (up to 40 characters), shown in the server name
  (`midas-mcp (child)`), the instructions given to the agent, every tool result, the approval
  window's strip and title, the kdialog/zenity fallbacks and login notifications.
- `MIDAS_HTTP_PORT`, `MIDAS_TOKEN_FILE`: a separate port and token per account for the HTTP
  service.

The account line (`Hesap: child`) comes as a separate content part after the JSON, so the
first part stays pure JSON.

```bash
claude mcp add midas-personal -e MIDAS_ACCOUNT_LABEL=personal -e MIDAS_DATA_DIR=~/.local/share/mcp-midas/personal \
  -e MIDAS_PHONE=5XXXXXXXXX -e MIDAS_PASSWORD=... -- node /absolute/path/mcp-midas/dist/index.js
claude mcp add midas-child -e MIDAS_ACCOUNT_LABEL=child -e MIDAS_DATA_DIR=~/.local/share/mcp-midas/child \
  -e MIDAS_PHONE=5YYYYYYYYY -e MIDAS_PASSWORD=... -- node /absolute/path/mcp-midas/dist/index.js
```

### Approving on another machine (optional)

By default the approval window opens only on the screen of the machine running the server,
and nothing in this section turns on by itself. If you run the server on a machine whose
screen nobody watches (for example a small server at home), or want the window on one more
machine at the same time, set these commands in the service environment. All are JSON arrays;
no shell is involved:

- `MIDAS_CONFIRM_REMOTE`: also opens the approval window elsewhere. Both windows open at once;
  the first Yes, No or timeout given in a shown window decides and the other window is closed.
- `MIDAS_CONFIRM_REMOTE_CLOSE` (optional): closes the remote window when the other one decided.
- `MIDAS_CONFIRM_LOCAL`: replaces the local approval window command; no display is needed on
  this machine and the kdialog/zenity fallbacks are skipped.
- `MIDAS_CONFIRM_LOCAL_CLOSE` (optional): closes the window opened through `MIDAS_CONFIRM_LOCAL`.

The command must run **the same approval window** (`onay/onay.py`) on the other machine. The
server passes the preview on stdin and reads the output with the same strict protocol as the
local window: only the `ACILDI` line together with `SONUC evet` and exit code 0 is a Yes;
everything else is No or an error.

```ini
Environment='MIDAS_CONFIRM_REMOTE=["ssh","-i","/etc/mcp-midas/onay_ed25519","user@desktop"]'
```

A window that never opens (machine off, ssh failed) is not waited for; if neither side opens
the result is an error and nothing is sent. An invalid value is not ignored: every approval
then fails as an error. The order audit log records which window decided (`onay` or
`onay-remote`) and the configured command.

## Tools

| Read (always on) | Orders (off by default) |
| --- | --- |
| `get_session_status`, `get_portfolio`, `get_assets`, `get_asset_price`, `get_asset_info`, `get_pending_orders`, `get_transactions`, `get_transaction_filters`, `get_technicals`, `get_chart` | `place_order`, `update_order`, `cancel_order` |

`get_session_status` reports whether the session is open **without starting a login** (no
browser is opened when there is no valid saved state); call it first when a login push is
unwanted.

Symbol lookup for read tools is fuzzy (check `name` and `currency` in the reply); order
tools require an exact symbol. When several instruments share a symbol (e.g. `GTM`: a TEFAS
fund and ZoomInfo on NASDAQ), the one you hold wins; otherwise read tools return
`ambiguousSymbol` with `candidates` and accept an optional `market` hint (`TR` or `US`),
while order tools refuse and list the candidates instead of guessing. `place_order` also
places take-profit/stop-loss sell orders (`take_profit_price`, `stop_loss_price`); Midas does
not allow updating an existing TP/SL order, so cancel it and place a new one. TEFAS fund sells
use `DEMAND` with a share count (`quantity`). Fund buys are refused: Midas Atlas does not offer
TEFAS buying (only the Midas mobile app does). Full argument
tables are in the [Turkish README](README.md#araçlar).

## Security

![The five gates every order passes: flag, preview resolved from Midas, your approval on the desktop, revalidation after approval, Midas; an audit log records every step](docs/vitrin/emir-kapilari.png)

Default No; Yes is press-and-hold, Enter never approves; Esc, closing the window or 120 s
of silence mean No. No argument, environment variable or setting bypasses the window.
After approval the server re-resolves the instrument and price and aborts if either changed
(price by more than 2%). Every attempt is written to `.midas-orders.log.jsonl` (0600,
credentials stripped). Reporting a vulnerability: [SECURITY.md](SECURITY.md).

### Approving on another machine: trust model

The default promise is that an order is approved only in a window on the machine running the
server. Setting `MIDAS_CONFIRM_REMOTE` or `MIDAS_CONFIRM_LOCAL` moves that trust. The command is
trusted like the local window: the server does not second-guess its output, it only checks the
protocol. From then on approvals are decided by

- anyone who can change the service configuration (systemd unit, `.env`),
- anyone who controls the other machine,
- whatever controls the link between the two (for example ssh keys).

These settings are read only from the server's environment at start-up, never from a tool
schema, an MCP request or a file that can change at run time; the agent can neither see nor
change them. Still, whoever writes the command could also write a script that answers Yes
instead of showing a window. What prevents that is who can touch the service configuration,
not the code.

With ssh, create a key used only for this and lock it to one command in the other machine's
`authorized_keys`:

```text
command="/usr/bin/python3 /absolute/path/mcp-midas/onay/onay.py",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... midas-onay
```

The command has to reach the graphical session on that machine (`DISPLAY`/`WAYLAND_DISPLAY`),
for example through a small wrapper started from that session. Use a separate key with its own
`command=` for the SMS code window.

## Documentation

| Document | Covers |
| --- | --- |
| [METHOD.md](METHOD.md) | Formulas and data source behind `get_technicals` (Turkish) |
| [docs/analiz-kurallari.md](docs/analiz-kurallari.md) | Guidelines the agent follows when analysing a stock or fund (Turkish) |
| [docs/brand](docs/brand/README.md) | Brand kit: logo, colours, type, voice (Turkish) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, pre-submit commands, repository pitfalls (Turkish) |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting, scope, sensitive files (Turkish) |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release and what you need to do |
| [RELEASES.md](RELEASES.md) | What a version number promises, what counts as breaking, supported versions |

## License

[MIT](LICENSE).
