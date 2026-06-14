import { JsxAttributeLike, SyntaxKind } from "ts-morph";

export function parseStyle(attr: JsxAttributeLike): Record<string, string> | undefined {
  if (attr.getKind() !== SyntaxKind.JsxAttribute) return;
  const jsxAttr = attr.asKind(SyntaxKind.JsxAttribute);
  if (!jsxAttr) return;
  if (jsxAttr.getNameNode().getText() !== "style") return;

  const init = jsxAttr.getInitializer();
  if (!init) return {};

  let expr = init.asKind(SyntaxKind.JsxExpression)?.getExpression() ?? init;

  const styles: Record<string, string> = {};
  if (expr.getKind() === SyntaxKind.ObjectLiteralExpression) {
    const obj = expr.asKind(SyntaxKind.ObjectLiteralExpression);
    if (obj) {
      for (const prop of obj.getProperties()) {
        if (prop.getKind() === SyntaxKind.PropertyAssignment) {
          const assignment = prop.asKind(SyntaxKind.PropertyAssignment);
          if (assignment) {
            const key = assignment.getName();
            const value = assignment.getInitializer()?.getText().replace(/^["']|["']$/g, "");
            if (value !== undefined) styles[key] = value;
          }
        }
      }
    }
  }
  return styles;
}
