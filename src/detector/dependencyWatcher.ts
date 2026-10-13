import * as vscode from 'vscode';
import { RuleRegistry } from '../rules/ruleRegistry';
import { DependencyDiff } from '../types/tracker';
import { VersionTracker } from './versionTracker';

export class DependencyWatcher implements vscode.Disposable {
  private watcher: vscode.FileSystemWatcher | undefined;
  private disposables: vscode.Disposable[] = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  private _onDidDetectUpgrade = new vscode.EventEmitter<{
    uri: vscode.Uri;
    upgrades: DependencyDiff[];
  }>();
  public readonly onDidDetectUpgrade = this._onDidDetectUpgrade.event;

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Starts monitoring package.json files across the workspace
   */
  public activate(): void {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/package.json');

    this.watcher.onDidChange((uri) => this.handleFileChange(uri), null, this.disposables);
    this.watcher.onDidCreate((uri) => this.handleFileChange(uri), null, this.disposables);

    // Initial pass: record initial snapshots for open workspace package.json files
    this.initializeSnapshots();
  }

  /**
   * Initializes snapshots on workspace startup
   */
  public async initializeSnapshots(): Promise<void> {
    const files = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
    for (const file of files) {
      try {
        const raw = await vscode.workspace.fs.readFile(file);
        const text = new TextDecoder('utf-8').decode(raw);
        const deps = VersionTracker.extractDependencies(text);

        const saved = VersionTracker.getSavedSnapshot(this.context, file.fsPath);
        if (!saved) {
          await VersionTracker.saveSnapshot(this.context, file.fsPath, deps);
        }
      } catch (err) {
        console.error(`Failed to initialize snapshot for ${file.fsPath}`, err);
      }
    }
  }

  /**
   * Handles package.json update with debouncing
   */
  private handleFileChange(uri: vscode.Uri): void {
    if (uri.fsPath.includes('node_modules') || uri.fsPath.includes('.git')) {
      return;
    }

    const key = uri.fsPath;
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    this.debounceTimers.set(
      key,
      setTimeout(async () => {
        this.debounceTimers.delete(key);
        await this.processPackageJson(uri);
      }, 500)
    );
  }

  /**
   * Processes a modified package.json file, diffs against previous snapshot, and notifies if upgrade detected
   */
  public async processPackageJson(uri: vscode.Uri): Promise<DependencyDiff[]> {
    let text: string;
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      text = new TextDecoder('utf-8').decode(raw);
    } catch {
      return [];
    }

    const newDeps = VersionTracker.extractDependencies(text);
    const oldDeps = VersionTracker.getSavedSnapshot(this.context, uri.fsPath) || {};

    // Save latest snapshot
    await VersionTracker.saveSnapshot(this.context, uri.fsPath, newDeps);

    // If there were no prior dependencies recorded, treat as initial baseline
    if (Object.keys(oldDeps).length === 0) {
      return [];
    }

    const supported = RuleRegistry.getInstance().getSupportedFrameworks();
    const diffs = VersionTracker.diffSnapshots(oldDeps, newDeps, supported);

    const upgrades = diffs.filter((d) => d.type === 'upgrade');
    if (upgrades.length > 0) {
      this._onDidDetectUpgrade.fire({ uri, upgrades });
      await this.notifyUpgrades(upgrades);
    }

    return diffs;
  }

  /**
   * Prompts the user with an upgrade notification
   */
  private async notifyUpgrades(upgrades: DependencyDiff[]): Promise<void> {
    const config = vscode.workspace.getConfiguration('upgradelens');
    const legacyConfig = vscode.workspace.getConfiguration('antigravity');
    const autoScan = config.get<string>('autoScanOnDependencyChange') ?? legacyConfig.get<string>('autoScanOnDependencyChange', 'ask');

    if (autoScan === 'never') {
      return;
    }

    const summary = upgrades.map((u) => `${u.name} (${u.oldVersion} → ${u.newVersion})`).join(', ');

    if (autoScan === 'always') {
      vscode.window.showInformationMessage(`UpgradeLens: Detected upgrade for ${summary}. Running scan...`);
      await vscode.commands.executeCommand('upgradelens.scanProject');
      return;
    }

    const choice = await vscode.window.showInformationMessage(
      `UpgradeLens detected framework upgrade: ${summary}. Run migration scan now?`,
      'Run Scan',
      'Later'
    );

    if (choice === 'Run Scan') {
      await vscode.commands.executeCommand('upgradelens.scanProject');
    }
  }

  public dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    if (this.watcher) {
      this.watcher.dispose();
    }
    this._onDidDetectUpgrade.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
