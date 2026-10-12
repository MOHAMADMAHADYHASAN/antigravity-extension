import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownGenerator } from '../src/reporter/markdownGenerator';
import { ScanResult } from '../src/types/scanner';

describe('MarkdownGenerator', () => {
  it('should generate an all-clear report when 0 issues are found', () => {
    const emptyResult: ScanResult = {
      totalFilesScanned: 15,
      filesWithIssues: 0,
      issues: [],
      durationMs: 120,
      frameworks: ['next']
    };

    const md = MarkdownGenerator.generate(emptyResult, {
      upgradeDetails: [{ framework: 'next', oldVersion: '14.2.0', newVersion: '15.0.0' }]
    });

    assert.ok(md.includes('Antigravity Migration Report'));
    assert.ok(md.includes('**All Clear!**'));
    assert.ok(md.includes('15'));
  });

  it('should generate structured sections, line links, and remediation examples for detected issues', () => {
    const mockResult: ScanResult = {
      totalFilesScanned: 25,
      filesWithIssues: 2,
      durationMs: 450,
      frameworks: ['next', 'react'],
      issues: [
        {
          ruleId: 'next-15-async-cookies',
          framework: 'next',
          severity: 'breaking',
          title: 'cookies() is now asynchronous in Next.js 15',
          docsUrl: 'https://nextjs.org/docs/messages/sync-dynamic-apis',
          filePath: '/workspace/app/api/auth/route.ts',
          line: 12,
          column: 15,
          codeSnippet: 'const cookieStore = cookies();',
          remediation: {
            summary: 'Await the cookies() call before accessing methods.',
            exampleBefore: 'const cookieStore = cookies();',
            exampleAfter: 'const cookieStore = await cookies();'
          }
        },
        {
          ruleId: 'next-15-async-cookies',
          framework: 'next',
          severity: 'breaking',
          title: 'cookies() is now asynchronous in Next.js 15',
          docsUrl: 'https://nextjs.org/docs/messages/sync-dynamic-apis',
          filePath: '/workspace/app/profile/page.tsx',
          line: 8,
          column: 5,
          codeSnippet: 'cookies().get("token");',
          remediation: {
            summary: 'Await the cookies() call before accessing methods.'
          }
        },
        {
          ruleId: 'react-19-removed-reactdom-render',
          framework: 'react',
          severity: 'breaking',
          title: 'ReactDOM.render has been removed in React 19',
          docsUrl: 'https://react.dev/blog/2024/04/25/react-19-upgrade-guide',
          filePath: '/workspace/src/index.tsx',
          line: 5,
          column: 1,
          codeSnippet: 'ReactDOM.render(<App />, root);',
          remediation: {
            summary: 'Use createRoot instead.',
            exampleBefore: 'ReactDOM.render(<App />, root);',
            exampleAfter: 'createRoot(root).render(<App />);'
          }
        }
      ]
    };

    const md = MarkdownGenerator.generate(mockResult, {
      workspaceRoot: '/workspace'
    });

    // 1. Overview table checks
    assert.ok(md.includes('Total Issues Flagged** | **3**'));
    assert.ok(md.includes('Files with Issues** | 2'));

    // 2. Clickable link formatting checks
    assert.ok(
      md.includes('[**`app/api/auth/route.ts:12`**](file:///workspace/app/api/auth/route.ts#L12)'),
      'Should format clickable markdown link to line 12'
    );
    assert.ok(
      md.includes('[**`src/index.tsx:5`**](file:///workspace/src/index.tsx#L5)'),
      'Should format clickable markdown link to line 5'
    );

    // 3. Snippet rendering check
    assert.ok(md.includes('Line 12: const cookieStore = cookies();'));

    // 4. Grouping check: 2 occurrences grouped under next-15-async-cookies
    assert.ok(md.includes('Occurrences (2):'));

    // 5. Remediation Before & After check
    assert.ok(md.includes('// ❌ BEFORE (Old Syntax)'));
    assert.ok(md.includes('// ✅ AFTER (Migrated Syntax)'));
    assert.ok(md.includes('const cookieStore = await cookies();'));
  });
});
