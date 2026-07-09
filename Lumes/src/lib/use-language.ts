// Language hook — manages language state with localStorage persistence
"use client";

import { useState, useEffect, useCallback } from "react";
import { type Language, detectLanguage } from "@/lib/i18n";

const STORAGE_KEY = "ember-language";

export function useLanguage() {
  // Start from a deterministic server/client value. Reading localStorage in
  // the initial client render caused locale-dependent hydration failures.
  const [language, setLanguage] = useState<Language>("pt");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    const preferred = saved === "pt" || saved === "en" ? saved : detectLanguage();
    // Defer the client preference until after hydration; this keeps the
    // initial markup deterministic without a synchronous effect update.
    const timer = window.setTimeout(() => setLanguage(preferred), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Persist + update <html lang>
  const changeLanguage = useCallback((lang: Language) => {
    setLanguage(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.lang = lang;
    }
  }, []);

  // Set <html lang> on mount
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  return { language, changeLanguage };
}
