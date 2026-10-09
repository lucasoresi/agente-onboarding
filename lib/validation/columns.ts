import { cellToText, isEmpty, normalizeHeader } from './normalize';
import type { Cell, ColumnSpec, Issue, Row, Schema, Sheet } from './types';

export const HEADER_SEARCH_ROWS = 10;

export function headerMatches(header: string, col: ColumnSpec): boolean {
  const h = normalizeHeader(header);
  return h !== '' && [col.label, ...(col.aliases ?? [])].some((l) => normalizeHeader(l) === h);
}

function matchCount(cells: Cell[], schema: Schema): number {
  return schema.columns.filter((c) => cells.some((cell) => !isEmpty(cell) && headerMatches(cellToText(cell), c)))
    .length;
}

export type ResolvedSheet = { headerLine: number; headers: string[]; rows: Row[] };

/** Elige como encabezado la fila (entre las primeras 10) con más columnas reconocidas. */
export function resolveHeader(sheet: Sheet, schema: Schema): ResolvedSheet {
  let best = 0;
  let bestScore = 0;
  sheet.lines.slice(0, HEADER_SEARCH_ROWS).forEach((r, i) => {
    const score = matchCount(r.cells, schema);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  const header = sheet.lines[best];
  return {
    headerLine: header?.line ?? 0,
    headers: (header?.cells ?? []).map((c) => cellToText(c)),
    rows: sheet.lines.slice(best + 1),
  };
}

export type ColumnMapping = {
  fixed: Map<string, number>;
  dynamic: { index: number; header: string }[];
  errors: Issue[];
  warnings: Issue[];
};

export function mapColumns(headers: string[], schema: Schema): ColumnMapping {
  const fixed = new Map<string, number>();
  const dynamic: { index: number; header: string }[] = [];
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  headers.forEach((header, index) => {
    if (header.trim() === '') return;
    const col = schema.columns.find((c) => headerMatches(header, c));
    if (col) {
      if (fixed.has(col.key)) {
        warnings.push({
          rule: 'columna_desconocida',
          column: header,
          message: `La columna "${header}" está repetida; se usa la primera.`,
        });
      } else {
        fixed.set(col.key, index);
      }
      return;
    }
    if (schema.dynamic) {
      if (/[[\]]/.test(header) || schema.dynamic.placeholder.test(normalizeHeader(header))) {
        errors.push({
          rule: 'placeholder_sin_reemplazar',
          column: header,
          message: `El encabezado "${header}" es un marcador de la plantilla: ${schema.dynamic.replaceHint}.`,
        });
        return;
      }
      dynamic.push({ index, header: header.trim() });
      return;
    }
    warnings.push({
      rule: 'columna_desconocida',
      column: header,
      message: `La columna "${header}" no forma parte de la plantilla de ${schema.title}; se va a ignorar.`,
    });
  });

  for (const col of schema.columns) {
    if (fixed.has(col.key)) continue;
    if (col.level === 'required') {
      errors.push({ rule: 'columna_faltante', column: col.label, message: `Falta la columna obligatoria "${col.label}".` });
    } else if (col.level === 'recommended') {
      warnings.push({
        rule: 'columna_recomendada_faltante',
        column: col.label,
        message: `Falta la columna recomendada "${col.label}".`,
      });
    }
  }

  if (schema.dynamic && dynamic.length === 0) {
    errors.push({ rule: 'sin_columnas_dinamicas', message: schema.dynamic.missingMessage });
  }

  return { fixed, dynamic, errors, warnings };
}
