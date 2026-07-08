"use client";
// Root-level error boundary — catches errors in app/layout.tsx itself
// (the regular error.tsx is replaced by this in that case).
//
// Reference: https://nextjs.org/docs/app/api-reference/file-conventions/error

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[lumes:global-error]", error);
  }, [error]);

  return (
    <html lang="pt">
      <body
        style={{
          background: "#0a0e0d",
          color: "#e8e8e8",
          fontFamily: "system-ui, -apple-system, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", padding: "1.5rem", maxWidth: 480 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔥</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Algo correu mal
          </h1>
          <p style={{ fontSize: 14, color: "#a3a8a4", marginBottom: 24 }}>
            A aplicação encontrou um erro inesperado. Tente novamente ou volte à
            página inicial.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: "#f97316",
              color: "#0a0e0d",
              fontWeight: 600,
              cursor: "pointer",
              marginRight: 8,
            }}
          >
            Tentar novamente
          </button>
          <a
            href="/"
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #1f2522",
              background: "#131815",
              color: "#e8e8e8",
              fontWeight: 500,
              cursor: "pointer",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Início
          </a>
        </div>
      </body>
    </html>
  );
}