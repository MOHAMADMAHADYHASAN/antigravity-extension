import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RuleRegistry } from '../src/rules/ruleRegistry';

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
});
