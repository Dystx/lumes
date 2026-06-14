import { JsxAttributeLike, SyntaxKind } from "ts-morph";

export interface ParsedClassName {
  raw: string;
  utilities: string[];
}

export function parseClassName(attr: JsxAttributeLike): ParsedClassName | undefined {
  if (attr.getKind() !== SyntaxKind.JsxAttribute) return;
  const jsxAttr = attr.asKind(SyntaxKind.JsxAttribute);
  if (!jsxAttr) return;

  const name = jsxAttr.getNameNode().getText();
  if (name !== "className" && name !== "class") return;

  const init = jsxAttr.getInitializer();
  let raw = "";

  if (init) {
    const text = init.getText();
    raw = text.replace(/^["']|["']$/g, "");
  }

  const utilities = raw.split(/\s+/).filter(Boolean);
  return { raw, utilities };
}
