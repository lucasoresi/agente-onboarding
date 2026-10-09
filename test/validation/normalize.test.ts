import { describe, expect, it } from 'vitest';
import {
  cellToText,
  checkFileNameConvention,
  detectDecimalComma,
  isEmail,
  isEmpty,
  matchEnum,
  normalizeCode,
  normalizeHeader,
  parseBoolean,
  parseDate,
  parseNumber,
} from '@/lib/validation/normalize';

describe('normalizeHeader', () => {
  it('ignora mayúsculas, tildes, espacios dobles y puntuación final', () => {
    expect(normalizeHeader('  Código   de PRÁCTICA: ')).toBe('codigo de practica');
    expect(normalizeHeader('Email*')).toBe('email');
  });
});

describe('isEmpty / cellToText', () => {
  it('trata null, vacío y espacios como vacío', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty('   ')).toBe(true);
    expect(isEmpty(0)).toBe(false);
  });
  it('convierte fechas a ISO y números a texto', () => {
    expect(cellToText(new Date(Date.UTC(2026, 6, 15)))).toBe('2026-07-15');
    expect(cellToText(123)).toBe('123');
    expect(cellToText('  abc ')).toBe('abc');
  });
});

describe('normalizeCode', () => {
  it('quita ceros a la izquierda en códigos numéricos y normaliza texto', () => {
    expect(normalizeCode('0123')).toBe('123');
    expect(normalizeCode(123)).toBe('123');
    expect(normalizeCode(' HEM-01 ')).toBe('hem-01');
    expect(normalizeCode('0')).toBe('0');
  });
});

describe('parseNumber', () => {
  it.each([
    [1234.56, false, 1234.56],
    ['1234.56', false, 1234.56],
    ['1234,56', false, 1234.56],
    ['1.234,56', false, 1234.56],
    ['$ 1.234,50', false, 1234.5],
    ['1.234.567', false, 1234567],
    ['1,234.56', false, 1234.56],
    ['1.234', true, 1234],
    ['1.234', false, 1.234],
    ['-15', false, -15],
  ] as const)('%s (coma decimal=%s) → %s', (v, dc, expected) => {
    expect(parseNumber(v, dc)).toBeCloseTo(expected);
  });
  it.each(['abc', '12a', '1,2,3', ''])('"%s" → null', (v) => {
    expect(parseNumber(v, false)).toBeNull();
  });
  it('rechaza booleanos y fechas', () => {
    expect(parseNumber(true, false)).toBeNull();
    expect(parseNumber(new Date(), false)).toBeNull();
  });
});

describe('detectDecimalComma', () => {
  it('detecta coma decimal si algún valor la usa', () => {
    expect(detectDecimalComma(['10,5', 3, null])).toBe(true);
    expect(detectDecimalComma(['$ 1.234,50'])).toBe(true);
    expect(detectDecimalComma(['1.234', '12', 1.5])).toBe(false);
  });
});

describe('parseDate', () => {
  const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
  it.each([
    ['15/07/2026', '2026-07-15'],
    ['15-07-2026', '2026-07-15'],
    ['2026-07-15', '2026-07-15'],
    ['5/7/2026', '2026-07-05'],
  ])('%s → %s', (v, expected) => {
    expect(iso(parseDate(v))).toBe(expected);
  });
  it('acepta serial de Excel y objetos Date', () => {
    expect(iso(parseDate(46218))).toBe('2026-07-15');
    expect(iso(parseDate(new Date(Date.UTC(2026, 0, 2))))).toBe('2026-01-02');
  });
  it.each(['31/02/2026', 'ayer', '2026/15/01', ''])('"%s" → null', (v) => {
    expect(parseDate(v)).toBeNull();
  });
});

describe('isEmail / parseBoolean', () => {
  it('valida emails', () => {
    expect(isEmail('ana@lab.com')).toBe(true);
    expect(isEmail('ana@lab')).toBe(false);
    expect(isEmail('ana lab@x.com')).toBe(false);
  });
  it('interpreta sí/no', () => {
    expect(parseBoolean('Sí')).toBe(true);
    expect(parseBoolean('SI')).toBe(true);
    expect(parseBoolean(1 as unknown as string)).toBe(true);
    expect(parseBoolean('no')).toBe(false);
    expect(parseBoolean(false)).toBe(false);
    expect(parseBoolean('quizás')).toBeNull();
  });
});

describe('matchEnum', () => {
  const roles = ['Administrador', 'Editor', 'Solo lectura'];
  it('coincide ignorando mayúsculas y tildes', () => {
    expect(matchEnum('administrador', roles)).toEqual({ match: 'Administrador' });
    expect(matchEnum('SOLO LECTURA', roles)).toEqual({ match: 'Solo lectura' });
    expect(matchEnum('Derivacion', ['Derivación', 'Especial'])).toEqual({ match: 'Derivación' });
  });
  it('sugiere el valor más parecido', () => {
    expect(matchEnum('Admin', roles)).toEqual({ suggestion: 'Administrador' });
    expect(matchEnum('lectura', roles)).toEqual({ suggestion: 'Solo lectura' });
    expect(matchEnum('Especiall', ['Derivación', 'Especial'])).toEqual({ suggestion: 'Especial' });
  });
  it('sin sugerencia si no se parece a nada', () => {
    expect(matchEnum('Gerente', roles)).toEqual({});
  });
});

describe('checkFileNameConvention', () => {
  it('acepta AAAA-MM-DD_Nombre.ext', () => {
    expect(checkFileNameConvention('2026-07-15_Usuarios.xlsx')).toBe(true);
    expect(checkFileNameConvention('2026-07-15_Usuarios.CSV')).toBe(true);
  });
  it('rechaza otros nombres', () => {
    expect(checkFileNameConvention('Usuarios.xlsx')).toBe(false);
    expect(checkFileNameConvention('15-07-2026_Usuarios.xlsx')).toBe(false);
  });
});
