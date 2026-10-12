import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export class ReportViewer {
  private static lastReportContent: string | undefined;

  /**
   * Sets and returns the cached report content
   */
  public static setLastReport(content: string): void {
    ReportViewer.lastReportContent = content;
  }

  public static getLastReport(): string | undefined {
    return ReportViewer.lastReportContent;
  }

  /**
   * Opens the generated report in VS Code and triggers the side-by-side Markdown preview
   */
  public static async showReport(markdown: string): Promise<void> {
    ReportViewer.setLastReport(markdown);

    try {
      const doc = await vscode.workspace.openTextDocument({
        content: markdown,
        language: 'markdown'
      });

      // Show the raw document first
      await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.One
      });

      // Attempt to trigger the native Markdown preview side-by-side
      try {
        await vscode.commands.executeCommand('markdown.showPreviewToSide', doc.uri);
      } catch {
        // Fallback: the text document is already open and syntax-highlighted
      }

      // Check auto-save setting
      const config = vscode.workspace.getConfiguration('antigravity');
      const autoSave = config.get<boolean>('saveReportToFile', false);
      if (autoSave) {
        await ReportViewer.saveReportToFile();
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Antigravity: Failed to display migration report: ${err}`);
    }
  }

  /**
   * Saves the current migration report to a physical file in the workspace
   */
  public static async saveReportToFile(): Promise<string | undefined> {
    const content = ReportViewer.getLastReport();
    if (!content) {
      vscode.window.showWarningMessage('Antigravity: No migration report available to save.');
      return undefined;
    }

    const config = vscode.workspace.getConfiguration('antigravity');
    const outputPathSetting = config.get<string>('reportOutputPath', 'MIGRATION_REPORT.md');

    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const targetPath = path.isAbsolute(outputPathSetting)
      ? outputPathSetting
      : path.join(workspaceRoot, outputPathSetting);

    try {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(targetPath, content, 'utf-8');
      vscode.window.showInformationMessage(
        `Antigravity: Migration report saved to ${path.basename(targetPath)}`,
        'Open File'
      ).then(async (selection) => {
        if (selection === 'Open File') {
          const doc = await vscode.workspace.openTextDocument(targetPath);
          await vscode.window.showTextDocument(doc);
        }
      });

      return targetPath;
    } catch (err) {
      vscode.window.showErrorMessage(`Antigravity: Failed to save report: ${err}`);
      return undefined;
    }
  }
}
