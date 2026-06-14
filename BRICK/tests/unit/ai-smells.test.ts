import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { detectAiSmells } from "../../src/detectors/ai-smells";
import { detectArchitectureSlop } from "../../src/detectors/architecture";
import { join } from "node:path";

const projectPath = join(__dirname, "../..");

describe("ai-smell detector", () => {
  it("flags glassmorphism cards", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    const source = project.createSourceFile(
      "glass.tsx",
      `export function Glass() {
        return <div className="backdrop-blur bg-white/70 rounded-xl">hi</div>;
      }`
    );
    const issues = detectAiSmells(source.getFunctions()[0], {
      disabledRules: [],
      bannedDefaults: true,
    });
    expect(issues.some((i) => i.ruleId === "no-glassmorphism")).toBe(true);
  });

  it("flags gradient hero backgrounds", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    const source = project.createSourceFile(
      "hero.tsx",
      `export function Hero() {
        return <div className="bg-gradient-to-r from-indigo-500 to-purple-500">hi</div>;
      }`
    );
    const issues = detectAiSmells(source.getFunctions()[0], {
      disabledRules: [],
      bannedDefaults: true,
    });
    expect(issues.some((i) => i.ruleId === "no-gradient-hero")).toBe(true);
  });

  it("flags SaaS template page structure", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    const source = project.createSourceFile(
      "landing.tsx",
      `export function Landing() {
        return (
          <div>
            <section className="py-20 text-center max-w-4xl mx-auto">
              <h1>Build faster</h1>
              <button>Get started</button>
            </section>
            <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {features.map((f) => (
                <div key={f.title}>{f.title}</div>
              ))}
            </section>
          </div>
        );
      }`
    );
    const issues = detectAiSmells(source.getFunctions()[0], {
      disabledRules: [],
      bannedDefaults: true,
    });
    expect(issues.some((i) => i.ruleId === "no-saas-template-structure")).toBe(true);
  });

  it("skips rules listed in disabledRules", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    const source = project.createSourceFile(
      "hero.tsx",
      `export function Hero() {
        return <div className="bg-gradient-to-r from-indigo-500 to-purple-500">hi</div>;
      }`
    );
    const issues = detectAiSmells(source.getFunctions()[0], {
      disabledRules: ["no-gradient-hero"],
      bannedDefaults: true,
    });
    expect(issues.some((i) => i.ruleId === "no-gradient-hero")).toBe(false);
  });
});

describe("architecture detector", () => {
  it("flags hallucinated imports", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    const source = project.createSourceFile(
      "bad-import.tsx",
      `import { MagicIcon } from "not-a-package";
      export function X() { return <MagicIcon />; }`
    );
    const issues = detectArchitectureSlop(source.getFunctions()[0], {
      projectPath,
    });
    expect(issues.some((i) => i.ruleId === "hallucinated-import")).toBe(true);
  });

  it("flags placeholder copy", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    const source = project.createSourceFile(
      "placeholder.tsx",
      `export function Placeholder() {
        return <div>Lorem ipsum dolor sit amet</div>;
      }`
    );
    const issues = detectArchitectureSlop(source.getFunctions()[0]);
    expect(issues.some((i) => i.ruleId === "placeholder-copy")).toBe(true);
  });

  it("flags generic font stacks", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    const source = project.createSourceFile(
      "font.tsx",
      `export function FontStack() {
        return <div className="font-['Inter']">hi</div>;
      }`
    );
    const issues = detectAiSmells(source.getFunctions()[0], {
      disabledRules: [],
      bannedDefaults: true,
    });
    expect(issues.some((i) => i.ruleId === "no-generic-font-stack")).toBe(true);
  });
});
