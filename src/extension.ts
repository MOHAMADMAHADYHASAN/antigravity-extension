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
 * Extension activation entry point
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Antigravity - Framework Migration Assistant is now active.');

  const registry = RuleRegistry.getInstance();
  const watcher = new DependencyWatcher(context);
  watcher.activate();
  context.subscriptions.push(watcher);

  // 1. Command: Scan Project
  const scanCommand = vscode.commands.registerCommand('antigravity.scanProject', async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showWarningMessage('Antigravity: Please open a workspace folder to run a scan.');
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const config = vscode.workspace.getConfiguration('antigravity');
    const excludeGlobs = config.get<string[]>('excludeGlobs', []);

    // Determine rules to execute
    let rulesToRun: MigrationRule[] = [];
    const upgradeTargets: UpgradeTarget[] = [];

    // Attempt to inspect workspace package.json
    try {
      const packageJsonUri = vscode.Uri.file(path.join(workspaceRoot, 'package.json'));
      const raw = await vscode.workspace.fs.readFile(packageJsonUri);
      const text = new TextDecoder('utf-8').decode(raw);
      const currentDeps = VersionTracker.extractDependencies(text);
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

    // If no specific upgrade delta found, offer full scan of all rules
    if (rulesToRun.length === 0) {
      rulesToRun = registry.getAllRules();
    }

    // Run scan with progress notification and cancellation support
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Antigravity: Running framework migration scan...',
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
          vscode.window.showInformationMessage('Antigravity: Migration scan was cancelled.');
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
  });

  // 2. Command: Inspect Dependencies
  const inspectCommand = vscode.commands.registerCommand('antigravity.inspectDependencies', async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showWarningMessage('Antigravity: No active workspace found.');
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
          `Antigravity: No supported frameworks found in package.json (supported: ${supported.join(', ')})`
        );
      } else {
        vscode.window.showInformationMessage(
          `Antigravity Tracked Frameworks: ${detected.join(' | ')}`,
          'Run Migration Scan'
        ).then((action) => {
          if (action === 'Run Migration Scan') {
            vscode.commands.executeCommand('antigravity.scanProject');
          }
        });
      }
    } catch {
      vscode.window.showErrorMessage('Antigravity: Could not read package.json in the current workspace.');
    }
  });

  // 3. Command: Save Report
  const saveReportCommand = vscode.commands.registerCommand('antigravity.saveReport', async () => {
    await ReportViewer.saveReportToFile();
  });

  context.subscriptions.push(scanCommand, inspectCommand, saveReportCommand);
}

/**
 * Extension deactivation entry point
 */
export function deactivate() {
  console.log('Antigravity deactivated.');
}
