# Changelog

All notable changes to the **UpgradeLens** (formerly *Antigravity*) extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.11] - 2026-10-13

### Added
- **Cloud-Based Remote Rules Architecture**:
  - Centralized manifest routing via `https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/manifest.json`.
  - Automatic detection of project framework dependencies and versions from `package.json`.
  - In-memory caching with 10-minute TTL to prevent redundant network requests.
  - Asynchronous background pre-fetching on extension activation.
  - Fail-safe offline fallback to local rules during network failure or timeouts.
  - Safe payload validation isolating invalid JSON or malformed rules.
- **Framework Breaking Change Rules**:
  - **Next.js 16 & 17**: 15 migration rules covering async `params`/`searchParams`, `middleware.ts` to `proxy.ts`, removal of `next/amp`, `unstable_cache` deprecation, Pages Router deprecation, and stable Partial Prerendering.
  - **React 19 & 20 (26 Rules)**: Complete, limit-free coverage of all React 19 breaking changes and deprecations (18 rules including `ReactDOM.render`, `ReactDOM.hydrate`, `unmountComponentAtNode`, `findDOMNode`, `this.refs`, `defaultProps`, legacy lifecycles, legacy context, `createFactory`, `react-test-renderer/shallow`, `test-utils`, `useFormState`, `forwardRef`, `<Context.Provider>`, `useRef()`, `react-test-renderer`) and 8 React 20 removal rules.
  - **Prisma 6**: 8 migration rules covering removal of `rejectOnNotFound`, `prisma.$use()` deprecation, and removal of `NotFoundError`.
- **Prisma Schema DSL Scanner**:
  - Dedicated DSL parser in `src/scanner/prismaSchemaScanner.ts` for `.prisma` files.
  - Flags graduated `previewFeatures` (`driverAdapters`, `relationJoins`) and deprecated `jsonProtocol`.
- **Precision Workspace Access**:
  - Unblocked user-authored files (`prisma/schema.prisma`, `prisma/seed.ts`, `prisma/*.ts`).
  - Targeted excludes for auto-generated files (`**/.prisma/**`, `**/prisma/runtime/**`, `**/prisma/migrations/**`).

### Changed
- **Rebranding to UpgradeLens**:
  - Primary commands registered under `upgradelens.*` with category `UpgradeLens`.
  - Retained backward-compatible aliases for all legacy `antigravity.*` commands and settings.
  - Configuration namespace updated to `upgradelens.*` with fallback to `antigravity.*`.

---

## [0.1.0] - Initial Release
- Core two-stage AST scanning engine with FastFilter token pre-filtering.
- Initial support for Next.js 14 to 15 migrations and React 18 to 19 migrations.
- Actionable Markdown migration report generation with clickable file line links.
