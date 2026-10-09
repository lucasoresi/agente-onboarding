import { describe, expect, it } from 'vitest';
import { normalizeHeader } from '@/lib/validation/normalize';
import { SCHEMAS, getSchema } from '@/lib/validation/schemas';
import { STEP_IDS } from '@/lib/validation/types';

describe('SCHEMAS', () => {
  it('tiene los 14 pasos en orden', () => {
    expect(SCHEMAS.map((s) => s.id)).toEqual([...STEP_IDS]);
  });

  it('cada esquema tiene al menos una columna obligatoria y claves de nombre de archivo', () => {
    for (const s of SCHEMAS) {
      expect(s.columns.some((c) => c.level === 'required'), s.id).toBe(true);
      expect(s.fileNameKeys.length, s.id).toBeGreaterThan(0);
      for (const k of s.fileNameKeys) expect(k, s.id).toMatch(/^[a-z]+$/);
    }
  });

  it('labels y alias no colisionan dentro de un esquema', () => {
    for (const s of SCHEMAS) {
      const all = s.columns.flatMap((c) => [c.label, ...(c.aliases ?? [])].map(normalizeHeader));
      expect(new Set(all).size, s.id).toBe(all.length);
    }
  });

  it('reglas puntuales de la spec', () => {
    expect(getSchema('obras_sociales').columns.find((c) => c.key === 'valorUb')?.level).toBe('required');
    expect(getSchema('usuarios').columns.find((c) => c.key === 'rol')?.enumValues).toEqual([
      'Administrador',
      'Editor',
      'Solo lectura',
    ]);
    expect(getSchema('convenios').columns.find((c) => c.key === 'tipo')?.enumValues).toEqual(['Derivación', 'Especial']);
    expect(getSchema('sedes').columns.find((c) => c.key === 'codigo')?.level).toBe('recommended');
    expect(getSchema('practicas').dynamic?.firstRequired).toBe(true);
    expect(getSchema('modulos_obra_social').dynamic?.firstRequired).toBe(false);
    expect(getSchema('relaciones_consumo').columns.find((c) => c.key === 'rendimiento')?.greaterThan).toBe(0);
  });

  it('los placeholders de la plantilla se reconocen', () => {
    expect(getSchema('practicas').dynamic!.placeholder.test(normalizeHeader('[Nombre del arancel 1]'))).toBe(true);
    expect(getSchema('practicas').dynamic!.placeholder.test(normalizeHeader('Nombre del arancel 2'))).toBe(true);
    expect(getSchema('practicas').dynamic!.placeholder.test(normalizeHeader('Derivación'))).toBe(false);
    expect(
      getSchema('modulos_obra_social').dynamic!.placeholder.test(normalizeHeader('[Código de obra social 1]')),
    ).toBe(true);
  });
});
