import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as semver from 'semver';
import { MigrationRule } from '../types/rules';

let vscodeModule: typeof import('vscode') | undefined;
try {
  vscodeModule = require('vscode');
} catch {
  // Running outside VS Code (e.g. Node test suite)
}

export interface RemoteRulesManifest {
  [technology: string]: {
    [version: string]: string; // version string (e.g. "15", "16", "19") or "default" -> URL
  };
}

export interface DetectedTechnology {
  technology: string;     // Normalized name (e.g. "nextjs", "react", "typescript")
  rawName: string;        // Package name in package.json (e.g. "next", "react")
  version: string;        // Raw semver from package.json (e.g. "^15.0.0")
  majorVersion?: string;  // Coerced major version string (e.g. "15")
}

export class RemoteRuleLoader {
  public static readonly DEFAULT_MANIFEST_URL =
    'https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/manifest.json';

  // In-memory cache with TTL to prevent duplicate requests
  private static manifestCache: { data: RemoteRulesManifest; timestamp: number } | null = null;
  private static rulesCache: Map<string, { rules: MigrationRule[]; timestamp: number }> = new Map();
  public static cacheTtlMs = 10 * 60 * 1000; // 10 minutes default TTL

  /**
   * Clears internal memory caches (useful for testing and manual sync)
   */
  public static clearCache(): void {
    RemoteRuleLoader.manifestCache = null;
    RemoteRuleLoader.rulesCache.clear();
  }

  /**
   * Backwards-compatible catalog reader for remote-rules index.json
   */
  public static async loadCatalog(localDir?: string): Promise<{
    name: string;
    version: string;
    description: string;
    repository: string;
    baseUrl: string;
    rulesets: Array<{
      id: string;
      framework: string;
      targetVersion: string;
      fromVersion: string;
      toVersion: string;
      file: string;
      ruleCount: number;
      url: string;
    }>;
  }> {
    const targetDir = localDir || path.join(process.cwd(), 'remote-rules');
    const indexPath = path.join(targetDir, 'index.json');
    if (fs.existsSync(indexPath)) {
      const raw = fs.readFileSync(indexPath, 'utf-8');
      return JSON.parse(raw);
    }
    return { name: '', version: '', description: '', repository: '', baseUrl: '', rulesets: [] };
  }

  /**
   * Retrieves configured manifest URL, checking VS Code configuration if available
   */
  public static getManifestUrl(): string {
    try {
      if (vscodeModule?.workspace) {
        const config = vscodeModule.workspace.getConfiguration('antigravity');
        const customUrl = config.get<string>('remoteManifestUrl');
        if (customUrl && typeof customUrl === 'string' && customUrl.trim()) {
          return customUrl.trim();
        }
      }
    } catch {
      // Fallback to default
    }
    return RemoteRuleLoader.DEFAULT_MANIFEST_URL;
  }

  /**
   * Fetches JSON from an HTTPS URL with timeout and error handling
   */
  public static async fetchJson<T>(url: string, timeoutMs = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch (err) {
        return reject(new Error(`Invalid URL: ${url} (${err})`));
      }

      if (parsedUrl.protocol !== 'https:') {
        return reject(new Error(`Only HTTPS URLs are permitted for security: ${url}`));
      }

      const req = https.get(
        url,
        {
          headers: {
            'User-Agent': 'Antigravity-VSCode-Extension/0.1.6',
            Accept: 'application/json'
          }
        },
        (res) => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          }

          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              // Parse strictly as JSON (no eval or script execution)
              const parsed = JSON.parse(data) as T;
              resolve(parsed);
            } catch (err) {
              reject(new Error(`Failed to parse JSON response from ${url}: ${err}`));
            }
          });
        }
      );

      req.on('error', (err) => {
        reject(new Error(`Network error connecting to ${url}: ${err.message}`));
      });

      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error(`Request timed out after ${timeoutMs}ms: ${url}`));
      });
    });
  }

  /**
   * Validates structure of a manifest object
   */
  public static validateManifest(obj: unknown): obj is RemoteRulesManifest {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return false;
    }

    for (const [tech, versionMap] of Object.entries(obj)) {
      if (!versionMap || typeof versionMap !== 'object' || Array.isArray(versionMap)) {
        return false;
      }
      for (const [ver, url] of Object.entries(versionMap)) {
        if (typeof ver !== 'string' || typeof url !== 'string') {
          return false;
        }
        if (!url.startsWith('https://')) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Normalizes rules payload, supporting both top-level arrays and container schemas:
   * { framework: "...", fromVersion: "...", toVersion: "...", rules: [...] }
   */
  public static normalizeRulesPayload(payload: unknown): MigrationRule[] | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    let rootFramework = '';
    let rootFromVersion = '';
    let rootToVersion = '';
    let rawList: unknown[] = [];

    if (Array.isArray(payload)) {
      rawList = payload;
    } else {
      const container = payload as Record<string, unknown>;
      if (!Array.isArray(container.rules)) {
        return null;
      }
      rootFramework = typeof container.framework === 'string' ? container.framework : '';
      rootFromVersion = typeof container.fromVersion === 'string' ? container.fromVersion : '';
      rootToVersion = typeof container.toVersion === 'string' ? container.toVersion : '';
      rawList = container.rules;
    }

    const normalized: MigrationRule[] = [];

    for (const item of rawList) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const r = item as Record<string, unknown>;

      const id = typeof r.id === 'string' ? r.id.trim() : '';
      if (!id) continue;

      const framework = typeof r.framework === 'string' && r.framework ? r.framework : rootFramework;
      const fromVersion = typeof r.fromVersion === 'string' && r.fromVersion ? r.fromVersion : rootFromVersion;
      const toVersion = typeof r.toVersion === 'string' && r.toVersion ? r.toVersion : rootToVersion;

      if (!framework || !fromVersion || !toVersion) continue;

      const rawSeverity = typeof r.severity === 'string' ? r.severity.toLowerCase() : 'breaking';
      const severity = rawSeverity === 'error' || rawSeverity === 'breaking' ? 'breaking' : (rawSeverity === 'warning' ? 'warning' : 'deprecation');

      const title = typeof r.title === 'string' && r.title ? r.title : id;
      const docsUrl = typeof r.docsUrl === 'string' ? r.docsUrl : '';
      const description = typeof r.description === 'string' ? r.description : (typeof r.message === 'string' ? r.message : '');

      let detection: any = r.detection;
      if (!detection || typeof detection !== 'object') {
        detection = {
          fileExtensions: Array.isArray(r.fileExtensions) ? r.fileExtensions : ['.js', '.jsx', '.ts', '.tsx'],
          fastFilter: Array.isArray(r.fastFilter) ? r.fastFilter : [],
          astPattern: typeof r.astPattern === 'object' && r.astPattern ? r.astPattern : {}
        };
      }

      let remediation: any = r.remediation;
      if (!remediation || typeof remediation !== 'object') {
        remediation = {
          summary: title,
          exampleBefore: typeof r.exampleBefore === 'string' ? r.exampleBefore : '',
          exampleAfter: typeof r.exampleAfter === 'string' ? r.exampleAfter : ''
        };
      }

      normalized.push({
        id,
        framework,
        fromVersion,
        toVersion,
        severity,
        title,
        docsUrl,
        description,
        detection,
        remediation
      });
    }

    return normalized;
  }

  /**
   * Validates array of MigrationRule objects or container object
   */
  public static validateRules(rules: unknown): rules is MigrationRule[] {
    const normalized = RemoteRuleLoader.normalizeRulesPayload(rules);
    if (!normalized || normalized.length === 0) {
      return false;
    }

    for (const r of normalized) {
      if (!r || typeof r !== 'object') return false;
      if (typeof r.id !== 'string' || !r.id.trim()) return false;
      if (typeof r.framework !== 'string') return false;
      if (typeof r.fromVersion !== 'string' || typeof r.toVersion !== 'string') return false;
      if (!r.detection || typeof r.detection !== 'object') return false;
      if (!r.remediation || typeof r.remediation !== 'object') return false;
    }

    return true;
  }

  /**
   * Fetches the central manifest from remote URL with caching and local fallback
   */
  public static async fetchManifest(
    manifestUrl = RemoteRuleLoader.getManifestUrl(),
    localFallbackDir?: string
  ): Promise<RemoteRulesManifest | null> {
    const now = Date.now();

    // Check in-memory cache
    if (
      RemoteRuleLoader.manifestCache &&
      now - RemoteRuleLoader.manifestCache.timestamp < RemoteRuleLoader.cacheTtlMs
    ) {
      return RemoteRuleLoader.manifestCache.data;
    }

    // 1. Try remote fetch
    try {
      const data = await RemoteRuleLoader.fetchJson<unknown>(manifestUrl);
      if (RemoteRuleLoader.validateManifest(data)) {
        RemoteRuleLoader.manifestCache = { data, timestamp: now };
        return data;
      }
    } catch {
      // Remote fetch failed; attempt local fallback
    }

    // 2. Local fallback if directory provided or standard remote-rules folder
    const fallbackLocations = localFallbackDir
      ? [path.join(localFallbackDir, 'manifest.json')]
      : [path.join(process.cwd(), 'remote-rules', 'manifest.json')];

    for (const loc of fallbackLocations) {
      if (fs.existsSync(loc)) {
        try {
          const raw = fs.readFileSync(loc, 'utf-8');
          const parsed = JSON.parse(raw);
          if (RemoteRuleLoader.validateManifest(parsed)) {
            RemoteRuleLoader.manifestCache = { data: parsed, timestamp: now };
            return parsed;
          }
        } catch {
          // ignore corrupted local fallback
        }
      }
    }

    return null;
  }

  /**
   * Automatically detects technologies and versions from package.json content or dependency map
   */
  public static detectTechnologies(
    packageJsonOrDeps: string | Record<string, unknown>
  ): DetectedTechnology[] {
    let deps: Record<string, unknown> = {};

    if (typeof packageJsonOrDeps === 'string') {
      try {
        const parsed = JSON.parse(packageJsonOrDeps);
        deps = {
          ...(parsed.dependencies || {}),
          ...(parsed.devDependencies || {})
        };
      } catch {
        return [];
      }
    } else {
      deps = packageJsonOrDeps;
    }

    const detected: DetectedTechnology[] = [];
    const techMapping: Record<string, string> = {
      next: 'nextjs',
      nextjs: 'nextjs',
      react: 'react',
      typescript: 'typescript',
      javascript: 'javascript',
      prisma: 'prisma',
      '@prisma/client': 'prisma'
    };

    for (const [pkgName, versionVal] of Object.entries(deps)) {
      if (typeof versionVal !== 'string') continue;

      const normPkg = pkgName.toLowerCase().trim();
      const techKey = techMapping[normPkg];
      if (techKey) {
        const coerced = semver.coerce(versionVal);
        const majorVersion = coerced ? coerced.major.toString() : undefined;

        detected.push({
          technology: techKey,
          rawName: pkgName,
          version: versionVal,
          majorVersion
        });
      }
    }

    return detected;
  }

  /**
   * Resolves the correct rules URL from manifest given technology and version
   * Returns undefined if no compatible rule set is found (safe fallback).
   */
  public static resolveRulesUrl(
    manifest: RemoteRulesManifest,
    technology: string,
    version?: string
  ): string | undefined {
    if (!manifest || !technology) return undefined;

    const normTech = technology.toLowerCase().trim();
    // Support aliases (e.g. next <-> nextjs, prisma <-> @prisma/client)
    const candidates = [normTech];
    if (normTech === 'next') candidates.push('nextjs');
    if (normTech === 'nextjs') candidates.push('next');
    if (normTech === 'prisma') candidates.push('@prisma/client');
    if (normTech === '@prisma/client') candidates.push('prisma');

    let techMap: Record<string, string> | undefined;
    for (const cand of candidates) {
      if (manifest[cand]) {
        techMap = manifest[cand];
        break;
      }
    }

    if (!techMap) {
      return undefined; // Missing manifest entry
    }

    // 1. If version provided, try exact major version lookup
    if (version) {
      const coerced = semver.coerce(version);
      const major = coerced ? coerced.major.toString() : version.split('.')[0].replace(/[^0-9]/g, '');

      if (major && techMap[major]) {
        return techMap[major];
      }
    }

    // 2. Check for default entry if exact version not mapped
    if (techMap['default']) {
      return techMap['default'];
    }

    // 3. Safe fallback: do not load incompatible rules
    return undefined;
  }

  /**
   * Fetches rules from a resolved URL with caching and local file fallback
   */
  public static async fetchRules(
    url: string,
    localFallbackDir?: string
  ): Promise<MigrationRule[] | null> {
    const now = Date.now();

    // Check rules cache to prevent duplicate fetches
    const cached = RemoteRuleLoader.rulesCache.get(url);
    if (cached && now - cached.timestamp < RemoteRuleLoader.cacheTtlMs) {
      return cached.rules;
    }

    // 1. Try remote fetch
    try {
      const data = await RemoteRuleLoader.fetchJson<unknown>(url);
      const normalized = RemoteRuleLoader.normalizeRulesPayload(data);
      if (normalized && normalized.length > 0 && RemoteRuleLoader.validateRules(normalized)) {
        RemoteRuleLoader.rulesCache.set(url, { rules: normalized, timestamp: now });
        return normalized;
      }
    } catch {
      // Remote fetch failed; attempt local fallback
    }

    // 2. Try local fallback matching filename
    const filename = path.basename(new URL(url).pathname);
    const fallbackLocations = localFallbackDir
      ? [path.join(localFallbackDir, filename)]
      : [path.join(process.cwd(), 'remote-rules', filename)];

    for (const loc of fallbackLocations) {
      if (fs.existsSync(loc)) {
        try {
          const raw = fs.readFileSync(loc, 'utf-8');
          const parsed = JSON.parse(raw);
          const normalized = RemoteRuleLoader.normalizeRulesPayload(parsed);
          if (normalized && normalized.length > 0 && RemoteRuleLoader.validateRules(normalized)) {
            RemoteRuleLoader.rulesCache.set(url, { rules: normalized, timestamp: now });
            return normalized;
          }
        } catch {
          // ignore corrupted local fallback
        }
      }
    }

    return null;
  }

  /**
   * High-level helper: detects project technologies, resolves remote rules from manifest, and fetches them.
   */
  public static async loadRulesForProject(options: {
    packageJson: string | Record<string, unknown>;
    localFallbackDir?: string;
    manifestUrl?: string;
  }): Promise<{
    loadedRules: MigrationRule[];
    detected: DetectedTechnology[];
    fromRemote: boolean;
  }> {
    const { packageJson, localFallbackDir, manifestUrl } = options;
    const detected = RemoteRuleLoader.detectTechnologies(packageJson);
    if (detected.length === 0) {
      return { loadedRules: [], detected: [], fromRemote: false };
    }

    const manifest = await RemoteRuleLoader.fetchManifest(manifestUrl, localFallbackDir);
    if (!manifest) {
      return { loadedRules: [], detected, fromRemote: false };
    }

    const loadedRules: MigrationRule[] = [];
    const ruleIds = new Set<string>();
    let anyFromRemote = false;

    for (const item of detected) {
      const rulesUrl = RemoteRuleLoader.resolveRulesUrl(manifest, item.technology, item.version);
      if (!rulesUrl) {
        continue;
      }

      const rules = await RemoteRuleLoader.fetchRules(rulesUrl, localFallbackDir);
      if (rules && rules.length > 0) {
        anyFromRemote = true;
        for (const rule of rules) {
          if (!ruleIds.has(rule.id)) {
            ruleIds.add(rule.id);
            loadedRules.push(rule);
          }
        }
      }
    }

    return {
      loadedRules,
      detected,
      fromRemote: anyFromRemote
    };
  }
}
