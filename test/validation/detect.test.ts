import { describe, expect, it } from 'vitest';
import { detectSchema, fileKey } from '@/lib/validation/detect';
import { parsed } from '../helpers';

const id = (d: ReturnType<typeof detectSchema>) => (d.kind === 'ok' ? d.schema.id : d.kind);

describe('fileKey', () => {
  it('normaliza el nombre sin extensión', () => {
    expect(fileKey('2026-07-15_Relaciones de Consumo.xlsx')).toBe('20260715relacionesdeconsumo');
  });
});

describe('detectSchema', () => {
  it('respeta el tipo explícito', () => {
    expect(detectSchema(parsed('x.xlsx', [['a']]), 'sedes')).toMatchObject({ kind: 'ok', via: 'tipo' });
  });

  it.each([
    ['2026-07-15_Usuarios.xlsx', 'usuarios'],
    ['Template_Relaciones_Consumo_Optacost sueros e INM completos.xlsx', 'relaciones_consumo'],
    ['Template_Practicas_Relacionadas_Optacost.xlsx', 'practicas_compuestas'],
    ['Template_Practicas_Optacost.xlsx', 'practicas'],
    ['Template_Modulos_Obra_Social_Optacost.xlsx', 'modulos_obra_social'],
    ['2026-07-15_Obras Sociales.csv', 'obras_sociales'],
    ['Template_Lista_Precios_Competencia_Optacost.xlsx', 'precios_competencia'],
    ['facturacion por sedes julio.xlsx', 'facturacion'],
  ])('por nombre: %s → %s', (name, expected) => {
    expect(id(detectSchema(parsed(name, [['x']])))).toBe(expected);
  });

  it('por encabezados cuando el nombre no dice nada', () => {
    const d = detectSchema(parsed('export.csv', [['Código', 'Nombre', 'Valor UB'], ['1', 'OSDE', 10]]));
    expect(d).toMatchObject({ kind: 'ok', via: 'encabezados' });
    expect(id(d)).toBe('obras_sociales');
  });

  it('desempata por cantidad de columnas reconocidas (facturación vs sedes)', () => {
    const header = ['Código de práctica', 'Nombre de práctica', 'Código de convenio', 'Nombre de convenio', 'Sede', 'Cantidad facturada', 'Bruto facturado'];
    expect(id(detectSchema(parsed('export.csv', [header, ['1', 'X', 'C', 'OS', 'Centro', 1, 10]])))).toBe('facturacion');
  });

  it('ambiguo cuando dos esquemas empatan', () => {
    const d = detectSchema(parsed('export.csv', [['Código', 'Nombre'], ['1', 'X']]));
    expect(d.kind).toBe('ambiguo');
    if (d.kind === 'ambiguo') expect(d.candidates.map((s) => s.id).sort()).toEqual(['convenios', 'obras_sociales']);
  });

  it('desconocido cuando nada coincide', () => {
    expect(id(detectSchema(parsed('export.csv', [['foo', 'bar']])))).toBe('desconocido');
  });
});
