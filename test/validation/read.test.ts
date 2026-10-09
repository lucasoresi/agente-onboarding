import { describe, expect, it } from 'vitest';
import { MAX_ROWS, ReadError, readFile } from '@/lib/validation/read';
import { csvBytes, xlsxBytes } from '../helpers';

function readError(fn: () => unknown): ReadError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ReadError) return e;
    throw e;
  }
  throw new Error('no lanzó ReadError');
}

describe('readFile CSV', () => {
  it('detecta separador ; y conserva números de fila', () => {
    const f = readFile(csvBytes('Nombre completo;Email;Rol\nAna;ana@x.com;Editor\n'), 'u.csv');
    expect(f.sheets).toHaveLength(1);
    expect(f.sheets[0].lines[0].cells).toEqual(['Nombre completo', 'Email', 'Rol']);
    expect(f.sheets[0].lines[1]).toEqual({ line: 2, cells: ['Ana', 'ana@x.com', 'Editor'] });
  });

  it('decodifica Latin-1 con separador ,', () => {
    const f = readFile(csvBytes('Código de práctica,Nombre de práctica\n1,Hemograma\n', 'latin1'), 'p.csv');
    expect(f.sheets[0].lines[0].cells[0]).toBe('Código de práctica');
  });

  it('quita el BOM de UTF-8', () => {
    const f = readFile(csvBytes('Nombre completo;Email\nAna;a@x.com\n', 'utf8', true), 'u.csv');
    expect(f.sheets[0].lines[0].cells[0]).toBe('Nombre completo');
  });

  it('saltea filas vacías sin perder la numeración', () => {
    const f = readFile(csvBytes('a;b\n\n;\n1;2\n'), 'x.csv');
    expect(f.sheets[0].lines.map((l) => l.line)).toEqual([1, 4]);
  });
});

describe('readFile Excel', () => {
  it('lee todas las hojas con tipos nativos', () => {
    const bytes = xlsxBytes({
      Instrucciones: [['Leer antes de completar']],
      Insumos: [
        ['Código de insumo', 'Precio de última compra', 'Fecha de última compra'],
        ['INS1', 12.5, new Date(Date.UTC(2026, 6, 15))],
      ],
    });
    const f = readFile(bytes, 'insumos.xlsx');
    expect(f.sheets.map((s) => s.name)).toEqual(['Instrucciones', 'Insumos']);
    const row = f.sheets[1].lines[1];
    expect(row.line).toBe(2);
    expect(row.cells[1]).toBe(12.5);
    expect(row.cells[2]).toBeInstanceOf(Date);
  });

  it('respeta la fila real cuando hay filas vacías arriba', () => {
    const f = readFile(xlsxBytes({ Hoja1: [[], [], ['Nombre del sector'], ['Hematología']] }), 's.xlsx');
    expect(f.sheets[0].lines[0].line).toBe(3);
    expect(f.sheets[0].lines[1]).toEqual({ line: 4, cells: ['Hematología'] });
  });
});

describe('readFile errores', () => {
  it('rechaza extensiones no soportadas', () => {
    expect(readError(() => readFile(new Uint8Array([1, 2]), 'a.pdf')).code).toBe('formato_no_soportado');
  });
  it('rechaza un .xlsx que no es Excel', () => {
    expect(readError(() => readFile(csvBytes('hola;chau'), 'a.xlsx')).code).toBe('archivo_corrupto');
  });
  it('rechaza archivos vacíos', () => {
    expect(readError(() => readFile(csvBytes('\n\n'), 'a.csv')).code).toBe('archivo_vacio');
  });
  it('rechaza más de MAX_ROWS filas', () => {
    const text = 'Nombre del sector\n' + 'S\n'.repeat(MAX_ROWS + 1);
    expect(readError(() => readFile(csvBytes(text), 'a.csv')).code).toBe('demasiadas_filas');
  });
});
