# Security

## Reporting

Please do not open a public issue for a security problem. Use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository instead.

## What this software touches

It holds a logged-in session to a brokerage account. That makes three things worth
knowing before you run it.

**It cannot trade.** The server exposes read tools only. There is no order-placing or
order-cancelling code in the repository — not disabled, absent. An assistant connected
to it can misread your portfolio, but it cannot move your money.

**Credentials never leave your machine.** `MIDAS_PHONE` and `MIDAS_PASSWORD` are read
from the environment and used in exactly one place: filling Midas's own SSO form
(`src/session.ts`). They are not logged, cached or sent anywhere else. The only network
destinations in the code are `atlas.getmidas.com` and `api.atlas.getmidas.com`.

**Two files are sensitive.** `.env` holds your password and `.midas-state.json` holds
live session tokens — anyone with that file can read your account until the tokens
expire. Both are gitignored, and the state file is written with mode 0600. The browser
profile in `.midas-session/` is likewise local. Do not commit or copy them.

## Scope

Reports about the scanning, backtest and scoring code (`CLAUDE.md`, `METHOD.md`,
`src/backtest.ts`, `src/rescore.ts`, `src/positioning.ts`) are welcome but that code is
explicitly experimental and produces no financial advice.
