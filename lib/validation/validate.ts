import { mapColumns, resolveHeader } from './columns';
import {
  cellToText,
  checkFileNameConvention,
  detectDecimalComma,
  isEmail,
  isEmpty,
  matchEnum,
  normalizeCode,
  normalizeHeader,
  normalizeText,
  parseBoolean,
  parseDate,
  parseNumber,
} from './normalize';
import type { CatalogName, Cell, ColumnSpec, Issue, ParsedFile, Schema, Sheet, ValidationReport } from './types';

export const MAX_ISSUES = 500;

export type Catalogs = Partial<Record<CatalogName, Set<string>>>;

const CATALOG_TITLES: Record<CatalogName, string> = { practicas: 'Prácticas', insumos: 'Insumos' };

export function pickSheet(file: ParsedFile, schema: Schema): Sheet {
  const wanted = schema.sheetNames.map(normalizeHeader);
  return (
    file.sheets.find((s) => wanted.includes(normalizeHeader(s.name))) ??
    file.sheets.find((s) => !normalizeHeader(s.name).startsWith('instruccion')) ??
    file.sheets[0]
  );
}

function isExampleRow(cells: Cell[]): boolean {
  return cells.some((c) => {
    if (typeof c !== 'string') return false;
    const t = normalizeText(c);
    return t.includes('ejemplo') && t.includes('borrar');
  });
}

type Sink = (issue: Issue) => void;

function checkValue(col: ColumnSpec, v: Cell, line: number, decimalComma: boolean, err: Sink) {
  const text = cellToText(v);
  const at = `Fila ${line}: "${col.label}"`;
  switch (col.type) {
    case 'number': {
      const n = parseNumber(v, decimalComma);
      if (n === null) {
        err({ rule: 'tipo_invalido', row: line, column: col.label, value: text, message: `${at} debe ser un número (valor: "${text}").` });
      } else if (col.min !== undefined && n < col.min) {
        err({ rule: 'fuera_de_rango', row: line, column: col.label, value: text, message: `${at} no puede ser negativo (valor: ${text}).` });
      } else if (col.greaterThan !== undefined && n <= col.greaterThan) {
        err({ rule: 'fuera_de_rango', row: line, column: col.label, value: text, message: `${at} debe ser mayor que ${col.greaterThan} (valor: ${text}).` });
      }
      return;
    }
    case 'date':
      if (parseDate(v) === null) {
        err({ rule: 'tipo_invalido', row: line, column: col.label, value: text, message: `${at} debe ser una fecha válida en formato dd/mm/aaaa (valor: "${text}").` });
      }
      return;
    case 'email':
      if (!isEmail(text)) {
        err({ rule: 'tipo_invalido', row: line, column: col.label, value: text, message: `${at} no es un email válido (valor: "${text}").` });
      }
      return;
    case 'enum': {
      const allowed = col.enumValues ?? [];
      const m = matchEnum(text, allowed);
      if (!m.match) {
        const hint = m.suggestion ? ` ¿Quisiste decir "${m.suggestion}"?` : '';
        err({
          rule: 'valor_no_permitido',
          row: line,
          column: col.label,
          value: text,
          suggestion: m.suggestion,
          message: `${at} tiene "${text}", que no es un valor válido. Valores permitidos: ${allowed.join(', ')}.${hint}`,
        });
      }
      return;
    }
    case 'boolean':
      if (parseBoolean(v) === null) {
        err({ rule: 'valor_no_permitido', row: line, column: col.label, value: text, message: `${at} debe ser "Sí" o "No" (valor: "${text}").` });
      }
      return;
    case 'name':
      if (!/\p{L}/u.test(text)) {
        err({ rule: 'tipo_invalido', row: line, column: col.label, value: text, message: `${at} es "${text}", que parece un código y no un nombre: tiene que tener al menos una letra. ¿Están invertidas las columnas?` });
      }
      return;
    case 'text':
      return;
  }
}

export function validateFile(file: ParsedFile, schema: Schema, catalogs: Catalogs = {}): ValidationReport {
  const sheet = pickSheet(file, schema);
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  let errorCount = 0;
  let warningCount = 0;
  const err: Sink = (i) => {
    errorCount++;
    if (errors.length < MAX_ISSUES) errors.push(i);
  };
  const warn: Sink = (i) => {
    warningCount++;
    if (warnings.length < MAX_ISSUES) warnings.push(i);
  };

  if (!checkFileNameConvention(file.fileName)) {
    warn({
      rule: 'nombre_archivo',
      message: `El nombre "${file.fileName}" no sigue la convención AAAA-MM-DD_NombreDelDato (por ejemplo 2026-07-15_${schema.title.replace(/\s+/g, '')}.xlsx).`,
    });
  }

  const resolved = resolveHeader(sheet, schema);
  const mapping = mapColumns(resolved.headers, schema);
  mapping.errors.forEach(err);
  mapping.warnings.forEach(warn);

  const dataRows: typeof resolved.rows = [];
  for (const row of resolved.rows) {
    if (isExampleRow(row.cells)) {
      err({ rule: 'fila_de_ejemplo', row: row.line, message: `La fila ${row.line} es la fila de ejemplo de la plantilla: borrala antes de enviar el archivo.` });
    } else {
      dataRows.push(row);
    }
  }
  if (dataRows.length === 0) {
    err({ rule: 'archivo_vacio', message: 'El archivo no tiene filas de datos debajo de los encabezados.' });
  }

  const cols = schema.columns.filter((c) => mapping.fixed.has(c.key));
  const cellOf = (cells: Cell[], key: string): Cell => {
    const i = mapping.fixed.get(key);
    return i === undefined ? null : (cells[i] ?? null);
  };
  const labelOf = (key: string) => schema.columns.find((c) => c.key === key)?.label ?? key;
  const decimalComma = new Map(
    cols.filter((c) => c.type === 'number').map((c) => [c.key, detectDecimalComma(dataRows.map((r) => cellOf(r.cells, c.key)))]),
  );
  const dynamicDecimalComma = detectDecimalComma(dataRows.flatMap((r) => mapping.dynamic.map((d) => r.cells[d.index] ?? null)));

  const seen = new Map<string, Map<string, number>>();
  const checkUnique = (key: string, label: string, normalized: string, display: string, line: number) => {
    const values = seen.get(key) ?? new Map<string, number>();
    seen.set(key, values);
    const first = values.get(normalized);
    if (first !== undefined) {
      err({ rule: 'duplicado', row: line, column: label, value: display, message: `Fila ${line}: "${display}" está repetido en "${label}" (ya aparece en la fila ${first}).` });
    } else {
      values.set(normalized, line);
    }
  };

  for (const { line, cells } of dataRows) {
    for (const col of cols) {
      const v = cellOf(cells, col.key);
      if (isEmpty(v)) {
        if (col.level === 'required') {
          err({ rule: 'celda_vacia', row: line, column: col.label, message: `Fila ${line}: "${col.label}" está vacío y es obligatorio.` });
        }
        continue;
      }
      checkValue(col, v, line, decimalComma.get(col.key) ?? false, err);
      if (col.unique) checkUnique(col.key, col.label, normalizeCode(v), cellToText(v), line);
    }

    if (schema.dynamic) {
      const dyn = schema.dynamic;
      mapping.dynamic.forEach((d, idx) => {
        const v = cells[d.index] ?? null;
        if (isEmpty(v)) {
          if (dyn.firstRequired && idx === 0) {
            err({ rule: 'celda_vacia', row: line, column: d.header, message: `Fila ${line}: "${d.header}" está vacío; la primera columna de ${dyn.label} es obligatoria.` });
          }
          return;
        }
        const text = cellToText(v);
        const n = parseNumber(v, dynamicDecimalComma);
        if (n === null) {
          err({ rule: 'tipo_invalido', row: line, column: d.header, value: text, message: `Fila ${line}: "${d.header}" debe ser un número (valor: "${text}").` });
        } else if (n < dyn.min) {
          err({ rule: 'fuera_de_rango', row: line, column: d.header, value: text, message: `Fila ${line}: "${d.header}" no puede ser negativo (valor: ${text}).` });
        }
      });
    }

    for (const [a, b] of schema.uniquePairs ?? []) {
      const va = cellOf(cells, a);
      const vb = cellOf(cells, b);
      if (isEmpty(va) || isEmpty(vb)) continue;
      checkUnique(`${a}|${b}`, `${labelOf(a)} + ${labelOf(b)}`, `${normalizeCode(va)}|${normalizeCode(vb)}`, `${cellToText(va)} / ${cellToText(vb)}`, line);
    }

    if (schema.distinctPair) {
      const [a, b] = schema.distinctPair;
      const va = cellOf(cells, a);
      const vb = cellOf(cells, b);
      if (!isEmpty(va) && !isEmpty(vb) && normalizeCode(va) === normalizeCode(vb)) {
        err({ rule: 'fuera_de_rango', row: line, column: labelOf(b), value: cellToText(vb), message: `Fila ${line}: "${labelOf(a)}" y "${labelOf(b)}" no pueden ser el mismo código (${cellToText(va)}).` });
      }
    }
  }

  for (const ref of schema.catalogRefs ?? []) {
    if (!mapping.fixed.has(ref.column)) continue;
    const label = labelOf(ref.column);
    const catalog = catalogs[ref.catalog];
    if (!catalog) {
      warn({ rule: 'catalogo_no_verificado', column: label, message: `No pude verificar "${label}" contra el catálogo de ${CATALOG_TITLES[ref.catalog]} porque todavía no se validó ese archivo.` });
      continue;
    }
    const missing = new Map<string, number>();
    for (const { line, cells } of dataRows) {
      const v = cellOf(cells, ref.column);
      if (isEmpty(v) || catalog.has(normalizeCode(v))) continue;
      const code = cellToText(v);
      if (!missing.has(code)) missing.set(code, line);
    }
    for (const [code, line] of missing) {
      warn({ rule: 'codigo_no_en_catalogo', row: line, column: label, value: code, message: `Fila ${line}: el código "${code}" de "${label}" no está en el catálogo de ${CATALOG_TITLES[ref.catalog]} validado.` });
    }
  }

  return {
    fileName: file.fileName,
    schemaId: schema.id,
    schemaTitle: schema.title,
    sheetName: sheet.name,
    ok: errorCount === 0,
    rows: dataRows.length,
    errorCount,
    warningCount,
    errors,
    warnings,
    dynamicColumns: schema.dynamic ? mapping.dynamic.map((d) => d.header) : undefined,
  };
}

export function extractCatalog(file: ParsedFile, schema: Schema): string[] | undefined {
  if (!schema.providesCatalog) return undefined;
  const resolved = resolveHeader(pickSheet(file, schema), schema);
  const index = mapColumns(resolved.headers, schema).fixed.get(schema.providesCatalog.column);
  if (index === undefined) return [];
  const codes = new Set<string>();
  for (const { cells } of resolved.rows) {
    const v = cells[index] ?? null;
    if (!isEmpty(v) && !isExampleRow(cells)) codes.add(normalizeCode(v));
  }
  return [...codes];
}
