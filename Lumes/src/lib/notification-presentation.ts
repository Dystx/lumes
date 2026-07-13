/** Return the exact positive unread count for a compact navigation badge. */
export function notificationBadgeLabel(value: number): string | null {
  return Number.isInteger(value) && value > 0 ? String(value) : null;
}
