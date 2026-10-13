import * as path from 'path';
import * as vscode from 'vscode';
import { DependencyWatcher } from './detector/dependencyWatcher';
import { VersionTracker } from './detector/versionTracker';
import { MarkdownGenerator } from './reporter/markdownGenerator';
import { ReportViewer } from './reporter/reportViewer';
import { RuleRegistry } from './rules/ruleRegistry';
import { ScanEngine } from './scanner/scanEngine';
import { MigrationRule, UpgradeTarget } from './types/rules';

/**
 * Helper to retrieve effective configuration prioritizing 'upgradelens' with fallback to 'antigravity'
 */
function getEffectiveConfig() {
  const config = vscode.workspace.getConfiguration('upgradelens');
  const legacyConfig = vscode.workspace.getConfiguration('antigravity');
  return {
    get: <T>(key: string, defaultValue: T): T => {
      const primary = config.get<T>(key);
      if (primary !== undefined && primary !== null) {
        const inspected = config.inspect<T>(key);
        if (inspected?.workspaceValue !== undefined || inspected?.globalValue !== undefined) {
          return primary;
        }
      }
      const legacy = legacyConfig.get<T>(key);
      if (legacy !== undefined && legacy !== null) {
        return legacy;
      }
      return primary !== undefined ? primary : defaultValue;
    }
  };
}

/**
 * Helper to register a command under both the new 'upgradelens' namespace and the legacy 'antigravity' alias
 */
function registerWithLegacyAlias(
  primaryCommand: string,
  legacyCommand: string,
  handler: (...args: any[]) => any
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(primaryCommand, handler),
    vscode.commands.registerCommand(legacyCommand, handler)
  ];
}

/**
 * Extension activation entry point
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('UpgradeLens - Framework Migration Assistant is now active.');

  const registry = RuleRegistry.getInstance();
  // Asynchronously pre-fetch remote rules in the background
  registry.fetchRemoteRules().catch(() => {});

  const watcher = new DependencyWatcher(context);
  watcher.activate();
  context.subscriptions.push(watcher);

  // 1. Command: Scan Project
  const scanHandler = async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showWarningMessage('UpgradeLens: Please open a workspace folder to run a scan.');
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const config = getEffectiveConfig();
    const excludeGlobs = config.get<string[]>('excludeGlobs', []);

    // Determine rules to execute
    let rulesToRun: MigrationRule[] = [];
    const upgradeTargets: UpgradeTarget[] = [];
    let detectedDeps: Record<string, string> = {};

    // Attempt to inspect workspace package.json
    try {
      const packageJsonUri = vscode.Uri.file(path.join(workspaceRoot, 'package.json'));
      const raw = await vscode.workspace.fs.readFile(packageJsonUri);
      const text = new TextDecoder('utf-8').decode(raw);

      // Dynamically load remote rules for project based on manifest and detected dependencies
      const localRulesDir = path.join(workspaceRoot, 'remote-rules');
      await registry.loadRemoteRulesForProject(text, localRulesDir);

      const currentDeps = VersionTracker.extractDependencies(text);
      detectedDeps = currentDeps;
      const savedDeps = VersionTracker.getSavedSnapshot(context, packageJsonUri.fsPath);

      if (savedDeps) {
        const diffs = VersionTracker.diffSnapshots(savedDeps, currentDeps, registry.getSupportedFrameworks());
        for (const diff of diffs) {
          if (diff.type === 'upgrade') {
            upgradeTargets.push({
              framework: diff.name,
              oldVersion: diff.oldVersion,
              newVersion: diff.newVersion
            });
          }
        }
      }

      if (upgradeTargets.length > 0) {
        rulesToRun = registry.getRulesForUpgrades(upgradeTargets);
      }
    } catch {
      // If reading package.json fails or no diff, run all supported rules
    }

    // If no specific upgrade delta found, filter rules by frameworks detected in package.json
    if (rulesToRun.length === 0) {
      const detectedFrameworks = new Set<string>();
      for (const pkg of Object.keys(detectedDeps)) {
        const norm = pkg.toLowerCase();
        if (norm === 'react') detectedFrameworks.add('react');
        if (norm === 'next' || norm === 'nextjs') detectedFrameworks.add('next');
        if (norm === 'prisma' || norm === '@prisma/client') detectedFrameworks.add('prisma');
      }

      if (detectedFrameworks.size > 0) {
        rulesToRun = registry.getAllRules().filter((r) => detectedFrameworks.has(r.framework));
      } else {
        rulesToRun = registry.getAllRules();
      }
    }

    // Run scan with progress notification and cancellation support
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'UpgradeLens: Running framework migration scan...',
        cancellable: true
      },
      async (progress, token) => {
        let lastReported = 0;

        const result = await ScanEngine.runScan({
          rootPath: workspaceRoot,
          rules: rulesToRun,
          excludeGlobs,
          cancellationToken: token,
          onProgress: (scanned, total, currentFile) => {
            const pct = Math.floor((scanned / total) * 100);
            if (pct >= lastReported + 5 || scanned === total) {
              lastReported = pct;
              progress.report({
                message: `${scanned}/${total} files (${path.basename(currentFile)})`,
                increment: 5
              });
            }
          }
        });

        if (token.isCancellationRequested) {
          vscode.window.showInformationMessage('UpgradeLens: Migration scan was cancelled.');
          return;
        }

        // Generate report
        const report = MarkdownGenerator.generate(result, {
          workspaceRoot,
          upgradeDetails: upgradeTargets
        });

        // Present report to user
        await ReportViewer.showReport(report);
      }
    );
  };

  // 2. Command: Inspect Dependencies
  const inspectHandler = async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showWarningMessage('UpgradeLens: No active workspace found.');
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    try {
      const packageJsonUri = vscode.Uri.file(path.join(workspaceRoot, 'package.json'));
      const raw = await vscode.workspace.fs.readFile(packageJsonUri);
      const text = new TextDecoder('utf-8').decode(raw);
      const deps = VersionTracker.extractDependencies(text);

      const supported = registry.getSupportedFrameworks();
      const detected: string[] = [];

      for (const fw of supported) {
        if (deps[fw]) {
          detected.push(`${fw}: ${deps[fw]}`);
        }
      }

      if (detected.length === 0) {
        vscode.window.showInformationMessage(
          `UpgradeLens: No supported frameworks found in package.json (supported: ${supported.join(', ')})`
        );
      } else {
        vscode.window.showInformationMessage(
          `UpgradeLens Tracked Frameworks: ${detected.join(' | ')}`,
          'Run Migration Scan'
        ).then((action) => {
          if (action === 'Run Migration Scan') {
            vscode.commands.executeCommand('upgradelens.scanProject');
          }
        });
      }
    } catch {
      vscode.window.showErrorMessage('UpgradeLens: Could not read package.json in the current workspace.');
    }
  };

  // 3. Command: Save Report
  const saveReportHandler = async () => {
    await ReportViewer.saveReportToFile();
  };

  // 4. Command: Run Custom Version Scan (Interactive User-Selected Versions)
  const customScanHandler = async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showWarningMessage('UpgradeLens: Please open a workspace folder to run a scan.');
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const supportedFrameworks = registry.getSupportedFrameworks();

    // 1. Select framework
    const selectedFramework = await vscode.window.showQuickPick(supportedFrameworks, {
      placeHolder: 'Select framework to analyze',
      title: 'UpgradeLens: Select Framework'
    });
    if (!selectedFramework) {
      return;
    }

    // 2. Prompt for current version
    const fromVersion = await vscode.window.showInputBox({
      title: `UpgradeLens: ${selectedFramework} Current Version`,
      prompt: `Enter your CURRENT ${selectedFramework} version`,
      placeHolder: 'e.g., 14.2.0, 14, or 15',
      validateInput: (value) => (value.trim() ? null : 'Current version cannot be empty')
    });
    if (!fromVersion) {
      return;
    }

    // 3. Prompt for target version
    const toVersion = await vscode.window.showInputBox({
      title: `UpgradeLens: ${selectedFramework} Target Version`,
      prompt: `Enter your TARGET ${selectedFramework} version`,
      placeHolder: 'e.g., 15.0.0, 15, or 16',
      validateInput: (value) => (value.trim() ? null : 'Target version cannot be empty')
    });
    if (!toVersion) {
      return;
    }

    // Attempt to load remote rules for workspace dependencies if available
    try {
      const packageJsonUri = vscode.Uri.file(path.join(workspaceRoot, 'package.json'));
      const raw = await vscode.workspace.fs.readFile(packageJsonUri);
      const text = new TextDecoder('utf-8').decode(raw);
      await registry.loadRemoteRulesForProject(text, path.join(workspaceRoot, 'remote-rules'));
    } catch {
      // Continue with local rules if package.json unavailable or offline
    }

    // Ensure remote rules for the selected framework & target version are fetched if available
    await registry.fetchRemoteRules({
      technology: selectedFramework,
      version: toVersion,
      localFallbackDir: path.join(workspaceRoot, 'remote-rules')
    }).catch(() => {});

    // 4. Filter applicable rules dynamically from RuleRegistry
    const rulesToRun = registry.getRulesForUpgrade(selectedFramework, fromVersion, toVersion);

    if (rulesToRun.length === 0) {
      vscode.window.showInformationMessage(
        `UpgradeLens: No migration rules found for ${selectedFramework} (${fromVersion} → ${toVersion}).`
      );
      return;
    }

    const config = getEffectiveConfig();
    const excludeGlobs = config.get<string[]>('excludeGlobs', []);

    // 5. Run Scan with progress indicator
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `UpgradeLens: Scanning for ${selectedFramework} (${fromVersion} → ${toVersion}) breaking changes...`,
        cancellable: true
      },
      async (progress, token) => {
        let lastReported = 0;

        const result = await ScanEngine.runScan({
          rootPath: workspaceRoot,
          rules: rulesToRun,
          excludeGlobs,
          cancellationToken: token,
          onProgress: (scanned, total, currentFile) => {
            const pct = Math.floor((scanned / total) * 100);
            if (pct >= lastReported + 5 || scanned === total) {
              lastReported = pct;
              progress.report({
                message: `${scanned}/${total} files (${path.basename(currentFile)})`,
                increment: 5
              });
            }
          }
        });

        if (token.isCancellationRequested) {
          vscode.window.showInformationMessage('UpgradeLens: Migration scan was cancelled.');
          return;
        }

        // 6. Generate and present Markdown report
        const report = MarkdownGenerator.generate(result, {
          workspaceRoot,
          upgradeDetails: [
            {
              framework: selectedFramework,
              oldVersion: fromVersion,
              newVersion: toVersion
            }
          ]
        });

        await ReportViewer.showReport(report);
      }
    );
  };

  const scanCommands = registerWithLegacyAlias('upgradelens.scanProject', 'antigravity.scanProject', scanHandler);
  const inspectCommands = registerWithLegacyAlias('upgradelens.inspectDependencies', 'antigravity.inspectDependencies', inspectHandler);
  const saveReportCommands = registerWithLegacyAlias('upgradelens.saveReport', 'antigravity.saveReport', saveReportHandler);
  const customScanCommands = registerWithLegacyAlias('upgradelens.customScan', 'antigravity.customScan', customScanHandler);

  context.subscriptions.push(
    ...scanCommands,
    ...inspectCommands,
    ...saveReportCommands,
    ...customScanCommands
  );
}

/**
 * Extension deactivation entry point
 */
export function deactivate() {
  console.log('UpgradeLens deactivated.');
}
