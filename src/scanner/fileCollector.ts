import * as fs from 'fs';
import * as path from 'path';

let vscodeModule: typeof import('vscode') | undefined;
try {
  vscodeModule = require('vscode');
} catch {
  // Running outside VS Code (e.g. Node test suite)
}

export class FileCollector {
  public static readonly SUPPORTED_EXTENSIONS = new Set([
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.mjs',
    '.cjs',
    '.prisma'
  ]);

  /**
   * Default glob patterns to exclude from file discovery in both VS Code findFiles and filesystem walks
   */
  public static readonly DEFAULT_EXCLUDE_GLOBS = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.git/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/out/**',
    '**/generated/**',
    '**/.prisma/**',
    '**/@prisma/client/**',
    '**/prisma/runtime/**',
    '**/prisma/client/**',
    '**/prisma/migrations/**',
    '**/*.min.js'
  ];

  /**
   * Directory names that should be pruned immediately during recursive traversal
   */
  public static readonly DEFAULT_IGNORES = [
    'node_modules',
    'dist',
    'build',
    '.next',
    '.git',
    '.turbo',
    'coverage',
    'out',
    'generated',
    '.prisma'
  ];

  /**
   * Helper to check if a file or directory path matches default or custom exclude patterns/globs
   */
  public static isExcluded(filePath: string, customExcludes: string[] = [], isDirectory: boolean = false): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    const baseName = path.basename(normalized);

    // 1. Minified files check
    if (!isDirectory && (baseName.endsWith('.min.js') || baseName.endsWith('.min.ts') || baseName.endsWith('.min.mjs'))) {
      return true;
    }

    // 2. Direct directory name check
    if (isDirectory && FileCollector.DEFAULT_IGNORES.includes(baseName)) {
      return true;
    }

    // 3. Combined patterns check
    const allPatterns = [...FileCollector.DEFAULT_EXCLUDE_GLOBS, ...customExcludes];

    for (const pattern of allPatterns) {
      if (!pattern) continue;

      // Direct directory name or token match
      if (!pattern.includes('/') && !pattern.includes('*')) {
        if (baseName === pattern || normalized.split('/').includes(pattern)) {
          return true;
        }
      }

      // Check glob patterns like **/dirname/**
      const dirMatch = pattern.match(/^\*\*\/([^/*]+)\/\*\*$/);
      if (dirMatch) {
        const dirName = dirMatch[1];
        const segments = normalized.split('/');
        if (segments.includes(dirName) || baseName === dirName) {
          return true;
        }
        continue;
      }

      // Check file glob patterns like **/*.ext or **/*.min.js
      if (pattern.startsWith('**/*.')) {
        const suffix = pattern.slice(4); // e.g. "min.js"
        if (!isDirectory && (baseName.endsWith(suffix) || baseName.endsWith(`.${suffix}`))) {
          return true;
        }
        continue;
      }

      // General glob matching
      if (pattern.includes('*')) {
        const regexStr = pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*/g, '.*')
          .replace(/(?<!\.)\*/g, '[^/]*');
        try {
          const testPath = normalized.startsWith('/') ? normalized : '/' + normalized;
          const reg = new RegExp(`^${regexStr}$`);
          if (reg.test(normalized) || reg.test(testPath) || new RegExp(regexStr).test(normalized)) {
            return true;
          }
        } catch {
          if (normalized.includes(pattern.replace(/\*/g, ''))) {
            return true;
          }
        }
      } else {
        if (normalized.includes(pattern)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Discovers candidate source files using VS Code workspace API or filesystem fallback
   */
  public static async collectFiles(
    rootPath?: string,
    customExcludes: string[] = []
  ): Promise<string[]> {
    // If running in VS Code with an active workspace
    if (vscodeModule?.workspace?.workspaceFolders && vscodeModule.workspace.workspaceFolders.length > 0) {
      try {
        const combinedExcludes = Array.from(new Set([
          ...FileCollector.DEFAULT_EXCLUDE_GLOBS,
          ...customExcludes
        ]));
        const excludeGlob = `{${combinedExcludes.join(',')}}`;
        const uris = await vscodeModule.workspace.findFiles(
          '**/*.{js,jsx,ts,tsx,mjs,cjs,prisma}',
          excludeGlob
        );
        return uris.map((u) => u.fsPath);
      } catch {
        // Fallback to manual walk if findFiles fails
      }
    }

    // Direct filesystem walk fallback (for testing and CLI harness)
    const targetDir =
      rootPath ||
      vscodeModule?.workspace?.workspaceFolders?.[0]?.uri.fsPath ||
      process.cwd();

    const results: string[] = [];
    FileCollector.walkDirectory(targetDir, results, customExcludes);
    return results;
  }

  private static walkDirectory(
    currentDir: string,
    results: string[],
    customExcludes: string[]
  ): void {
    if (!fs.existsSync(currentDir)) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (FileCollector.isExcluded(fullPath, customExcludes, true)) {
          continue;
        }
        FileCollector.walkDirectory(fullPath, results, customExcludes);
      } else if (entry.isFile()) {
        if (FileCollector.isExcluded(fullPath, customExcludes, false)) {
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (FileCollector.SUPPORTED_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }
}
