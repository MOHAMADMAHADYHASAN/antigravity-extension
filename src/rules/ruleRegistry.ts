import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as semver from 'semver';
import { MigrationRule, UpgradeTarget } from '../types/rules';
import { RemoteRuleLoader } from './remoteRuleLoader';

import next14To15Rules from './definitions/nextjs/14-to-15.json';
import next15To16Rules from './definitions/nextjs/15-to-16.json';
import react18To19Rules from './definitions/react/18-to-19.json';

export interface FetchRemoteRulesOptions {
  manifestUrl?: string;
  timeoutMs?: number;
  technology?: string;
  version?: string;
  forceRefresh?: boolean;
  localFallbackDir?: string;
}

export class RuleRegistry {
  private static instance: RuleRegistry;
  private rules: MigrationRule[] = [];

  public static readonly REMOTE_MANIFEST_URL =
    'https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/manifest.json';

  // In-memory cache and concurrency protection
  private activeFetchPromise: Promise<MigrationRule[]> | null = null;
  private manifestCache: { data: Record<string, Record<string, string>>; timestamp: number } | null = null;
  private rulesCache: Map<string, { rules: MigrationRule[]; timestamp: number }> = new Map();
  private cacheTtlMs: number = 10 * 60 * 1000; // 10 minutes default TTL

  private constructor() {
    this.loadBuiltinRules();
  }

  public static getInstance(): RuleRegistry {
    if (!RuleRegistry.instance) {
      RuleRegistry.instance = new RuleRegistry();
    }
    return RuleRegistry.instance;
  }

  /**
   * Resets registry to initial state (built-in rules only) and clears caches.
   * Useful for test isolation and state resetting.
   */
  public reset(): void {
    this.loadBuiltinRules();
    this.manifestCache = null;
    this.rulesCache.clear();
    this.activeFetchPromise = null;
  }

  /**
   * Loads built-in rule definitions
   */
  private loadBuiltinRules(): void {
    const builtin: MigrationRule[] = [
      ...(next14To15Rules as unknown as MigrationRule[]),
      ...(next15To16Rules as unknown as MigrationRule[]),
      ...(react18To19Rules as unknown as MigrationRule[])
    ];
    this.rules = builtin;
  }

  /**
   * Registers additional or custom rules (e.g. from workspace .antigravity/rules.json)
   * Predictable conflict policy: If a rule with the same ID already exists,
   * it overrides the existing entry. Otherwise, it is appended.
   */
  public registerCustomRules(customRules: MigrationRule[]): void {
    for (const rule of customRules) {
      const existingIdx = this.rules.findIndex((r) => r.id === rule.id);
      if (existingIdx >= 0) {
        this.rules[existingIdx] = rule; // Override
      } else {
        this.rules.push(rule);
      }
    }
  }

  /**
   * Loads and registers rules from JSON files within a directory (e.g. remote-rules/)
   */
  public loadFromDirectory(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0;
    let count = 0;
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json' && file !== 'manifest.json') {
          const filePath = path.join(dirPath, file);
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.registerCustomRules(parsed as MigrationRule[]);
            count += parsed.length;
          }
        }
      }
    } catch (err) {
      console.error(`Failed to load rules from ${dirPath}:`, err);
    }
    return count;
  }

  /**
   * Automatically detects dependencies from package.json, resolves remote rules
   * from manifest, and registers them into the rule registry.
   * Gracefully falls back to local rules if offline or remote fetch fails.
   */
  public async loadRemoteRulesForProject(
    packageJson: string | Record<string, unknown>,
    localFallbackDir?: string,
    manifestUrl?: string
  ): Promise<MigrationRule[]> {
    try {
      const result = await RemoteRuleLoader.loadRulesForProject({
        packageJson,
        localFallbackDir,
        manifestUrl
      });
      if (result.loadedRules.length > 0) {
        this.registerCustomRules(result.loadedRules);
      }
      return result.loadedRules;
    } catch (err) {
      console.warn('Failed to load remote rules, continuing with local rules:', err);
      return [];
    }
  }

  /**
   * Fetches JSON from an HTTPS URL using globalThis.fetch if available, with native https fallback.
   * Enforces HTTPS protocol, timeouts, status code verification, and strict JSON parsing.
   */
  private static async fetchJson<T>(url: string, timeoutMs = 5000): Promise<T> {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new Error(`Insecure protocol: only HTTPS is permitted (${url})`);
    }

    // 1. Use globalThis.fetch if available (standard in Node 18+)
    if (typeof globalThis.fetch === 'function') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await globalThis.fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Antigravity-VSCode-Extension',
            Accept: 'application/json'
          }
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        return data as T;
      } finally {
        clearTimeout(timer);
      }
    }

    // 2. Native Node.js https fallback
    return new Promise<T>((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent': 'Antigravity-VSCode-Extension',
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
              resolve(JSON.parse(data) as T);
            } catch (err) {
              reject(err);
            }
          });
        }
      );

      req.on('error', (err) => reject(err));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error(`Request timed out after ${timeoutMs}ms: ${url}`));
      });
    });
  }

  /**
   * Validates manifest structure: technology -> { [version]: string URL }
   */
  private static validateManifest(manifest: unknown): manifest is Record<string, Record<string, string>> {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return false;
    }
    for (const [tech, versionMap] of Object.entries(manifest as Record<string, unknown>)) {
      if (!versionMap || typeof versionMap !== 'object' || Array.isArray(versionMap)) {
        return false;
      }
      for (const [ver, url] of Object.entries(versionMap as Record<string, unknown>)) {
        if (typeof ver !== 'string' || typeof url !== 'string' || !url.startsWith('https://')) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Validates individual MigrationRule object, ensuring required fields and semver ranges
   */
  public static validateRule(rule: unknown): rule is MigrationRule {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      return false;
    }
    const r = rule as Partial<MigrationRule>;
    if (typeof r.id !== 'string' || !r.id.trim()) return false;
    if (typeof r.framework !== 'string' || !r.framework.trim()) return false;
    if (typeof r.fromVersion !== 'string' || !semver.validRange(r.fromVersion)) return false;
    if (typeof r.toVersion !== 'string' || !semver.validRange(r.toVersion)) return false;
    if (!r.detection || typeof r.detection !== 'object') return false;
    if (!Array.isArray(r.detection.fileExtensions) || !Array.isArray(r.detection.fastFilter)) return false;
    if (!r.detection.astPattern || typeof r.detection.astPattern !== 'object') return false;
    if (!r.remediation || typeof r.remediation !== 'object' || typeof r.remediation.summary !== 'string') return false;
    if (typeof r.severity !== 'string') return false;
    return true;
  }

  /**
   * Asynchronously fetches the remote manifest and downloads applicable migration rules.
   *
   * Merge and conflict policy:
   * 1. Preserves all local built-in rules.
   * 2. Validates each fetched rule's fields and semver constraints before merging.
   * 3. If a remote rule's ID matches an existing rule in the registry, it updates/overrides that rule.
   * 4. If a remote rule's ID is new, it is appended to the registry.
   * 5. If fetching fails (offline, timeout, HTTP error, malformed JSON), the failure is handled
   *    silently and the local registry remains fully functional and intact.
   * 6. Concurrent calls return the same in-flight Promise to avoid duplicate network requests.
   */
  public async fetchRemoteRules(
    options?: string | FetchRemoteRulesOptions
  ): Promise<MigrationRule[]> {
    const opts: FetchRemoteRulesOptions =
      typeof options === 'string' ? { manifestUrl: options } : options || {};

    const manifestUrl = opts.manifestUrl || RuleRegistry.REMOTE_MANIFEST_URL;
    const timeoutMs = opts.timeoutMs ?? 5000;
    const forceRefresh = opts.forceRefresh ?? false;

    // Prevent duplicate in-flight requests
    if (this.activeFetchPromise && !forceRefresh) {
      return this.activeFetchPromise;
    }

    const fetchTask = async (): Promise<MigrationRule[]> => {
      const now = Date.now();
      let manifest: Record<string, Record<string, string>> | null = null;

      // Check manifest cache
      if (
        !forceRefresh &&
        this.manifestCache &&
        now - this.manifestCache.timestamp < this.cacheTtlMs
      ) {
        manifest = this.manifestCache.data;
      }

      // 1. Fetch remote manifest
      if (!manifest) {
        try {
          const rawManifest = await RuleRegistry.fetchJson<unknown>(manifestUrl, timeoutMs);
          if (RuleRegistry.validateManifest(rawManifest)) {
            manifest = rawManifest;
            this.manifestCache = { data: rawManifest, timestamp: now };
          }
        } catch {
          // Expected network/offline failure; handled silently
        }
      }

      // 2. Local fallback if manifest fetch failed
      if (!manifest) {
        const fallbackLocations = opts.localFallbackDir
          ? [path.join(opts.localFallbackDir, 'manifest.json')]
          : [path.join(process.cwd(), 'remote-rules', 'manifest.json')];

        for (const loc of fallbackLocations) {
          if (fs.existsSync(loc)) {
            try {
              const raw = fs.readFileSync(loc, 'utf-8');
              const parsed = JSON.parse(raw);
              if (RuleRegistry.validateManifest(parsed)) {
                manifest = parsed;
                this.manifestCache = { data: parsed, timestamp: now };
                break;
              }
            } catch {
              // Local fallback corrupted; ignore silently
            }
          }
        }
      }

      // If manifest still unavailable, keep local rules intact and return empty
      if (!manifest) {
        return [];
      }

      // 3. Resolve target rule URLs from manifest
      const targetUrls = new Set<string>();

      if (opts.technology) {
        const normTech = opts.technology.toLowerCase().trim();
        const techCandidates = [normTech];
        if (normTech === 'next') techCandidates.push('nextjs');
        if (normTech === 'nextjs') techCandidates.push('next');

        let techMap: Record<string, string> | undefined;
        for (const cand of techCandidates) {
          if (manifest[cand]) {
            techMap = manifest[cand];
            break;
          }
        }

        if (techMap) {
          if (opts.version) {
            const coerced = semver.coerce(opts.version);
            const major = coerced ? coerced.major.toString() : opts.version;
            if (techMap[major]) {
              targetUrls.add(techMap[major]);
            } else if (techMap['default']) {
              targetUrls.add(techMap['default']);
            }
          } else {
            // Add all available version URLs for this technology
            for (const url of Object.values(techMap)) {
              targetUrls.add(url);
            }
          }
        }
      } else {
        // Collect all distinct rule URLs from all technologies
        for (const versionMap of Object.values(manifest)) {
          for (const url of Object.values(versionMap)) {
            targetUrls.add(url);
          }
        }
      }

      // 4. Fetch and validate each rule file into temporary collection
      const validatedRemoteRules: MigrationRule[] = [];
      const seenIds = new Set<string>();

      for (const url of targetUrls) {
        let rules: MigrationRule[] | null = null;

        // Check rules cache
        if (
          !forceRefresh &&
          this.rulesCache.has(url) &&
          now - this.rulesCache.get(url)!.timestamp < this.cacheTtlMs
        ) {
          rules = this.rulesCache.get(url)!.rules;
        }

        // Fetch remotely
        if (!rules) {
          try {
            const rawRules = await RuleRegistry.fetchJson<unknown>(url, timeoutMs);
            if (Array.isArray(rawRules)) {
              const validInFile: MigrationRule[] = [];
              for (const r of rawRules) {
                if (RuleRegistry.validateRule(r)) {
                  validInFile.push(r);
                }
              }
              rules = validInFile;
              this.rulesCache.set(url, { rules: validInFile, timestamp: now });
            }
          } catch {
            // Remote fetch failed; attempt local file fallback matching filename
            try {
              const filename = path.basename(new URL(url).pathname);
              const fallbackLocations = opts.localFallbackDir
                ? [path.join(opts.localFallbackDir, filename)]
                : [path.join(process.cwd(), 'remote-rules', filename)];

              for (const loc of fallbackLocations) {
                if (fs.existsSync(loc)) {
                  const raw = fs.readFileSync(loc, 'utf-8');
                  const parsed = JSON.parse(raw);
                  if (Array.isArray(parsed)) {
                    const validInFile: MigrationRule[] = [];
                    for (const r of parsed) {
                      if (RuleRegistry.validateRule(r)) {
                        validInFile.push(r);
                      }
                    }
                    rules = validInFile;
                    this.rulesCache.set(url, { rules: validInFile, timestamp: now });
                    break;
                  }
                }
              }
            } catch {
              // Local fallback also failed; ignore silently
            }
          }
        }

        // Add to temporary collection with deduplication across URLs
        if (rules && rules.length > 0) {
          for (const rule of rules) {
            if (!seenIds.has(rule.id)) {
              seenIds.add(rule.id);
              validatedRemoteRules.push(rule);
            }
          }
        }
      }

      // 5. Merge validated rules atomically into registry using documented conflict policy
      if (validatedRemoteRules.length > 0) {
        this.registerCustomRules(validatedRemoteRules);
      }

      return validatedRemoteRules;
    };

    this.activeFetchPromise = fetchTask().finally(() => {
      this.activeFetchPromise = null;
    });

    return this.activeFetchPromise;
  }

  /**
   * Retrieves all rules currently loaded
   */
  public getAllRules(): MigrationRule[] {
    return [...this.rules];
  }

  /**
   * Returns list of supported frameworks (e.g. 'next', 'react')
   */
  public getSupportedFrameworks(): string[] {
    return Array.from(new Set(this.rules.map((r) => r.framework)));
  }

  /**
   * Finds a rule by its unique ID
   */
  public getRuleById(id: string): MigrationRule | undefined {
    return this.rules.find((r) => r.id === id);
  }

  /**
   * Finds rules that apply to a specific framework upgrade
   * e.g. framework: "next", oldVersion: "14.2.0", newVersion: "15.0.0"
   */
  public getRulesForUpgrade(framework: string, oldVersion: string, newVersion: string): MigrationRule[] {
    const normFramework = framework.toLowerCase().trim();
    const cleanOld = semver.coerce(oldVersion);
    const cleanNew = semver.coerce(newVersion);

    if (!cleanOld || !cleanNew) {
      return [];
    }

    // Only look for rules if it is an upgrade (new >= old)
    if (semver.lt(cleanNew.version, cleanOld.version)) {
      return [];
    }

    return this.rules.filter((rule) => {
      if (rule.framework.toLowerCase() !== normFramework) {
        return false;
      }

      const satisfiesFrom = semver.satisfies(cleanOld.version, rule.fromVersion, { includePrerelease: true });
      const satisfiesTo = semver.satisfies(cleanNew.version, rule.toVersion, { includePrerelease: true });

      if (satisfiesFrom && satisfiesTo) {
        return true;
      }

      // Support multi-major upgrades (e.g. 14 -> 16 spanning 14->15 and 15->16)
      const minTo = semver.minVersion(rule.toVersion);
      if (minTo && semver.gte(cleanNew.version, minTo.version) && semver.lt(cleanOld.version, minTo.version)) {
        return true;
      }

      return false;
    });
  }

  /**
   * Finds rules matching an array of upgrade targets
   */
  public getRulesForUpgrades(targets: UpgradeTarget[]): MigrationRule[] {
    const matchedRules = new Map<string, MigrationRule>();

    for (const target of targets) {
      const rules = this.getRulesForUpgrade(target.framework, target.oldVersion, target.newVersion);
      for (const rule of rules) {
        matchedRules.set(rule.id, rule);
      }
    }

    return Array.from(matchedRules.values());
  }
}
