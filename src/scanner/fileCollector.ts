import * as fs from 'fs';
import * as path from 'path';

let vscodeModule: typeof import('vscode') | undefined;
try {
  vscodeModule = require('vscode');
} catch {
  // Running outside VS Code (e.g. Node test suite)
}

export class FileCollector {
  private static readonly SUPPORTED_EXTENSIONS = new Set([
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.mjs',
    '.cjs'
  ]);

  private static readonly DEFAULT_IGNORES = [
    'node_modules',
    'dist',
    'build',
    '.next',
    '.git',
    '.turbo',
    'coverage',
    'out'
  ];

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
        const excludeGlob = `{${[...FileCollector.DEFAULT_IGNORES.map((i) => `**/${i}/**`), ...customExcludes].join(',')}}`;
        const uris = await vscodeModule.workspace.findFiles(
          '**/*.{js,jsx,ts,tsx,mjs,cjs}',
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
        if (FileCollector.DEFAULT_IGNORES.includes(entry.name)) continue;
        if (customExcludes.some((pattern) => entry.name.includes(pattern))) continue;
        FileCollector.walkDirectory(fullPath, results, customExcludes);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (FileCollector.SUPPORTED_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }
}
