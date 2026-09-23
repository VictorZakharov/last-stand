// Tiny cookie helpers for small persisted preferences (loadouts, settings).
const MAX_AGE = 60 * 60 * 24 * 365 * 5; // five years

export function readCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${MAX_AGE}; path=/; SameSite=Lax`;
}
