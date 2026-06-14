import { Project } from "ts-morph";
import { JsxEmit } from "typescript";

const TEXT_EXTENSIONS = new Set([".vue", ".svelte"]);

export function isTextSource(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return TEXT_EXTENSIONS.has(lower.slice(lower.lastIndexOf(".")));
}

export function createProject(filePaths: string[]): Project {
  const project = new Project({
    compilerOptions: { jsx: JsxEmit.ReactJSX, allowJs: true },
  });
  // Vue and Svelte files are handled as text sources by the component extractor.
  const codePaths = filePaths.filter((p) => !isTextSource(p));
  project.addSourceFilesAtPaths(codePaths);
  return project;
}
