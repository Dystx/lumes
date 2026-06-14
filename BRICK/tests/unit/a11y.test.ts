import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { detectA11ySlop } from "../../src/detectors/a11y.js";

function createFunction(source: string) {
  const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
  const file = project.createSourceFile("test.tsx", source);
  const fn = file.getFunctions()[0];
  if (!fn) throw new Error("No function declaration found in test source");
  return fn;
}

describe("a11y detector", () => {
  it("flags div with onClick and no role", () => {
    const fn = createFunction(`
      export function Clickable() {
        return <div onClick={() => {}}>Open</div>;
      }
    `);
    const issues = detectA11ySlop(fn);
    const issue = issues.find((i) => i.ruleId === "div-on-click");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("high");
  });

  it("flags span with onClick and no role", () => {
    const fn = createFunction(`
      export function Clickable() {
        return <span onClick={() => {}}>Open</span>;
      }
    `);
    const issues = detectA11ySlop(fn);
    const issue = issues.find((i) => i.ruleId === "span-on-click");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("high");
  });

  it("does not flag div with onClick and role=button", () => {
    const fn = createFunction(`
      export function Clickable() {
        return <div role="button" onClick={() => {}}>Open</div>;
      }
    `);
    const issues = detectA11ySlop(fn);
    expect(issues.some((i) => i.ruleId === "div-on-click")).toBe(false);
  });

  it("flags img without alt", () => {
    const fn = createFunction(`
      export function Hero() {
        return <img src="hero.png" />;
      }
    `);
    const issues = detectA11ySlop(fn);
    expect(issues.some((i) => i.ruleId === "img-missing-alt")).toBe(true);
  });

  it("does not flag img with alt", () => {
    const fn = createFunction(`
      export function Hero() {
        return <img src="hero.png" alt="Hero" />;
      }
    `);
    const issues = detectA11ySlop(fn);
    expect(issues.some((i) => i.ruleId === "img-missing-alt")).toBe(false);
  });

  it("flags icon-only button without aria-label", () => {
    const fn = createFunction(`
      export function IconButton() {
        return <button><Icon name="close" /></button>;
      }
    `);
    const issues = detectA11ySlop(fn);
    expect(issues.some((i) => i.ruleId === "icon-button-missing-label")).toBe(true);
  });

  it("does not flag button with text label", () => {
    const fn = createFunction(`
      export function TextButton() {
        return <button>Close</button>;
      }
    `);
    const issues = detectA11ySlop(fn);
    expect(issues.some((i) => i.ruleId === "icon-button-missing-label")).toBe(false);
  });

  it("flags visual-only heading", () => {
    const fn = createFunction(`
      export function StyledHeading() {
        return <h2 className="text-4xl font-bold" />;
      }
    `);
    const issues = detectA11ySlop(fn);
    const issue = issues.find((i) => i.ruleId === "visual-only-heading");
    expect(issue).toBeDefined();
    expect(issue?.category).toBe("typography");
  });

  it("does not flag heading with text content", () => {
    const fn = createFunction(`
      export function RealHeading() {
        return <h2 className="text-4xl font-bold">Title</h2>;
      }
    `);
    const issues = detectA11ySlop(fn);
    expect(issues.some((i) => i.ruleId === "visual-only-heading")).toBe(false);
  });
});
