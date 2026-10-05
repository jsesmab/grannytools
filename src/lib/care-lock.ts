import { useEffect, useState } from "react";

/**
 * Modo de uso de la agenda: "autonomo" (por defecto) permite crear, modificar y borrar
 * citas, turnos, tareas y medicinas; "protegido" solo deja consultarlas y marcar tomas/tareas.
 * Preparado para que la futura app Family lo cambie llamando a setCareMode().
 */
export type CareMode = "autonomo" | "protegido";
const KEY = "grannytools.careMode";
const EVT = "grannytools:caremode";

export function getCareMode(): CareMode {
  if (typeof window === "undefined") return "autonomo";
  return localStorage.getItem(KEY) === "protegido" ? "protegido" : "autonomo";
}

export function setCareMode(mode: CareMode, source: "local" | "family" = "local") {
  localStorage.setItem(KEY, mode);
  localStorage.setItem(KEY + ".source", source);
  window.dispatchEvent(new Event(EVT));
}

export function useCareLocked() {
  const [mode, setMode] = useState<CareMode>("autonomo");
  useEffect(() => {
    const sync = () => setMode(getCareMode());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return { mode, locked: mode === "protegido" };
}
