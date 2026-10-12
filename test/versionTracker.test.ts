import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VersionTracker } from '../src/detector/versionTracker';

describe('VersionTracker', () => {
  it('should extract dependencies from package.json JSON string', () => {
    const raw = JSON.stringify({
      name: 'sample-app',
      dependencies: {
        next: '^14.2.5',
        react: '^18.2.0'
      },
      devDependencies: {
        typescript: '^5.0.0',
        '@types/react': '^18.2.0'
      }
    });

    const deps = VersionTracker.extractDependencies(raw);
    assert.equal(deps.next, '^14.2.5');
    assert.equal(deps.react, '^18.2.0');
    assert.equal(deps.typescript, '^5.0.0');
    assert.equal(deps['@types/react'], '^18.2.0');
  });

  it('should handle malformed JSON gracefully', () => {
    const deps = VersionTracker.extractDependencies('{ invalid json');
    assert.deepEqual(deps, {});
  });

  it('should detect major version upgrade for Next.js from 14 to 15', () => {
    const oldDeps = {
      next: '^14.2.5',
      react: '^18.2.0'
    };

    const newDeps = {
      next: '^15.0.0',
      react: '^18.2.0'
    };

    const diffs = VersionTracker.diffSnapshots(oldDeps, newDeps);
    const nextDiff = diffs.find((d) => d.name === 'next');

    assert.ok(nextDiff, 'Should find diff for next');
    assert.equal(nextDiff.type, 'upgrade');
    assert.equal(nextDiff.isMajor, true);
    assert.equal(nextDiff.isMinor, false);
    assert.equal(nextDiff.oldVersion, '^14.2.5');
    assert.equal(nextDiff.newVersion, '^15.0.0');

    const reactDiff = diffs.find((d) => d.name === 'react');
    assert.ok(reactDiff);
    assert.equal(reactDiff.type, 'unchanged');
  });

  it('should detect React 18 to 19 major upgrade', () => {
    const oldDeps = { react: '^18.3.1' };
    const newDeps = { react: '^19.0.0' };

    const diffs = VersionTracker.diffSnapshots(oldDeps, newDeps);
    const reactDiff = diffs.find((d) => d.name === 'react');

    assert.ok(reactDiff);
    assert.equal(reactDiff.type, 'upgrade');
    assert.equal(reactDiff.isMajor, true);
  });

  it('should detect minor version upgrades without flagging as major', () => {
    const oldDeps = { next: '^14.1.0' };
    const newDeps = { next: '^14.2.0' };

    const diffs = VersionTracker.diffSnapshots(oldDeps, newDeps);
    const nextDiff = diffs.find((d) => d.name === 'next');

    assert.ok(nextDiff);
    assert.equal(nextDiff.type, 'upgrade');
    assert.equal(nextDiff.isMajor, false);
    assert.equal(nextDiff.isMinor, true);
  });

  it('should detect downgrades and newly added dependencies', () => {
    const oldDeps = { next: '^15.0.0' };
    const newDeps = { next: '^14.2.0', tailwindcss: '^3.4.0' };

    const diffs = VersionTracker.diffSnapshots(oldDeps, newDeps);

    const nextDiff = diffs.find((d) => d.name === 'next');
    assert.equal(nextDiff?.type, 'downgrade');

    const tailwindDiff = diffs.find((d) => d.name === 'tailwindcss');
    assert.equal(tailwindDiff?.type, 'added');
  });

  it('should filter by tracked packages list when supplied', () => {
    const oldDeps = { next: '^14.0.0', lodash: '^4.17.0' };
    const newDeps = { next: '^15.0.0', lodash: '^4.18.0' };

    const diffs = VersionTracker.diffSnapshots(oldDeps, newDeps, ['next']);
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].name, 'next');
  });
});
