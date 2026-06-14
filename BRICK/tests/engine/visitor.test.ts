import { describe, expect, it } from 'vitest';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { join } from 'path';

const fixture = (name: string) => join(__dirname, `../fixtures/${name}.tsx`);

describe('extractFacts', () => {
  it('extracts components and class names', async () => {
    const { ast, nodeCount } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, nodeCount);
    expect(facts.components.length).toBe(2);
    expect(facts.staticClassNames.length).toBe(1);
    expect(facts.staticClassNames[0].value).toBe('flex items-center justify-center');
  });

  it('detects useState hook usage', async () => {
    const { ast, nodeCount } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, nodeCount);
    const form = facts.components.find((c) => c.name === 'Form');
    expect(form).toBeDefined();
    expect(form!.hookCalls.some((h) => h.name === 'useState')).toBe(true);
  });

  it('marks files without use client as server components', async () => {
    const { ast, nodeCount } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, nodeCount);
    expect(facts.components.every((c) => c.isServerComponent)).toBe(true);
  });

  it('flips isServerComponent when use client directive is present', async () => {
    const { ast, nodeCount } = await parseFile(fixture('use-client'));
    const facts = extractFacts(fixture('use-client'), ast, nodeCount);
    expect(facts.components.length).toBe(1);
    expect(facts.components[0].isServerComponent).toBe(false);
  });

  it('collects interactive elements with class names', async () => {
    const { ast, nodeCount } = await parseFile(fixture('interactive'));
    const facts = extractFacts(fixture('interactive'), ast, nodeCount);
    const tags = facts.interactiveElements.map((e) => e.tag).sort();
    expect(tags).toEqual(['a', 'button', 'input']);
    const button = facts.interactiveElements.find((e) => e.tag === 'button');
    expect(button).toBeDefined();
    expect(button!.classNames[0].value).toBe('btn-primary');
  });

  it('collects && chains with depth >= 3', async () => {
    const { ast, nodeCount } = await parseFile(fixture('logical-chain'));
    const facts = extractFacts(fixture('logical-chain'), ast, nodeCount);
    expect(facts.logicalExpressions.length).toBeGreaterThanOrEqual(1);
    expect(facts.logicalExpressions.some((l) => l.depth >= 3)).toBe(true);
  });

  it('collects zero-interpolation template literal class names', async () => {
    const { ast, nodeCount } = await parseFile(fixture('template-class'));
    const facts = extractFacts(fixture('template-class'), ast, nodeCount);
    expect(facts.staticClassNames.length).toBe(1);
    expect(facts.staticClassNames[0].value).toBe('container wrapper');
  });

  it('detects multiple top-level non-exported functions as components', async () => {
    const { ast, nodeCount } = await parseFile(fixture('non-exported'));
    const facts = extractFacts(fixture('non-exported'), ast, nodeCount);
    const names = facts.components.map((c) => c.name).sort();
    expect(names).toEqual(['First', 'Second', 'Third']);
  });

  it('reports line and column positions greater than 1:0', async () => {
    const { ast, nodeCount } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, nodeCount);
    const className = facts.staticClassNames[0];
    expect(className).toBeDefined();
    expect(className.line).toBeGreaterThan(1);
    expect(className.column).toBeGreaterThan(0);
  });

  it('bubbles hooks inside nested helpers up to the enclosing component', async () => {
    const { ast, nodeCount } = await parseFile(fixture('nested-hook'));
    const facts = extractFacts(fixture('nested-hook'), ast, nodeCount);
    const wrapper = facts.components.find((c) => c.name === 'Wrapper');
    expect(wrapper).toBeDefined();
    expect(wrapper!.hookCalls.some((h) => h.name === 'useId')).toBe(true);
  });
});
