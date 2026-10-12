export type RuleSeverity = 'breaking' | 'deprecation' | 'warning';

export type AstPatternType =
  | 'callExpression'
  | 'memberExpression'
  | 'import'
  | 'jsxAttribute'
  | 'identifier'
  | 'asyncRequestApi';

export interface CallExpressionPattern {
  type: 'callExpression';
  callee: string; // e.g. "ReactDOM.render", "cookies"
  requireAwait?: boolean; // For Next.js 15 cookies()/headers()
  argCount?: number;
}

export interface MemberExpressionPattern {
  type: 'memberExpression';
  object: string; // e.g. "React", "ReactDOM"
  property: string; // e.g. "PropTypes", "findDOMNode"
}

export interface ImportPattern {
  type: 'import';
  source: string; // e.g. "next/router"
  specifiers?: string[]; // e.g. ["useRouter"]
  pathPattern?: string; // e.g. "**/app/**" to only flag in App Router
}

export interface JsxAttributePattern {
  type: 'jsxAttribute';
  element?: string; // e.g. "Image", "*"
  attribute: string; // e.g. "ref", "layout", "objectFit"
  disallowLiteralString?: boolean; // e.g. <input ref="stringRef" />
}

export interface IdentifierPattern {
  type: 'identifier';
  name: string; // e.g. "componentWillReceiveProps"
  context?: 'method' | 'property' | 'any';
}

export interface AsyncRequestApiPattern {
  type: 'asyncRequestApi';
  apiName: 'cookies' | 'headers' | 'draftMode' | 'params' | 'searchParams';
}

export type AstPattern =
  | CallExpressionPattern
  | MemberExpressionPattern
  | ImportPattern
  | JsxAttributePattern
  | IdentifierPattern
  | AsyncRequestApiPattern;

export interface DetectionCriteria {
  fileExtensions: string[]; // e.g. [".js", ".jsx", ".ts", ".tsx"]
  fastFilter: string[]; // Fast string tokens to check before parsing AST
  astPattern: AstPattern;
}

export interface Remediation {
  summary: string;
  exampleBefore?: string;
  exampleAfter?: string;
}

export interface MigrationRule {
  id: string;
  framework: string; // e.g. "next", "react", "angular"
  fromVersion: string; // Semver range, e.g. ">=14.0.0 <15.0.0"
  toVersion: string; // Semver range, e.g. ">=15.0.0"
  severity: RuleSeverity;
  title: string;
  docsUrl: string;
  description: string;
  detection: DetectionCriteria;
  remediation: Remediation;
}

export interface UpgradeTarget {
  framework: string;
  oldVersion: string;
  newVersion: string;
}
