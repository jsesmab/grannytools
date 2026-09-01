export type Prefs = {
  fontScale: number; // 0.85 – 1.6
  highContrast: boolean;
  brightness: number; // 1 – 2 (brillo extra en la lupa)
};

export const DEFAULT_PREFS: Prefs = { fontScale: 1, highContrast: false, brightness: 1 };

const KEY = "grannytools.prefs";
const EVENT = "grannytools:prefs";
const BASE_FONT_PX = 18;

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function applyPrefs(p: Prefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.fontSize = `${Math.round(BASE_FONT_PX * p.fontScale)}px`;
  root.classList.toggle("hc", p.highContrast);
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
  applyPrefs(p);
  window.dispatchEvent(new CustomEvent<Prefs>(EVENT, { detail: p }));
}

export function subscribePrefs(cb: (p: Prefs) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<Prefs>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
