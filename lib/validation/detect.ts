import { HEADER_SEARCH_ROWS, headerMatches } from './columns';
import { cellToText, normalizeText } from './normalize';
import { SCHEMAS, getSchema } from './schemas';
import type { ParsedFile, Schema, Sheet, StepId } from './types';

export type Detection =
  | { kind: 'ok'; schema: Schema; via: 'tipo' | 'nombre' | 'encabezados' }
  | { kind: 'ambiguo'; candidates: Schema[] }
  | { kind: 'desconocido' };

const MIN_SCORE = 0.6;
const TIE_MARGIN = 0.1;

const FILE_KEYS = SCHEMAS.flatMap((schema) => schema.fileNameKeys.map((key) => ({ key, schema }))).sort(
  (a, b) => b.key.length - a.key.length,
);

export function fileKey(name: string): string {
  return normalizeText(name.replace(/\.[^.]+$/, '')).replace(/[^a-z0-9]/g, '');
}

/** Proporción de columnas obligatorias reconocidas (score) y cuántas son (found), en la mejor fila candidata. */
function headerScore(sheet: Sheet, schema: Schema): { score: number; found: number } {
  const required = schema.columns.filter((c) => c.level === 'required');
  let best = { score: 0, found: 0 };
  for (const row of sheet.lines.slice(0, HEADER_SEARCH_ROWS)) {
    const headers = row.cells.map((c) => cellToText(c));
    const found = required.filter((c) => headers.some((h) => headerMatches(h, c))).length;
    const score = found / required.length;
    if (score > best.score || (score === best.score && found > best.found)) best = { score, found };
  }
  return best;
}

export function detectSchema(file: ParsedFile, tipo?: StepId): Detection {
  if (tipo) return { kind: 'ok', schema: getSchema(tipo), via: 'tipo' };

  const key = fileKey(file.fileName);
  const byName = FILE_KEYS.find((e) => key.includes(e.key));
  if (byName) return { kind: 'ok', schema: byName.schema, via: 'nombre' };

  const scored = SCHEMAS.map((schema) => {
    const perSheet = file.sheets.map((sheet) => headerScore(sheet, schema));
    const best = perSheet.reduce((a, b) => (b.score > a.score || (b.score === a.score && b.found > a.found) ? b : a));
    return { schema, ...best };
  })
    .filter((x) => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || b.found - a.found);
  if (scored.length === 0) return { kind: 'desconocido' };
  // Empate en score: gana el esquema con más columnas obligatorias reconocidas (Facturación con 7 le gana a Sedes con 1).
  const close = scored.filter((x) => scored[0].score - x.score < TIE_MARGIN);
  const maxFound = Math.max(...close.map((x) => x.found));
  const top = close.filter((x) => x.found === maxFound);
  if (top.length > 1) return { kind: 'ambiguo', candidates: top.map((x) => x.schema) };
  return { kind: 'ok', schema: top[0].schema, via: 'encabezados' };
}
