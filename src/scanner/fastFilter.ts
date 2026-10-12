import { MigrationRule } from '../types/rules';

export interface FastFilterResult {
  shouldParse: boolean;
  candidateRules: MigrationRule[];
}

export class FastFilter {
  /**
   * Pre-filters source code using fast string matching against rules' fastFilter tokens.
   * If no tokens are found, AST parsing can be skipped entirely.
   */
  public static filter(content: string, rules: MigrationRule[], filePath?: string): FastFilterResult {
    const candidateRules: MigrationRule[] = [];

    const fileExt = filePath ? ('.' + filePath.split('.').pop()?.toLowerCase()) : undefined;

    for (const rule of rules) {
      // Check file extension compatibility if filePath is provided and rule specifies extensions
      if (fileExt && rule.detection.fileExtensions && rule.detection.fileExtensions.length > 0) {
        const matchesExt = rule.detection.fileExtensions.some(
          (ext) => ext.toLowerCase() === fileExt
        );
        if (!matchesExt) {
          continue;
        }
      }

      const filters = rule.detection.fastFilter;

      // If a rule defines no fast filters, include it by default
      if (!filters || filters.length === 0) {
        candidateRules.push(rule);
        continue;
      }

      // Check if any required token is present in file
      let matched = false;
      for (const token of filters) {
        if (token && content.includes(token)) {
          matched = true;
          break;
        }
      }

      if (matched) {
        candidateRules.push(rule);
      }
    }

    return {
      shouldParse: candidateRules.length > 0,
      candidateRules
    };
  }
}
