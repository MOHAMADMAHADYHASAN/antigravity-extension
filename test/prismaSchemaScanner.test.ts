import * as path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaSchemaScanner } from '../src/scanner/prismaSchemaScanner';
import { ScanEngine } from '../src/scanner/scanEngine';
import { RuleRegistry } from '../src/rules/ruleRegistry';

describe('PrismaSchemaScanner', () => {
  const remoteRulesDir = path.join(__dirname, '..', 'remote-rules');
  const registry = RuleRegistry.getInstance();
  registry.loadFromDirectory(remoteRulesDir);
  const prisma6Rules = registry.getRulesForUpgrade('prisma', '5.20.0', '6.0.0');

  it('should detect driverAdapters preview feature in schema.prisma with exact line number', () => {
    const schemaContent = [
      'datasource db {',
      '  provider = "postgresql"',
      '  url      = env("DATABASE_URL")',
      '}',
      '',
      'generator client {',
      '  provider        = "prisma-client-js"',
      '  previewFeatures = ["driverAdapters"]', // Line 8
      '}',
      '',
      'model User {',
      '  id Int @id @default(autoincrement())',
      '}'
    ].join('\n');

    const issues = PrismaSchemaScanner.scanFile('prisma/schema.prisma', schemaContent, prisma6Rules);
    const issue = issues.find((i) => i.ruleId === 'prisma-6-schema-driver-adapters-ga');

    assert.ok(issue, 'Should flag driverAdapters preview feature');
    assert.equal(issue.line, 8);
    assert.ok(issue.codeSnippet.includes('previewFeatures = ["driverAdapters"]'));
    assert.equal(issue.severity, 'warning');
  });

  it('should detect multiple preview features on separate lines', () => {
    const schemaContent = [
      'generator client {',
      '  provider        = "prisma-client-js"',
      '  previewFeatures = [',
      '    "driverAdapters",', // Line 4
      '    "relationJoins",',  // Line 5
      '    "jsonProtocol"',    // Line 6
      '  ]',
      '}'
    ].join('\n');

    const issues = PrismaSchemaScanner.scanFile('prisma/schema.prisma', schemaContent, prisma6Rules);
    
    const driverIssue = issues.find((i) => i.ruleId === 'prisma-6-schema-driver-adapters-ga');
    assert.ok(driverIssue);
    assert.equal(driverIssue.line, 4);

    const relationIssue = issues.find((i) => i.ruleId === 'prisma-6-schema-relation-joins-ga');
    assert.ok(relationIssue);
    assert.equal(relationIssue.line, 5);

    const jsonIssue = issues.find((i) => i.ruleId === 'prisma-6-schema-json-protocol-deprecated');
    assert.ok(jsonIssue);
    assert.equal(jsonIssue.line, 6);
  });

  it('should return 0 issues for clean schema.prisma without deprecated preview features', () => {
    const cleanSchema = [
      'datasource db {',
      '  provider = "postgresql"',
      '  url      = env("DATABASE_URL")',
      '}',
      '',
      'generator client {',
      '  provider = "prisma-client-js"',
      '}',
      '',
      'model User {',
      '  id    Int    @id @default(autoincrement())',
      '  email String @unique',
      '}'
    ].join('\n');

    const issues = PrismaSchemaScanner.scanFile('prisma/schema.prisma', cleanSchema, prisma6Rules);
    assert.equal(issues.length, 0, 'Clean schema should have 0 issues');
  });

  it('should ignore non-prisma rules when scanning schema.prisma', () => {
    const schemaContent = 'generator client { previewFeatures = ["driverAdapters"] }';
    // Rules from other frameworks
    const nextRules = registry.getRulesForUpgrade('next', '14.0.0', '15.0.0');

    const issues = PrismaSchemaScanner.scanFile('prisma/schema.prisma', schemaContent, nextRules);
    assert.equal(issues.length, 0, 'Should not match Next.js rules against schema.prisma');
  });

  it('should strictly ignore React rules even if schema content contains matching fastFilter keywords', () => {
    const schemaWithReactKeywords = [
      '// Warning: ReactDOM.render or createRef should not trigger React rules here',
      'datasource db {',
      '  provider = "postgresql"',
      '  url      = env("DATABASE_URL")',
      '}',
      'model User {',
      '  id Int @id',
      '  render String',
      '}'
    ].join('\n');

    const reactRules = registry.getRulesForUpgrade('react', '18.0.0', '19.0.0');
    assert.ok(reactRules.length > 0, 'Should have React rules loaded');

    const issues = PrismaSchemaScanner.scanFile('prisma/schema.prisma', schemaWithReactKeywords, reactRules);
    assert.equal(issues.length, 0, 'Must produce 0 issues when scanning .prisma file with React rules');
  });

  it('should completely exclude .prisma files in ScanEngine when executing pure React rules', async () => {
    const reactRules = registry.getRulesForUpgrade('react', '18.0.0', '19.0.0');
    const scannedFiles: string[] = [];

    const result = await ScanEngine.runScan({
      rootPath: path.join(__dirname, 'fixtures', 'sample-app'),
      rules: reactRules,
      onProgress: (_scanned, _total, currentFile) => {
        scannedFiles.push(currentFile);
      }
    });

    const prismaFileScanned = scannedFiles.some((f) => f.endsWith('.prisma'));
    assert.equal(prismaFileScanned, false, 'No .prisma file should be processed during a React scan');
    const prismaIssues = result.issues.filter((i) => i.framework === 'prisma' || i.filePath.endsWith('.prisma'));
    assert.equal(prismaIssues.length, 0, 'No Prisma issues should ever be returned from a React scan');
  });
});
