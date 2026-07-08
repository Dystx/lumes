"use client";

// Registers the service worker on first load.
// Mounted once from the root layout.

import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // Skip registration in dev — the SW caches bake in the dev server URL.
      return;
    }

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })
        .catch((err) => {
          console.warn("[sw] registration failed:", err);
        });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }
  }, []);

  return null;
}
