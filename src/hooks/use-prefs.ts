import { useEffect, useState } from "react";
import { DEFAULT_PREFS, loadPrefs, applyPrefs, savePrefs, subscribePrefs, type Prefs } from "@/lib/prefs";

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    const p = loadPrefs();
    setPrefs(p);
    applyPrefs(p);
    return subscribePrefs(setPrefs);
  }, []);

  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  };

  return { prefs, update };
}
