"use client";

import { useCallback, useMemo, useState } from "react";
import { NOTIFICATIONS_MOCK, type IncidentNotification } from "@/lib/sample-data";

export function markNotificationsRead(
  notifications: ReadonlyArray<IncidentNotification>,
): IncidentNotification[] {
  return notifications.map((notification) => ({ ...notification, read: true }));
}

export function useNotifications(initialNotifications: ReadonlyArray<IncidentNotification> = NOTIFICATIONS_MOCK): {
  notifications: IncidentNotification[];
  unreadCount: number;
  markAllRead: () => void;
} {
  const [notifications, setNotifications] = useState<IncidentNotification[]>(() => [...initialNotifications]);
  const unreadCount = useMemo(
    () => notifications.reduce((count, notification) => count + (notification.read ? 0 : 1), 0),
    [notifications],
  );
  const markAllRead = useCallback(() => {
    setNotifications(markNotificationsRead);
  }, []);

  return { notifications, unreadCount, markAllRead };
}
