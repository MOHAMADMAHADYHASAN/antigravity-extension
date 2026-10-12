import * as path from 'path';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RemoteRuleLoader, RemoteRulesManifest } from '../src/rules/remoteRuleLoader';
import { RuleRegistry } from '../src/rules/ruleRegistry';

describe('RemoteRuleLoader', () => {
  const remoteRulesDir = path.join(__dirname, '..', 'remote-rules');

  const sampleManifest: RemoteRulesManifest = {
    nextjs: {
      '15': 'https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/nextjs-15.json',
      '16': 'https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/nextjs-16.json'
    },
    next: {
      '15': 'https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/nextjs-15.json',
      '16': 'https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/nextjs-16.json'
    },
    react: {
      default: 'https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/react.json',
      '19': 'https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/react.json'
    }
  };

  beforeEach(() => {
    RemoteRuleLoader.clearCache();
  });

  describe('Technology & Version Detection', () => {
    it('should detect Next.js and major version from package.json dependencies', () => {
      const packageJson = JSON.stringify({
        dependencies: {
          next: '^15.0.3',
          react: '19.0.0'
        }
      });

      const detected = RemoteRuleLoader.detectTechnologies(packageJson);
      assert.equal(detected.length, 2);

      const nextTech = detected.find((d) => d.technology === 'nextjs');
      assert.ok(nextTech);
      assert.equal(nextTech.majorVersion, '15');
      assert.equal(nextTech.rawName, 'next');

      const reactTech = detected.find((d) => d.technology === 'react');
      assert.ok(reactTech);
      assert.equal(reactTech.majorVersion, '19');
    });

    it('should detect technologies from devDependencies as well', () => {
      const packageJson = JSON.stringify({
        devDependencies: {
          typescript: '^5.5.0'
        }
      });

      const detected = RemoteRuleLoader.detectTechnologies(packageJson);
      assert.equal(detected.length, 1);
      assert.equal(detected[0].technology, 'typescript');
      assert.equal(detected[0].majorVersion, '5');
    });

    it('should handle malformed JSON gracefully during detection', () => {
      const detected = RemoteRuleLoader.detectTechnologies('{ invalid json');
      assert.deepEqual(detected, []);
    });
  });

  describe('URL Resolution from Manifest', () => {
    it('Next.js 15 selects nextjs-15.json', () => {
      const url = RemoteRuleLoader.resolveRulesUrl(sampleManifest, 'nextjs', '^15.0.0');
      assert.ok(url);
      assert.ok(url.endsWith('/nextjs-15.json'));

      // Also via alias "next"
      const urlAlias = RemoteRuleLoader.resolveRulesUrl(sampleManifest, 'next', '15.2.0');
      assert.ok(urlAlias);
      assert.ok(urlAlias.endsWith('/nextjs-15.json'));
    });

    it('Next.js 16 selects nextjs-16.json', () => {
      const url = RemoteRuleLoader.resolveRulesUrl(sampleManifest, 'nextjs', '^16.0.0');
      assert.ok(url);
      assert.ok(url.endsWith('/nextjs-16.json'));

      // Also with pre-release/canary semver
      const urlCanary = RemoteRuleLoader.resolveRulesUrl(sampleManifest, 'next', '16.0.0-canary.2');
      assert.ok(urlCanary);
      assert.ok(urlCanary.endsWith('/nextjs-16.json'));
    });

    it('a technology with a default entry selects the default rules', () => {
      // React 18 has no exact "18" key, but has a "default" entry
      const url18 = RemoteRuleLoader.resolveRulesUrl(sampleManifest, 'react', '18.2.0');
      assert.ok(url18);
      assert.ok(url18.endsWith('/react.json'));

      // When no version is provided, default entry is also selected
      const urlNoVer = RemoteRuleLoader.resolveRulesUrl(sampleManifest, 'react');
      assert.ok(urlNoVer);
      assert.ok(urlNoVer.endsWith('/react.json'));
    });

    it('an unsupported version follows the documented fallback (returns undefined)', () => {
      // Next.js 14 is not in manifest and has no default entry
      const url = RemoteRuleLoader.resolveRulesUrl(sampleManifest, 'nextjs', '14.2.0');
      assert.equal(url, undefined, 'Unsupported version should return undefined rather than incompatible rules');
    });

    it('a missing manifest entry is handled gracefully (returns undefined)', () => {
      const url = RemoteRuleLoader.resolveRulesUrl(sampleManifest, 'unknown-framework', '1.0.0');
      assert.equal(url, undefined);
    });
  });

  describe('Validation & Security', () => {
    it('should validate legitimate manifest structure', () => {
      assert.equal(RemoteRuleLoader.validateManifest(sampleManifest), true);
    });

    it('should reject manifest with non-HTTPS URLs for security', () => {
      const insecureManifest = {
        nextjs: {
          '15': 'http://insecure.example.com/rules.json'
        }
      };
      assert.equal(RemoteRuleLoader.validateManifest(insecureManifest), false);
    });

    it('should reject non-object or malformed manifests', () => {
      assert.equal(RemoteRuleLoader.validateManifest(null), false);
      assert.equal(RemoteRuleLoader.validateManifest([]), false);
      assert.equal(RemoteRuleLoader.validateManifest('string'), false);
      assert.equal(RemoteRuleLoader.validateManifest({ next: 'invalid' }), false);
    });

    it('should validate migration rules array correctly', () => {
      const validRules = [
        {
          id: 'test-rule-1',
          framework: 'next',
          fromVersion: '14.0.0',
          toVersion: '15.0.0',
          detection: { fastFilter: ['cookies'] },
          remediation: { summary: 'Update cookies' }
        }
      ];
      assert.equal(RemoteRuleLoader.validateRules(validRules), true);
      assert.equal(RemoteRuleLoader.validateRules([{ invalid: true }]), false);
      assert.equal(RemoteRuleLoader.validateRules('not array'), false);
    });
  });

  describe('Caching & Deduplication', () => {
    it('should cache fetched rules in memory and avoid duplicate requests', async () => {
      // Use localFallbackDir so fetchRules loads local file without hitting network
      const ruleUrl = 'https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/nextjs-16.json';
      
      const firstFetch = await RemoteRuleLoader.fetchRules(ruleUrl, remoteRulesDir);
      assert.ok(firstFetch);
      assert.equal(firstFetch.length, 10);

      // Second fetch should return the exact same cached reference
      const secondFetch = await RemoteRuleLoader.fetchRules(ruleUrl, remoteRulesDir);
      assert.strictEqual(firstFetch, secondFetch, 'Should return cached rules reference on subsequent fetch');
    });

    it('should not duplicate rules when loaded into RuleRegistry multiple times', () => {
      const registry = RuleRegistry.getInstance();
      const initialCount = registry.getAllRules().length;

      const rule = {
        id: 'duplicate-test-rule',
        framework: 'test',
        fromVersion: '1.0.0',
        toVersion: '2.0.0',
        severity: 'critical' as const,
        description: 'Test rule',
        detection: { fastFilter: ['foo'] },
        remediation: { summary: 'Fix foo' }
      };

      registry.registerCustomRules([rule]);
      const countAfterFirst = registry.getAllRules().length;
      registry.registerCustomRules([rule]);
      const countAfterSecond = registry.getAllRules().length;

      assert.equal(countAfterFirst, countAfterSecond, 'Duplicate rule ID should overwrite, not increase count');
      assert.ok(countAfterSecond >= initialCount);
    });
  });

  describe('Resilience and Fallback Handling', () => {
    it('should fall back to local rules directory when remote loading encounters network error', async () => {
      // Point to an invalid unreachable manifest URL
      const invalidUrl = 'https://raw.githubusercontent.com/nonexistent-org/nonexistent-repo/main/manifest.json';

      const manifest = await RemoteRuleLoader.fetchManifest(invalidUrl, remoteRulesDir);
      assert.ok(manifest, 'Should fall back to local remote-rules/manifest.json');
      assert.ok(manifest.nextjs);
    });

    it('local rules still work when remote loading fails completely', async () => {
      const registry = RuleRegistry.getInstance();
      // Even if remote fetch completely fails with an invalid URL and invalid directory
      const loaded = await registry.loadRemoteRulesForProject(
        JSON.stringify({ dependencies: { next: '^15.0.0' } }),
        '/nonexistent/dir/path',
        'https://raw.githubusercontent.com/invalid/invalid/invalid/manifest.json'
      );

      // Local fallback in non-existent dir failed, returns empty array without throwing
      assert.deepEqual(loaded, []);

      // But built-in rules remain intact and functional!
      const allRules = registry.getAllRules();
      assert.ok(allRules.length >= 31, 'Built-in rules remain fully functional');

      const next15Rules = registry.getRulesForUpgrade('next', '14.2.0', '15.0.0');
      assert.ok(next15Rules.length >= 15);
    });

    it('should successfully load remote rules for project via manifest and local directory', async () => {
      const registry = RuleRegistry.getInstance();
      const loaded = await registry.loadRemoteRulesForProject(
        JSON.stringify({ dependencies: { next: '^16.0.0', react: '^19.0.0' } }),
        remoteRulesDir
      );

      assert.ok(loaded.length > 0, 'Should load rules for Next.js 16 and React');
      const hasNext16 = loaded.some((r) => r.id.startsWith('next-16'));
      assert.ok(hasNext16, 'Should have loaded Next.js 16 rules');
    });
  });
});
