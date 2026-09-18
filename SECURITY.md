# Security

## Reporting

Please do not open a public issue for a security problem. Use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository instead.

## What this software touches

It holds a logged-in session to a brokerage account. That makes three things worth
knowing before you run it.

**Order tools are off by default.** `place_order`, `update_order` and `cancel_order` are
only registered when `MIDAS_ORDERS_ENABLED=1` is set; otherwise they do not appear in the
MCP tool list at all.

**Trades require a local human confirmation.** When enabled, the server can place, update and cancel
the supported order types, but it cannot send their mutations until its own process has
shown its confirmation window (designed PySide6 window, falling back to `kdialog`/`zenity`)
and the user has held **Yes**. The default is No; timeouts, missing display and dialog
failures reject, and dialog failures are reported as errors, not as a user's No. The MCP schemas have no confirmation
or bypass field, and the server revalidates the exact instrument and price after approval.

**Credentials never leave your machine.** `MIDAS_PHONE` and `MIDAS_PASSWORD` are read
from the environment and used in exactly one place: filling Midas's own SSO form
(`src/session.ts`). They are not logged, cached or sent anywhere else. The only network
destinations in the code are `atlas.getmidas.com` and `api.atlas.getmidas.com`.

**Three files are sensitive.** `.env` holds your password, `.midas-state.json` holds
live session tokens — anyone with that file can read your account until the tokens
expire — and `.midas-orders.log.jsonl` contains local order audit records. All are
gitignored; state and audit files use mode 0600. The browser profile in `.midas-session/`
is likewise local. Do not commit or copy them.

## Scope

Reports about the scanning, backtest and scoring code (`docs/analiz-kurallari.md`,
`METHOD.md`, `src/backtest.ts`, `src/rescore.ts`, `src/positioning.ts`) are welcome but
that code is explicitly experimental and produces no financial advice.
