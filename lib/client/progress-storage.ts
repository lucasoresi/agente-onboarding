import { normalizeProgress, type LabProgress } from '@/lib/onboarding/state';

type KV = Pick<Storage, 'getItem' | 'setItem'>;

const key = (lab: string) => `optacost-onboarding:progreso:${lab}`;

function defaultStorage(): KV | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Progreso guardado en este navegador; si no hay, está roto o el navegador lo bloquea, arranca vacío. */
export function loadProgress(lab: string, storage: KV | undefined = defaultStorage()): LabProgress {
  try {
    const text = storage?.getItem(key(lab));
    return normalizeProgress(text ? JSON.parse(text) : undefined, lab);
  } catch {
    return normalizeProgress(undefined, lab);
  }
}

/** Devuelve false si no se pudo guardar (navegación privada, almacenamiento lleno o bloqueado). */
export function saveProgress(p: LabProgress, storage: KV | undefined = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key(p.lab), JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}
