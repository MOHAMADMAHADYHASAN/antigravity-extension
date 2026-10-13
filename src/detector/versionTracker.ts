import * as semver from 'semver';
import type * as vscode from 'vscode';
import { DependencyDiff, DependencyMap, DiffType } from '../types/tracker';

export class VersionTracker {
  private static readonly SNAPSHOT_STORAGE_KEY_PREFIX = 'upgradelens.snapshot.';
  private static readonly LEGACY_SNAPSHOT_STORAGE_KEY_PREFIX = 'antigravity.snapshot.';

  /**
   * Extracts combined dependencies and devDependencies from package.json content
   */
  public static extractDependencies(packageJson: string | Record<string, unknown>): DependencyMap {
    let parsed: Record<string, unknown>;

    if (typeof packageJson === 'string') {
      try {
        parsed = JSON.parse(packageJson);
      } catch {
        return {};
      }
    } else {
      parsed = packageJson;
    }

    const result: DependencyMap = {};

    const deps = (parsed.dependencies || {}) as Record<string, unknown>;
    const devDeps = (parsed.devDependencies || {}) as Record<string, unknown>;

    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === 'string') {
        result[name] = version;
      }
    }

    for (const [name, version] of Object.entries(devDeps)) {
      if (typeof version === 'string') {
        // Dependencies take precedence if duplicated
        if (!result[name]) {
          result[name] = version;
        }
      }
    }

    return result;
  }

  /**
   * Compares two dependency maps and returns list of changes
   * If trackedPackages is provided, only inspects those packages.
   */
  public static diffSnapshots(
    oldMap: DependencyMap,
    newMap: DependencyMap,
    trackedPackages?: string[]
  ): DependencyDiff[] {
    const diffs: DependencyDiff[] = [];
    const packagesToCheck = new Set<string>();

    if (trackedPackages && trackedPackages.length > 0) {
      for (const p of trackedPackages) {
        packagesToCheck.add(p);
      }
    } else {
      for (const k of Object.keys(oldMap)) packagesToCheck.add(k);
      for (const k of Object.keys(newMap)) packagesToCheck.add(k);
    }

    for (const pkg of packagesToCheck) {
      const oldVerStr = oldMap[pkg];
      const newVerStr = newMap[pkg];

      if (!oldVerStr && newVerStr) {
        // Newly added
        const newCoerced = semver.coerce(newVerStr);
        diffs.push({
          name: pkg,
          oldVersion: '',
          newVersion: newVerStr,
          type: 'added',
          isMajor: !!newCoerced && newCoerced.major > 0,
          isMinor: false
        });
        continue;
      }

      if (oldVerStr && !newVerStr) {
        // Removed
        diffs.push({
          name: pkg,
          oldVersion: oldVerStr,
          newVersion: '',
          type: 'removed',
          isMajor: false,
          isMinor: false
        });
        continue;
      }

      if (oldVerStr && newVerStr) {
        if (oldVerStr === newVerStr) {
          diffs.push({
            name: pkg,
            oldVersion: oldVerStr,
            newVersion: newVerStr,
            type: 'unchanged',
            isMajor: false,
            isMinor: false
          });
          continue;
        }

        const oldSem = semver.coerce(oldVerStr);
        const newSem = semver.coerce(newVerStr);

        if (!oldSem || !newSem) {
          // If unparseable semver strings
          const type: DiffType = oldVerStr !== newVerStr ? 'upgrade' : 'unchanged';
          diffs.push({
            name: pkg,
            oldVersion: oldVerStr,
            newVersion: newVerStr,
            type,
            isMajor: false,
            isMinor: false
          });
          continue;
        }

        let type: DiffType = 'unchanged';
        if (semver.gt(newSem.version, oldSem.version)) {
          type = 'upgrade';
        } else if (semver.lt(newSem.version, oldSem.version)) {
          type = 'downgrade';
        }

        const isMajor = newSem.major > oldSem.major;
        const isMinor = !isMajor && newSem.minor > oldSem.minor;

        diffs.push({
          name: pkg,
          oldVersion: oldVerStr,
          newVersion: newVerStr,
          type,
          isMajor,
          isMinor
        });
      }
    }

    return diffs;
  }

  /**
   * Retrieves saved snapshot from VS Code workspaceState
   */
  public static getSavedSnapshot(
    context: vscode.ExtensionContext,
    packageJsonPath: string
  ): DependencyMap | undefined {
    const key = `${VersionTracker.SNAPSHOT_STORAGE_KEY_PREFIX}${packageJsonPath}`;
    const saved = context.workspaceState.get<DependencyMap>(key);
    if (saved) {
      return saved;
    }
    const legacyKey = `${VersionTracker.LEGACY_SNAPSHOT_STORAGE_KEY_PREFIX}${packageJsonPath}`;
    return context.workspaceState.get<DependencyMap>(legacyKey);
  }

  /**
   * Saves updated snapshot into VS Code workspaceState
   */
  public static async saveSnapshot(
    context: vscode.ExtensionContext,
    packageJsonPath: string,
    snapshot: DependencyMap
  ): Promise<void> {
    const key = `${VersionTracker.SNAPSHOT_STORAGE_KEY_PREFIX}${packageJsonPath}`;
    await context.workspaceState.update(key, snapshot);
  }
}
