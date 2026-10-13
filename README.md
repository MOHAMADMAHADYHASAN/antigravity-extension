# UpgradeLens - Framework Migration Assistant 🚀

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue.svg)](https://code.visualstudio.com/)
[![Tests](https://img.shields.io/badge/Tests-80%2F80%20Passing-brightgreen.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A lightweight, high-performance VS Code extension designed to streamline framework and library upgrades (**Next.js 14 &rarr; 15 &rarr; 16 &rarr; 17**, **React 18 &rarr; 19 &rarr; 20**, **Prisma 5 &rarr; 6**, and beyond).

Instead of guessing what broke after running `npm install`, **UpgradeLens** detects version bumps in your `package.json`, runs an ultra-fast two-stage static AST scan across your codebase, and generates a developer-friendly **Migration Document / Update Report** in Markdown with clickable file & line numbers.

---

## ⚡ Features

- **Real-Time Version Bump Detection**: Monitors `package.json` for upgrades to tracked frameworks (Next.js, React, Prisma). Debounced to avoid interfering with package installations.
- **🌐 Dynamic Version-Based Remote Rules Loading**: Automatically queries a central `manifest.json` on GitHub Raw URLs, resolving exact major versions (e.g. Next.js 16/17, React 19/20, Prisma 6) or default rules with built-in caching and offline fallback.
- **🏎️ Two-Stage Static Code Analysis**:
  - **Stage 1 (Fast Token Pre-Filter)**: Eliminates 90–95% of non-candidate files in milliseconds without parsing the AST.
  - **Stage 2 (Precision AST Parser)**: Uses `@babel/parser` & `@babel/traverse` to verify AST nodes, ensuring zero false positives and extracting 1-indexed lines, columns, and code snippets.
- **🎯 Interactive Custom Version Scan**: Choose any framework and enter arbitrary source & target versions (e.g. 15 &rarr; 16, 5 &rarr; 6) to dynamically filter migration rules and scan on-demand.
- **📑 Actionable Markdown Reports**:
  - Automatically opens an in-memory Markdown preview side-by-side (`markdown.showPreviewToSide`).
  - Contains clickable line navigation links (e.g. `[app/api/auth/route.ts:4](file:///...#L4)`).
  - Collapsible Before & After code remediation examples.
  - Actionable checklists so you can track your migration progress.
- **💾 Save to Workspace**: One-click command to export `MIGRATION_REPORT.md` to your project root.
- **🔄 Full Backward Compatibility**: Supports both new `upgradelens.*` commands and settings as well as legacy `antigravity.*` aliases.

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
- **Removed Legacy Lifecycles**: `componentWillMount`, `componentWillReceiveProps`, `componentWillUpdate` removed.
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

### Prisma 5 &rarr; 6 (5 Rules)
- **Bytes fields return Uint8Array**: Node.js `Buffer` replaced by native `Uint8Array`.
- **`NotFoundError` export removed**: Replaced by `PrismaClientKnownRequestError` with error code `P2025`.
- **`rejectOnNotFound` option removed**: Replaced by `findUniqueOrThrow()` and `findFirstOrThrow()`.
- **`prisma.$use()` middleware deprecated**: Migrated to Client Extensions (`prisma.$extends()`).
- **`$executeRawUnsafe` warning**: Flags unparameterized raw SQL in favor of tagged template `$executeRaw`.

---

## 🌐 Dynamic Remote Rules Architecture

UpgradeLens retrieves remote rules using a central `manifest.json` hosted on GitHub Raw URLs:

```text
antigravity-extension/
└── remote-rules/
    ├── manifest.json
    ├── nextjs-15.json
    ├── nextjs-16.json
    ├── nextjs-17.json
    ├── react-19.json
    ├── react-20.json
    └── prisma-6.json
```

1. **Detection**: On startup or `package.json` modification, UpgradeLens reads dependencies and extracts major versions.
2. **Manifest Resolution**: Looks up `https://raw.githubusercontent.com/.../manifest.json` for matching versions.
3. **Caching**: In-memory caching with a 10-minute TTL avoids duplicate network requests during iterative scans.
4. **Resilience & Offline Fallback**:
   - If the remote GitHub URL is unreachable or network is offline, the extension falls back to local files in `remote-rules/`.
   - If local files are unavailable, built-in rules compiled directly into the extension continue running without interruption.
   - Network timeouts, HTTP errors, or malformed JSON payloads are handled gracefully and never crash the extension.

---

## ⌨️ Extension Commands

Press `Ctrl+Shift+P` (or `Cmd+Shift+P`) to open the Command Palette:

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
    "**/prisma/**",
    "**/.prisma/**",
    "**/*.min.js"
  ],
  "upgradelens.remoteManifestUrl": "https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/manifest.json"
}
```

- `upgradelens.autoScanOnDependencyChange`: `"ask"` (default), `"always"`, or `"never"`.
- `upgradelens.saveReportToFile`: Automatically saves `MIGRATION_REPORT.md` on every scan.
- `upgradelens.reportOutputPath`: Custom destination path for exported reports.
- `upgradelens.excludeGlobs`: Glob patterns to ignore during codebase scans.
- `upgradelens.remoteManifestUrl`: Central manifest URL for remote rules loading and auto-updates.

*(Legacy `antigravity.*` settings are automatically read as fallbacks if `upgradelens.*` settings are unset).*

---

## 💻 Development & Testing

```bash
# Clone the repository
git clone https://github.com/MOHAMADMAHADYHASAN/antigravity-extension.git
cd antigravity-extension

# Install dependencies
npm install

# Run automated test suites (80+ unit & integration tests)
npm test

# Build production bundle
npm run build

# Package release .vsix
npm run release
```

---

## 📄 License

MIT &copy; 2026 [UpgradeLens](https://github.com/MOHAMADMAHADYHASAN/antigravity-extension)
