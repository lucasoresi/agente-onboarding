import { describe, expect, it } from 'vitest';
import { mapColumns, resolveHeader } from '@/lib/validation/columns';
import { getSchema } from '@/lib/validation/schemas';
import { parsed } from '../helpers';

describe('resolveHeader', () => {
  it('encuentra el encabezado aunque haya un título arriba (Review Focus 1)', () => {
    const file = parsed('u.xlsx', [
      ['Listado de usuarios del laboratorio'],
      [null],
      ['Nombre completo', 'Email', 'Rol'],
      ['Ana', 'ana@x.com', 'Editor'],
    ]);
    const r = resolveHeader(file.sheets[0], getSchema('usuarios'));
    expect(r.headerLine).toBe(3);
    expect(r.headers).toEqual(['Nombre completo', 'Email', 'Rol']);
    expect(r.rows.map((x) => x.line)).toEqual([4]);
  });

  it('si ninguna fila coincide usa la primera', () => {
    const r = resolveHeader(parsed('x.csv', [['foo', 'bar'], ['1', '2']]).sheets[0], getSchema('usuarios'));
    expect(r.headerLine).toBe(1);
  });
});

describe('mapColumns', () => {
  it('mapea por label o alias ignorando tildes y mayúsculas', () => {
    const m = mapColumns(['NOMBRE COMPLETO', 'Correo', 'rol'], getSchema('usuarios'));
    expect([...m.fixed.entries()]).toEqual([
      ['nombre', 0],
      ['email', 1],
      ['rol', 2],
    ]);
    expect(m.errors).toEqual([]);
  });

  it('reporta obligatorias faltantes como error y recomendadas como advertencia', () => {
    expect(mapColumns(['Nombre completo'], getSchema('usuarios')).errors.map((e) => e.column)).toEqual(['Email', 'Rol']);
    const sedes = mapColumns(['Nombre de la sede'], getSchema('sedes'));
    expect(sedes.errors).toEqual([]);
    expect(sedes.warnings.map((w) => w.rule)).toEqual(['columna_recomendada_faltante']);
  });

  it('columnas desconocidas y repetidas son advertencias', () => {
    const m = mapColumns(['Nombre completo', 'Email', 'Rol', 'Teléfono', 'Email'], getSchema('usuarios'));
    expect(m.warnings.map((w) => w.column)).toEqual(['Teléfono', 'Email']);
    expect(m.fixed.get('email')).toBe(1);
  });

  it('detecta columnas dinámicas y placeholders sin reemplazar', () => {
    const m = mapColumns(
      ['Código de práctica', 'Nombre de práctica', 'Derivación', '[Nombre del arancel 2]', ''],
      getSchema('practicas'),
    );
    expect(m.dynamic).toEqual([{ index: 2, header: 'Derivación' }]);
    expect(m.errors.map((e) => e.rule)).toEqual(['placeholder_sin_reemplazar']);
  });

  it('exige al menos una columna dinámica', () => {
    const m = mapColumns(['Código de práctica', 'Nombre de práctica'], getSchema('practicas'));
    expect(m.errors.map((e) => e.rule)).toEqual(['sin_columnas_dinamicas']);
  });
});
