import { describe, expect, it } from 'vitest';
import { getSchema } from '@/lib/validation/schemas';
import { extractCatalog, MAX_ISSUES, pickSheet, validateFile } from '@/lib/validation/validate';
import type { Cell, ParsedFile } from '@/lib/validation/types';
import { parsed } from '../helpers';

const USERS_HEADER: Cell[] = ['Nombre completo', 'Email', 'Rol'];
const rules = (issues: { rule: string }[]) => issues.map((i) => i.rule);

describe('validateFile: archivo correcto', () => {
  it('sin errores y con conteo de filas', () => {
    const r = validateFile(
      parsed('2026-07-15_Usuarios.xlsx', [USERS_HEADER, ['Ana', 'ana@x.com', 'Editor'], ['Juan', 'j@x.com', 'Solo lectura']]),
      getSchema('usuarios'),
    );
    expect(r).toMatchObject({ ok: true, rows: 2, errorCount: 0, warningCount: 0, schemaId: 'usuarios', sheetName: 'Hoja1' });
  });
});

describe('validateFile: reglas por celda', () => {
  it('celda obligatoria vacía, email inválido y rol con sugerencia', () => {
    const r = validateFile(
      parsed('2026-07-15_Usuarios.xlsx', [USERS_HEADER, ['Ana', '', 'Admin'], ['Juan', 'juan@', 'Editor']]),
      getSchema('usuarios'),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => [e.rule, e.row])).toEqual([
      ['celda_vacia', 2],
      ['valor_no_permitido', 2],
      ['tipo_invalido', 3],
    ]);
    expect(r.errors[1].suggestion).toBe('Administrador');
    expect(r.errors[1].message).toContain('¿Quisiste decir "Administrador"?');
  });

  it('el nombre de una persona no puede tener números ni símbolos', () => {
    const r = validateFile(
      parsed('2026-07-15_Usuarios.xlsx', [
        USERS_HEADER,
        ['Luca Soresi', 'luca@gmail.com', 'Solo lectura'],
        [' Leo2', 'leo@x.com', 'Administrador'],
        ["José María O'Neil", 'jm@x.com', 'Editor'],
        ['Ana Pérez-Gómez', 'ana@x.com', 'Editor'],
        ['Juan_Perez', 'juan@x.com', 'Editor'],
      ]),
      getSchema('usuarios'),
    );
    expect(r.errors.map((e) => [e.rule, e.row, e.value])).toEqual([
      ['tipo_invalido', 3, 'Leo2'],
      ['tipo_invalido', 6, 'Juan_Perez'],
    ]);
    expect(r.errors[0].message).toContain('solo puede tener letras');
  });

  it('el nombre de la sede solo admite letras; el código puede ser alfanumérico', () => {
    const r = validateFile(
      parsed('2026-07-15_Sedes.xlsx', [
        ['Nombre de la sede', 'Código'],
        ['Derivantes32', 'AA03'],
        [478, 'lñs'],
        ['Nanni', 1000],
        ['Dow Center', 'S-2'],
      ]),
      getSchema('sedes'),
    );
    expect(r.errors.map((e) => [e.rule, e.row, e.column, e.value])).toEqual([
      ['tipo_invalido', 2, 'Nombre de la sede', 'Derivantes32'],
      ['tipo_invalido', 3, 'Nombre de la sede', '478'],
    ]);
    expect(r.errors[0].message).toContain('solo puede tener letras');
    expect(r.errors[1].message).toContain('parece un código');
  });

  it('un nombre sin letras (solo un número) es error: parece un código', () => {
    const r = validateFile(
      parsed('2026-07-15_Sectores.xlsx', [['Nombre del sector'], ['Hematología'], [57], ['Química 2'], ['47']]),
      getSchema('sectores'),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => [e.rule, e.row, e.column, e.value])).toEqual([
      ['tipo_invalido', 3, 'Nombre del sector', '57'],
      ['tipo_invalido', 5, 'Nombre del sector', '47'],
    ]);
    expect(r.errors[0].message).toContain('parece un código');
  });

  it('duplicados ignorando mayúsculas y espacios (Review Focus 3)', () => {
    const r = validateFile(
      parsed('2026-07-15_Usuarios.xlsx', [USERS_HEADER, ['Ana', 'Ana@Lab.com', 'Editor'], ['Ana B', 'ana@lab.com ', 'Editor']]),
      getSchema('usuarios'),
    );
    expect(rules(r.errors)).toEqual(['duplicado']);
    expect(r.errors[0]).toMatchObject({ row: 3 });
    expect(r.errors[0].message).toContain('fila 2');
  });

  it('números: tipo, negativos, mayor que cero y coma decimal', () => {
    const header: Cell[] = ['Código de insumo', 'Código de práctica', 'Rendimiento'];
    const r = validateFile(
      parsed('2026-07-15_Relaciones.xlsx', [header, ['I1', 'P1', '10,5'], ['I2', 'P1', 0], ['I3', 'P1', 'diez']]),
      getSchema('relaciones_consumo'),
      { insumos: new Set(['i1', 'i2', 'i3']), practicas: new Set(['p1']) },
    );
    expect(r.errors.map((e) => [e.rule, e.row])).toEqual([
      ['fuera_de_rango', 3],
      ['tipo_invalido', 4],
    ]);
  });

  it('fechas inválidas y booleanos', () => {
    const header: Cell[] = ['Código de insumo', 'Nombre de insumo', 'Precio de última compra', 'Fecha de última compra', 'Activo'];
    const r = validateFile(
      parsed('2026-07-15_Insumos.xlsx', [header, ['I1', 'Tubo', '1.234,50', '15/07/2026', 'Sí'], ['I2', 'Aguja', -3, '31/02/2026', 'quizás']]),
      getSchema('insumos'),
    );
    expect(r.errors.map((e) => [e.rule, e.column])).toEqual([
      ['fuera_de_rango', 'Precio de última compra'],
      ['tipo_invalido', 'Fecha de última compra'],
      ['valor_no_permitido', 'Activo'],
    ]);
  });

  it('pares únicos y madre distinta de hija', () => {
    const r = validateFile(
      parsed('2026-07-15_PracticasCompuestas.xlsx', [['Código práctica madre', 'Código práctica hija'], ['100', '101'], ['100', '101'], ['200', '200']]),
      getSchema('practicas_compuestas'),
      { practicas: new Set(['100', '101', '200']) },
    );
    expect(r.errors.map((e) => [e.rule, e.row])).toEqual([
      ['duplicado', 3],
      ['fuera_de_rango', 4],
    ]);
  });
});

describe('validateFile: columnas dinámicas', () => {
  const header: Cell[] = ['Código de práctica', 'Nombre de práctica', 'Derivación', 'Especial'];
  it('valida números en aranceles y exige el primero', () => {
    const r = validateFile(
      parsed('2026-07-15_Practicas.xlsx', [header, ['1', 'Hemograma', '1.500,00', ''], ['2', 'Glucemia', '', 300], ['3', 'Urea', 'caro', -1]]),
      getSchema('practicas'),
    );
    expect(r.dynamicColumns).toEqual(['Derivación', 'Especial']);
    expect(r.errors.map((e) => [e.rule, e.row, e.column])).toEqual([
      ['celda_vacia', 3, 'Derivación'],
      ['tipo_invalido', 4, 'Derivación'],
      ['fuera_de_rango', 4, 'Especial'],
    ]);
  });

  it('en Módulos por obra social exige la primera obra social, como marca la plantilla', () => {
    const r = validateFile(
      parsed('2026-07-15_ModulosObraSocial.xlsx', [
        ['Código de práctica', 'Descripción de práctica', 'OSDE', 'IOMA'],
        ['1', 'Hemograma', 10, ''],
        ['2', 'Glucemia', '', 5],
      ]),
      getSchema('modulos_obra_social'),
      { practicas: new Set(['1', '2']) },
    );
    expect(r.errors.map((e) => [e.rule, e.row, e.column])).toEqual([['celda_vacia', 3, 'OSDE']]);
    expect(r.errors[0].message).toContain('obra social');
    expect(r.errors[0].message).not.toContain('arancel');
  });
});

describe('validateFile: plantilla y archivo', () => {
  it('fila de ejemplo de la plantilla es error y no cuenta como fila', () => {
    const r = validateFile(
      parsed('2026-07-15_PracticasCompuestas.xlsx', [['Código práctica madre', 'Código práctica hija'], ['123456', '123', '<- ejemplo, borrar antes de completar'], ['200', '201']]),
      getSchema('practicas_compuestas'),
      { practicas: new Set(['200', '201']) },
    );
    expect(rules(r.errors)).toEqual(['fila_de_ejemplo']);
    expect(r.rows).toBe(1);
  });

  it('sin filas de datos es error', () => {
    const r = validateFile(parsed('2026-07-15_Usuarios.xlsx', [USERS_HEADER]), getSchema('usuarios'));
    expect(rules(r.errors)).toEqual(['archivo_vacio']);
  });

  it('nombre fuera de convención es advertencia', () => {
    const r = validateFile(parsed('usuarios final.xlsx', [USERS_HEADER, ['Ana', 'a@x.com', 'Editor']]), getSchema('usuarios'));
    expect(r.ok).toBe(true);
    expect(rules(r.warnings)).toEqual(['nombre_archivo']);
  });

  it('limita los issues guardados pero cuenta todos', () => {
    const rows: Cell[][] = [USERS_HEADER, ...Array.from({ length: MAX_ISSUES + 10 }, () => ['Usuario', '', 'Editor'])];
    const r = validateFile(parsed('2026-07-15_Usuarios.xlsx', rows), getSchema('usuarios'));
    expect(r.errorCount).toBe(MAX_ISSUES + 10);
    expect(r.errors).toHaveLength(MAX_ISSUES);
  });
});

describe('catálogos', () => {
  const header: Cell[] = ['Código de insumo', 'Código de práctica', 'Rendimiento'];
  it('advierte códigos que no están en el catálogo, con números y ceros a la izquierda (Review Focus 2)', () => {
    const r = validateFile(
      parsed('2026-07-15_Relaciones.xlsx', [header, ['0123', 45, 10], ['999', '45', 10]]),
      getSchema('relaciones_consumo'),
      { insumos: new Set(['123']), practicas: new Set(['45']) },
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => [w.rule, w.value])).toEqual([['codigo_no_en_catalogo', '999']]);
  });

  it('avisa cuando el catálogo todavía no se validó', () => {
    const r = validateFile(parsed('2026-07-15_Relaciones.xlsx', [header, ['1', '2', 3]]), getSchema('relaciones_consumo'));
    expect(rules(r.warnings)).toEqual(['catalogo_no_verificado', 'catalogo_no_verificado']);
  });

  it('extractCatalog devuelve códigos normalizados', () => {
    const f = parsed('p.xlsx', [['Código de práctica', 'Nombre de práctica', 'Derivación'], ['0045', 'Hemograma', 10], ['HEM-2', 'Otra', 5]]);
    expect(extractCatalog(f, getSchema('practicas'))).toEqual(['45', 'hem-2']);
    expect(extractCatalog(f, getSchema('usuarios'))).toBeUndefined();
  });
});

describe('pickSheet (Review Focus 4)', () => {
  it('prefiere la hoja con el nombre del esquema y si no, la primera que no sea Instrucciones', () => {
    const file: ParsedFile = {
      fileName: 'x.xlsx',
      sheets: [
        { name: 'Instrucciones', lines: [{ line: 1, cells: ['Leer'] }] },
        { name: 'Hoja1', lines: [{ line: 1, cells: USERS_HEADER }] },
      ],
    };
    expect(pickSheet(file, getSchema('usuarios')).name).toBe('Hoja1');
    file.sheets.push({ name: 'USUARIOS', lines: [{ line: 1, cells: USERS_HEADER }] });
    expect(pickSheet(file, getSchema('usuarios')).name).toBe('USUARIOS');
  });
});
