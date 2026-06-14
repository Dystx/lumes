import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { detectVisualSlop } from "../../src/detectors/visual.js";
import { detectSpacingSlop } from "../../src/detectors/spacing.js";
import { detectTypographySlop } from "../../src/detectors/typography.js";
import { parseSpacingValue } from "../../src/detectors/helpers.js";

function createFunction(source: string) {
  const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
  const file = project.createSourceFile("test.tsx", source);
  const fn = file.getFunctions()[0];
  if (!fn) throw new Error("No function declaration found in test source");
  return fn;
}

describe("visual detector", () => {
  it("flags arbitrary Tailwind color values", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="bg-[#ff0000] text-[#333333]">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "arbitrary-color")).toBe(true);
  });

  it("does not flag arbitrary non-color values", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="text-[42px] text-[15px] bg-[length:100%]">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "arbitrary-color")).toBe(false);
  });

  it("flags arbitrary named colors", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="text-[tomato] bg-[rgb(0,0,0)]">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "arbitrary-color")).toBe(true);
  });

  it("flags glassmorphism", () => {
    const fn = createFunction(`
      export function Glass() {
        return <div className="backdrop-blur-md bg-white/50">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "glassmorphism")).toBe(true);
  });

  it("flags excessive border radius", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="rounded-[30px]">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "excessive-radius")).toBe(true);
  });

  it("flags low contrast text/background pairs", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="text-[#999999] bg-[#eeeeee]">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "low-contrast")).toBe(true);
  });

  it("does not flag high contrast pairs", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="text-[#000000] bg-[#ffffff]">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "low-contrast")).toBe(false);
  });

  it("flags arbitrary Tailwind utility values", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="w-[123px] h-[45px] p-[13px] top-[50px]">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "arbitrary-tailwind-value")).toBe(true);
  });

  it("does not flag color arbitrary values as utility slop", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="bg-[#ff0000] text-[oklch(50%_0.2_250)]">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "arbitrary-tailwind-value")).toBe(false);
  });

  it("flags inline style prop as high severity", () => {
    const fn = createFunction(`
      export function Card() {
        return <div style={{ color: "red" }}>x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    const inline = issues.find((i) => i.ruleId === "inline-style-prop");
    expect(inline).toBeDefined();
    expect(inline?.severity).toBe("high");
  });

  it("flags hardcoded named Tailwind colors not in tokens", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="bg-red-500 text-blue-400">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    const hardcoded = issues.filter((i) => i.ruleId === "hardcoded-tailwind-color");
    expect(hardcoded.length).toBe(1);
    expect(hardcoded[0].severity).toBe("low");
  });

  it("does not flag named Tailwind colors that exist in tokens", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="bg-brand-500 text-brand-400">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
      tokens: {
        spacing: [],
        radii: [],
        fontSizes: [],
        colors: [{ name: "brand", raw: "--color-brand" }],
        zIndex: [],
        shadows: [],
        lineHeights: [],
        letterSpacing: [],
        fontWeights: [],
        fontFamilies: [],
      },
    });
    expect(issues.some((i) => i.ruleId === "hardcoded-tailwind-color")).toBe(false);
  });

  it("does not flag size or layout utilities as hardcoded colors", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="text-xl font-bold bg-cover">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "hardcoded-tailwind-color")).toBe(false);
  });

  it("flags non-token OKLCH/LCH colors", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="bg-[oklch(60%_0.2_250)] text-[lch(60%_0.2_250)]">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    const oklch = issues.filter((i) => i.ruleId === "non-token-oklch-color");
    expect(oklch.length).toBe(1);
    expect(oklch[0].severity).toBe("low");
    expect(oklch[0].message).toContain("bg-[oklch(60%_0.2_250)]");
    expect(oklch[0].message).toContain("text-[lch(60%_0.2_250)]");
  });

  it("does not flag OKLCH colors that match a token", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="bg-[oklch(60%_0.2_250)]">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
      tokens: {
        spacing: [],
        radii: [],
        fontSizes: [],
        colors: [{ name: "brand", raw: "--color-brand", oklch: "oklch(60% 0.2 250)" }],
        zIndex: [],
        shadows: [],
        lineHeights: [],
        letterSpacing: [],
        fontWeights: [],
        fontFamilies: [],
      },
    });
    expect(issues.some((i) => i.ruleId === "non-token-oklch-color")).toBe(false);
  });

  it("flags fixed dimensions via inline styles", () => {
    const fn = createFunction(`
      export function Card() {
        return <div style={{ width: "800px", height: "600px" }}>x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "fixed-dimension")).toBe(true);
  });

  it("flags mixed styling systems (Tailwind + css prop)", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="flex" css={{ color: "red" }}>x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "mixed-styling-system")).toBe(true);
  });

  it("flags mixed styling systems (Tailwind + styled-components)", () => {
    const fn = createFunction(`
      const Box = styled.div\`color: red;\`;
      export function Card() {
        return <div className="flex">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "mixed-styling-system")).toBe(true);
  });

  it("flags mixed styling systems (Tailwind + CSS modules)", () => {
    const fn = createFunction(`
      import styles from "./card.module.css";
      export function Card() {
        return <div className={styles.root + " flex"}>x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "mixed-styling-system")).toBe(true);
  });

  it("does not flag Tailwind-only components as mixed styling", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="flex bg-red-500">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "mixed-styling-system")).toBe(false);
  });

  it("flags excessive absolute positioning", () => {
    const fn = createFunction(`
      export function Card() {
        return (
          <div className="relative">
            <span className="absolute top-0 left-0">a</span>
            <span className="absolute top-0 right-0">b</span>
            <span className="absolute bottom-0 left-0">c</span>
          </div>
        );
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "excessive-absolute-positioning")).toBe(true);
  });
});

describe("parseSpacingValue", () => {
  it("resolves default Tailwind spacing values", () => {
    expect(parseSpacingValue("p-4")).toBe(16);
    expect(parseSpacingValue("m-2")).toBe(8);
  });

  it("returns undefined for values outside the default scale", () => {
    expect(parseSpacingValue("p-13")).toBeUndefined();
  });

  it("returns undefined for fractional utilities", () => {
    expect(parseSpacingValue("w-1/2")).toBeUndefined();
  });

  it("resolves bracket values", () => {
    expect(parseSpacingValue("p-[13px]")).toBe(13);
    expect(parseSpacingValue("m-[1rem]")).toBe(16);
  });

  it("resolves numeric utilities against configured tokens", () => {
    const tokens = {
      spacing: [{ value: 52, unit: "px" as const, raw: "52px" }],
    };
    expect(parseSpacingValue("p-13", tokens)).toBe(52);
  });

  it("returns undefined for numeric utilities missing from tokens", () => {
    const tokens = {
      spacing: [{ value: 16, unit: "px" as const, raw: "16px" }],
    };
    expect(parseSpacingValue("p-13", tokens)).toBeUndefined();
  });
});

describe("spacing detector", () => {
  it("flags off-grid padding", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="p-[13px]">x</div>;
      }
    `);
    const issues = detectSpacingSlop(fn, { baseSpacing: 4 });
    expect(issues.some((i) => i.ruleId === "off-grid-spacing")).toBe(true);
  });

  it("flags off-grid inline margin", () => {
    const fn = createFunction(`
      export function Card() {
        return <div style={{ marginTop: "13px" }}>x</div>;
      }
    `);
    const issues = detectSpacingSlop(fn, { baseSpacing: 4 });
    expect(issues.some((i) => i.ruleId === "off-grid-spacing")).toBe(true);
  });

  it("does not flag on-grid spacing", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="p-4 m-2 gap-4 w-16 h-16">x</div>;
      }
    `);
    const issues = detectSpacingSlop(fn, { baseSpacing: 4 });
    expect(issues.filter((i) => i.ruleId === "off-grid-spacing")).toHaveLength(0);
  });

  it("flags high spacing entropy", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="p-[3px] m-[5px] gap-[7px] w-[11px] h-[13px]">x</div>;
      }
    `);
    const issues = detectSpacingSlop(fn, { baseSpacing: 4 });
    expect(issues.some((i) => i.ruleId === "spacing-entropy")).toBe(true);
  });

  it("flags negative margin utilities", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="-m-[20px]">x</div>;
      }
    `);
    const issues = detectSpacingSlop(fn, { baseSpacing: 4 });
    expect(issues.some((i) => i.ruleId === "negative-margin")).toBe(true);
  });

  it("flags magic z-index values", () => {
    const fn = createFunction(`
      export function Card() {
        return <div className="z-[9999]">x</div>;
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "magic-z-index")).toBe(true);
  });

  it("flags generic inline style prop overuse", () => {
    const fn = createFunction(`
      export function Card() {
        return (
          <>
            <div style={{ color: "red" }}>a</div>
            <div style={{ color: "blue" }}>b</div>
            <div style={{ color: "green" }}>c</div>
          </>
        );
      }
    `);
    const issues = detectVisualSlop(fn, {
      baseSpacing: 4,
      arbitraryTolerance: "balanced",
    });
    expect(issues.some((i) => i.ruleId === "generic-style-prop")).toBe(true);
  });
});

describe("typography detector", () => {
  it("flags off-scale font sizes", () => {
    const fn = createFunction(`
      export function Type() {
        return (
          <>
            <p className="text-[12px]">a</p>
            <p className="text-[15px]">b</p>
            <p className="text-[30px]">c</p>
          </>
        );
      }
    `);
    const issues = detectTypographySlop(fn, { typeScaleRatio: 1.2 });
    expect(issues.some((i) => i.ruleId === "off-scale-font-size")).toBe(true);
  });

  it("flags skipped heading levels", () => {
    const fn = createFunction(`
      export function Page() {
        return (
          <>
            <h1>Title</h1>
            <h3>Subtitle</h3>
          </>
        );
      }
    `);
    const issues = detectTypographySlop(fn, { typeScaleRatio: 1.2 });
    expect(issues.some((i) => i.ruleId === "skipped-heading-level")).toBe(true);
  });

  it("flags inverted heading hierarchy", () => {
    const fn = createFunction(`
      export function Page() {
        return (
          <>
            <h1 className="text-sm">Title</h1>
            <h2 className="text-4xl">Subtitle</h2>
          </>
        );
      }
    `);
    const issues = detectTypographySlop(fn, { typeScaleRatio: 1.2 });
    expect(issues.some((i) => i.ruleId === "inverted-heading-hierarchy")).toBe(true);
  });

  it("flags low contrast text", () => {
    const fn = createFunction(`
      export function Card() {
        return <p className="text-[#aaaaaa]">x</p>;
      }
    `);
    const issues = detectTypographySlop(fn, { typeScaleRatio: 1.2 });
    expect(issues.some((i) => i.ruleId === "low-contrast-text")).toBe(true);
  });
});
