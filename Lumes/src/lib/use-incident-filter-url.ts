"use client";

import { useEffect, useRef } from "react";
import { parseIncidentFilterQuery, writeIncidentFilterQuery } from "@/lib/incident-filter-url";
import { useUIStore } from "@/store/ui-store";

const SEARCH_WRITE_DEBOUNCE_MS = 200;

/**
 * Keeps incident query filters shareable without involving the App Router.
 * Hydration is guarded so the first render cannot overwrite an incoming link.
 */
export function useIncidentFilterUrl(): void {
  const replaceIncidentFilters = useUIStore((state) => state.replaceIncidentFilters);
  const severityFilter = useUIStore((state) => state.severityFilter);
  const hideResolved = useUIStore((state) => state.hideResolved);
  const quickFilter = useUIStore((state) => state.quickFilter);
  const phaseFilter = useUIStore((state) => state.phaseFilter);
  const resourceFilter = useUIStore((state) => state.resourceFilter);
  const searchQuery = useUIStore((state) => state.searchQuery);
  const hydratedRef = useRef(false);
  const writeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hydrate = () => {
      replaceIncidentFilters(parseIncidentFilterQuery(new URLSearchParams(window.location.search)));
      hydratedRef.current = true;
    };

    hydrate();
    window.addEventListener("popstate", hydrate);
    return () => window.removeEventListener("popstate", hydrate);
  }, [replaceIncidentFilters]);

  useEffect(() => {
    if (typeof window === "undefined" || !hydratedRef.current) return;

    const write = () => {
      const params = writeIncidentFilterQuery(
        new URLSearchParams(window.location.search),
        {
          severities: severityFilter,
          hideResolved,
          quick: quickFilter,
          phase: phaseFilter,
          resource: resourceFilter,
          search: searchQuery,
        },
      );
      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextUrl !== currentUrl) {
        window.history.replaceState(window.history.state, "", nextUrl);
      }
    };

    if (writeTimerRef.current !== null) {
      window.clearTimeout(writeTimerRef.current);
      writeTimerRef.current = null;
    }

    if (searchQuery) {
      writeTimerRef.current = window.setTimeout(write, SEARCH_WRITE_DEBOUNCE_MS);
    } else {
      write();
    }

    return () => {
      if (writeTimerRef.current !== null) {
        window.clearTimeout(writeTimerRef.current);
        writeTimerRef.current = null;
      }
    };
  }, [hideResolved, phaseFilter, quickFilter, resourceFilter, searchQuery, severityFilter]);
}
