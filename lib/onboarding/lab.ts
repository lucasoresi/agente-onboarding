export const LAB_ID = /^[a-z0-9-]{1,40}$/;
export const DEFAULT_LAB = 'demo';

/**
 * Convierte lo que alguien escribió en el link (?lab=prueba-Nanni) en un id válido: minúsculas, sin tildes,
 * espacios y símbolos como guiones. Devuelve undefined si no queda ningún carácter válido.
 */
export function normalizeLab(raw: string): string | undefined {
  const id = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
  return id ? id : undefined;
}
