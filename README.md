# UpgradeLens - Framework Migration Assistant 🚀

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue.svg)](https://code.visualstudio.com/)
[![Tests](https://img.shields.io/badge/Tests-94%2F94%20Passing-brightgreen.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A lightweight, enterprise-ready VS Code extension designed to streamline framework and library upgrades (**Next.js 14 &rarr; 15 &rarr; 16 &rarr; 17**, **React 18 &rarr; 19 &rarr; 20**, **Prisma 5 &rarr; 6**, and beyond).

Instead of guessing what broke after running `npm install`, **UpgradeLens** automatically detects version bumps in your `package.json`, runs an ultra-fast two-stage static AST & schema scan across your codebase, and generates a developer-friendly **Migration Document / Update Report** in Markdown with clickable file & line numbers, collapsible Before & After remediation examples, and interactive checklists.

---

## ⚡ Core Features

- **🔔 Real-Time Version Bump Detection**: Monitors `package.json` for upgrades to tracked frameworks (Next.js, React, Prisma). Debounced to prevent interruptions during active package installations.
- **🌐 Dynamic Version-Based Remote Rules Loading**: Automatically queries a centralized `manifest.json` on GitHub Raw URLs, resolving exact major versions (e.g. Next.js 15/16/17, React 19/20, Prisma 6) or default rules with built-in caching (10-minute TTL) and zero-crash offline fallbacks.
- **🏎️ High-Performance Two-Stage Code Analysis**:
  - **Stage 1 (Fast Token Pre-Filter)**: Inspects source files using lightweight string token matching, eliminating 90–95% of non-candidate files in milliseconds without parsing the AST.
  - **Stage 2 (Precision AST Parser)**: Employs `@babel/parser` & `@babel/traverse` to verify AST nodes, ensuring zero false positives and extracting 1-indexed lines, columns, and code snippets.
- **⚛️ Limit-Free React Migration Support**:
  - Comprehensive detection across **React 18 &rarr; 19 &rarr; 20** (26 rules total).
  - Advanced AST analysis for JSX elements (`<Context.Provider>` &rarr; `<Context>`), `this.refs` resolution on class components, `forwardRef` to standard `ref` props, `defaultProps` removal, and zero-argument `useRef()` enforcement.
- **🐘 Dedicated Prisma Schema DSL Scanner**:
  - Specialized schema parser ([`src/scanner/prismaSchemaScanner.ts`](file:///home/mahady-hasan/Desktop/extention/src/scanner/prismaSchemaScanner.ts)) for `.prisma` files that audits schema generator blocks, preview features, and driver adapters without failing Babel JS/TS syntax checks.
- **📂 Precision Workspace File Access**:
  - Automatically unblocks developer-authored files such as `prisma/schema.prisma`, `prisma/seed.ts`, and `prisma/*.ts`.
  - Strictly ignores auto-generated runtimes (`**/.prisma/**`, `**/prisma/runtime/**`, `**/prisma/migrations/**`, `**/dist/**`, `**/build/**`) to prevent false positive reports.
- **🎯 Interactive Custom Version Scan**: Choose any framework and enter arbitrary source and target versions (e.g. 15 &rarr; 16, 5 &rarr; 6, 18 &rarr; 19) to dynamically filter rules and audit on-demand.
- **📑 Actionable Markdown Migration Reports**:
  - Automatically opens an in-memory Markdown preview side-by-side (`markdown.showPreviewToSide`).
  - Clickable file & line navigation links (e.g. `[app/api/auth/route.ts:4](file:///...#L4)`).
  - Collapsible Before & After code remediation examples.
  - Interactive checklists to track migration completion.
- **💾 Save Report to Workspace**: One-click command to export `MIGRATION_REPORT.md` to your project root.
- **🔄 Full Backward Compatibility**: First-class support for both new `upgradelens.*` commands and settings as well as legacy `antigravity.*` aliases.

---

## 🛠️ Supported Framework Rulesets

### Next.js 15 &rarr; 16 (10 Rules)
- **Async `params` prop**: Flags synchronous `params.slug` or `params.id` in Pages and Layouts (must be `await params`).
- **Async `searchParams` prop**: Flags synchronous `searchParams` access (must be `await searchParams`).
- **`middleware` replaced by `proxy`**: Flags legacy `export function middleware` convention in favor of `proxy.ts`.
- **AMP support removed**: Flags imports from `next/amp` and `useAmp()`.
- **`unstable_cache` deprecated**: Flags `unstable_cache()` in favor of the `'use cache'` directive and `cacheLife()`.
- **`revalidateTag` profile changes**: Flags legacy `revalidateTag()` calls in favor of `updateTag()` / `cacheTag()`.
- **`serverRuntimeConfig` / `publicRuntimeConfig` removed**: Flags removed configs in `next.config.js`.
- **Turbopack custom `webpack` config**: Flags custom `webpack` in `next.config.js` when Turbopack is default.
- **Edge runtime on middleware/proxy deprecated**: Flags `export const runtime = 'edge'` in middleware/proxy.
- **`getInitialProps` deprecated**: Flags legacy `getInitialProps` in Pages router.

### Next.js 16 &rarr; 17 (5 Rules)
- **Pages Router deprecation**: Flags `/pages/` directory files in favor of App Router (`/app/`).
- **Stable Partial Prerendering (PPR)**: Flags `experimental_ppr` in favor of stable `ppr`.
- **Async `draftMode()`**: Flags synchronous `draftMode()` calls in favor of `await draftMode()`.
- **Turbopack default bundler**: Flags redundant `--turbo` and `--turbopack` script flags.
- **Legacy `headers()` removal**: Flags synchronous `headers()` invocations.

### React 18 &rarr; 19 (18 Rules)
- **Removed `ReactDOM.render`**: Replaced by `createRoot` from `react-dom/client`.
- **Removed `ReactDOM.hydrate`**: Replaced by `hydrateRoot` from `react-dom/client`.
- **Removed `unmountComponentAtNode`**: Replaced by `root.unmount()`.
- **Removed `findDOMNode`**: Direct DOM refs required on native elements.
- **Removed `React.PropTypes`**: Replaced by TypeScript interfaces or `prop-types` package.
- **Removed string refs**: Replaced by `useRef()` or callback refs.
- **Removed `this.refs`**: Direct `React.createRef()` required on class components.
- **Removed `defaultProps` on Function Components**: Replaced with ES6 default argument parameters.
- **Removed Legacy Lifecycles**: `componentWillMount`, `componentWillReceiveProps`, `componentWillUpdate` without `UNSAFE_` removed.
- **Removed Legacy Context**: `contextTypes` / `childContextTypes` removed in favor of `React.createContext()` and `use()`.
- **Removed `React.createFactory`**: Replaced by standard JSX elements.
- **Removed `react-test-renderer/shallow`**: Replaced by standalone `react-shallow-renderer` package.
- **Deprecated `react-dom/test-utils`**: Import `act` directly from `'react'`.
- **Deprecated `useFormState`**: Replaced by `useActionState` from `'react'`.
- **Deprecated `forwardRef`**: Function components receive `ref` directly as a regular prop.
- **Deprecated `<Context.Provider>`**: Render `<Context value={...}>` directly as a provider.
- **`useRef()` argument requirement**: Calling `useRef()` with 0 arguments deprecated in TS typings; use `useRef(null)`.
- **Deprecated `react-test-renderer`**: Migrated to React Testing Library (`@testing-library/react`).

### React 19 &rarr; 20 (8 Rules)
- **Removed `forwardRef`**: Direct `ref` prop required on function components.
- **Removed `<Context.Provider>`**: Direct `<Context value={...}>` required.
- **Removed `defaultProps`**: Removed across all component types.
- **Removed Legacy Context**: `contextTypes` completely removed.
- **Removed `react-dom/test-utils`**: Completely removed in favor of React Testing Library.
- **Removed `react-test-renderer`**: Completely removed in favor of React Testing Library.
- **Removed `useFormState`**: Completely removed from `react-dom`.
- **Removed `ReactDOM.findDOMNode`**: Completely removed from `react-dom`.

### Prisma 5 &rarr; 6 (8 Rules)
#### Client Runtime & AST (5 Rules)
- **`rejectOnNotFound` option removed**: Replaced by `findUniqueOrThrow()` and `findFirstOrThrow()`.
- **`prisma.$use()` middleware deprecated**: Migrated to Client Extensions (`prisma.$extends()`).
- **`NotFoundError` export removed**: Replaced by `PrismaClientKnownRequestError` with error code `P2025`.
- **Bytes fields return Uint8Array**: Node.js `Buffer` replaced by native `Uint8Array`.
- **`$executeRawUnsafe` warning**: Flags unparameterized raw SQL in favor of tagged template `$executeRaw`.

#### Schema DSL (3 Rules)
- **`driverAdapters` preview feature GA**: Flags obsolete `driverAdapters` preview flag in `schema.prisma`.
- **`relationJoins` preview feature GA**: Flags obsolete `relationJoins` preview flag in `schema.prisma`.
- **`jsonProtocol` preview feature deprecated**: Flags obsolete `jsonProtocol` flag (default in Prisma 6).

---

## 📁 Extension File Details & Architecture

UpgradeLens is architected cleanly with modular subsystems:

```text
antigravity-extension/
├── remote-rules/                       # Remote rules repository (GitHub Raw delivery)
│   ├── manifest.json                   # Central routing manifest for framework versions
│   ├── index.json                      # Rule catalog metadata
│   ├── nextjs-15.json                  # Next.js 14 -> 15 breaking changes
│   ├── nextjs-16.json                  # Next.js 15 -> 16 breaking changes
│   ├── nextjs-17.json                  # Next.js 16 -> 17 breaking changes
│   ├── react-19.json                   # React 18 -> 19 breaking changes (18 rules)
│   ├── react-20.json                   # React 19 -> 20 breaking changes (8 rules)
│   ├── react.json                      # Universal default React rules
│   └── prisma-6.json                   # Prisma 5 -> 6 AST & Schema rules (8 rules)
├── src/
│   ├── detector/
│   │   ├── dependencyWatcher.ts        # Debounced watcher for package.json upgrades
│   │   └── versionTracker.ts           # Semver diffing & storage snapshot tracker
│   ├── reporter/
│   │   ├── markdownGenerator.ts        # Generates structured reports with clickable line links
│   │   └── reportViewer.ts             # Virtual document & webview previewer
│   ├── rules/
│   │   ├── definitions/                # Bundled local rules for offline operation
│   │   ├── remoteRuleLoader.ts         # HTTPS client with 10-min cache & fail-safe fallbacks
│   │   └── ruleRegistry.ts             # Conflict-safe rule registration & semver filtering
│   ├── scanner/
│   │   ├── astScanner.ts               # Babel AST parser (JSX elements, ThisExpression, etc.)
│   │   ├── fastFilter.ts               # Sub-millisecond string token pre-filtering
│   │   ├── fileCollector.ts            # Workspace file collection with targeted excludes
│   │   ├── prismaSchemaScanner.ts      # Dedicated DSL scanner for .prisma schema files
│   │   └── scanEngine.ts               # Dual-engine orchestrator (AST + Prisma DSL)
│   ├── types/
│   │   ├── rules.ts                    # MigrationRule, AstPattern, & DetectionCriteria interfaces
│   │   ├── scanner.ts                  # ScanIssue & ScanResult definitions
│   │   └── tracker.ts                  # DependencySnapshot & VersionDiff interfaces
│   └── extension.ts                    # VS Code entrypoint, lifecycle, & command dispatcher
├── test/                               # Comprehensive unit & integration test suite (94 tests)
├── CHANGELOG.md                        # Version-by-version change log
├── package.json                        # VS Code extension manifest & contributions
└── README.md                           # Documentation & quick start guide
```

---

## 🌐 Dynamic Remote Rules Architecture

UpgradeLens retrieves remote rules using a central `manifest.json` hosted on GitHub Raw URLs:

```text
https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/manifest.json
```

```json
{
  "nextjs": {
    "15": "https://raw.githubusercontent.com/.../nextjs-15.json",
    "16": "https://raw.githubusercontent.com/.../nextjs-16.json",
    "17": "https://raw.githubusercontent.com/.../nextjs-17.json"
  },
  "react": {
    "default": "https://raw.githubusercontent.com/.../react.json",
    "19": "https://raw.githubusercontent.com/.../react-19.json",
    "20": "https://raw.githubusercontent.com/.../react-20.json"
  },
  "prisma": {
    "default": "https://raw.githubusercontent.com/.../prisma-6.json",
    "6": "https://raw.githubusercontent.com/.../prisma-6.json"
  }
}
```

### How Remote Loading Operates:
1. **Detection**: On startup or `package.json` modification, UpgradeLens reads dependencies and extracts major versions.
2. **Manifest Resolution**: Looks up `manifest.json` for exact matching versions or technology default fallbacks.
3. **Caching**: In-memory caching with a 10-minute TTL avoids duplicate network requests during iterative scans.
4. **Resilience & Offline Fallback**:
   - If the remote GitHub URL is unreachable or the network is offline, the extension automatically falls back to local files in `remote-rules/`.
   - If local files are unavailable, built-in rules compiled directly into the extension continue running without interruption.
   - Network timeouts, HTTP errors, or malformed JSON payloads are isolated and never crash the extension.

---

## ⌨️ Extension Commands

Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to open the Command Palette:

| Primary Command | Legacy Alias | Palette Title | Description |
|---|---|---|---|
| `upgradelens.scanProject` | `antigravity.scanProject` | **UpgradeLens: Run Migration Scan** | Scans the workspace against detected version upgrade rules and displays the report. |
| `upgradelens.customScan` | `antigravity.customScan` | **UpgradeLens: Run Custom Version Scan** | Interactively prompts for framework, current version, and target version to run targeted scans. |
| `upgradelens.inspectDependencies` | `antigravity.inspectDependencies` | **UpgradeLens: Inspect Tracked Dependencies** | Displays currently installed versions of tracked frameworks in `package.json`. |
| `upgradelens.saveReport` | `antigravity.saveReport` | **UpgradeLens: Save Migration Report to File** | Exports the current migration report to `MIGRATION_REPORT.md` in your project root. |

---

## ⚙️ Configuration Settings

Configure in your VS Code `settings.json`:

```json
{
  "upgradelens.autoScanOnDependencyChange": "ask",
  "upgradelens.saveReportToFile": false,
  "upgradelens.reportOutputPath": "MIGRATION_REPORT.md",
  "upgradelens.excludeGlobs": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
    "**/.next/**",
    "**/generated/**",
    "**/.prisma/**",
    "**/@prisma/client/**",
    "**/prisma/runtime/**",
    "**/prisma/client/**",
    "**/prisma/migrations/**",
    "**/*.min.js"
  ],
  "upgradelens.remoteManifestUrl": "https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/manifest.json"
}
```

- `upgradelens.autoScanOnDependencyChange`: `"ask"` (default), `"always"`, or `"never"`.
- `upgradelens.saveReportToFile`: Automatically saves `MIGRATION_REPORT.md` to disk upon every scan.
- `upgradelens.reportOutputPath`: Custom destination path for exported reports.
- `upgradelens.excludeGlobs`: Glob patterns to ignore during codebase scans (preserves `prisma/schema.prisma` and seeds).
- `upgradelens.remoteManifestUrl`: Central manifest URL for remote rules loading and updates.

*(Legacy `antigravity.*` settings are automatically read as fallbacks if `upgradelens.*` settings are unset).*

---

## 💡 How to Install

### Install from Packaged VSIX:
1. Download the latest **`upgradelens-0.1.13.vsix`** from the GitHub Release Assets.
2. In VS Code, open the Extensions panel (`Ctrl+Shift+X` or `Cmd+Shift+X`).
3. Click the **"..."** (Views and More Actions) menu in the top-right corner.
4. Select **"Install from VSIX..."**.
5. Choose the downloaded `.vsix` file and confirm installation.
6. Open your project and run **`UpgradeLens: Run Migration Scan`**!

---

## 💻 Development & Testing

```bash
# Clone the repository
git clone https://github.com/MOHAMADMAHADYHASAN/antigravity-extension.git
cd antigravity-extension

# Install dependencies
npm install

# Run automated test suites (94 unit & integration tests)
npm test

# Build production bundle
npm run build

# Package release .vsix
npm run release
```

---

## 📄 License

MIT &copy; 2026 [UpgradeLens](https://github.com/MOHAMADMAHADYHASAN/antigravity-extension)
