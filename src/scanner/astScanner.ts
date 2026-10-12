import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
import {
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

export class AstScanner {
  /**
   * Scans a single file's source code against a set of candidate rules using AST traversal
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
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Categorize rules by pattern type for rapid dispatch
    const callRules: { rule: MigrationRule; pattern: CallExpressionPattern }[] = [];
    const memberRules: { rule: MigrationRule; pattern: MemberExpressionPattern }[] = [];
    const importRules: { rule: MigrationRule; pattern: ImportPattern }[] = [];
    const jsxRules: { rule: MigrationRule; pattern: JsxAttributePattern }[] = [];
    const idRules: { rule: MigrationRule; pattern: IdentifierPattern }[] = [];

    for (const rule of rules) {
      const p = rule.detection.astPattern;
      if (p.type === 'callExpression') callRules.push({ rule, pattern: p });
      else if (p.type === 'memberExpression') memberRules.push({ rule, pattern: p });
      else if (p.type === 'import') importRules.push({ rule, pattern: p });
      else if (p.type === 'jsxAttribute') jsxRules.push({ rule, pattern: p });
      else if (p.type === 'identifier') idRules.push({ rule, pattern: p });
    }

    const addIssue = (
      rule: MigrationRule,
      loc: { line: number; column: number } | null | undefined
    ) => {
      const line = loc?.line ?? 1;
      const column = (loc?.column ?? 0) + 1;
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

    traverse(ast, {
      // 1. Check Call Expressions (e.g. cookies(), headers(), ReactDOM.render(...))
      CallExpression(path: any) {
        if (callRules.length === 0) return;

        const callee = path.node.callee;
        let calleeName = '';

        if (callee.type === 'Identifier') {
          calleeName = callee.name;
        } else if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.property.type === 'Identifier'
        ) {
          calleeName = `${callee.object.name}.${callee.property.name}`;
        }

        if (!calleeName) return;

        for (const { rule, pattern } of callRules) {
          if (pattern.callee === calleeName) {
            if (pattern.requireAwait) {
              // If the pattern requires await, verify if parent is AwaitExpression
              const isAwaited = path.parentPath?.isAwaitExpression();
              if (!isAwaited) {
                addIssue(rule, path.node.loc?.start);
              }
            } else {
              addIssue(rule, path.node.loc?.start);
            }
          }
        }
      },

      // 2. Check Member Expressions (e.g. React.PropTypes)
      MemberExpression(path: any) {
        if (memberRules.length === 0) return;

        const obj = path.node.object;
        const prop = path.node.property;

        if (obj.type === 'Identifier' && prop.type === 'Identifier') {
          for (const { rule, pattern } of memberRules) {
            if (pattern.object === obj.name && pattern.property === prop.name) {
              addIssue(rule, path.node.loc?.start);
            }
          }
        }
      },

      // 3. Check Import Declarations (e.g. import { useRouter } from 'next/router')
      ImportDeclaration(path: any) {
        if (importRules.length === 0) return;

        const source = path.node.source.value;
        for (const { rule, pattern } of importRules) {
          if (pattern.source === source) {
            if (pattern.pathPattern) {
              // Path-constrained check (e.g. only inside /app/ directory)
              if (normalizedPath.includes('/app/')) {
                addIssue(rule, path.node.loc?.start);
              }
            } else {
              addIssue(rule, path.node.loc?.start);
            }
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
            if (pattern.element) {
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
        if (idRules.length === 0) return;

        const key = path.node.key;
        if (key.type === 'Identifier') {
          for (const { rule, pattern } of idRules) {
            if (pattern.name === key.name) {
              addIssue(rule, path.node.loc?.start);
            }
          }
        }
      }
    });

    return issues;
  }
}
