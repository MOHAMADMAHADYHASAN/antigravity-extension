import * as path from 'path';
import { ScanIssue, ScanResult } from '../types/scanner';

export interface MarkdownReportOptions {
  workspaceRoot?: string;
  upgradeDetails?: {
    framework: string;
    oldVersion: string;
    newVersion: string;
  }[];
}

export class MarkdownGenerator {
  /**
   * Generates a comprehensive GitHub-Flavored Markdown report from scan results
   */
  public static generate(result: ScanResult, options: MarkdownReportOptions = {}): string {
    const { workspaceRoot = '', upgradeDetails = [] } = options;
    const now = new Date().toLocaleString();

    let md = '# 🚀 UpgradeLens Migration Report\n\n';

    // 1. Overview Table
    md += '## 📋 Overview\n\n';
    md += '| Metric | Value |\n';
    md += '| :--- | :--- |\n';

    if (upgradeDetails.length > 0) {
      const upgradeStr = upgradeDetails
        .map((u) => `**${u.framework}** (${u.oldVersion} → ${u.newVersion})`)
        .join(', ');
      md += `| **Detected Upgrade** | ${upgradeStr} |\n`;
    } else {
      md += `| **Framework(s)** | ${result.frameworks.join(', ') || 'N/A'} |\n`;
    }

    md += `| **Scan Date** | ${now} |\n`;
    md += `| **Files Scanned** | ${result.totalFilesScanned} |\n`;
    md += `| **Files with Issues** | ${result.filesWithIssues} |\n`;
    md += `| **Total Issues Flagged** | **${result.issues.length}** |\n`;
    md += `| **Scan Duration** | ${(result.durationMs / 1000).toFixed(2)}s |\n\n`;

    // Zero issues scenario
    if (result.issues.length === 0) {
      md += '> [!NOTE]\n';
      md += '> **All Clear!** No breaking changes or deprecated syntax were detected for the scanned framework rules.\n\n';
      md += 'Your codebase appears ready for the updated framework dependencies. Always ensure you run your project test suite (`npm test`) before committing!\n';
      return md;
    }

    // 2. Summary of Findings
    md += '## ⚠️ Summary of Interventions Required\n\n';
    md += `UpgradeLens identified **${result.issues.length} location(s)** across **${result.filesWithIssues} file(s)** that require manual code updates before upgrading.\n\n`;

    // Group issues by Rule ID
    const issuesByRule = new Map<string, ScanIssue[]>();
    for (const issue of result.issues) {
      const list = issuesByRule.get(issue.ruleId) || [];
      list.push(issue);
      issuesByRule.set(issue.ruleId, list);
    }

    // 3. Detailed Sections Per Rule
    for (const [ruleId, issues] of issuesByRule.entries()) {
      const first = issues[0];
      const severityBadge =
        first.severity === 'breaking'
          ? '🔴 **BREAKING CHANGE**'
          : first.severity === 'deprecation'
          ? '🟡 **DEPRECATION**'
          : '⚪ **WARNING**';

      md += `### ${severityBadge}: ${first.title}\n\n`;
      md += `> **Framework**: \`${first.framework}\` | **Rule ID**: \`${ruleId}\`\n`;
      if (first.docsUrl) {
        md += `> **Documentation**: [Official Migration Reference](${first.docsUrl})\n`;
      }
      md += '\n';

      // Remediation Guidance
      if (first.remediation) {
        md += `**Recommended Action**: ${first.remediation.summary}\n\n`;

        if (first.remediation.exampleBefore && first.remediation.exampleAfter) {
          md += '<details><summary><b>View Before & After Code Example</b></summary>\n\n';
          md += '```typescript\n// ❌ BEFORE (Old Syntax)\n';
          md += `${first.remediation.exampleBefore}\n\n`;
          md += '// ✅ AFTER (Migrated Syntax)\n';
          md += `${first.remediation.exampleAfter}\n`;
          md += '```\n\n</details>\n\n';
        }
      }

      // Action Checklist with precise file & line navigation links
      md += `**Occurrences (${issues.length}):**\n\n`;
      for (const issue of issues) {
        const relativePath = workspaceRoot
          ? path.relative(workspaceRoot, issue.filePath).replace(/\\/g, '/')
          : issue.filePath.replace(/\\/g, '/');

        // Formats clickable VS Code link
        const targetUri = issue.filePath.startsWith('/')
          ? `file://${issue.filePath}#L${issue.line}`
          : `file:///${issue.filePath.replace(/\\/g, '/')}#L${issue.line}`;

        md += `- [ ] [**\`${relativePath}:${issue.line}\`**](${targetUri})\n`;
        if (issue.codeSnippet) {
          md += `  \`\`\`typescript\n  Line ${issue.line}: ${issue.codeSnippet}\n  \`\`\`\n`;
        }
      }
      md += '\n---\n\n';
    }

    // 4. Developer Next Steps
    md += '## 💡 Next Steps\n\n';
    md += '1. Click on the file links above to jump directly to each flagged line in VS Code.\n';
    md += '2. Apply the recommended replacements using the code examples.\n';
    md += '3. Once resolved, re-run `UpgradeLens: Run Migration Scan` to ensure all items are checked off.\n';

    return md;
  }
}
