# Changelog

## 1.5.0

Security, correctness and packaging release. No API changes, but several behaviors that were
previously crashes, hangs or silently-wrong output are now correct — see *Behavior changes*.

### Security

- Updated `lodash` to `^4.18.1` (GHSA-r5fr-rjxr-66jc code injection, GHSA-f23m-r3pf-42rh and
  GHSA-xxjr-mmjv-4gpg prototype pollution) and Babel to `^7.29.7` (GHSA-4x5r-pxfx-6jf8 arbitrary
  file read, GHSA-fv7c-fp4j-7gwp arbitrary code generation, GHSA-968p-4wvh-cqc8 ReDoS).
- Removed `babel-loader` and `@babel/polyfill` from `dependencies` — neither was imported, and
  together they pulled the vulnerable `brace-expansion` / `minimatch` / `picomatch` / `ajv` chain
  into every consumer's install. `npm audit` is now clean.
- Fixed an unbounded loop in the chunk scanner that spun forever (pinning a CPU core inside
  React's render phase) on ordinary input — any highlighted value containing `$$`, a duplicate
  path, or an overlapping path. In a browser this froze the tab; under SSR it wedged the request.

### Fixed

- **The published package could not be imported.** `dist/` was built with `useBuiltIns: "usage"`
  and emitted `require("core-js/modules/...")`, but `core-js` was never a dependency.
- **`react` was a hard dependency** instead of a peer dependency, giving consumers a duplicate
  React and "invalid hook call" errors. It is now a peer dependency (`^18 || ^19`).
- Values containing `$$`, `$&`, `` $` ``, `$'` or `$n` no longer corrupt the output or throw a
  `SyntaxError` during render — the marker is now spliced, not passed to `String.replace` as a
  replacement string.
- Json data containing the literal string `__marker__` no longer steals the highlight; the
  sentinel is now checked against the data and escalated until unique.
- Paths beginning with an index (`'[1].id'` on a top-level array) now work.
- `'a["b"]'` and `'a[\'b\']'` now work — path parsing uses lodash `toPath` instead of a regex.
- Keys containing `.` or `[` are addressable via the new array path form.
- Scalar json (`json={5}`, `json={true}`, or the strings `'5'` / `'true'` / `'null'`) now renders
  instead of producing an empty span.
- Overlapping paths (`['a', 'a.b']`) no longer emit a chunk running past the end of the text and
  swallowing the rest of the document; duplicates are collapsed.
- Inherited (prototype-chain) keys are no longer treated as valid paths — enumeration uses
  `Object.keys` rather than `for...in`.
- `textToHighlight`, `searchWords` and `findChunks` can no longer be clobbered by pass-through
  props, which desynced the highlight offsets.
- `npm run build` no longer compiles the test files into `dist/`.

### Behavior changes

- **A path that does not exist is now ignored, not thrown.** Previously `getSortedPaths` threw a
  raw `Error` from inside `useMemo` during render, which unmounts the consumer's entire React root
  — including on the very common first render where async data has not arrived yet. Unknown and
  malformed paths are now reported with `console.error` and skipped, and the remaining valid paths
  still highlight. If you relied on the throw, add the check upstream.
- **A string path always resolves as a nested path.** `'a.b'` means key `b` inside key `a`. In
  1.4.8 lodash's `isKey` would prefer a literal key named `a.b`. Use the array form `[['a.b']]` to
  target a literal key containing a dot.

### Other

- Added a test suite (166 tests: unit, component, and one regression test per defect above) with
  Jest, jsdom and Testing Library, plus coverage thresholds.
- `lodash` is now imported per-function (`lodash/get` etc.) rather than whole, shrinking consumer
  bundles.
- Added `.github/dependabot.yml` and a CI workflow running tests, build and `npm audit` on Node
  20/22/24, plus a weekly scheduled audit.
- Replaced the stale `yarn.lock` with a `package-lock.json` so `npm audit` runs at all — it
  previously failed with `ENOLOCK`.
