import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AstScanner } from '../src/scanner/astScanner';
import { RuleRegistry } from '../src/rules/ruleRegistry';

describe('AstScanner', () => {
  const registry = RuleRegistry.getInstance();
  const nextRules = registry.getRulesForUpgrade('next', '14.2.0', '15.0.0');
  const reactRules = registry.getRulesForUpgrade('react', '18.2.0', '19.0.0');

  describe('Next.js 15 AST detection', () => {
    it('should detect synchronous cookies() call and report exact line number', () => {
      const code = [
        "import { cookies } from 'next/headers';",
        'export function handler() {',
        "  const cookieStore = cookies();", // Line 3
        "  return cookieStore.get('auth');",
        '}'
      ].join('\n');

      const issues = AstScanner.scanFile('app/api/auth/route.ts', code, nextRules);
      const cookieIssue = issues.find((i) => i.ruleId === 'next-15-async-cookies');

      assert.ok(cookieIssue, 'Should flag sync cookies call');
      assert.equal(cookieIssue.line, 3);
      assert.equal(cookieIssue.codeSnippet, 'const cookieStore = cookies();');
    });

    it('should NOT flag awaited cookies() call (no false positives)', () => {
      const code = [
        "import { cookies } from 'next/headers';",
        'export async function handler() {',
        "  const cookieStore = await cookies();",
        "  return cookieStore.get('auth');",
        '}'
      ].join('\n');

      const issues = AstScanner.scanFile('app/api/auth/route.ts', code, nextRules);
      const cookieIssue = issues.find((i) => i.ruleId === 'next-15-async-cookies');

      assert.equal(cookieIssue, undefined, 'Awaited cookies() must not be flagged');
    });

    it('should detect next/router import in App Router directory', () => {
      const code = [
        "'use client';",
        "import { useRouter } from 'next/router';",
        'export default function Profile() { return <div />; }'
      ].join('\n');

      const issues = AstScanner.scanFile('src/app/profile/page.tsx', code, nextRules);
      const routerIssue = issues.find((i) => i.ruleId === 'next-15-app-router-legacy-router');

      assert.ok(routerIssue, 'Should flag next/router import in /app/');
      assert.equal(routerIssue.line, 2);
    });

    it('should detect deprecated layout prop on <Image>', () => {
      const code = [
        "import Image from 'next/image';",
        'export function Banner() {',
        '  return <Image src="/hero.png" layout="fill" />;',
        '}'
      ].join('\n');

      const issues = AstScanner.scanFile('src/components/Banner.tsx', code, nextRules);
      const imageIssue = issues.find((i) => i.ruleId === 'next-15-legacy-image-props');

      assert.ok(imageIssue, 'Should flag layout prop on Image');
      assert.equal(imageIssue.line, 3);
    });

    it('should detect request.geo and request.ip on NextRequest', () => {
      const code = [
        "import { NextRequest } from 'next/server';",
        'export function middleware(request: NextRequest) {',
        '  const geo = request.geo;', // Line 3
        '  const ip = request.ip;', // Line 4
        '  return null;',
        '}'
      ].join('\n');

      const issues = AstScanner.scanFile('middleware.ts', code, nextRules);
      const geoIssue = issues.find((i) => i.ruleId === 'next-15-nextrequest-geo-removed');
      const ipIssue = issues.find((i) => i.ruleId === 'next-15-nextrequest-ip-removed');

      assert.ok(geoIssue, 'Should flag request.geo');
      assert.equal(geoIssue.line, 3);
      assert.ok(ipIssue, 'Should flag request.ip');
      assert.equal(ipIssue.line, 4);
    });

    it('should detect next/legacy/image and @next/font imports', () => {
      const code = [
        "import Image from 'next/legacy/image';", // Line 1
        "import { Inter } from '@next/font/google';", // Line 2
        'export function Comp() { return null; }'
      ].join('\n');

      const issues = AstScanner.scanFile('src/Comp.tsx', code, nextRules);
      const legacyImageIssue = issues.find((i) => i.ruleId === 'next-15-next-legacy-image-removed');
      const fontIssue = issues.find((i) => i.ruleId === 'next-15-next-font-package-removed');

      assert.ok(legacyImageIssue, 'Should flag next/legacy/image');
      assert.equal(legacyImageIssue.line, 1);
      assert.ok(fontIssue, 'Should flag @next/font');
      assert.equal(fontIssue.line, 2);
    });

    it('should detect useFormState usage', () => {
      const code = [
        "import { useFormState } from 'react-dom';",
        'export function Form() {',
        '  const [state, action] = useFormState(fn, null);', // Line 3
        '  return null;',
        '}'
      ].join('\n');

      const issues = AstScanner.scanFile('src/Form.tsx', code, nextRules);
      const formIssue = issues.find((i) => i.ruleId === 'next-15-react-use-form-state');

      assert.ok(formIssue, 'Should flag useFormState');
      assert.equal(formIssue.line, 3);
    });
  });

  describe('React 19 AST detection', () => {
    it('should detect ReactDOM.render with exact line number', () => {
      const code = [
        "import ReactDOM from 'react-dom';",
        "import { App } from './App';",
        "ReactDOM.render(<App />, document.getElementById('root'));"
      ].join('\n');

      const issues = AstScanner.scanFile('src/index.tsx', code, reactRules);
      const renderIssue = issues.find((i) => i.ruleId === 'react-19-removed-reactdom-render');

      assert.ok(renderIssue, 'Should flag ReactDOM.render');
      assert.equal(renderIssue.line, 3);
    });

    it('should detect legacy string refs on JSX elements', () => {
      const code = [
        'export function Form() {',
        '  return <input ref="usernameInput" type="text" />;',
        '}'
      ].join('\n');

      const issues = AstScanner.scanFile('src/components/Form.tsx', code, reactRules);
      const refIssue = issues.find((i) => i.ruleId === 'react-19-removed-string-refs');

      assert.ok(refIssue, 'Should flag string ref');
      assert.equal(refIssue.line, 2);
    });

    it('should detect deprecated lifecycle methods on class components', () => {
      const code = [
        "import React from 'react';",
        'class LegacyComponent extends React.Component {',
        '  componentWillReceiveProps(nextProps) {',
        '    console.log(nextProps);',
        '  }',
        '  render() { return null; }',
        '}'
      ].join('\n');

      const issues = AstScanner.scanFile('src/components/Legacy.tsx', code, reactRules);
      const lifecycleIssue = issues.find((i) => i.ruleId === 'react-19-removed-legacy-lifecycles');

      assert.ok(lifecycleIssue, 'Should flag componentWillReceiveProps');
      assert.equal(lifecycleIssue.line, 3);
    });

    it('should detect React.PropTypes usage', () => {
      const code = [
        "import React from 'react';",
        'function Card() { return null; }',
        'Card.propTypes = React.PropTypes.string;'
      ].join('\n');

      const issues = AstScanner.scanFile('src/components/Card.tsx', code, reactRules);
      const propTypesIssue = issues.find((i) => i.ruleId === 'react-19-removed-proptypes');

      assert.ok(propTypesIssue, 'Should flag React.PropTypes');
      assert.equal(propTypesIssue.line, 3);
    });
  });
});
