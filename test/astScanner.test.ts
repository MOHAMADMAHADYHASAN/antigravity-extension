import * as path from 'path';
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

    it('should detect ReactDOM.hydrate with exact line number', () => {
      const code = [
        "import ReactDOM from 'react-dom';",
        'ReactDOM.hydrate(<App />, document.getElementById("root"));'
      ].join('\n');

      const issues = AstScanner.scanFile('src/entry.tsx', code, reactRules);
      const hydrateIssue = issues.find((i) => i.ruleId === 'react-19-removed-reactdom-hydrate');
      assert.ok(hydrateIssue, 'Should flag ReactDOM.hydrate');
      assert.equal(hydrateIssue.line, 2);
    });

    it('should detect ReactDOM.unmountComponentAtNode with exact line number', () => {
      const code = [
        "import ReactDOM from 'react-dom';",
        'ReactDOM.unmountComponentAtNode(container);'
      ].join('\n');

      const issues = AstScanner.scanFile('src/cleanup.ts', code, reactRules);
      const unmountIssue = issues.find((i) => i.ruleId === 'react-19-removed-unmount-component');
      assert.ok(unmountIssue, 'Should flag unmountComponentAtNode');
      assert.equal(unmountIssue.line, 2);
    });

    it('should detect this.refs property access on class components', () => {
      const code = [
        'class Form extends React.Component {',
        '  focus() {',
        '    this.refs.input.focus();',
        '  }',
        '}'
      ].join('\n');

      const issues = AstScanner.scanFile('src/Form.tsx', code, reactRules);
      const thisRefsIssue = issues.find((i) => i.ruleId === 'react-19-removed-this-refs');
      assert.ok(thisRefsIssue, 'Should flag this.refs');
      assert.equal(thisRefsIssue.line, 3);
    });

    it('should detect defaultProps on components', () => {
      const code = [
        'function Badge({ color }: { color?: string }) {',
        '  return <span>{color}</span>;',
        '}',
        "Badge.defaultProps = { color: 'blue' };"
      ].join('\n');

      const issues = AstScanner.scanFile('src/Badge.tsx', code, reactRules);
      const defaultPropsIssue = issues.find((i) => i.ruleId === 'react-19-removed-default-props-function');
      assert.ok(defaultPropsIssue, 'Should flag defaultProps');
      assert.equal(defaultPropsIssue.line, 4);
    });

    it('should detect React.createFactory invocations', () => {
      const code = [
        "import React from 'react';",
        "const divFactory = React.createFactory('div');"
      ].join('\n');

      const issues = AstScanner.scanFile('src/factory.ts', code, reactRules);
      const factoryIssue = issues.find((i) => i.ruleId === 'react-19-removed-create-factory');
      assert.ok(factoryIssue, 'Should flag createFactory');
      assert.equal(factoryIssue.line, 2);
    });

    it('should detect react-test-renderer/shallow imports', () => {
      const code = [
        "import ShallowRenderer from 'react-test-renderer/shallow';",
        'const renderer = new ShallowRenderer();'
      ].join('\n');

      const issues = AstScanner.scanFile('test/comp.test.ts', code, reactRules);
      const shallowIssue = issues.find((i) => i.ruleId === 'react-19-removed-react-test-renderer-shallow');
      assert.ok(shallowIssue, 'Should flag react-test-renderer/shallow');
      assert.equal(shallowIssue.line, 1);
    });

    it('should detect forwardRef wrappers', () => {
      const code = [
        "import { forwardRef } from 'react';",
        'const Button = forwardRef((props, ref) => <button ref={ref} />);'
      ].join('\n');

      const issues = AstScanner.scanFile('src/Button.tsx', code, reactRules);
      const forwardRefIssue = issues.find((i) => i.ruleId === 'react-19-deprecated-forward-ref');
      assert.ok(forwardRefIssue, 'Should flag forwardRef');
      assert.equal(forwardRefIssue.line, 2);
    });

    it('should detect <Context.Provider> JSX elements', () => {
      const code = [
        'export function ThemeWrapper({ children }) {',
        '  return <ThemeContext.Provider value="dark">{children}</ThemeContext.Provider>;',
        '}'
      ].join('\n');

      const issues = AstScanner.scanFile('src/Theme.tsx', code, reactRules);
      const providerIssue = issues.find((i) => i.ruleId === 'react-19-deprecated-context-provider');
      assert.ok(providerIssue, 'Should flag <ThemeContext.Provider>');
      assert.equal(providerIssue.line, 2);
    });

    it('should detect useRef() called with 0 arguments and not flag useRef(null)', () => {
      const badCode = [
        "import { useRef } from 'react';",
        'function Input() {',
        '  const ref = useRef();',
        '  return null;',
        '}'
      ].join('\n');

      const goodCode = [
        "import { useRef } from 'react';",
        'function Input() {',
        '  const ref = useRef(null);',
        '  return null;',
        '}'
      ].join('\n');

      const badIssues = AstScanner.scanFile('src/Bad.tsx', badCode, reactRules);
      const goodIssues = AstScanner.scanFile('src/Good.tsx', goodCode, reactRules);

      const badRefIssue = badIssues.find((i) => i.ruleId === 'react-19-useref-no-arguments');
      const goodRefIssue = goodIssues.find((i) => i.ruleId === 'react-19-useref-no-arguments');

      assert.ok(badRefIssue, 'Should flag useRef() with no arguments');
      assert.equal(badRefIssue.line, 3);
      assert.equal(goodRefIssue, undefined, 'Should NOT flag useRef(null)');
    });
  });

  describe('Next.js 16 AST detection', () => {
    const next16Rules = registry.getRulesForUpgrade('next', '15.0.0', '16.0.0');

    it('should detect synchronous params property access in Next.js 16', () => {
      const code = [
        'export default function Page({ params }: { params: { slug: string } }) {',
        '  const slug = params.slug;', // Line 2
        '  return <div>{slug}</div>;',
        '}'
      ].join('\n');

      const issues = AstScanner.scanFile('app/blog/[slug]/page.tsx', code, next16Rules);
      const paramsIssue = issues.find((i) => i.ruleId === 'next-16-async-params');

      assert.ok(paramsIssue, 'Should flag synchronous params.slug access');
      assert.equal(paramsIssue.line, 2);
    });

    it('should detect middleware function convention in Next.js 16', () => {
      const code = [
        "import { NextResponse } from 'next/server';",
        'export function middleware(req: any) {', // Line 2
        '  return NextResponse.next();',
        '}'
      ].join('\n');

      const issues = AstScanner.scanFile('middleware.ts', code, next16Rules);
      const middlewareIssue = issues.find((i) => i.ruleId === 'next-16-middleware-to-proxy');

      assert.ok(middlewareIssue, 'Should flag middleware function in Next 16');
      assert.equal(middlewareIssue.line, 2);
    });

    it('should detect next/amp imports in Next.js 16', () => {
      const code = [
        "import { useAmp } from 'next/amp';", // Line 1
        'export default function Page() { return null; }'
      ].join('\n');

      const issues = AstScanner.scanFile('pages/amp.tsx', code, next16Rules);
      const ampIssue = issues.find((i) => i.ruleId === 'next-16-amp-removed');

      assert.ok(ampIssue, 'Should flag next/amp import in Next 16');
      assert.equal(ampIssue.line, 1);
    });

    it('should detect unstable_cache calls in Next.js 16', () => {
      const code = [
        "import { unstable_cache } from 'next/cache';",
        'const getData = unstable_cache(async () => [], ["key"]);' // Line 2
      ].join('\n');

      const issues = AstScanner.scanFile('lib/data.ts', code, next16Rules);
      const cacheIssue = issues.find((i) => i.ruleId === 'next-16-unstable-cache-deprecated');

      assert.ok(cacheIssue, 'Should flag unstable_cache call in Next 16');
      assert.equal(cacheIssue.line, 2);
    });

    it('should detect serverRuntimeConfig in next.config.js in Next.js 16', () => {
      const code = [
        'module.exports = {',
        '  serverRuntimeConfig: { secret: "123" }', // Line 2
        '};'
      ].join('\n');

      const issues = AstScanner.scanFile('next.config.js', code, next16Rules);
      const configIssue = issues.find((i) => i.ruleId === 'next-16-runtime-config-removed');

      assert.ok(configIssue, 'Should flag serverRuntimeConfig in next.config.js');
      assert.equal(configIssue.line, 2);
    });
  });

  describe('Prisma 6 AST detection', () => {
    const remoteRulesDir = path.join(__dirname, '..', 'remote-rules');
    registry.loadFromDirectory(remoteRulesDir);
    const prismaRules = registry.getRulesForUpgrade('prisma', '5.20.0', '6.0.0');

    it('should detect rejectOnNotFound option in prisma queries', () => {
      const code = [
        'const user = await prisma.user.findUnique({',
        '  where: { id: 1 },',
        '  rejectOnNotFound: true', // Line 3
        '});'
      ].join('\n');

      const issues = AstScanner.scanFile('src/services/user.ts', code, prismaRules);
      const issue = issues.find((i) => i.ruleId === 'prisma-6-reject-on-not-found-removed');
      assert.ok(issue, 'Should flag rejectOnNotFound');
      assert.equal(issue.line, 3);
    });

    it('should detect NotFoundError from @prisma/client', () => {
      const code = [
        "import { NotFoundError } from '@prisma/client';", // Line 1
        "export function handleError() { throw new NotFoundError('Not found'); }"
      ].join('\n');

      const issues = AstScanner.scanFile('src/utils/errors.ts', code, prismaRules);
      const issue = issues.find((i) => i.ruleId === 'prisma-6-not-found-error-removed');
      assert.ok(issue, 'Should flag NotFoundError import');
      assert.equal(issue.line, 1);
    });

    it('should detect prisma.$use middleware calls', () => {
      const code = [
        'prisma.$use(async (params, next) => {', // Line 1
        '  return next(params);',
        '});'
      ].join('\n');

      const issues = AstScanner.scanFile('src/prisma/middleware.ts', code, prismaRules);
      const issue = issues.find((i) => i.ruleId === 'prisma-6-middleware-use-deprecated');
      assert.ok(issue, 'Should flag prisma.$use call');
      assert.equal(issue.line, 1);
    });
  });
});

