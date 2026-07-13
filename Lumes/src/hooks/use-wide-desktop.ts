"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Matches the Tailwind `xl` breakpoint used by the desktop rail and mobile
 * shell. `null` is intentional during SSR/hydration so neither responsive
 * incident-detail surface mounts before the browser knows its viewport.
 */
export const WIDE_DESKTOP_MEDIA_QUERY = "(min-width: 1280px)";

const subscribeToMount = () => () => undefined;
const getClientMountSnapshot = () => true;
const getServerMountSnapshot = () => false;

/**
 * Returns a hydration-safe browser mounted snapshot without an effect-driven
 * state update. The server snapshot remains false so browser-only controls
 * still wait for hydration before rendering.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(subscribeToMount, getClientMountSnapshot, getServerMountSnapshot);
}

export function useIsWideDesktop(): boolean | null {
  const [isWideDesktop, setIsWideDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia(WIDE_DESKTOP_MEDIA_QUERY);
    const sync = () => setIsWideDesktop(mediaQuery.matches);

    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  return isWideDesktop;
}
