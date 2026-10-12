import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
import {
  AsyncRequestApiPattern,
  CallExpressionPattern,
  IdentifierPattern,
  ImportPattern,
  JsxAttributePattern,
  MemberExpressionPattern,
  MigrationRule
} from '../types/rules';
import { ScanIssue } from '../types/scanner';

// Handle Babel traverse default export interop
const traverse = typeof _traverse === 'function' ? _traverse : (_traverse as any).default;

/**
 * Helper to recursively extract the member access chain from a MemberExpression or Identifier
 * e.g. a.b.c -> "a.b.c", cookies -> "cookies"
 */
function getMemberText(node: any): string {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'MemberExpression') {
    const obj = getMemberText(node.object);
    const prop =
      node.property.type === 'Identifier'
        ? node.property.name
        : node.property.type === 'StringLiteral'
        ? node.property.value
        : '';
    return obj && prop ? `${obj}.${prop}` : prop || obj;
  }
  return '';
}

/**
 * Checks if a file path matches a glob or substring pattern (e.g. "** /app/**")
 */
function matchesPathPattern(filePath: string, pattern?: string): boolean {
  if (!pattern) return true;
  const normalized = filePath.replace(/\\/g, '/');
  if (pattern.includes('*')) {
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.*')
      .replace(/(?<!\.)\*/g, '[^/]*');
    try {
      return new RegExp(regexStr).test(normalized);
    } catch {
      return normalized.includes(pattern.replace(/\*/g, ''));
    }
  }
  return normalized.includes(pattern);
}

/**
 * Verifies if a call expression is awaited, checking parent await or parenthesized expressions
 */
function isCallAwaited(path: any): boolean {
  let current = path.parentPath;
  while (
    current &&
    (current.isParenthesizedExpression?.() ||
      current.isTSAsExpression?.() ||
      current.isTSTypeAssertion?.() ||
      current.isTypeCastExpression?.())
  ) {
    current = current.parentPath;
  }
  return current?.isAwaitExpression?.() ?? false;
}

export class AstScanner {
  /**
   * Scans a single file's source code against candidate rules using AST traversal
   */
  public static scanFile(filePath: string, content: string, rules: MigrationRule[]): ScanIssue[] {
    if (!content || rules.length === 0) {
      return [];
    }

    const lines = content.split('\n');
    const getSnippet = (line: number): string => {
      if (line >= 1 && line <= lines.length) {
        return lines[line - 1].trim();
      }
      return '';
    };

    let ast: parser.ParseResult<import('@babel/types').File>;
    try {
      ast = parser.parse(content, {
        sourceType: 'module',
        plugins: [
          'jsx',
          'typescript',
          ['decorators', { decoratorsBeforeExport: true }],
          'classProperties',
          'classPrivateProperties',
          'classPrivateMethods',
          'exportDefaultFrom'
        ],
        errorRecovery: true
      });
    } catch {
      // If parsing fails completely, ignore file to prevent halting
      return [];
    }

    const issues: ScanIssue[] = [];
    const reportedKeys = new Set<string>();
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Categorize rules by pattern type for rapid dispatch
    const callRules: { rule: MigrationRule; pattern: CallExpressionPattern }[] = [];
    const memberRules: { rule: MigrationRule; pattern: MemberExpressionPattern }[] = [];
    const importRules: { rule: MigrationRule; pattern: ImportPattern }[] = [];
    const jsxRules: { rule: MigrationRule; pattern: JsxAttributePattern }[] = [];
    const idRules: { rule: MigrationRule; pattern: IdentifierPattern }[] = [];
    const asyncApiRules: { rule: MigrationRule; pattern: AsyncRequestApiPattern }[] = [];

    for (const rule of rules) {
      const p = rule.detection.astPattern;
      if (p.type === 'callExpression') callRules.push({ rule, pattern: p });
      else if (p.type === 'memberExpression') memberRules.push({ rule, pattern: p });
      else if (p.type === 'import') importRules.push({ rule, pattern: p });
      else if (p.type === 'jsxAttribute') jsxRules.push({ rule, pattern: p });
      else if (p.type === 'identifier') idRules.push({ rule, pattern: p });
      else if (p.type === 'asyncRequestApi') asyncApiRules.push({ rule, pattern: p });
    }

    const addIssue = (
      rule: MigrationRule,
      loc: { line: number; column: number } | null | undefined
    ) => {
      const line = loc?.line ?? 1;
      const column = (loc?.column ?? 0) + 1;
      const dedupeKey = `${rule.id}:${line}:${column}`;
      if (reportedKeys.has(dedupeKey)) return;
      reportedKeys.add(dedupeKey);

      issues.push({
        ruleId: rule.id,
        framework: rule.framework,
        severity: rule.severity,
        title: rule.title,
        docsUrl: rule.docsUrl,
        filePath,
        line,
        column,
        codeSnippet: getSnippet(line),
        remediation: rule.remediation
      });
    };

    const checkIdentifier = (
      name: string,
      loc: any,
      contextType: 'method' | 'property' | 'declaration'
    ) => {
      if (!name || idRules.length === 0) return;
      for (const { rule, pattern } of idRules) {
        if (pattern.name === name) {
          if (!pattern.context || pattern.context === 'any' || pattern.context === contextType) {
            addIssue(rule, loc);
          }
        }
      }
    };

    traverse(ast, {
      // 1. Check Call Expressions (e.g. cookies(), headers(), ReactDOM.render(...), unstable_cache(...))
      CallExpression(path: any) {
        // Handle callRules
        if (callRules.length > 0) {
          const calleeText = getMemberText(path.node.callee);
          const simpleCallee = path.node.callee.type === 'Identifier' ? path.node.callee.name : '';

          for (const { rule, pattern } of callRules) {
            const matchesCallee =
              pattern.callee === calleeText ||
              (simpleCallee && pattern.callee === simpleCallee);

            if (matchesCallee) {
              if (pattern.argCount !== undefined && path.node.arguments.length !== pattern.argCount) {
                continue;
              }

              if (pattern.requireAwait) {
                if (!isCallAwaited(path)) {
                  addIssue(rule, path.node.loc?.start);
                }
              } else {
                addIssue(rule, path.node.loc?.start);
              }
            }
          }
        }

        // Handle asyncApiRules for functions like cookies(), headers(), draftMode()
        if (asyncApiRules.length > 0) {
          const calleeText = getMemberText(path.node.callee);
          for (const { rule, pattern } of asyncApiRules) {
            if (
              (pattern.apiName === 'cookies' ||
                pattern.apiName === 'headers' ||
                pattern.apiName === 'draftMode') &&
              (calleeText === pattern.apiName || calleeText.endsWith(`.${pattern.apiName}`))
            ) {
              if (!isCallAwaited(path)) {
                addIssue(rule, path.node.loc?.start);
              }
            }
          }
        }
      },

      // 2. Check Member Expressions (e.g. React.PropTypes, request.geo, params.slug)
      MemberExpression(path: any) {
        const objText = getMemberText(path.node.object);
        const propNode = path.node.property;
        const propName =
          propNode.type === 'Identifier'
            ? propNode.name
            : propNode.type === 'StringLiteral'
            ? propNode.value
            : '';

        // Check memberRules
        if (memberRules.length > 0) {
          for (const { rule, pattern } of memberRules) {
            const matchesObj =
              !pattern.object ||
              pattern.object === '*' ||
              objText === pattern.object ||
              objText.endsWith(`.${pattern.object}`);

            const matchesProp =
              !pattern.property ||
              pattern.property === '*' ||
              (propName && propName === pattern.property);

            if (matchesObj && matchesProp) {
              addIssue(rule, path.node.loc?.start);
            }
          }
        }

        // Check asyncApiRules for params.xyz or searchParams.xyz
        if (asyncApiRules.length > 0) {
          for (const { rule, pattern } of asyncApiRules) {
            if (
              (pattern.apiName === 'params' || pattern.apiName === 'searchParams') &&
              (objText === pattern.apiName || objText.endsWith(`.${pattern.apiName}`))
            ) {
              addIssue(rule, path.node.loc?.start);
            }
          }
        }

        // Member properties can also be identifiers in 'property' context (e.g. Page.getInitialProps)
        if (propName) {
          checkIdentifier(propName, propNode.loc?.start, 'property');
        }
      },

      // 3. Check Import Declarations (e.g. import { useRouter } from 'next/router', import from 'next/amp')
      ImportDeclaration(path: any) {
        if (importRules.length === 0) return;

        const source = path.node.source.value;
        for (const { rule, pattern } of importRules) {
          if (pattern.source === source) {
            // Check path pattern if specified
            if (pattern.pathPattern && !matchesPathPattern(normalizedPath, pattern.pathPattern)) {
              continue;
            }

            // Check specifiers if specified
            if (pattern.specifiers && pattern.specifiers.length > 0) {
              const importedNames: string[] = [];
              for (const spec of path.node.specifiers) {
                if (spec.type === 'ImportSpecifier') {
                  importedNames.push(
                    spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value
                  );
                } else if (spec.type === 'ImportDefaultSpecifier') {
                  importedNames.push('default');
                } else if (spec.type === 'ImportNamespaceSpecifier') {
                  importedNames.push('*');
                }
              }

              const hasMatchingSpecifier = pattern.specifiers.some((s) =>
                importedNames.includes(s)
              );
              if (!hasMatchingSpecifier) {
                continue;
              }
            }

            addIssue(rule, path.node.loc?.start);
          }
        }
      },

      // 4. Check JSX Attributes (e.g. <input ref="str" />, <Image layout="fill" />)
      JSXAttribute(path: any) {
        if (jsxRules.length === 0) return;

        const attrName = path.node.name.name;
        if (typeof attrName !== 'string') return;

        for (const { rule, pattern } of jsxRules) {
          if (pattern.attribute === attrName) {
            // Check component element name if specified
            if (pattern.element && pattern.element !== '*') {
              const parentOpening = path.parentPath?.node;
              if (parentOpening && parentOpening.type === 'JSXOpeningElement') {
                const tag = parentOpening.name;
                const tagName = tag.type === 'JSXIdentifier' ? tag.name : '';
                if (tagName !== pattern.element) {
                  continue;
                }
              }
            }

            // Check if string literal is disallowed
            if (pattern.disallowLiteralString) {
              if (path.node.value && path.node.value.type === 'StringLiteral') {
                addIssue(rule, path.node.loc?.start);
              }
            } else {
              addIssue(rule, path.node.loc?.start);
            }
          }
        }
      },

      // 5. Check Class Methods (e.g. componentWillReceiveProps)
      ClassMethod(path: any) {
        const key = path.node.key;
        if (key.type === 'Identifier') {
          checkIdentifier(key.name, path.node.loc?.start, 'method');
        }
      },

      // 6. Check Class Properties
      ClassProperty(path: any) {
        const key = path.node.key;
        if (key.type === 'Identifier') {
          checkIdentifier(key.name, path.node.loc?.start, 'property');
        }
      },

      // 7. Check Object Methods
      ObjectMethod(path: any) {
        const key = path.node.key;
        if (key.type === 'Identifier') {
          checkIdentifier(key.name, path.node.loc?.start, 'method');
        }
      },

      // 8. Check Object Properties (e.g. swcMinify, serverRuntimeConfig, webpack in next.config.js)
      ObjectProperty(path: any) {
        const key = path.node.key;
        const keyName =
          key.type === 'Identifier'
            ? key.name
            : key.type === 'StringLiteral'
            ? key.value
            : '';
        if (keyName) {
          checkIdentifier(keyName, path.node.loc?.start, 'property');
        }
      },

      // 9. Check Function Declarations (e.g. export function middleware, export function GET)
      FunctionDeclaration(path: any) {
        const id = path.node.id;
        if (id && id.type === 'Identifier') {
          checkIdentifier(id.name, path.node.loc?.start, 'method');
        }
      },

      // 10. Check Variable Declarators (e.g. const middleware = ..., const GET = ...)
      VariableDeclarator(path: any) {
        const id = path.node.id;
        if (id && id.type === 'Identifier') {
          checkIdentifier(id.name, path.node.loc?.start, 'declaration');
        }
      }
    });

    return issues;
  }
}
