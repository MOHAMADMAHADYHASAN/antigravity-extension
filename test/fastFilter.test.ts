import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FastFilter } from '../src/scanner/fastFilter';
import { RuleRegistry } from '../src/rules/ruleRegistry';

describe('FastFilter', () => {
  const registry = RuleRegistry.getInstance();
  const rules = registry.getAllRules();

  it('should reject clean files with no candidate tokens', () => {
    const cleanContent = `
      import React, { useState } from 'react';
      export function Button({ label }: { label: string }) {
        const [clicked, setClicked] = useState(false);
        return <button onClick={() => setClicked(true)}>{label}</button>;
      }
    `;

    const result = FastFilter.filter(cleanContent, rules);
    assert.equal(result.shouldParse, false);
    assert.equal(result.candidateRules.length, 0);
  });

  it('should flag files containing Next.js 15 candidate tokens', () => {
    const nextContent = `
      import { cookies } from 'next/headers';
      export async function GET() {
        const store = cookies();
        return Response.json({ ok: true });
      }
    `;

    const result = FastFilter.filter(nextContent, rules);
    assert.equal(result.shouldParse, true);
    assert.ok(result.candidateRules.some((r) => r.id === 'next-15-async-cookies'));
  });

  it('should flag files containing React 19 candidate tokens', () => {
    const reactContent = `
      import ReactDOM from 'react-dom';
      ReactDOM.render(<App />, document.getElementById('root'));
    `;

    const result = FastFilter.filter(reactContent, rules);
    assert.equal(result.shouldParse, true);
    assert.ok(result.candidateRules.some((r) => r.id === 'react-19-removed-reactdom-render'));
  });
});
