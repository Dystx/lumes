import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { Project } from "ts-morph";
import { createProject, isTextSource } from "../../src/extractor/project";
import {
  extractComponents,
  isTextComponentExtension,
  extractClassNamesFromText,
  isPlaceholder,
} from "../../src/extractor/component";
import { parseClassName } from "../../src/extractor/className";
import { parseStyle } from "../../src/extractor/style";
import { SyntaxKind } from "ts-morph";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { detectVisualSlop } from "../../src/detectors/visual";
import { detectSpacingSlop } from "../../src/detectors/spacing";

function getFirstAttribute(source: string, attrName: string) {
  const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
  const file = project.createSourceFile(
    "test.tsx",
    source
  );
  const attr = file.getFirstDescendantByKind(SyntaxKind.JsxAttribute);
  if (!attr || attr.getNameNode().getText() !== attrName) {
    throw new Error(`${attrName} attribute not found`);
  }
  return attr;
}

describe("extractor", () => {
  it("finds function declaration components in a TSX file", () => {
    const project = createProject([join(__dirname, "../fixtures/sample.tsx")]);
    const components = extractComponents(project);
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe("SloppyCard");
  });

  it("finds exported arrow-function variable components", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    project.createSourceFile(
      "arrow.tsx",
      `export const ArrowCard = () => <div className="p-4">x</div>;`
    );
    const components = extractComponents(project);
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe("ArrowCard");
  });

  it("finds non-exported arrow function components", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    project.createSourceFile(
      "private.tsx",
      `const PrivateCard = () => <div className="p-4">x</div>;`
    );
    const components = extractComponents(project);
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe("PrivateCard");
  });

  it("finds function expression components in JSX files", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    project.createSourceFile(
      "expr.jsx",
      `const ExprCard = function() { return <div>x</div>; };`
    );
    const components = extractComponents(project);
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe("ExprCard");
  });

  it("finds forwardRef components", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    project.createSourceFile(
      "fwd.tsx",
      `import { forwardRef } from "react";
       export const FwdCard = forwardRef((props, ref) => <div ref={ref}>x</div>);`
    );
    const components = extractComponents(project);
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe("FwdCard");
  });

  it("ignores non-component source files", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    project.createSourceFile(
      "plain.ts",
      `export function PlainHelper() { return "x"; }`
    );
    const components = extractComponents(project);
    expect(components).toHaveLength(0);
  });

  it("prioritizes .tsx files when sorting components", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    project.createSourceFile("a.jsx", `export function A() { return <div />; }`);
    project.createSourceFile("b.tsx", `export function B() { return <div />; }`);
    const components = extractComponents(project);
    expect(components[0].file).toMatch(/\.tsx$/);
  });
});

describe("parseClassName", () => {
  it("splits Tailwind className by whitespace", () => {
    const attr = getFirstAttribute(
      `export function T() { return <div className="p-4 m-2 bg-red-500" />; }`,
      "className"
    );
    const parsed = parseClassName(attr);
    expect(parsed).toBeDefined();
    expect(parsed!.raw).toBe("p-4 m-2 bg-red-500");
    expect(parsed!.utilities).toEqual(["p-4", "m-2", "bg-red-500"]);
  });

  it("preserves arbitrary bracket values", () => {
    const attr = getFirstAttribute(
      `export function T() { return <div className="w-[123px] h-[45px] p-[13px] bg-[#ff0000]" />; }`,
      "className"
    );
    const parsed = parseClassName(attr);
    expect(parsed).toBeDefined();
    expect(parsed!.utilities).toEqual([
      "w-[123px]",
      "h-[45px]",
      "p-[13px]",
      "bg-[#ff0000]",
    ]);
  });

  it("returns undefined for non-className attributes", () => {
    const attr = getFirstAttribute(
      `export function T() { return <div style={{ color: "red" }} />; }`,
      "style"
    );
    expect(parseClassName(attr)).toBeUndefined();
  });
});

describe("parseStyle", () => {
  it("parses inline style object literals", () => {
    const attr = getFirstAttribute(
      `export function T() { return <div style={{ marginTop: 10, color: "red" }} />; }`,
      "style"
    );
    const parsed = parseStyle(attr);
    expect(parsed).toBeDefined();
    expect(parsed).toEqual({ marginTop: "10", color: "red" });
  });

  it("returns undefined for non-style attributes", () => {
    const attr = getFirstAttribute(
      `export function T() { return <div className="p-4" />; }`,
      "className"
    );
    expect(parseStyle(attr)).toBeUndefined();
  });

  it("returns empty object for empty style", () => {
    const attr = getFirstAttribute(
      `export function T() { return <div style={{}} />; }`,
      "style"
    );
    expect(parseStyle(attr)).toEqual({});
  });
});

describe("vue/svelte extraction", () => {
  it("identifies .vue and .svelte as text component extensions", () => {
    expect(isTextComponentExtension("src/Card.vue")).toBe(true);
    expect(isTextComponentExtension("src/Card.svelte")).toBe(true);
    expect(isTextComponentExtension("src/Card.tsx")).toBe(false);
  });

  it("extracts class names from a Vue template block", () => {
    const source = `<template>
  <div class="p-[13px] bg-[#ff0000]">
    <span class="text-[15px]">x</span>
  </div>
</template>`;
    expect(extractClassNamesFromText(source)).toEqual(
      expect.arrayContaining(["p-[13px]", "bg-[#ff0000]", "text-[15px]"])
    );
  });

  it("extracts a single component from a .vue file", () => {
    const tmp = mkdtempSync(join(tmpdir(), "slop-audit-vue-"));
    try {
      const filePath = join(tmp, "Hero.vue");
      writeFileSync(
        filePath,
        `<template>
  <section class="w-[123px] p-[13px]">Hello</section>
</template>`
      );
      const project = createProject([]);
      const components = extractComponents(project, [filePath]);
      expect(components).toHaveLength(1);
      expect(components[0].name).toBe("Hero");
      expect(components[0].file).toBe(filePath);
      expect(isPlaceholder(components[0].node)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("extracts a single component from a .svelte file", () => {
    const tmp = mkdtempSync(join(tmpdir(), "slop-audit-svelte-"));
    try {
      const filePath = join(tmp, "Button.svelte");
      writeFileSync(
        filePath,
        `<button class="px-4 py-2 bg-blue-500">Click</button>`
      );
      const project = createProject([]);
      const components = extractComponents(project, [filePath]);
      expect(components).toHaveLength(1);
      expect(components[0].name).toBe("Button");
      expect(isPlaceholder(components[0].node)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("runs visual and spacing detectors on a placeholder Vue component", () => {
    const tmp = mkdtempSync(join(tmpdir(), "slop-audit-vue-detector-"));
    try {
      const filePath = join(tmp, "Card.vue");
      writeFileSync(
        filePath,
        `<template>
  <div class="w-[123px] p-[13px] bg-[#ff0000]">Card</div>
</template>`
      );
      const project = createProject([]);
      const components = extractComponents(project, [filePath]);
      const component = components[0];
      expect(isPlaceholder(component.node)).toBe(true);

      const visualIssues = detectVisualSlop(component.node, {
        baseSpacing: 4,
        arbitraryTolerance: "balanced",
      });
      expect(visualIssues.some((i) => i.ruleId === "arbitrary-tailwind-value")).toBe(true);
      expect(visualIssues.some((i) => i.ruleId === "arbitrary-color")).toBe(true);

      const spacingIssues = detectSpacingSlop(component.node, { baseSpacing: 4 });
      expect(spacingIssues.some((i) => i.ruleId === "off-grid-spacing")).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
