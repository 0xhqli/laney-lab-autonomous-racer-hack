'use client';

const USER_ID_KEY = 'deepracer-user-id';

/** Generates a short random alphanumeric suffix for new user IDs. */
function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Returns the persistent user ID stored in localStorage, creating one if it doesn't exist.
 * The ID is sent with every run upload so the server can attribute runs to a driver.
 * Returns 'server' on SSR where localStorage is unavailable.
 */
export function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return 'server';
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing && existing.trim()) return existing;

  const generated = `driver-${randomSuffix()}`;
  localStorage.setItem(USER_ID_KEY, generated);
  return generated;
}

/** Returns the stored user ID, or null if it hasn't been created yet or on SSR. */
export function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USER_ID_KEY);
}

/** Overrides the stored user ID (used for testing or classroom identity assignment). */
export function setUserId(value: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_ID_KEY, value);
}

