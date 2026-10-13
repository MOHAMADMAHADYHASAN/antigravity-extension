import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { VersionTracker } from '../src/detector/versionTracker';
import { RuleRegistry } from '../src/rules/ruleRegistry';
import { ScanEngine } from '../src/scanner/scanEngine';
import { MarkdownGenerator } from '../src/reporter/markdownGenerator';

describe('End-to-End Migration Flow', () => {
  const fixtureDir = path.join(__dirname, 'fixtures', 'sample-app');
  const registry = RuleRegistry.getInstance();

  it('should detect upgrades, scan the fixture app, and generate a complete report', async () => {
    // 1. Dependency version diff detection
    const oldDeps = {
      next: '^14.2.5',
      react: '^18.2.0'
    };
    const newDeps = {
      next: '^15.0.0',
      react: '^19.0.0'
    };

    const diffs = VersionTracker.diffSnapshots(oldDeps, newDeps, ['next', 'react']);
    const upgradeTargets = diffs
      .filter((d) => d.type === 'upgrade')
      .map((d) => ({
        framework: d.name,
        oldVersion: d.oldVersion,
        newVersion: d.newVersion
      }));

    assert.equal(upgradeTargets.length, 2, 'Should flag both Next.js and React as upgrades');

    // 2. Fetch relevant rules
    const rules = registry.getRulesForUpgrades(upgradeTargets);
    assert.ok(rules.length >= 8, 'Should collect all Next.js 15 and React 19 rules');

    // 3. Run high-performance ScanEngine across fixture project
    const scanResult = await ScanEngine.runScan({
      rootPath: fixtureDir,
      rules,
      excludeGlobs: ['**/node_modules/**']
    });

    assert.ok(scanResult.totalFilesScanned >= 6, 'Should scan fixture files');
    assert.equal(scanResult.issues.length, 7, 'Should catch all 7 fixture issues');
    assert.equal(scanResult.filesWithIssues, 6, 'Should find issues in 6 separate files');

    // 4. Verify each individual issue with line accuracy
    const issueMap = new Map(scanResult.issues.map((i) => [i.ruleId, i]));

    const routeGetIssue = issueMap.get('next-15-route-handlers-uncached-by-default');
    assert.ok(routeGetIssue, 'Should detect uncached GET Route Handler');
    assert.equal(routeGetIssue.line, 3);

    const cookieIssue = issueMap.get('next-15-async-cookies');
    assert.ok(cookieIssue);
    assert.equal(cookieIssue.line, 4);
    assert.equal(cookieIssue.codeSnippet, 'const cookieStore = cookies();');

    const routerIssue = issueMap.get('next-15-app-router-legacy-router');
    assert.ok(routerIssue);
    assert.equal(routerIssue.line, 3);
    assert.equal(routerIssue.codeSnippet, "import { useRouter } from 'next/router';");

    const imageIssue = issueMap.get('next-15-legacy-image-props');
    assert.ok(imageIssue);
    assert.equal(imageIssue.line, 6);
    assert.ok(imageIssue.codeSnippet.includes('layout="fill"'));

    const renderIssue = issueMap.get('react-19-removed-reactdom-render');
    assert.ok(renderIssue);
    assert.equal(renderIssue.line, 5);
    assert.ok(renderIssue.codeSnippet.includes('ReactDOM.render'));

    const stringRefIssue = issueMap.get('react-19-removed-string-refs');
    assert.ok(stringRefIssue);
    assert.equal(stringRefIssue.line, 6);
    assert.ok(stringRefIssue.codeSnippet.includes('ref="usernameInput"'));

    const lifecycleIssue = issueMap.get('react-19-removed-legacy-lifecycles');
    assert.ok(lifecycleIssue);
    assert.equal(lifecycleIssue.line, 4);
    assert.ok(lifecycleIssue.codeSnippet.includes('componentWillReceiveProps'));

    // 5. Generate Markdown Report
    const markdownReport = MarkdownGenerator.generate(scanResult, {
      workspaceRoot: fixtureDir,
      upgradeDetails: upgradeTargets
    });

    assert.ok(markdownReport.includes('UpgradeLens Migration Report'));
    assert.ok(markdownReport.includes('**next** (^14.2.5 → ^15.0.0)'));
    assert.ok(markdownReport.includes('**react** (^18.2.0 → ^19.0.0)'));
    assert.ok(markdownReport.includes('Total Issues Flagged** | **7**'));

    // Verify all 6 relative clickable links are included
    assert.ok(markdownReport.includes('app/api/auth/route.ts:4'));
    assert.ok(markdownReport.includes('app/dashboard/page.tsx:3'));
    assert.ok(markdownReport.includes('components/Hero.tsx:6'));
    assert.ok(markdownReport.includes('src/index.tsx:5'));
    assert.ok(markdownReport.includes('components/UserProfile.tsx:6'));
    assert.ok(markdownReport.includes('components/LegacyCard.tsx:4'));
  });
});
