// Language hook — manages language state with localStorage persistence
"use client";

import { useState, useEffect, useCallback } from "react";
import { type Language, detectLanguage } from "@/lib/i18n";

const STORAGE_KEY = "ember-language";

export function useLanguage() {
  const [language, setLanguage] = useState<Language>("pt");

  // Load saved language on mount
  useEffect(() => {
    const saved = typeof window !== "undefined"
      ? (localStorage.getItem(STORAGE_KEY) as Language | null)
      : null;
    if (saved === "pt" || saved === "en") {
      setLanguage(saved);
    } else {
      setLanguage(detectLanguage());
    }
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
