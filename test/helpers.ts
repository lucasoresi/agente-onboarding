import * as XLSX from 'xlsx';
import type { Cell, ParsedFile } from '@/lib/validation/types';

export function xlsxBytes(sheets: Record<string, Cell[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), name);
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

export function csvBytes(text: string, encoding: 'utf8' | 'latin1' = 'utf8', bom = false): Uint8Array {
  const body = Buffer.from(text, encoding);
  return new Uint8Array(bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body);
}

/** ParsedFile en memoria: cada fila de `rows` es la fila i+1. */
export function parsed(fileName: string, rows: Cell[][], sheetName = 'Hoja1'): ParsedFile {
  return { fileName, sheets: [{ name: sheetName, lines: rows.map((cells, i) => ({ line: i + 1, cells })) }] };
}
