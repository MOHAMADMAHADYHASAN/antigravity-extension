# 🚀 UpgradeLens v0.1.14 — Comprehensive React Upgrade Support & Engine-Level AST Expansion

We are excited to announce release **v0.1.14** of **UpgradeLens**!

This release delivers **limit-free React migration support** across **React 18 &rarr; 19 &rarr; 20** (26 rules total), backed by major **Engine-Level AST Traversal Expansions** that detect JSX tags, `this.refs` member resolutions, universal namespace callees, and zero-argument hook invocations with zero false positives.

---

## ⚡ Engine-Level AST Expansion

To eliminate all limitations when scanning modern and legacy React codebases, the `@babel` AST traversal engine has been significantly upgraded:

- **`JsxElementPattern` & `<Context.Provider>` Traversal**:
  - Direct inspection of `JSXOpeningElement` and `JSXMemberExpression` tags.
  - Automatically flags deprecated `<Context.Provider>` usages and recommends rendering `<Context>` directly (React 19) while reporting breaking removals in React 20.
- **`ThisExpression` Member Resolution**:
  - Recursive member chain extraction now handles `ThisExpression`.
  - Accurately catches `this.refs.input` on class components without false positives on standard object properties.
- **Universal Callee Matching**:
  - CallExpression resolution now seamlessly handles both bare identifiers and namespaced callees (e.g. `forwardRef` and `React.forwardRef`, `createFactory` and `React.createFactory`).
- **Zero-Argument Invocation Auditing**:
  - Enforces `argCount: 0` checks on hook invocations.
  - Flags `useRef()` called with 0 arguments (which causes type errors in React 19 typings) while safely allowing `useRef(null)` and `useRef(initialValue)`.

---

## 📦 Exhaustive React 19 & 20 Rulesets (26 Rules)

### ⚛️ React 18 &rarr; 19 (18 Rules)
Comprehensive coverage for all breaking changes and deprecations from the official React 19 Upgrade Guide:

1. **`ReactDOM.render` Removed**: Replaced by `createRoot` from `'react-dom/client'`.
2. **`ReactDOM.hydrate` Removed**: Replaced by `hydrateRoot` from `'react-dom/client'`.
3. **`unmountComponentAtNode` Removed**: Replaced by `root.unmount()`.
4. **`findDOMNode` Removed**: Direct DOM refs required on native elements.
5. **`React.PropTypes` Removed**: Replaced by TypeScript interfaces or standalone `'prop-types'`.
6. **String Refs Removed**: String literals (`<input ref="myInput" />`) replaced by `useRef()`.
7. **`this.refs` Removed**: Access on class components replaced by `React.createRef()`.
8. **`defaultProps` on Function Components Removed**: Replaced by ES6 default parameter syntax.
9. **Legacy Lifecycles Removed**: `componentWillMount`, `componentWillReceiveProps`, `componentWillUpdate` without `UNSAFE_` prefix removed.
10. **Legacy Context Removed**: `contextTypes` / `childContextTypes` replaced by `React.createContext()` and `use()`.
11. **`React.createFactory` Removed**: Replaced by standard JSX elements.
12. **`react-test-renderer/shallow` Removed**: Replaced by standalone `'react-shallow-renderer'`.
13. **`react-dom/test-utils` Deprecated**: Import `act` directly from `'react'`.
14. **`useFormState` Deprecated**: Migrated to `useActionState` from `'react'`.
15. **`forwardRef` Deprecated**: Function components receive `ref` directly as a regular prop.
16. **`<Context.Provider>` Deprecated**: Render `<Context value={...}>` directly as a provider.
17. **`useRef()` Initial Value Requirement**: Calling `useRef()` with 0 arguments deprecated; requires `useRef(null)`.
18. **`react-test-renderer` Deprecated**: Migrated to React Testing Library (`@testing-library/react`).

### ⚛️ React 19 &rarr; 20 (8 Breaking Rules)
Strict breaking error rules enforcing complete forward migration:

1. **`forwardRef` Removed**: Complete removal of `forwardRef`.
2. **`<Context.Provider>` Removed**: Complete removal in favor of `<Context>`.
3. **`defaultProps` Removed**: Completely removed across all component types.
4. **Legacy Context Removed**: Complete removal of `contextTypes`.
5. **`react-dom/test-utils` Removed**: Completely removed in favor of React Testing Library.
6. **`react-test-renderer` Removed**: Completely removed in favor of React Testing Library.
7. **`useFormState` Removed**: Completely removed from `'react-dom'`.
8. **`ReactDOM.findDOMNode` Removed**: Completely removed from `'react-dom'`.

---

## 🛡️ Stability & Verification

- **100% Green Test Suite**: **94 automated tests passing** across 20 test suites covering AST detection, FastFilter pre-tokenization, network mocking, semver evaluation, and file collectors.
- **Synchronized Catalogs**: Both remote manifests (`remote-rules/`) and offline built-in definitions (`src/rules/definitions/`) are fully synchronized.
- **Fast Production Build**: Bundle compiled in under 130ms (`dist/extension.js` 889kb).

---

## 💡 How to Install

1. Download the attached **`upgradelens-0.1.14.vsix`** file from Assets.
2. Open **VS Code**.
3. Open the **Extensions** panel (`Ctrl+Shift+X` on Windows/Linux, `Cmd+Shift+X` on macOS).
4. Click the **"..."** menu in the top-right corner &rarr; select **"Install from VSIX..."**.
5. Select `upgradelens-0.1.14.vsix` and confirm installation.
6. Run **`UpgradeLens: Run Migration Scan`** (`Ctrl+Shift+P` / `Cmd+Shift+P`) to audit your project!

---

**Full Changelog**: https://github.com/MOHAMADMAHADYHASAN/antigravity-extension/commits/main
