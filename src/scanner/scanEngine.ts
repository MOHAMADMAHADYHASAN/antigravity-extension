import * as fs from 'fs';
import { ScanIssue, ScanOptions, ScanResult } from '../types/scanner';
import { AstScanner } from './astScanner';
import { FastFilter } from './fastFilter';
import { FileCollector } from './fileCollector';
import { PrismaSchemaScanner } from './prismaSchemaScanner';

export class ScanEngine {
  /**
   * Runs the complete two-stage migration scan across the workspace
   */
  public static async runScan(options: ScanOptions): Promise<ScanResult> {
    const startTime = Date.now();
    const { rules, rootPath, excludeGlobs = [], onProgress, cancellationToken } = options;

    if (!rules || rules.length === 0) {
      return {
        totalFilesScanned: 0,
        filesWithIssues: 0,
        issues: [],
        durationMs: 0,
        frameworks: []
      };
    }

    const files = await FileCollector.collectFiles(rootPath, excludeGlobs);
    const hasPrismaRules = rules.some((r) => r.framework === 'prisma');
    const targetFiles = hasPrismaRules ? files : files.filter((f) => !f.endsWith('.prisma'));
    const issues: ScanIssue[] = [];
    const filesWithIssuesSet = new Set<string>();

    for (let i = 0; i < targetFiles.length; i++) {
      if (cancellationToken?.isCancellationRequested) {
        break;
      }

      const file = targetFiles[i];
      if (onProgress) {
        onProgress(i + 1, targetFiles.length, file);
      }

      let content: string;
      try {
        content = fs.readFileSync(file, 'utf-8');
      } catch {
        continue;
      }

      // Stage 1: Fast Regex / String Filter
      const filterResult = FastFilter.filter(content, rules, file);
      if (!filterResult.shouldParse) {
        continue;
      }

      // Stage 2: Precision AST Parsing & Traversal (or DSL Schema Scanning)
      const fileIssues = file.endsWith('.prisma')
        ? PrismaSchemaScanner.scanFile(file, content, filterResult.candidateRules)
        : AstScanner.scanFile(file, content, filterResult.candidateRules);

      if (fileIssues.length > 0) {
        issues.push(...fileIssues);
        filesWithIssuesSet.add(file);
      }
    }

    const durationMs = Date.now() - startTime;
    const frameworks = Array.from(new Set(rules.map((r) => r.framework)));

    return {
      totalFilesScanned: targetFiles.length,
      filesWithIssues: filesWithIssuesSet.size,
      issues,
      durationMs,
      frameworks
    };
  }
}
