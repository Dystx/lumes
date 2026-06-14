import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { detectComponentSlop } from "../../src/detectors/components.js";
import { detectLogicSlop } from "../../src/detectors/logic.js";

function createFunction(source: string) {
  const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
  const file = project.createSourceFile("test.tsx", source);
  const fn = file.getFunctions()[0];
  if (!fn) throw new Error("No function declaration found in test source");
  return fn;
}

const componentOptions = {
  registry: {
    button: ["Button"],
    input: ["Input"],
    dialog: ["Dialog"],
    card: ["Card"],
    select: ["Select"],
    badge: ["Badge"],
  },
  maxJsxNestingDepth: 6,
  maxDirectChildren: 10,
  maxProps: 10,
  maxComponentLines: 500,
};

describe("component detector", () => {
  it("flags native button instead of registry Button", () => {
    const fn = createFunction(`
      export function Submit() {
        return <button onClick={() => {}}>Send</button>;
      }
    `);
    const issues = detectComponentSlop(fn, componentOptions);
    expect(issues.some((i) => i.ruleId === "missing-registry-component")).toBe(true);
  });

  it("flags div with button role when Button is registered", () => {
    const fn = createFunction(`
      export function Submit() {
        return <div role="button">Send</div>;
      }
    `);
    const issues = detectComponentSlop(fn, componentOptions);
    expect(issues.some((i) => i.ruleId === "missing-registry-component")).toBe(true);
  });

  it("does not flag registry Button component", () => {
    const fn = createFunction(`
      export function Submit() {
        return <Button>Send</Button>;
      }
    `);
    const issues = detectComponentSlop(fn, componentOptions);
    expect(issues.some((i) => i.ruleId === "missing-registry-component")).toBe(false);
  });

  it("flags inconsistent snake_case prop naming", () => {
    const fn = createFunction(`
      export function Field() {
        return <input data_testid="field" />;
      }
    `);
    const issues = detectComponentSlop(fn, componentOptions);
    expect(issues.some((i) => i.ruleId === "inconsistent-prop-naming")).toBe(true);
  });

  it("allows data-* and aria-* kebab-case attributes", () => {
    const fn = createFunction(`
      export function Field() {
        return <input data-testid="field" aria-label="Name" />;
      }
    `);
    const issues = detectComponentSlop(fn, componentOptions);
    expect(issues.some((i) => i.ruleId === "inconsistent-prop-naming")).toBe(false);
  });

  it("flags deep JSX nesting", () => {
    const fn = createFunction(`
      export function Deep() {
        return (
          <div>
            <div>
              <div>
                <div>
                  <div>
                    <div>
                      <div>too deep</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }
    `);
    const issues = detectComponentSlop(fn, componentOptions);
    expect(issues.some((i) => i.ruleId === "deep-jsx-nesting")).toBe(true);
  });

  it("flags too many direct children", () => {
    const children = Array.from({ length: 12 }, (_, i) => `<span key={${i}}>${i}</span>`).join("\n");
    const fn = createFunction(`
      export function List() {
        return <div>${children}</div>;
      }
    `);
    const issues = detectComponentSlop(fn, componentOptions);
    expect(issues.some((i) => i.ruleId === "too-many-direct-children")).toBe(true);
  });

  it("flags too many props on an element", () => {
    const props = Array.from({ length: 12 }, (_, i) => `prop${i}={${i}}`).join(" ");
    const fn = createFunction(`
      export function Props() {
        return <div ${props}>x</div>;
      }
    `);
    const issues = detectComponentSlop(fn, componentOptions);
    expect(issues.some((i) => i.ruleId === "too-many-props")).toBe(true);
  });

  it("flags components that exceed max line count", () => {
    const body = Array.from({ length: 30 }, (_, i) => `  // line ${i + 1}`).join("\n");
    const fn = createFunction(`
      export function Long() {
${body}
        return <div>x</div>;
      }
    `);
    const issues = detectComponentSlop(fn, { ...componentOptions, maxComponentLines: 20 });
    expect(issues.some((i) => i.ruleId === "component-too-long")).toBe(true);
  });
});

describe("logic detector", () => {
  it("flags ghost useEffect", () => {
    const fn = createFunction(`
      import { useState, useEffect } from "react";
      export function Ghost() {
        const [x, setX] = useState(0);
        useEffect(() => { setX(1); }, []);
        return <div>{x}</div>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "ghost-use-effect")).toBe(true);
  });

  it("flags excessive useEffect calls", () => {
    const fn = createFunction(`
      import { useEffect } from "react";
      export function Effects() {
        useEffect(() => {}, []);
        useEffect(() => {}, []);
        useEffect(() => {}, []);
        useEffect(() => {}, []);
        return <div />;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "excessive-use-effect")).toBe(true);
  });

  it("flags complex inline event handlers", () => {
    const fn = createFunction(`
      export function Clicker() {
        return <button onClick={() => { console.log("a"); console.log("b"); }}>x</button>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "inline-event-handler")).toBe(true);
  });

  it("does not flag simple inline event handlers", () => {
    const fn = createFunction(`
      export function Clicker() {
        return <button onClick={() => console.log("click")}>x</button>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "inline-event-handler")).toBe(false);
  });

  it("does not flag event handlers bound to named functions", () => {
    const fn = createFunction(`
      export function Clicker({ onClick }: { onClick: () => void }) {
        return <button onClick={onClick}>x</button>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "inline-event-handler")).toBe(false);
  });

  it("flags unused state setters", () => {
    const fn = createFunction(`
      import { useState } from "react";
      export function ReadOnly() {
        const [value, setValue] = useState(0);
        return <div>{value}</div>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "unused-state-setter")).toBe(true);
  });

  it("does not flag state setters that are used", () => {
    const fn = createFunction(`
      import { useState } from "react";
      export function Toggle() {
        const [on, setOn] = useState(false);
        return <button onClick={() => setOn(!on)}>{on ? "on" : "off"}</button>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "unused-state-setter")).toBe(false);
  });

  it("flags business logic mixed in JSX", () => {
    const fn = createFunction(`
      export function Price({ items }: { items: number[] }) {
        return <div>{items.filter((i) => i > 0).reduce((a, b) => a + b, 0)}</div>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "business-logic-in-jsx")).toBe(true);
  });

  it("does not flag simple variable interpolation", () => {
    const fn = createFunction(`
      export function Greet({ name }: { name: string }) {
        return <div>{name}</div>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "business-logic-in-jsx")).toBe(false);
  });

  it("does not flag simple ternaries in JSX", () => {
    const fn = createFunction(`
      export function Greet({ name }: { name: string }) {
        return <div>{name ? name : "Guest"}</div>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "business-logic-in-jsx")).toBe(false);
  });

  it("does not flag simple map calls in JSX", () => {
    const fn = createFunction(`
      export function List({ items }: { items: string[] }) {
        return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "business-logic-in-jsx")).toBe(false);
  });

  it("flags nested ternaries in JSX", () => {
    const fn = createFunction(`
      export function Greet({ a, b }: { a: boolean; b: boolean }) {
        return <div>{a ? "a" : b ? "b" : "c"}</div>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "business-logic-in-jsx")).toBe(true);
  });

  it("flags prop-to-state-sync pattern", () => {
    const fn = createFunction(`
      import { useState, useEffect } from "react";
      export function Synced({ value }: { value: number }) {
        const [count, setCount] = useState(value);
        useEffect(() => { setCount(value); }, [value]);
        return <div>{count}</div>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "prop-to-state-sync")).toBe(true);
  });

  it("flags zombie state never read", () => {
    const fn = createFunction(`
      import { useState } from "react";
      export function Zombie() {
        const [unused, setUnused] = useState(0);
        setUnused(1);
        return <div>ok</div>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "zombie-state")).toBe(true);
  });

  it("does not flag state that is read", () => {
    const fn = createFunction(`
      import { useState } from "react";
      export function Used() {
        const [count, setCount] = useState(0);
        return <button onClick={() => setCount(count + 1)}>{count}</button>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "zombie-state")).toBe(false);
  });

  it("flags pointless useMemo wrapping a literal", () => {
    const fn = createFunction(`
      import { useMemo } from "react";
      export function Static() {
        const label = useMemo(() => "hello", []);
        return <div>{label}</div>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "pointless-memo")).toBe(true);
  });

  it("flags pointless useMemo wrapping an identity expression", () => {
    const fn = createFunction(`
      import { useMemo } from "react";
      export function Identity({ items }: { items: string[] }) {
        const data = useMemo(() => items, [items]);
        return <ul>{data.map((i) => <li key={i}>{i}</li>)}</ul>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "pointless-memo")).toBe(true);
  });

  it("does not flag useMemo wrapping non-trivial computation", () => {
    const fn = createFunction(`
      import { useMemo } from "react";
      export function Sum({ items }: { items: number[] }) {
        const total = useMemo(() => items.reduce((a, b) => a + b, 0), [items]);
        return <div>{total}</div>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "pointless-memo")).toBe(false);
  });

  it("flags hand-rolled utility function inside component", () => {
    const fn = createFunction(`
      export function List({ items }: { items: string[] }) {
        const sortItems = () => items.sort();
        return <div>{sortItems().join(", ")}</div>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "hand-rolled-utility")).toBe(true);
  });

  it("flags hand-rolled date formatter inside component", () => {
    const fn = createFunction(`
      export function DateLabel({ date }: { date: string }) {
        const formatDate = () => new Date(date).toLocaleDateString();
        return <div>{formatDate()}</div>;
      }
    `);
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "hand-rolled-utility")).toBe(true);
  });
});

describe("component detector extras", () => {
  it("flags prop spreading on an element", () => {
    const fn = createFunction(`
      export function Box(props: any) {
        return <div {...props}>x</div>;
      }
    `);
    const issues = detectComponentSlop(fn, componentOptions);
    expect(issues.some((i) => i.ruleId === "prop-spreading-abuse")).toBe(true);
  });

  it("flags missing loading state when mapping over a prop", () => {
    const fn = createFunction(`
      export function List({ items }: { items: string[] }) {
        return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
      }
    `);
    const issues = detectComponentSlop(fn, componentOptions);
    expect(issues.some((i) => i.ruleId === "missing-loading-state")).toBe(true);
  });

  it("does not flag loading state when guarded", () => {
    const fn = createFunction(`
      export function List({ items, loading }: { items: string[]; loading: boolean }) {
        if (loading) return <p>Loading...</p>;
        return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
      }
    `);
    const issues = detectComponentSlop(fn, componentOptions);
    expect(issues.some((i) => i.ruleId === "missing-loading-state")).toBe(false);
  });

  it("flags variant hacking via className on a composed component", () => {
    const fn = createFunction(`
      export function Submit() {
        return <Button variant="primary" className="ml-[13px]" />;
      }
    `);
    const issues = detectComponentSlop(fn, componentOptions);
    expect(issues.some((i) => i.ruleId === "variant-hacking-via-className")).toBe(true);
  });
});
