# Antigravity - Framework Migration Assistant 🚀

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue.svg)](https://code.visualstudio.com/)
[![Tests](https://img.shields.io/badge/Tests-36%2F36%20Passing-brightgreen.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A lightweight, high-performance VS Code extension designed to streamline framework and library upgrades (**Next.js 14 &rarr; 15 &rarr; 16**, **React 18 &rarr; 19**, and beyond).

Instead of guessing what broke after running `npm install`, **Antigravity** detects version bumps in your `package.json`, runs an ultra-fast two-stage static AST scan across your codebase, and generates a developer-friendly **Migration Document / Update Report** in Markdown with clickable file & line numbers.

---

## ⚡ Features

- **Real-Time Version Bump Detection**: Monitors `package.json` for upgrades to tracked frameworks (Next.js, React). Debounced to avoid interfering with package installations.
- **🏎️ Two-Stage Static Code Analysis**:
  - **Stage 1 (Fast Token Pre-Filter)**: Eliminates 90–95% of non-candidate files in milliseconds without parsing the AST.
  - **Stage 2 (Precision AST Parser)**: Uses `@babel/parser` & `@babel/traverse` to verify AST nodes, ensuring zero false positives and extracting 1-indexed lines, columns, and code snippets.
- **🎯 Interactive Custom Version Scan**: Choose any framework and enter arbitrary source & target versions (e.g. 14 &rarr; 15, 15 &rarr; 16) to dynamically filter migration rules and scan on-demand.
- **📑 Actionable Markdown Reports**:
  - Automatically opens an in-memory Markdown preview side-by-side (`markdown.showPreviewToSide`).
  - Contains clickable line navigation links (e.g. `[app/api/auth/route.ts:4](file:///...#L4)`).
  - Collapsible Before & After code remediation examples.
  - Actionable checklists so you can track your migration progress.
- **💾 Save to Workspace**: One-click command to export `MIGRATION_REPORT.md` to your project root.

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

### Next.js 14 &rarr; 15 (15 Rules)
- **Async `cookies()` requirement**: Flags synchronous `cookies().get(...)` calls (must be `await cookies()`).
- **Async `headers()` requirement**: Flags synchronous `headers().get(...)` calls (must be `await headers()`).
- **Async `draftMode()` requirement**: Flags synchronous `draftMode()` calls (must be `await draftMode()`).
- **NextRequest `request.geo` removal**: Flags removed `request.geo` property (migrated to `@vercel/functions`).
- **NextRequest `request.ip` removal**: Flags removed `request.ip` property (migrated to `@vercel/functions`).
- **`fetch()` caching default change**: Flags `fetch()` calls affected by the new `no-store` default.
- **Route Handlers dynamic default**: Flags GET Route Handlers defaulting to dynamic/uncached.
- **App Router legacy imports**: Flags `import { useRouter } from 'next/router'` inside `app/**` routes.
- **Deprecated `<Image>` props**: Flags legacy `layout` and `objectFit` props.
- **Removed `next/legacy/image`**: Flags imports from the removed `next/legacy/image` module.
- **Removed `@next/font`**: Flags imports from the removed `@next/font` package (migrated to `next/font`).
- **React 19 `useFormState`**: Flags `useFormState` in favor of `useActionState`.
- **`unstable_after` stabilization**: Flags `unstable_after` in favor of `after`.
- **`serverExternalPackages` config**: Flags `experimental.serverExternalPackages` moved to top-level `serverExternalPackages`.
- **Removed `swcMinify` config**: Flags removed `swcMinify` in `next.config.js`.

### React 18 &rarr; 19 (6 Rules)
- **`ReactDOM.render` removal**: Flags removed `ReactDOM.render(...)` calls in favor of `createRoot(...)`.
- **`ReactDOM.unmountComponentAtNode` removal**: Flags removed unmount calls in favor of `root.unmount()`.
- **`ReactDOM.findDOMNode` removal**: Flags removed escape-hatch calls in favor of DOM refs.
- **`React.PropTypes` removal**: Flags deprecated core PropTypes.
- **Legacy string refs**: Flags `<input ref="myInput" />` in favor of `useRef`.
- **Deprecated lifecycle methods**: Flags `componentWillReceiveProps`, `componentWillMount`, `componentWillUpdate`.

---

## ⌨️ Extension Commands

Press `Ctrl+Shift+P` (or `Cmd+Shift+P`) to open the Command Palette:

| Command | Palette Title | Description |
|---|---|---|
| `antigravity.scanProject` | **Antigravity: Run Migration Scan** | Scans the workspace against detected version upgrade rules and displays the report. |
| `antigravity.customScan` | **Antigravity: Run Custom Version Scan** | Interactively prompts for framework, current version, and target version to run targeted scans. |
| `antigravity.inspectDependencies` | **Antigravity: Inspect Tracked Dependencies** | Displays currently installed versions of tracked frameworks in `package.json`. |
| `antigravity.saveReport` | **Antigravity: Save Migration Report to File** | Exports the current migration report to `MIGRATION_REPORT.md` in your project root. |

---

## ⚙️ Configuration Settings

Configure in your VS Code `settings.json`:

```json
{
  "antigravity.autoScanOnDependencyChange": "ask",
  "antigravity.saveReportToFile": false,
  "antigravity.reportOutputPath": "MIGRATION_REPORT.md",
  "antigravity.excludeGlobs": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
    "**/.next/**"
  ]
}
```

- `antigravity.autoScanOnDependencyChange`: `"ask"` (default), `"always"`, or `"never"`.
- `antigravity.saveReportToFile`: Automatically saves `MIGRATION_REPORT.md` on every scan.
- `antigravity.reportOutputPath`: Custom destination path for exported reports.
- `antigravity.excludeGlobs`: Glob patterns to ignore during codebase scans.

---

## 📦 Installation & Packaging

### Install from `.vsix` Package
```bash
# In Antigravity IDE:
antigravity --install-extension antigravity-0.1.2.vsix --force

# In standard VS Code:
code --install-extension antigravity-0.1.2.vsix
```

Or via UI: Open the **Extensions view** (`Ctrl+Shift+X`), click **`...`** (Views and More Actions), and select **"Install from VSIX..."**.

---

## 💻 Development & Testing

```bash
# Clone the repository
git clone https://github.com/MOHAMADMAHADYHASAN/antigravity-extension.git
cd antigravity-extension

# Install dependencies
npm install

# Run automated test suites (36 unit & integration tests)
npm test

# Build production bundle
npm run build

# Package release .vsix
npm run release
```

### Running in Development Host
1. Open this repository in VS Code.
2. Press **`F5`** to launch the **Extension Development Host**.
3. In the development window, open any Next.js or React project.
4. Run `Ctrl+Shift+P` &rarr; `Antigravity: Run Migration Scan`.

---

## 📄 License

MIT &copy; 2026 [Antigravity](https://github.com/MOHAMADMAHADYHASAN/antigravity-extension)
