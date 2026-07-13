"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isValidIsoTimestamp } from "@/lib/data-state";
import {
  FOLLOWED_READ_STATE_STORAGE_KEY,
  markFollowedIncidentsRead as markReadState,
  normalizeFollowedReadState,
  serializeFollowedReadState,
  type ReadableFollowedIncident,
} from "@/lib/followed-read-state";

export type FollowStorageState = "loading" | "available" | "unavailable";

export function toggleFollowedId(current: ReadonlySet<string>, incidentId: string): Set<string> {
  const next = new Set(current);
  if (next.has(incidentId)) next.delete(incidentId);
  else next.add(incidentId);
  return next;
}

/** Return only records that are currently visible and followed on this device. */
export function filterFollowedIncidents<T extends { id: string }>(
  incidents: readonly T[],
  followedIds: ReadonlySet<string>,
): T[] {
  return incidents.filter((incident) => followedIds.has(incident.id));
}

export function useFollowedIncidents(): {
  followedIds: Set<string>;
  readState: Map<string, string>;
  pendingIds: Set<string>;
  toggleFollow: (incidentId: string, baselineUpdatedAt?: string | null) => Promise<boolean>;
  markFollowedIncidentsRead: (incidents: readonly ReadableFollowedIncident[]) => void;
  loading: boolean;
  storageState: FollowStorageState;
} {
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [readState, setReadState] = useState<Map<string, string>>(new Map());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [storageState, setStorageState] = useState<FollowStorageState>("loading");
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const followedIdsRef = useRef<Set<string>>(new Set());
  const readStateRef = useRef<Map<string, string>>(new Map());
  const storageStateRef = useRef<FollowStorageState>("loading");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("lumes.followed-incidents");
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      const ids = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
      const next = new Set(ids);
      let readStateValue: unknown = {};
      const storedReadState = window.localStorage.getItem(FOLLOWED_READ_STATE_STORAGE_KEY);
      if (storedReadState) {
        try {
          readStateValue = JSON.parse(storedReadState) as unknown;
        } catch {
          readStateValue = {};
        }
      }
      const nextReadState = normalizeFollowedReadState(readStateValue);
      followedIdsRef.current = next;
      setFollowedIds(next);
      readStateRef.current = nextReadState;
      setReadState(nextReadState);
      storageStateRef.current = "available";
      setStorageState("available");
    } catch {
      setFollowedIds(new Set());
      readStateRef.current = new Map();
      setReadState(new Map());
      storageStateRef.current = "unavailable";
      setStorageState("unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleFollow = useCallback(async (incidentId: string, baselineUpdatedAt?: string | null): Promise<boolean> => {
    if (pendingIdsRef.current.has(incidentId)) return false;

    pendingIdsRef.current.add(incidentId);
    const previous = new Set(followedIdsRef.current);
    const previousReadState = new Map(readStateRef.current);
    const next = toggleFollowedId(followedIdsRef.current, incidentId);
    const nextReadState = new Map(readStateRef.current);
    if (next.has(incidentId)) {
      if (isValidIsoTimestamp(baselineUpdatedAt)) nextReadState.set(incidentId, baselineUpdatedAt);
    } else {
      nextReadState.delete(incidentId);
    }
    followedIdsRef.current = next;
    readStateRef.current = nextReadState;
    setPendingIds((current) => new Set(current).add(incidentId));
    setFollowedIds(next);
    setReadState(nextReadState);
    try {
      // Keep the synchronous duplicate guard active through this turn. This
      // also lets rapid toggles of different IDs compute from the latest ref.
      await Promise.resolve();
      window.localStorage.setItem("lumes.followed-incidents", JSON.stringify([...next]));
      window.localStorage.setItem(FOLLOWED_READ_STATE_STORAGE_KEY, serializeFollowedReadState(nextReadState));
      return true;
    } catch {
      followedIdsRef.current = previous;
      readStateRef.current = previousReadState;
      setFollowedIds(previous);
      setReadState(previousReadState);
      storageStateRef.current = "unavailable";
      setStorageState("unavailable");
      throw new Error("Browser storage is unavailable");
    } finally {
      pendingIdsRef.current.delete(incidentId);
      setPendingIds((current) => {
        const nextPending = new Set(current);
        nextPending.delete(incidentId);
        return nextPending;
      });
    }
  }, []);

  const markFollowedIncidentsRead = useCallback((incidents: readonly ReadableFollowedIncident[]): void => {
    if (storageStateRef.current !== "available") return;
    const previous = readStateRef.current;
    const next = markReadState(previous, incidents);
    if (serializeFollowedReadState(previous) === serializeFollowedReadState(next)) return;

    readStateRef.current = next;
    setReadState(next);
    try {
      window.localStorage.setItem(FOLLOWED_READ_STATE_STORAGE_KEY, serializeFollowedReadState(next));
    } catch {
      readStateRef.current = previous;
      setReadState(previous);
      storageStateRef.current = "unavailable";
      setStorageState("unavailable");
    }
  }, []);

  return { followedIds, readState, pendingIds, toggleFollow, markFollowedIncidentsRead, loading, storageState };
}
