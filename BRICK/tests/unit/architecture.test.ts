import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { detectArchitectureSlop } from "../../src/detectors/architecture.js";

function createFunction(source: string, filePath = "test.tsx") {
  const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
  const file = project.createSourceFile(filePath, source);
  const fn = file.getFunctions()[0];
  if (!fn) throw new Error("No function declaration found in test source");
  return fn;
}

describe("architecture detector", () => {
  it("flags page-like component missing semantic landmarks", () => {
    const fn = createFunction(`
      export function HomePage() {
        return (
          <div>
            <div>Header</div>
            <div>Content</div>
            <div>Footer</div>
          </div>
        );
      }
    `);
    const issues = detectArchitectureSlop(fn);
    expect(issues.some((i) => i.ruleId === "missing-semantic-landmarks")).toBe(true);
  });

  it("does not flag page-like component with landmarks", () => {
    const fn = createFunction(`
      export function HomePage() {
        return (
          <>
            <header>Header</header>
            <main>Content</main>
            <footer>Footer</footer>
          </>
        );
      }
    `);
    const issues = detectArchitectureSlop(fn);
    expect(issues.some((i) => i.ruleId === "missing-semantic-landmarks")).toBe(false);
  });

  it("flags component that renders UI and fetches data", () => {
    const fn = createFunction(`
      import { useQuery } from "@tanstack/react-query";
      export function UserList() {
        const { data } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
        return <ul>{data?.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
      }
    `);
    const issues = detectArchitectureSlop(fn);
    expect(issues.some((i) => i.ruleId === "presentation-component-with-data-fetching")).toBe(true);
  });

  it("does not flag pure presentational component", () => {
    const fn = createFunction(`
      export function UserList({ users }: { users: { id: number; name: string }[] }) {
        return <ul>{users.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
      }
    `);
    const issues = detectArchitectureSlop(fn);
    expect(issues.some((i) => i.ruleId === "presentation-component-with-data-fetching")).toBe(false);
  });
});
