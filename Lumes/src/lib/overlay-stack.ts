export function openOverlay<T extends string>(stack: readonly T[], overlay: T): T[] {
  return [...stack.filter((item) => item !== overlay), overlay];
}

export function closeTopOverlay<T extends string>(stack: readonly T[]): {
  stack: T[];
  closed: T | null;
} {
  const closed = stack.at(-1) ?? null;
  return { stack: closed === null ? [...stack] : stack.slice(0, -1), closed };
}

export function closeOverlay<T extends string>(stack: readonly T[], overlay: T): T[] {
  return stack.filter((item) => item !== overlay);
}
