[Türkçe](CONTRIBUTING.md) · **English**

# Contributing

Contributions are welcome: bug fixes, tests, docs (including README.en.md), test reports from
macOS or Windows, and spotting a tool that broke when the Midas web app changed. The project
runs on one person's spare time, so open an issue and talk it through before you start a big
change.

We won't accept:

- anything that loosens or bypasses the approval gate (see the rules below),
- changes that turn order tools on by default or test with live orders,
- anything whose tests need Midas credentials or a real account,
- content with personal portfolio data, personal strategy or investment advice.

## Setup

You need Node.js 20 or 22 (CI tests both) and git. The tests don't need a Midas account,
credentials, a `.env` file or a browser.

```bash
git clone https://github.com/YakupEmreYerli/mcp-midas.git
cd mcp-midas
npm ci
npm run build
npm test
```

Once the dependencies are downloaded, the build and tests take a few seconds. The output ends
like this:

```text
# tests 130
# pass 130
# fail 0
```

The test count grows over time; what matters is `fail 0`. To actually run the server you also
need `npx playwright install chromium`. To try the approval window you need PySide6 and
QtWebEngine in the system Python; without them, `kdialog` or `zenity` is used.

## What to work on

Issues labeled
[`good first issue`](https://github.com/YakupEmreYerli/mcp-midas/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
are set aside for newcomers. To claim one, comment on the issue; if no pull request or progress
update arrives within 14 days, the issue is open again. If nothing fits, open an issue
describing what you'd like to do.

## Before you submit

- `npm run build` and `npm test` must pass cleanly; CI runs the same two commands on Node.js 20
  and 22. The tests don't connect to Midas.
- Commit messages are in Turkish, with a subject that says concretely what changed and the
  reason in the body.
- Code comments are in Turkish. Tool descriptions and messages returned to the user are
  written in both Turkish and English (see [Turkish and English](#turkish-and-english)).
  Identifiers, JSON field names and tool names stay in English.
- If users will notice the change, add one line to the pull request description; the
  maintainer moves it into [CHANGELOG.md](CHANGELOG.md). If a tool name, argument, environment
  variable, the approval protocol or the audit log changes, check the compatibility rules in
  [RELEASES.md](RELEASES.md).
- `AGENTS.md` and `CLAUDE.md` are twins; if you change one, change the other too.
- No CLA or `Signed-off-by` line is required; your contribution is published under the
  project's [MIT license](LICENSE).

## After you submit

- The first response usually comes within a week.
- On your first pull request from a fork, a maintainer has to approve CI before it runs, so CI
  may be a little delayed.
- Keep "Allow edits by maintainers" on; if something small is missing, the maintainer can
  finish it and merge.
- Outside contributions are merged with a merge commit, so your authorship is kept. Every
  user-visible contribution is credited in the CHANGELOG with your GitHub username.
- If you hear nothing for two weeks, leave a comment on the pull request as a reminder. If
  you get stuck, write on the pull request or the issue too.

## Rules that don't change

- **No live order testing.** Don't send real orders, updates or cancellations to Midas during
  development or testing. The order path is tested with unit tests and a fake approver.
- **The approval gate can't be bypassed.** No `confirmed`, `approve`, test mode or any channel
  an agent could answer gets added to the tool schema, environment variables or configuration.
  The production path is wired to the real desktop runner (`src/desktop-confirmation.ts`).
- **Order tools stay off by default.** Only `MIDAS_ORDERS_ENABLED=1` turns them on
  (`src/tool-flags.ts`); no other value that enables the flag gets added.
- **Mutations are never retried automatically.** If the session drops, a read is retried once
  and an order isn't; a new call needs a new approval.
- Credentials, session files, the order log and `discovery/` output are never committed.

## Turkish and English

- `MIDAS_LANG` (`tr` | `en`) sets the language. Without it, the system locale decides
  (`LC_ALL`, `LC_MESSAGES`, `LANG`): any value starting with `tr` means Turkish, anything else
  means English.
- Every string a user or agent sees exists in both languages. TypeScript modules define their
  strings next to the code with `defineMessages(tr, en)` from `src/i18n.ts`; the `en` object
  must have exactly the same keys as `tr`. The compiler catches missing or extra keys, and
  `test/i18n.test.ts` checks them again at run time.
- The approval and SMS windows pick their language from the device that shows them
  (`onay/dil.py`: `LC_ALL`, `LC_MESSAGES`, `LANG`, and if all are empty `/etc/locale.conf`, then
  `/etc/default/locale`). When `MIDAS_LANG` is set, the server sends it as `dil` and that wins.
  Without it, the approval model carries the language-dependent strings under `metinler.tr` and
  `metinler.en` (`buildWindowModel`). Notifications, error messages and the kdialog/zenity
  fallbacks run on the server and use the server's language. Static
  page text lives in the `METIN` table in `onay/onay.js` and `onay/sms.js` (between the
  `METIN-BAŞI` and `METIN-SONU` markers). On the Python side, window titles and error reasons
  live in the `METIN` dict in `onay/onay.py` and `onay/sms.py`.
- Tool names, argument names and JSON field names never change with the language.
- Tests that expect Turkish text pin the language with `process.env.MIDAS_LANG = "tr"` at the
  top of the file.

## Repository pitfalls

- **`x-midas-rid` is observed, not computed.** The API gateway requires this header, and the
  web app generates it per profile. `src/session.ts` reads it from the app's own requests.
- **Routing uses the root field name.** The gateway routes on the `x-apollo-operation-name`
  header, and its value must be the first root field in the document, not the operation name.
  If the first selection is an alias, pass the real field name to `gql()` explicitly.
- **Headless Chromium gets a 403.** Without a normal user agent and client hint headers, the
  gateway rejects the request; `session.ts` sets them.
- **A persistent profile isn't enough on its own.** Atlas keeps the identity in session
  cookies, which Chromium doesn't write to disk. The session is saved to `.midas-state.json`
  with `storageState()`. A stale snapshot must be deleted before a new login, or its
  localStorage overwrites the fresh tokens.
- **Don't treat the session as open just by looking at the URL.** The profile can still show
  `/dashboard` after the cookies are gone; the session is verified by asking the API.
- **Introspection is off on the server.** A new GraphQL document is taken from an operation the
  Atlas web app sends in the browser's network traffic, and the field selection is trimmed to
  the fields the tool actually returns. Everything captured along the way is kept under
  `discovery/`; it may contain account data and is gitignored.
- **Symbol resolution is fuzzy for reads** and must be exact for order tools
  (`assertExactResolvedSymbol`). If several instruments share a symbol, the choice is made by
  the pure logic in `src/symbol-resolution.ts` (the order's instrument → an explicit market
  hint on reads → the position); on the order path, an ambiguous match is rejected, never
  guessed.

## Security

Report vulnerabilities through the process in [SECURITY.en.md](SECURITY.en.md), not as a
public issue.
