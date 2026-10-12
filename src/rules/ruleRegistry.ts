import * as semver from 'semver';
import { MigrationRule, UpgradeTarget } from '../types/rules';

import next14To15Rules from './definitions/nextjs/14-to-15.json';
import next15To16Rules from './definitions/nextjs/15-to-16.json';
import react18To19Rules from './definitions/react/18-to-19.json';

export class RuleRegistry {
  private static instance: RuleRegistry;
  private rules: MigrationRule[] = [];

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
