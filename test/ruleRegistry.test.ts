import * as path from 'path';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RuleRegistry } from '../src/rules/ruleRegistry';
import { RemoteRuleLoader } from '../src/rules/remoteRuleLoader';
import { MigrationRule } from '../src/types/rules';

describe('RuleRegistry', () => {
  const registry = RuleRegistry.getInstance();

  it('should load built-in rules for Next.js and React', () => {
    const rules = registry.getAllRules();
    assert.ok(rules.length > 0, 'Rules list should not be empty');

    const frameworks = registry.getSupportedFrameworks();
    assert.ok(frameworks.includes('next'), 'Frameworks should include next');
    assert.ok(frameworks.includes('react'), 'Frameworks should include react');
  });

  it('should return Next.js 15 rules when upgrading from 14.2.0 to 15.0.0', () => {
    const rules = registry.getRulesForUpgrade('next', '14.2.0', '15.0.0');
    assert.ok(rules.length >= 4, 'Should match Next.js 15 breaking changes');

    const ruleIds = rules.map((r) => r.id);
    assert.ok(ruleIds.includes('next-15-async-cookies'), 'Should include async cookies rule');
    assert.ok(ruleIds.includes('next-15-async-headers'), 'Should include async headers rule');
    assert.ok(ruleIds.includes('next-15-app-router-legacy-router'), 'Should include legacy router rule');
  });

  it('should return Next.js 16 rules when upgrading from 15.0.0 to 16.0.0', () => {
    const rules = registry.getRulesForUpgrade('next', '15.0.0', '16.0.0');
    assert.ok(rules.length >= 8, 'Should match Next.js 16 breaking changes');

    const ruleIds = rules.map((r) => r.id);
    assert.ok(ruleIds.includes('next-16-async-params'), 'Should include async params rule');
    assert.ok(ruleIds.includes('next-16-middleware-to-proxy'), 'Should include middleware to proxy rule');
    assert.ok(ruleIds.includes('next-16-amp-removed'), 'Should include AMP removed rule');
    assert.ok(ruleIds.includes('next-16-unstable-cache-deprecated'), 'Should include unstable_cache deprecated rule');
  });

  it('should return combined 15 and 16 rules for multi-major jump from 14.2.0 to 16.0.0', () => {
    const rules = registry.getRulesForUpgrade('next', '14.2.0', '16.0.0');
    const ruleIds = rules.map((r) => r.id);
    assert.ok(ruleIds.includes('next-15-async-cookies'), 'Should include Next 15 rules');
    assert.ok(ruleIds.includes('next-16-async-params'), 'Should include Next 16 rules');
  });

  it('should return React 19 rules when upgrading from 18.2.0 to 19.0.0', () => {
    const rules = registry.getRulesForUpgrade('react', '^18.2.0', '^19.0.0');
    assert.ok(rules.length >= 5, 'Should match React 19 breaking changes');

    const ruleIds = rules.map((r) => r.id);
    assert.ok(ruleIds.includes('react-19-removed-reactdom-render'), 'Should include ReactDOM.render rule');
    assert.ok(ruleIds.includes('react-19-removed-string-refs'), 'Should include string refs rule');
    assert.ok(ruleIds.includes('react-19-removed-proptypes'), 'Should include propTypes rule');
  });

  it('should return no rules for downgrades or unaffected version jumps', () => {
    // Downgrade
    const downgradeRules = registry.getRulesForUpgrade('next', '15.0.0', '14.0.0');
    assert.equal(downgradeRules.length, 0, 'Downgrades should produce no rules');

    // Minor upgrade within same major version not touching target rules
    const minorRules = registry.getRulesForUpgrade('next', '14.1.0', '14.2.0');
    assert.equal(minorRules.length, 0, 'Within 14.x should produce no 15.x rules');
  });

  it('should allow registering and overriding custom rules', () => {
    registry.registerCustomRules([
      {
        id: 'custom-internal-lib-v2',
        framework: 'my-internal-ui',
        fromVersion: '^1.0.0',
        toVersion: '^2.0.0',
        severity: 'breaking',
        title: 'Custom component changed',
        docsUrl: 'https://internal.wiki/migration',
        description: 'Button now requires variant prop',
        detection: {
          fileExtensions: ['.tsx'],
          fastFilter: ['Button'],
          astPattern: {
            type: 'jsxAttribute',
            attribute: 'variant'
          }
        },
        remediation: {
          summary: 'Add variant="primary"'
        }
      }
    ]);

    const customRules = registry.getRulesForUpgrade('my-internal-ui', '1.2.0', '2.0.0');
    assert.equal(customRules.length, 1);
    assert.equal(customRules[0].id, 'custom-internal-lib-v2');
  });

  it('should load and register rules from remote-rules directory', () => {
    const remoteRulesDir = path.join(__dirname, '..', 'remote-rules');
    const loadedCount = registry.loadFromDirectory(remoteRulesDir);
    assert.ok(loadedCount >= 31, 'Should load all 31 rules from remote-rules/');
  });

  it('should load catalog manifest via RemoteRuleLoader', async () => {
    const remoteRulesDir = path.join(__dirname, '..', 'remote-rules');
    const catalog = await RemoteRuleLoader.loadCatalog(remoteRulesDir);
    assert.equal(catalog.rulesets.length, 3);
    assert.ok(catalog.baseUrl.includes('remote-rules'));
  });

  describe('Cloud-Based Remote Rule Fetching', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      registry.reset();
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      registry.reset();
    });

    it('1. should define REMOTE_MANIFEST_URL constant with intended URL', () => {
      assert.equal(
        RuleRegistry.REMOTE_MANIFEST_URL,
        'https://raw.githubusercontent.com/MOHAMADMAHADYHASAN/antigravity-extension/main/remote-rules/manifest.json'
      );
    });

    it('2. should successfully fetch remote manifest and rules via globalThis.fetch', async () => {
      const mockManifest = {
        mocktech: {
          '2': 'https://mock.example.com/mocktech-2.json'
        }
      };

      const mockRules: MigrationRule[] = [
        {
          id: 'mock-cloud-rule-1',
          framework: 'mocktech',
          fromVersion: '>=1.0.0 <2.0.0',
          toVersion: '>=2.0.0',
          severity: 'breaking',
          title: 'Mock Cloud Rule 1',
          docsUrl: 'https://example.com/docs',
          description: 'Testing remote cloud rule',
          detection: {
            fileExtensions: ['.ts', '.tsx'],
            fastFilter: ['useMockApi'],
            astPattern: {
              type: 'identifier',
              name: 'useMockApi'
            }
          },
          remediation: {
            summary: 'Migrate to useNewMockApi'
          }
        }
      ];

      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('manifest.json')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockManifest
          } as Response;
        }
        if (url.includes('mocktech-2.json')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockRules
          } as Response;
        }
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }) as typeof globalThis.fetch;

      const fetched = await registry.fetchRemoteRules({
        manifestUrl: 'https://mock.example.com/manifest.json',
        forceRefresh: true
      });

      assert.equal(fetched.length, 1);
      assert.equal(fetched[0].id, 'mock-cloud-rule-1');
      assert.ok(registry.getRuleById('mock-cloud-rule-1'));
    });

    it('3. should merge remote rules with local rules without clearing local registry', async () => {
      const initialCount = registry.getAllRules().length;
      assert.ok(initialCount >= 31, 'Baseline local rules exist');

      const mockManifest = {
        cloudlib: {
          '1': 'https://mock.example.com/cloudlib-1.json'
        }
      };
      const mockRules: MigrationRule[] = [
        {
          id: 'cloud-merged-rule',
          framework: 'cloudlib',
          fromVersion: '>=0.9.0 <1.0.0',
          toVersion: '>=1.0.0',
          severity: 'warning',
          title: 'Cloud Merged Rule',
          docsUrl: 'https://example.com/docs',
          description: 'Testing merged rule',
          detection: {
            fileExtensions: ['.ts'],
            fastFilter: ['cloudInit'],
            astPattern: { type: 'identifier', name: 'cloudInit' }
          },
          remediation: { summary: 'Use new cloudInit' }
        }
      ];

      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('manifest.json')) {
          return { ok: true, status: 200, json: async () => mockManifest } as Response;
        }
        return { ok: true, status: 200, json: async () => mockRules } as Response;
      }) as typeof globalThis.fetch;

      await registry.fetchRemoteRules({
        manifestUrl: 'https://mock.example.com/manifest.json',
        forceRefresh: true
      });

      const updatedRules = registry.getAllRules();
      assert.equal(updatedRules.length, initialCount + 1, 'Should contain local rules plus 1 remote rule');
      assert.ok(registry.getRuleById('cloud-merged-rule'));
      // Verify local rules are still present
      assert.ok(registry.getRuleById('next-15-async-cookies'));
    });

    it('4. should apply exact semver filtering to remote rules using existing semver logic', async () => {
      const mockManifest = {
        semvertest: {
          '2': 'https://mock.example.com/semvertest-2.json'
        }
      };
      const mockRules: MigrationRule[] = [
        {
          id: 'semver-test-rule',
          framework: 'semvertest',
          fromVersion: '>=1.0.0 <2.0.0',
          toVersion: '>=2.0.0',
          severity: 'breaking',
          title: 'Semver Test Rule',
          docsUrl: 'https://example.com/docs',
          description: 'Semver range check',
          detection: {
            fileExtensions: ['.ts'],
            fastFilter: ['semverTest'],
            astPattern: { type: 'identifier', name: 'semverTest' }
          },
          remediation: { summary: 'Update test' }
        }
      ];

      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('manifest.json')) {
          return { ok: true, status: 200, json: async () => mockManifest } as Response;
        }
        return { ok: true, status: 200, json: async () => mockRules } as Response;
      }) as typeof globalThis.fetch;

      await registry.fetchRemoteRules({
        manifestUrl: 'https://mock.example.com/manifest.json',
        forceRefresh: true
      });

      // Upgrade matching range
      const matching = registry.getRulesForUpgrade('semvertest', '1.4.0', '2.0.0');
      assert.equal(matching.length, 1);
      assert.equal(matching[0].id, 'semver-test-rule');

      // Downgrade should return no rules
      const downgrade = registry.getRulesForUpgrade('semvertest', '2.0.0', '1.4.0');
      assert.equal(downgrade.length, 0);

      // Upgrade outside the rule's fromVersion range
      const unaffected = registry.getRulesForUpgrade('semvertest', '0.5.0', '0.9.0');
      assert.equal(unaffected.length, 0);
    });

    it('5. should fall back to local rules gracefully during offline / network error', async () => {
      globalThis.fetch = (async () => {
        throw new Error('ENOTFOUND offline.example.com (offline mode)');
      }) as typeof globalThis.fetch;

      // Calling fetchRemoteRules without local fallback dir
      const result = await registry.fetchRemoteRules({
        manifestUrl: 'https://offline.example.com/manifest.json',
        localFallbackDir: '/nonexistent/path',
        forceRefresh: true
      });

      assert.deepEqual(result, [], 'Should return empty array without throwing');
      assert.ok(registry.getAllRules().length >= 31, 'Local rules remain 100% functional');
      assert.ok(registry.getRulesForUpgrade('next', '14.2.0', '15.0.0').length >= 15);
    });

    it('6. should handle HTTP errors (404, 500) and timeouts without crashing', async () => {
      // Test HTTP 404
      globalThis.fetch = (async () => {
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }) as typeof globalThis.fetch;

      const result404 = await registry.fetchRemoteRules({
        manifestUrl: 'https://mock.example.com/404-manifest.json',
        localFallbackDir: '/nonexistent',
        forceRefresh: true
      });
      assert.deepEqual(result404, []);

      // Test HTTP 500
      globalThis.fetch = (async () => {
        return { ok: false, status: 500, statusText: 'Internal Server Error' } as Response;
      }) as typeof globalThis.fetch;

      const result500 = await registry.fetchRemoteRules({
        manifestUrl: 'https://mock.example.com/500-manifest.json',
        localFallbackDir: '/nonexistent',
        forceRefresh: true
      });
      assert.deepEqual(result500, []);
    });

    it('7. should skip invalid JSON and malformed rule entries safely', async () => {
      const mockManifest = {
        testtech: {
          '1': 'https://mock.example.com/testtech-1.json'
        }
      };

      const mixedRules = [
        {
          id: 'valid-rule',
          framework: 'testtech',
          fromVersion: '>=0.1.0 <1.0.0',
          toVersion: '>=1.0.0',
          severity: 'breaking',
          title: 'Valid Rule',
          docsUrl: 'https://example.com',
          description: 'Valid rule',
          detection: {
            fileExtensions: ['.ts'],
            fastFilter: ['valid'],
            astPattern: { type: 'identifier', name: 'valid' }
          },
          remediation: { summary: 'Fix valid' }
        },
        {
          // Missing id, invalid semver, missing detection
          framework: 'testtech',
          fromVersion: 'invalid-semver',
          toVersion: 'also-invalid'
        },
        null,
        'not a rule'
      ];

      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('manifest.json')) {
          return { ok: true, status: 200, json: async () => mockManifest } as Response;
        }
        return { ok: true, status: 200, json: async () => mixedRules } as Response;
      }) as typeof globalThis.fetch;

      const fetched = await registry.fetchRemoteRules({
        manifestUrl: 'https://mock.example.com/manifest.json',
        forceRefresh: true
      });

      assert.equal(fetched.length, 1);
      assert.equal(fetched[0].id, 'valid-rule');
    });

    it('8. should isolate partial remote failures so they do not corrupt the local registry', async () => {
      const mockManifest = {
        nextjs: {
          '15': 'https://mock.example.com/fail.json',
          '16': 'https://mock.example.com/success.json'
        }
      };

      const successRules: MigrationRule[] = [
        {
          id: 'partial-success-rule',
          framework: 'next',
          fromVersion: '>=15.0.0 <16.0.0',
          toVersion: '>=16.0.0',
          severity: 'breaking',
          title: 'Success Rule',
          docsUrl: 'https://example.com',
          description: 'Success',
          detection: {
            fileExtensions: ['.ts'],
            fastFilter: ['success'],
            astPattern: { type: 'identifier', name: 'success' }
          },
          remediation: { summary: 'Fix success' }
        }
      ];

      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('manifest.json')) {
          return { ok: true, status: 200, json: async () => mockManifest } as Response;
        }
        if (url.includes('fail.json')) {
          throw new Error('Connection reset by peer');
        }
        return { ok: true, status: 200, json: async () => successRules } as Response;
      }) as typeof globalThis.fetch;

      const fetched = await registry.fetchRemoteRules({
        manifestUrl: 'https://mock.example.com/manifest.json',
        forceRefresh: true
      });

      assert.equal(fetched.length, 1);
      assert.equal(fetched[0].id, 'partial-success-rule');
      // Verify registry was not corrupted
      assert.ok(registry.getAllRules().length >= 32);
    });

    it('9. should predictably resolve duplicate entries and conflicting rule definitions', async () => {
      const originalRule = registry.getRuleById('next-15-async-cookies');
      assert.ok(originalRule);

      const mockManifest = {
        nextjs: {
          '15': 'https://mock.example.com/nextjs-15.json'
        }
      };

      // Conflict rule with updated remediation summary
      const conflictingRule: MigrationRule = {
        ...originalRule!,
        remediation: {
          summary: 'Updated cloud remediation for cookies()'
        }
      };

      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('manifest.json')) {
          return { ok: true, status: 200, json: async () => mockManifest } as Response;
        }
        return { ok: true, status: 200, json: async () => [conflictingRule] } as Response;
      }) as typeof globalThis.fetch;

      await registry.fetchRemoteRules({
        manifestUrl: 'https://mock.example.com/manifest.json',
        forceRefresh: true
      });

      const updated = registry.getRuleById('next-15-async-cookies');
      assert.equal(updated?.remediation.summary, 'Updated cloud remediation for cookies()');

      // Ensure no duplicate IDs in registry
      const cookieRules = registry.getAllRules().filter((r) => r.id === 'next-15-async-cookies');
      assert.equal(cookieRules.length, 1, 'Should overwrite rather than duplicate');
    });

    it('10. should avoid duplicate network requests during concurrent initialization', async () => {
      let manifestFetchCount = 0;

      const mockManifest = {
        tech: {
          '1': 'https://mock.example.com/tech-1.json'
        }
      };

      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('manifest.json')) {
          manifestFetchCount++;
          // Add a tiny delay to simulate network latency
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { ok: true, status: 200, json: async () => mockManifest } as Response;
        }
        return { ok: true, status: 200, json: async () => [] } as Response;
      }) as typeof globalThis.fetch;

      // Trigger 3 concurrent calls simultaneously
      const [res1, res2, res3] = await Promise.all([
        registry.fetchRemoteRules('https://mock.example.com/manifest.json'),
        registry.fetchRemoteRules('https://mock.example.com/manifest.json'),
        registry.fetchRemoteRules('https://mock.example.com/manifest.json')
      ]);

      assert.equal(manifestFetchCount, 1, 'Should execute only 1 network fetch for manifest across concurrent calls');
      assert.deepEqual(res1, res2);
      assert.deepEqual(res2, res3);
    });
  });
});
