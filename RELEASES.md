# Release policy

This file says what a mcp-midas version number promises, what counts as a breaking change,
and which versions get fixes. Release notes for each version are in
[CHANGELOG.md](CHANGELOG.md).

## Version numbers

mcp-midas uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and is in the 0.x
range. Until 1.0:

- `0.MINOR` is the breaking digit. A new minor (0.3 to 0.4) may change behaviour or defaults
  and may remove or rename things, and the changelog says what you have to do.
- `0.x.PATCH` is a compatible fix. Upgrading within the same minor never needs a
  configuration change.

Releases are git tags (`vX.Y.Z`) with a GitHub release. The project is installed from a
clone of the repository; it is not published to npm.

## What we consider breaking

This tool can place orders on a brokerage account, so the public surface includes the parts
other machines and scripts rely on, not only the MCP interface.

Covered by this policy:

- **MCP tools:** tool names, input argument names, types, allowed values and whether they
  are required; documented fields in the JSON result (`content[0]`). Adding a tool, an
  optional argument or a result field is not breaking.
- **Order tool gating:** order tools are registered only when `MIDAS_ORDERS_ENABLED` is
  exactly `1`.
- **Environment variables:** names, accepted values and defaults that change what the
  server does with your account (for example where files are written or whether a browser
  window opens).
- **Approval window protocol:** what the server sends to `onay/onay.py` on stdin, the
  `ACILDI` and `SONUC <x>` lines it reads back, and the exit codes. Commands set in
  `MIDAS_CONFIRM_REMOTE` or `MIDAS_CONFIRM_LOCAL` may run a copy of the window on another
  machine, so both sides must keep speaking the same protocol.
- **SMS code command protocol:** the JSON on stdin of `MIDAS_SMS_CODE_COMMAND`, the code on
  stdout and the exit codes.
- **Files on disk:** names and locations of `.env`, `.midas-state.json`,
  `.midas-orders.log.jsonl` and `.midas-session/`, including the `MIDAS_DATA_DIR` layout.
- **Order audit log:** one JSON object per line; existing field names and meanings stay.
  New fields may be added in any release.
- **HTTP service:** `127.0.0.1` binding, the `/mcp` path, bearer token authentication, the
  default port and the token file location.
- **Node.js floor:** see Runtime support.

One exception: a change that makes the approval gate stricter (refuses an order the old
version would have shown or sent) may ship in any release, including a patch, when it fixes
a safety problem. The changelog still says what changed.

Not covered:

- Human-readable text: tool descriptions, error and log messages, notification text, the
  wording and look of the approval and SMS windows.
- The account line appended after the JSON result when `MIDAS_ACCOUNT_LABEL` is set.
- The browser identity (user agent, client hints) sent to Midas.
- Internal modules under `src/` imported from code, the npm scripts other than `build`,
  `start` and `test`, and the analysis guide (`docs/analiz-kurallari.md`, `METHOD.md`).
- Midas's own behaviour. The server drives an undocumented web API that can change without
  notice; adapting to such a change ships as a fix and cannot be held back for policy.

Opt-in unstable: none.

## Runtime support

- **Node.js:** the floor is `engines.node` in `package.json` (currently `>=20`). CI tests
  every line listed in `.github/workflows/ci.yml`. Dropping a Node.js line that the Node.js
  project no longer supports may ship in a minor, announced in the changelog, with
  `engines.node` raised in the same release. npm only warns on `engines`, so read the
  changelog before upgrading Node-pinned installs.
- **Approval window:** a Linux desktop with Python 3, PySide6 and QtWebEngine; without them
  the server falls back to `kdialog` and then `zenity`. A host where no window can open
  refuses every order.

## Pre-releases and withdrawal

No pre-release channel is planned. If one is used, tags are `vX.Y.Z-rc.N`, marked as
pre-release on GitHub, and not supported.

Published tags are never moved or reused. A release with a security hole, an approval gate
defect or a break shipped as a patch is marked `[YANKED]` in the changelog and on its GitHub
release, and a fixed release follows.

## Release cadence

Feature-based: a release goes out when there is something worth shipping. There is no
fixed schedule and no promised maximum gap. Security fixes ship as soon as they are ready.

## Supported versions

| Line                 | Status      | Fixes                   | Supported until            |
| -------------------- | ----------- | ----------------------- | -------------------------- |
| latest minor (0.4.x) | current     | all, including security | until the next minor ships |
| older                | unsupported | none                    | -                          |

Issues on unsupported versions are closed with a link to this table unless they reproduce
on the latest release.

Capacity: one maintainer, latest line only, so there are no backports to staff. A second
supported line would cost a backport per security fix; that is not offered.

## Backports

None. Fixes land on `main` and ship in the next release of the current line.

## Deprecation

When an environment variable, tool or argument is renamed, the old name keeps working for at
least one minor release, logs a warning that names the replacement, and is listed under
**Deprecated** in the changelog. It is removed in a later minor, listed under **Removed**.
Settings that weaken the approval gate are the exception: they can be removed without a
deprecation period.

## When 1.0 happens

1.0 means the surface above is frozen and only a new major can break it. It will be tagged
when all of these hold:

- the tool set, argument schemas and environment variables have gone two minor releases
  without a breaking change,
- the approval window and SMS command protocols have been used across machines for at
  least one minor release without a protocol change,
- the release check below is automated in CI.

1.0 will not promise that Midas keeps its web API stable; nobody can promise that.

## Known past breaks

None since the first public release, 0.3.0.

## Who can cut a release

Only the repository owner can push tags and publish GitHub releases. When they are
unavailable, no release ships.

Before tagging, check that the tag, the `version` in `package.json` and the newest heading
in `CHANGELOG.md` show the same number.

## Changes to this policy

Policy changes are announced in the changelog of the release that introduces them.
