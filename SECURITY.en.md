[Türkçe](SECURITY.md) · **English**

# Security

This project holds a logged-in session to a brokerage account and can send orders. It makes
two promises: no order, change or cancellation reaches Midas without a human approving it, and
credentials and session tokens never leave the machine. Anything that breaks either promise is
a security vulnerability.

## Reporting

Don't report a vulnerability as a public issue, pull request or discussion. Use the
**Report a vulnerability** button on the repository's Security tab:
<https://github.com/YakupEmreYerli/mcp-midas/security/advisories/new>
([GitHub's guide to private reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).
If you can't see the button, open an issue titled "Private channel for a security report"
without any details, and we'll set up a private channel with you.

Include:

- the affected version or commit,
- a small proof that reproduces on a released version (ideally as a unit test),
- the impact you saw and, if you have one, a suggested fix.

If you used an AI tool, say so and confirm that you verified the result yourself. Reports
without a reproducible proof may be closed.

**Don't build your proof on a live account.** You don't need to send real orders to Midas or
probe someone else's account or Midas's systems, so don't. The order path is tested in unit
tests with a fake approver (`test/order-approval.test.ts`, `test/desktop-confirmation.test.ts`); a way around the approval gate can be shown in those tests too.

## What to expect

The project is run by one person in their spare time, and the timelines reflect that.

- **Acknowledgement:** within 5 business days.
- **First decision** (accepted, not a vulnerability, or more information needed): within 14 days.
- **Disclosure:** we aim to publish a fixed release and an advisory within 90 days of your
  report, and we set the date together with you. No advisory is published before a fixed
  release is out.

## Supported versions

Security fixes go to the latest release only. The table in [RELEASES.md](RELEASES.md) shows
which versions get fixes. A vulnerability found in an older version is accepted if it also
reproduces in the latest release.

## Scope

In scope, in the latest release used as documented:

- an order, change or cancellation request reaching Midas without Yes in the approval window;
  a window error, timeout or Esc counting as Yes; the approval protocol (`ACILDI`,
  `SONUC evet`, exit code 0) being misread,
- an order other than the one in the preview (symbol, side, quantity, price, account) being
  sent after approval,
- order tools being listed or running without `MIDAS_ORDERS_ENABLED=1`,
- an order request being retried on its own,
- the `midas` command calling a write tool (`place_order`, `update_order`, `cancel_order`)
  without `--confirm`, or `--confirm` skipping the server's approval,
- the password, SMS code or session tokens leaking into logs, the audit log, an error message
  or a tool result; sensitive files being written with wider permissions than documented,
- the HTTP service listening on anything other than `127.0.0.1`, or accepting a `/mcp` request without a valid token,
- preview data being able to run script in the approval or SMS window,
- in a multi-account setup, one account's data or orders ending up in another account's process.

Out of scope:

- what someone who can change the service configuration (environment variables, `.env`, the
  systemd unit) can do; the `MIDAS_CONFIRM_REMOTE`, `MIDAS_CONFIRM_LOCAL` and
  `MIDAS_SMS_CODE_COMMAND` commands running as configured. The trust model below explains
  where that trust moves.
- what a local attacker with the same user account or root can read
  (e.g. `.midas-state.json`),
- vulnerabilities in Midas's own app and servers; report those to Midas,
- breakage caused by changes to Midas's undocumented API (open a regular issue),
- errors in technical indicator calculations and the analysis guide (`src/technicals.ts`,
  `src/vwap.ts`, `src/inflation.ts`, `docs/analiz-kurallari.md`, `METHOD.md`); these don't
  produce investment advice, so open a regular issue,
- vulnerabilities in dependencies that our code doesn't reach, unsupported versions, and
  automated scanner output without a verified proof.

## Advisories and CVEs

For accepted vulnerabilities we publish an advisory on the repository's
[Security Advisories](https://github.com/YakupEmreYerli/mcp-midas/security/advisories)
page, request a CVE through GitHub, and rate severity with the CVSS 3.1 base metrics.

## Credit

Unless you'd rather we didn't, we credit you by name in the advisory and in
[CHANGELOG.md](CHANGELOG.md). The project has no bounty program and doesn't pay for reports.

## What this software touches

It holds a logged-in session to a brokerage account. Know these points before you run it:

**Order tools are off by default.** `place_order`, `update_order` and `cancel_order` are
registered only when `MIDAS_ORDERS_ENABLED=1` is set; otherwise they don't appear in the MCP
tool list at all.

**Every trade needs human approval.** With order tools on, the server can place, update and
cancel the supported order types, but it can't send these mutations unless its own process
shows the approval window (the designed PySide6 window, or `kdialog`/`zenity` if that can't
open) and the user holds down **Yes**. The default is No; timeouts, a missing display and
window errors are all refusals. Window errors are reported as errors, not as the user saying
No. The MCP schemas have no approval or bypass field, and after approval the server checks the
instrument and price again for an exact match. By default the window opens on the machine the
server runs on; it opens anywhere else only with the settings below.

**Approving on another machine is optional and moves the trust.** The default promise is that
an order can only be approved in a window on the machine the server runs on. If the operator
sets `MIDAS_CONFIRM_REMOTE` (also opens the window somewhere else) or `MIDAS_CONFIRM_LOCAL`
(replaces the local window command) in the service environment, that command is trusted as
much as the local window. There is no other way to do this and no auto-detection. The command
must run the same `onay/onay.py` window on the other machine, and the server reads its output
with the same strict protocol (only `ACILDI`, `SONUC evet` and exit code 0 together count as
Yes). The audit log records which window decided and the command itself. From then on,
approvals are in the hands of anyone who can change the service configuration, anyone who runs
the other machine, and whatever controls the connection between the two machines (e.g. ssh
keys). Whoever writes the command could also write a script that presses Yes instead of
showing a window; what stops that is who can touch the service configuration, not the code.
If you use ssh, we recommend a key dedicated to this job and locked to a single command in
`authorized_keys` on the other machine with
`command="…/onay/onay.py",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty`.
These settings are read from the environment only when the process starts; nothing in the
tool schema, an MCP request or a file that changes at run time maps to them. The same applies
to `MIDAS_SMS_CODE_COMMAND`: that command supplies the SMS code and can open a login session,
but it can't approve orders.

**The approval window only touches itself.** The window is frameless; its title bar is the
page's header strip. The close button on that strip, Esc and closing the window all produce No;
holding down the button is the only way to Yes. On Wayland, a temporary script loaded into
KWin (`onay/onay.py`, `KWIN_SCRIPT`) keeps only the window owned by the approval process's PID
on top, centers it and raises it; it's removed once the decision is made.
`onay/masaustu-kur.sh` only writes a `.desktop` file and an icon to your user directory
(`~/.local/share/`) and doesn't need root.

**Credentials never leave the machine.** `MIDAS_PHONE` and `MIDAS_PASSWORD` are read from the
environment and used in exactly one place: filling in Midas's own SSO form (`src/session.ts`).
They aren't logged, cached or sent anywhere else. Both are optional; without them, Midas's
login window opens when a login is needed and you type them in yourself. The only network
hosts in the code are `atlas.getmidas.com` and `api.atlas.getmidas.com`.

**Three files are sensitive.** `.env` holds your password, `.midas-state.json` holds live
session tokens (anyone with this file can read your account until the tokens expire), and
`.midas-orders.log.jsonl` holds the local order audit records. All are gitignored; the session
and audit files are written with 0600 permissions. The browser profile under
`.midas-session/` is local too. Don't commit or copy any of these. If `MIDAS_DATA_DIR` is set,
these files and the profile live in that directory (created with 0700 permissions); each
account has its own directory.

**The HTTP service listens locally only.** `dist/http.js` binds to `127.0.0.1` only and
checks `/mcp` requests against a bearer token. The token lives in `~/.config/mcp-midas/token`
by default (change it with `MIDAS_TOKEN_FILE`); with several accounts, each process has its
own port and token file.
