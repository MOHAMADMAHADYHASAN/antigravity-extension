import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FileCollector } from '../src/scanner/fileCollector';

describe('FileCollector', () => {
  describe('DEFAULT_EXCLUDE_GLOBS & isExcluded', () => {
    it('should exclude auto-generated files and directories', () => {
      assert.ok(
        FileCollector.isExcluded('src/generated/prisma/runtime/client.js', [], false),
        'Should exclude files under **/generated/**'
      );
      assert.ok(
        FileCollector.isExcluded('project/generated/schema.ts', [], false),
        'Should exclude generated directory'
      );
      assert.ok(
        FileCollector.isExcluded('src/generated', [], true),
        'Should exclude generated directory when traversing'
      );
    });

    it('should exclude prisma and .prisma directories', () => {
      assert.ok(
        FileCollector.isExcluded('prisma/client.js', [], false),
        'Should exclude prisma directory'
      );
      assert.ok(
        FileCollector.isExcluded('.prisma/client/index.js', [], false),
        'Should exclude .prisma directory'
      );
      assert.ok(
        FileCollector.isExcluded('node_modules/.prisma/client/index.js', [], false),
        'Should exclude nested .prisma directory'
      );
      assert.ok(
        FileCollector.isExcluded('prisma', [], true),
        'Should exclude prisma directory when traversing'
      );
    });

    it('should exclude minified files (*.min.js)', () => {
      assert.ok(
        FileCollector.isExcluded('public/vendor.min.js', [], false),
        'Should exclude *.min.js files'
      );
      assert.ok(
        FileCollector.isExcluded('src/lib/chart.min.js', [], false),
        'Should exclude nested minified files'
      );
      assert.ok(
        FileCollector.isExcluded('dist/bundle.min.js', [], false),
        'Should exclude dist bundle.min.js'
      );
    });

    it('should exclude standard default ignore directories', () => {
      assert.ok(
        FileCollector.isExcluded('node_modules/react/index.js', [], false),
        'Should exclude node_modules'
      );
      assert.ok(
        FileCollector.isExcluded('.next/server/pages/index.js', [], false),
        'Should exclude .next'
      );
      assert.ok(
        FileCollector.isExcluded('dist/bundle.js', [], false),
        'Should exclude dist'
      );
      assert.ok(
        FileCollector.isExcluded('build/index.js', [], false),
        'Should exclude build'
      );
    });

    it('should NOT exclude regular application source files', () => {
      assert.equal(
        FileCollector.isExcluded('src/app/page.tsx', [], false),
        false,
        'Application page.tsx should NOT be excluded'
      );
      assert.equal(
        FileCollector.isExcluded('src/components/Header.tsx', [], false),
        false,
        'Components should NOT be excluded'
      );
      assert.equal(
        FileCollector.isExcluded('lib/utils.ts', [], false),
        false,
        'Utilities should NOT be excluded'
      );
      assert.equal(
        FileCollector.isExcluded('pages/api/login.ts', [], false),
        false,
        'API routes should NOT be excluded'
      );
    });

    it('should support additional custom excludes', () => {
      const customExcludes = ['**/temp/**', '**/legacy/**'];

      assert.ok(
        FileCollector.isExcluded('src/temp/test.ts', customExcludes, false),
        'Should exclude custom temp directory'
      );
      assert.ok(
        FileCollector.isExcluded('src/legacy/oldCode.js', customExcludes, false),
        'Should exclude custom legacy directory'
      );
      assert.equal(
        FileCollector.isExcluded('src/app/page.tsx', customExcludes, false),
        false,
        'Should not exclude un-matched source files'
      );
    });
  });
});
