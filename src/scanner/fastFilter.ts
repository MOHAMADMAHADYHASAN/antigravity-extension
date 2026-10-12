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
  public static filter(content: string, rules: MigrationRule[]): FastFilterResult {
    const candidateRules: MigrationRule[] = [];

    for (const rule of rules) {
      const filters = rule.detection.fastFilter;

      // If a rule defines no fast filters, include it by default
      if (!filters || filters.length === 0) {
        candidateRules.push(rule);
        continue;
      }

      // Check if any required string is present in file
      let matched = false;
      for (const token of filters) {
        if (content.includes(token)) {
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
