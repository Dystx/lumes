import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { detectTypographySlop } from "../../src/detectors/typography.js";
import type { DesignTokens } from "../../src/types.js";

function createFunction(source: string) {
  const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
  const file = project.createSourceFile("test.tsx", source);
  const fn = file.getFunctions()[0];
  if (!fn) throw new Error("No function declaration found in test source");
  return fn;
}

const emptyTokens: DesignTokens = {
  spacing: [],
  radii: [],
  fontSizes: [],
  colors: [],
  zIndex: [],
  shadows: [],
  lineHeights: [],
  letterSpacing: [],
  fontWeights: [],
  fontFamilies: [],
};

describe("typography token detectors", () => {
  it("flags hardcoded line height via leading-[...]", () => {
    const fn = createFunction(`
      export function Card() {
        return <p className="leading-[1.75]">x</p>;
      }
    `);
    const issues = detectTypographySlop(fn, { typeScaleRatio: 1.2, tokens: emptyTokens });
    expect(issues.some((i) => i.ruleId === "hardcoded-line-height")).toBe(true);
  });

  it("flags hardcoded letter spacing via tracking-[...]", () => {
    const fn = createFunction(`
      export function Card() {
        return <p className="tracking-[0.5px]">x</p>;
      }
    `);
    const issues = detectTypographySlop(fn, { typeScaleRatio: 1.2, tokens: emptyTokens });
    expect(issues.some((i) => i.ruleId === "hardcoded-letter-spacing")).toBe(true);
  });

  it("flags hardcoded font weight via font-[...]", () => {
    const fn = createFunction(`
      export function Card() {
        return <p className="font-[550]">x</p>;
      }
    `);
    const issues = detectTypographySlop(fn, { typeScaleRatio: 1.2, tokens: emptyTokens });
    expect(issues.some((i) => i.ruleId === "hardcoded-font-weight")).toBe(true);
  });

  it("flags custom font family via font-[...]", () => {
    const fn = createFunction(`
      export function Card() {
        return <p className="font-['Inter']">x</p>;
      }
    `);
    const issues = detectTypographySlop(fn, { typeScaleRatio: 1.2, tokens: emptyTokens });
    expect(issues.some((i) => i.ruleId === "custom-font-family")).toBe(true);
  });

  it("does not flag line height that matches a token", () => {
    const fn = createFunction(`
      export function Card() {
        return <p className="leading-[1.5]">x</p>;
      }
    `);
    const issues = detectTypographySlop(fn, {
      typeScaleRatio: 1.2,
      tokens: { ...emptyTokens, lineHeights: [1.5] },
    });
    expect(issues.some((i) => i.ruleId === "hardcoded-line-height")).toBe(false);
  });

  it("does not flag font weight that matches a token", () => {
    const fn = createFunction(`
      export function Card() {
        return <p className="font-[600]">x</p>;
      }
    `);
    const issues = detectTypographySlop(fn, {
      typeScaleRatio: 1.2,
      tokens: { ...emptyTokens, fontWeights: [600] },
    });
    expect(issues.some((i) => i.ruleId === "hardcoded-font-weight")).toBe(false);
  });

  it("does not flag font family that matches a token", () => {
    const fn = createFunction(`
      export function Card() {
        return <p className="font-['Inter']">x</p>;
      }
    `);
    const issues = detectTypographySlop(fn, {
      typeScaleRatio: 1.2,
      tokens: { ...emptyTokens, fontFamilies: ["Inter"] },
    });
    expect(issues.some((i) => i.ruleId === "custom-font-family")).toBe(false);
  });

  it("flags typography slop via inline styles", () => {
    const fn = createFunction(`
      export function Card() {
        return <p style={{ lineHeight: 1.75, letterSpacing: "0.05em", fontWeight: 550, fontFamily: "Inter" }}>x</p>;
      }
    `);
    const issues = detectTypographySlop(fn, { typeScaleRatio: 1.2, tokens: emptyTokens });
    expect(issues.filter((i) => i.ruleId === "hardcoded-line-height").length).toBeGreaterThan(0);
    expect(issues.filter((i) => i.ruleId === "hardcoded-letter-spacing").length).toBeGreaterThan(0);
    expect(issues.filter((i) => i.ruleId === "hardcoded-font-weight").length).toBeGreaterThan(0);
    expect(issues.filter((i) => i.ruleId === "custom-font-family").length).toBeGreaterThan(0);
  });
});
