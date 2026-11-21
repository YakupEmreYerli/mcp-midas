# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) in the 0.x range.
See [RELEASES.md](RELEASES.md) for what each number promises and which versions get fixes.

## [0.4.0] - 2026-11-21

Several accounts side by side, optional approval on another machine, and a quieter browser.
No setting has to change: without the new variables the server behaves like 0.3.0, except
for the changed defaults listed under **Changed**.

### Added

- **Several accounts.** Run one server process per Midas account. `MIDAS_DATA_DIR` moves the
  browser profile, `.midas-state.json` and the order audit log into a directory of its own
  (created with 0700 permissions); without it the files stay in the project root, so
  existing installs do not move. `MIDAS_ACCOUNT_LABEL` shows the account in the MCP server
  name, the server instructions, `get_session_status`, the approval window and login
  notifications, and as a separate text part after every tool result. `content[0]` stays
  pure JSON. For the HTTP service, give each account its own `MIDAS_HTTP_PORT` and
  `MIDAS_TOKEN_FILE`.
- **Approval on another machine (optional, off by default).** `MIDAS_CONFIRM_REMOTE` opens
  the same approval window somewhere else (for example over ssh) at the same time as the
  local one; the first Yes, No or timeout in a window that actually opened decides, and
  the other window is closed (`MIDAS_CONFIRM_REMOTE_CLOSE`). `MIDAS_CONFIRM_LOCAL` replaces
  the local window command on a host whose screen nobody watches; `kdialog` and `zenity` are
  then skipped (`MIDAS_CONFIRM_LOCAL_CLOSE`). These settings move approval trust to whoever
  controls the service configuration, the other machine and the link between them. Read
  the trust model in [SECURITY.md](SECURITY.md) or the README before setting them. An
  invalid value is not ignored: every approval then fails as an error and no order is sent.
- **The audit log records the approval command.** When one of the commands above is set,
  each entry in `.midas-orders.log.jsonl` also records which command asked. Existing fields
  are unchanged.
- **SMS code command.** With `MIDAS_LOGIN_METHOD=sms`, `MIDAS_SMS_CODE_COMMAND` runs a
  command that receives the account label and the time left as JSON on stdin and prints
  the code. The code is typed into the login page and never logged. If the command is
  cancelled, fails or prints no 4-8 digit code, you can still type the code into the Midas
  window.
- **SMS code window.** `onay/sms.py` asks for the SMS code in a window that matches the
  approval window.

### Changed

- **The idle browser closes after 10 minutes.** The browser a tool call opened saves the
  session and closes after `MIDAS_IDLE_CLOSE_MINUTES` (default 10) without use. The next
  call reopens it headless from the saved session, without a new login. Set
  `MIDAS_IDLE_CLOSE_MINUTES=0` to keep the browser open as in 0.3.0.
- **The SMS code is asked in its own window.** With `MIDAS_LOGIN_METHOD=sms`, no
  `MIDAS_SMS_CODE_COMMAND` and a local desktop, the server opens the SMS code window instead
  of bringing up the Midas browser window. The Midas window is still the fallback.
- **`MIDAS_PHONE` and `MIDAS_PASSWORD` are optional.** Without them the server still starts.
  When a login is needed, the Midas login window opens (even in headless mode) and a desktop
  notification asks you to sign in there. Previously the server refused to start without
  both. ([#12](https://github.com/YakupEmreYerli/mcp-midas/pull/12), thanks
  [@mlubbad](https://github.com/mlubbad))
- **The browser reports the host's own operating system to Midas.** macOS sends a macOS
  user agent and client hint ([#12](https://github.com/YakupEmreYerli/mcp-midas/pull/12),
  thanks [@mlubbad](https://github.com/mlubbad)), and Linux now sends a Linux one instead
  of claiming Windows. Windows and other platforms keep the Windows identity.
- **Internal: moved to zod 4.** The dependency moved from zod 3 to 4.6.7 to pick up the fix
  for an upstream memory advisory on oversized collections. No action needed. Tool names
  and arguments are unchanged; the JSON Schema the server advertises no longer carries
  `additionalProperties: false`, and unknown arguments are ignored as before.

## [0.3.0] - 2026-11-16

First public release: an unofficial MCP server for Midas Atlas that reads your portfolio,
transaction history and prices, and sends orders only after you approve them on your
desktop.

### Added

- Read tools: `get_session_status`, `get_portfolio`, `get_assets`, `get_asset_price`,
  `get_asset_info`, `get_pending_orders`, `get_transactions`, `get_transaction_filters`,
  `get_technicals`, `get_chart`.
- Order tools `place_order`, `update_order` and `cancel_order`, registered only with
  `MIDAS_ORDERS_ENABLED=1`. Every order, update and cancel opens a desktop approval window
  (default No, Yes is press-and-hold) and is written to `.midas-orders.log.jsonl`.
- `get_session_status` reports whether the session is open without starting a login, so no
  login notification is sent to your phone.
- SMS login: `MIDAS_LOGIN_METHOD=sms` signs in with an SMS code instead of the phone
  notification. The code is not stored anywhere.
- New logo, banner and screenshots; the approval window uses Geist and Geist Mono.

### Changed

- The technical analysis, real VWAP and CPI modules were rewritten; the CPI table uses the
  monthly changes published by TÜİK.

### Removed

- The TEFAS fund buy tool, because Midas Atlas does not offer fund buying.
- Screening and backtest scripts the server did not use.

[0.4.0]: https://github.com/YakupEmreYerli/mcp-midas/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/YakupEmreYerli/mcp-midas/releases/tag/v0.3.0
