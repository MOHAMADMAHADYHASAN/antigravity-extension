# Antigravity - Framework Migration Assistant 🚀

A lightweight, high-performance VS Code extension designed to streamline framework and library upgrades (Next.js 14 &rarr; 15, React 18 &rarr; 19, and beyond).

Instead of guessing what broke after running `npm install`, **Antigravity** detects version bumps in your `package.json`, runs an ultra-fast two-stage static AST scan across your codebase, and generates a developer-friendly **Migration Document / Update Report** in Markdown with clickable file & line numbers.

---

## Features

- **⚡ Version Bump Detection**: Monitors `package.json` for upgrades to tracked frameworks (Next.js, React). Debounced to avoid interfering with package installations.
- **🏎️ Two-Stage Static Code Analysis**:
  - **Stage 1 (Fast Token Pre-Filter)**: Eliminates 90–95% of non-matching files instantly without touching the AST.
  - **Stage 2 (Precision AST Parser)**: Uses `@babel/parser` & `@babel/traverse` to verify AST nodes, ensuring zero false positives and extracting 1-indexed lines and columns.
- **📑 Actionable Markdown Reports**:
  - Automatically opens an in-memory Markdown preview side-by-side (`markdown.showPreviewToSide`).
  - Contains clickable line navigation links (e.g. `[app/api/auth/route.ts:4](app/api/auth/route.ts#L4)`).
  - Collapsible Before & After code remediation examples.
  - Actionable checklists so you can track your migration progress.
- **💾 Save to Workspace**: Option to export `MIGRATION_REPORT.md` to your project root.

---

## Supported Framework Rulesets

### Next.js 14 &rarr; 15
- **Async `cookies()` requirement**: Flags synchronous `cookies().get(...)` calls (must be `await cookies()`).
- **Async `headers()` requirement**: Flags synchronous `headers().get(...)` calls (must be `await headers()`).
- **Async `draftMode()` requirement**: Flags synchronous `draftMode()` calls.
- **App Router legacy imports**: Flags `import { useRouter } from 'next/router'` inside `app/**` routes.
- **Deprecated `<Image>` props**: Flags legacy `layout` and `objectFit` props.

### React 18 &rarr; 19
- **`ReactDOM.render` removal**: Flags removed `ReactDOM.render(...)` calls in favor of `createRoot(...)`.
- **`ReactDOM.unmountComponentAtNode` removal**: Flags removed unmount calls in favor of `root.unmount()`.
- **`ReactDOM.findDOMNode` removal**: Flags removed escape-hatch calls.
- **`React.PropTypes` removal**: Flags deprecated core PropTypes.
- **Legacy string refs**: Flags `<input ref="myInput" />` in favor of `useRef`.
- **Deprecated lifecycle methods**: Flags `componentWillReceiveProps`, `componentWillMount`, `componentWillUpdate`.

---

## Extension Commands

| Command | Title | Description |
|---|---|---|
| `antigravity.scanProject` | **Antigravity: Run Migration Scan** | Scans the active workspace against migration rules and opens the report. |
| `antigravity.inspectDependencies` | **Antigravity: Inspect Tracked Dependencies** | Shows currently installed versions of tracked frameworks in `package.json`. |
| `antigravity.saveReport` | **Antigravity: Save Migration Report to File** | Writes the current report to `MIGRATION_REPORT.md` in the project root. |

---

## Configuration Settings

In your VS Code `settings.json`:

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

---

## Development & Testing

```bash
# Install dependencies
npm install

# Run automated test suites (26 unit & integration tests)
npm test

# Build production bundle
npm run build
```

To run the extension in VS Code:
1. Open this repository in VS Code.
2. Press **`F5`** to launch the **Extension Development Host**.
3. In the new window, open any Next.js or React project.
4. Modify `package.json` to bump `"next": "^15.0.0"` or `"react": "^19.0.0"` and save.
5. Antigravity will notify you and open the migration report side-by-side!
