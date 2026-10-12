import type * as vscode from 'vscode';
import { MigrationRule, Remediation, RuleSeverity } from './rules';

export interface ScanIssue {
  ruleId: string;
  framework: string;
  severity: RuleSeverity;
  title: string;
  docsUrl: string;
  filePath: string;
  line: number;
  column: number;
  codeSnippet: string;
  remediation: Remediation;
}

export interface ScanResult {
  totalFilesScanned: number;
  filesWithIssues: number;
  issues: ScanIssue[];
  durationMs: number;
  frameworks: string[];
}

export interface ScanOptions {
  rootPath?: string;
  rules: MigrationRule[];
  excludeGlobs?: string[];
  onProgress?: (scanned: number, total: number, currentFile: string) => void;
  cancellationToken?: vscode.CancellationToken;
}
