# mcp-midas

[Türkçe](README.md) · The Turkish README is the primary documentation; this is a short summary.

**Unofficial** MCP server for the Midas brokerage web app (Atlas). Not affiliated with,
endorsed or supported by Midas Menkul Değerler A.Ş. or Midas Finansal Teknolojiler A.Ş.; no
Midas logo or branding is used. **Not investment advice**; provided as is, without warranty.

- **Your own account only, at your own risk.** The Midas framework agreement (art. 1.11)
  forbids consenting to unauthorized third-party intervention in the trading platform and
  expects the customer alone to use it. Do not use this to manage anyone else's account.
- **Credentials stay local**, supplied through environment variables (`MIDAS_PHONE`,
  `MIDAS_PASSWORD`) and sent only to Midas's own login form.
- **Read tools** (portfolio, positions, prices, instrument info, pending orders, transaction
  history, technicals, candles) are always available.
- **Order tools** (`place_order`, `update_order`, `cancel_order`) are **off by default** and
  only registered when `MIDAS_ORDERS_ENABLED=1`. Even then every order requires a local
  desktop confirmation window: default No, press-and-hold Yes, Enter never approves,
  Esc/close/120 s timeout mean No, and no argument or setting bypasses it.
- Setup: Node.js 20+, `npm ci`, `npx playwright install chromium`, `npm run build`,
  `npm run login` (approve the push notification on your phone).
- Tool descriptions and messages are in Turkish.

## Source and license

Forked from [ahmetdenizyilmaz/midas-mcp](https://github.com/ahmetdenizyilmaz/midas-mcp) at
upstream commit `a1bf39c`. Upstream has no `LICENSE` file; its license is declared as MIT in
`package.json` and its README. This repository is MIT as well; see [LICENSE](LICENSE).
