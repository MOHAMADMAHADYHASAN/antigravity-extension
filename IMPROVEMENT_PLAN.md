# 🚀 Antigravity Codebase Audit & Improvement Plan

## Goal Description
Conduct an end-to-end technical audit of the **Antigravity** VS Code extension codebase to identify performance bottlenecks, architectural gaps, UX deficiencies, and missing production features. This plan outlines a prioritized roadmap to elevate Antigravity from a report generator to a fully integrated in-editor migration suite.

---

## 🛠️ Prioritized Improvements

### 1. In-Editor Inline Diagnostics (`DiagnosticCollection`)
- **Problem**: Migration scan findings are currently only visible in the generated Markdown preview document. Developers looking at their source code see no inline visual cues or warnings on the affected lines.
- **Solution**: Register a `vscode.DiagnosticCollection` that renders error/warning squiggly underlines directly on the flagged lines and populates the native VS Code **Problems panel** (`Ctrl+Shift+M`).
- **Severity Mapping**:
  - `breaking` &rarr; `vscode.DiagnosticSeverity.Error` (red squiggly)
  - `deprecation` / `warning` &rarr; `vscode.DiagnosticSeverity.Warning` (yellow squiggly)
- **Features**: Diagnostic messages link directly to official documentation URLs and include one-line remediation summaries.

### 2. Automatic Workspace Custom Rules Loader (`.antigravity/rules.json`)
- **Problem**: `RuleRegistry.registerCustomRules()` exists in code, but is never invoked from workspace files. Teams wanting to define internal migration rules cannot currently do so without modifying the extension code.
- **Solution**:
  - Automatically detect and load `.antigravity/rules.json` (or `.antigravity/rules.yaml`) in the workspace root on startup.
  - Set up a live `FileSystemWatcher` on `.antigravity/rules.json` to hot-reload custom rules without requiring a VS Code restart.

### 3. Interactive Status Bar Item (`$(rocket) Antigravity`)
- **Problem**: Users must remember Command Palette shortcuts (`Ctrl+Shift+P` &rarr; `Antigravity: Run Migration Scan`) to interact with the extension.
- **Solution**:
  - Add a persistent status bar item `$(rocket) Antigravity` in the bottom status bar.
  - Clicking the item opens a QuickPick menu with direct actions:
    - 🔍 **Run Migration Scan**
    - 🎯 **Run Custom Version Scan**
    - 📦 **Inspect Tracked Dependencies**
    - 💾 **Save Report to File**
    - 🧹 **Clear Diagnostics**

### 4. Multi-Root Workspace & Monorepo Support
- **Problem**: `vscode.workspace.workspaceFolders[0]` is hardcoded in several commands. Monorepos with multiple packages or multi-root workspaces only scan the first folder.
- **Solution**:
  - Add workspace folder picker support (`vscode.window.showWorkspaceFolderPick`) when multiple workspace folders are detected, or allow scanning all workspace folders in one pass.

### 5. Batched Asynchronous I/O in `ScanEngine`
- **Problem**: `ScanEngine.runScan` reads files sequentially using synchronous `fs.readFileSync` in a single-threaded loop.
- **Solution**:
  - Batch file reads into chunks of 25–50 with `fs.promises.readFile` and `Promise.all` to reduce scan time by 2x–3x on large codebases (2,000+ files).

---

## 📁 Proposed File Changes

```
src/
├── types/
│   └── rules.ts               # Extended with diagnostic metadata if needed
├── reporter/
│   ├── diagnosticsManager.ts  # [NEW] Centralized manager for vscode.DiagnosticCollection
│   ├── markdownGenerator.ts   # Existing generator
│   └── reportViewer.ts        # Existing report display
├── rules/
│   ├── definitions/           # Next.js 14->15, Next.js 15->16, React 18->19 rules
│   └── ruleRegistry.ts        # [MODIFY] Added loadWorkspaceRules() and live watcher
├── scanner/
│   ├── scanEngine.ts          # [MODIFY] Batched async file reading
│   ├── fastFilter.ts          # Fast token pre-filter
│   ├── astScanner.ts          # AST traversal engine
│   └── fileCollector.ts       # File discovery & exclusions
├── ui/
│   └── statusBar.ts           # [NEW] Status bar item & quick actions menu
└── extension.ts               # [MODIFY] Wires DiagnosticsManager, StatusBar, workspace rules
```

---

## 🧪 Verification Plan

### Automated Test Suites
1. `test/diagnosticsManager.test.ts` — Verify diagnostic conversion, severity mapping, range formatting, and clearing.
2. `test/ruleRegistry.test.ts` — Verify loading and reloading workspace custom rules.
3. `test/fileCollector.test.ts`, `test/astScanner.test.ts`, `test/endToEnd.test.ts` — Ensure all 42+ existing tests continue to pass.
```bash
npm test
npm run compile
npm run build
```

### Manual Verification
1. Open a Next.js / React project in Antigravity IDE.
2. Run `Antigravity: Run Migration Scan`.
3. Inspect squiggly lines in editor and entries in Problems panel (`Ctrl+Shift+M`).
4. Click `$(rocket) Antigravity` in the status bar to verify the quick actions menu.
5. Create `.antigravity/rules.json` and verify custom rules appear in scan.
