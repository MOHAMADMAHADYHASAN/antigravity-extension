import { MigrationRule } from '../types/rules';
import { ScanIssue } from '../types/scanner';

export class PrismaSchemaScanner {
  /**
   * Scans a .prisma schema file against applicable migration rules
   */
  public static scanFile(
    filePath: string,
    content: string,
    rules: MigrationRule[]
  ): ScanIssue[] {
    const issues: ScanIssue[] = [];
    if (!content || !rules || rules.length === 0) {
      return issues;
    }

    const lines = content.split('\n');

    for (const rule of rules) {
      // 1. Verify file extension matches rule expectations if specified
      if (rule.detection?.fileExtensions && !rule.detection.fileExtensions.includes('.prisma')) {
        continue;
      }

      // Check applicable Prisma patterns
      const astPattern = (rule.detection?.astPattern || {}) as unknown as Record<string, unknown>;
      const patternType = typeof astPattern.type === 'string' ? astPattern.type : '';
      const targetFeature = typeof astPattern.feature === 'string' ? astPattern.feature : '';
      const targetProperty = typeof astPattern.property === 'string' ? astPattern.property : '';
      const rawRegexStr = typeof astPattern.pattern === 'string' ? astPattern.pattern : '';

      let currentBlock: string | null = null;

      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        const trimmed = lineText.trim();

        // Track current top-level block in schema.prisma (e.g. generator, datasource, model)
        const blockMatch = trimmed.match(/^(generator|datasource|model|enum)\s+([A-Za-z0-9_]+)\s*\{/);
        if (blockMatch) {
          currentBlock = blockMatch[1];
        } else if (trimmed === '}') {
          currentBlock = null;
        }

        let isMatch = false;
        let matchCol = 1;

        // Pattern A: previewFeature check
        if (patternType === 'previewFeature' && targetFeature) {
          // Look for previewFeatures containing the target token
          if (lineText.includes(targetFeature)) {
            // Ensure either in generator block or on a previewFeatures line
            if (currentBlock === 'generator' || lineText.includes('previewFeatures') || trimmed.includes(targetFeature)) {
              isMatch = true;
              matchCol = lineText.indexOf(targetFeature) + 1;
            }
          }
        }
        // Pattern B: Block property check (e.g. generator / datasource config)
        else if (patternType === 'schemaProperty' && targetProperty) {
          if (trimmed.startsWith(targetProperty)) {
            if (!astPattern.block || astPattern.block === currentBlock) {
              isMatch = true;
              matchCol = lineText.indexOf(targetProperty) + 1;
            }
          }
        }
        // Pattern C: Regex pattern check
        else if (patternType === 'regex' && rawRegexStr) {
          try {
            const regex = new RegExp(rawRegexStr);
            const m = lineText.match(regex);
            if (m && m.index !== undefined) {
              isMatch = true;
              matchCol = m.index + 1;
            }
          } catch {
            // Invalid regex; ignore
          }
        }
        // Pattern D: Generic fastFilter fallback match on .prisma files
        else if (rule.detection?.fastFilter && rule.detection.fastFilter.length > 0) {
          for (const token of rule.detection.fastFilter) {
            if (lineText.includes(token)) {
              isMatch = true;
              matchCol = lineText.indexOf(token) + 1;
              break;
            }
          }
        }

        if (isMatch) {
          issues.push({
            ruleId: rule.id,
            framework: rule.framework,
            filePath,
            line: i + 1,
            column: matchCol,
            title: rule.title || rule.id,
            codeSnippet: trimmed,
            severity: rule.severity,
            remediation: rule.remediation,
            docsUrl: rule.docsUrl
          });
        }
      }
    }

    return issues;
  }
}
