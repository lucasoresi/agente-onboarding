import Papa from "papaparse";
import * as XLSX from "xlsx";
import { HEADER_SEARCH_ROWS } from "./columns";
import { isEmpty } from "./normalize";
import type { Cell, ParsedFile, Row, Sheet } from "./types";

export const MAX_ROWS = 50_000;
const MAX_COLUMNS = 200;
export const SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

export type ReadErrorCode =
  | "formato_no_soportado"
  | "archivo_corrupto"
  | "archivo_vacio"
  | "demasiadas_filas";

export class ReadError extends Error {
  constructor(
    public readonly code: ReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReadError";
  }
}

const CORRUPT_MESSAGE =
  "No se pudo leer el archivo: no parece un Excel válido (puede estar dañado o tener la extensión equivocada).";

const TOO_MANY_ROWS_MESSAGE = `El archivo supera el máximo de ${MAX_ROWS.toLocaleString("es-AR")} filas.`;

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i === -1 ? "" : fileName.slice(i).toLowerCase();
}

export function decodeText(bytes: Uint8Array): string {
  const body =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return new TextDecoder("windows-1252").decode(body);
  }
}

const isZip = (b: Uint8Array) =>
  b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isCfb = (b: Uint8Array) =>
  b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

function toLines(matrix: Cell[][], offset = 0): Row[] {
  const lines: Row[] = [];
  matrix.forEach((cells, i) => {
    if (cells.some((c) => !isEmpty(c)))
      lines.push({ line: offset + i + 1, cells });
  });
  return lines;
}

function readCsv(bytes: Uint8Array): Sheet[] {
  const text = decodeText(bytes);
  // El guess de PapaParse falla con archivos de 2 columnas por la línea vacía final,
  // así que se adivina sobre las primeras filas sin líneas vacías y se parsea con ese separador.
  const { meta } = Papa.parse(text, {
    delimitersToGuess: [";", ",", "\t"],
    skipEmptyLines: "greedy",
    preview: 50,
  });
  const result = Papa.parse<string[]>(text, {
    delimiter: meta.delimiter,
    skipEmptyLines: false,
  });
  const matrix: Cell[][] = result.data.map((r) =>
    r.map((c) => (c.trim() === "" ? null : c)),
  );
  return [{ name: "CSV", lines: toLines(matrix) }];
}

function readExcel(bytes: Uint8Array): Sheet[] {
  if (!isZip(bytes) && !isCfb(bytes))
    throw new ReadError("archivo_corrupto", CORRUPT_MESSAGE);
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: "array", cellDates: true, nodim: true });
  } catch {
    throw new ReadError("archivo_corrupto", CORRUPT_MESSAGE);
  }
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const range = realRange(ws);
    if (!range) return { name, lines: [] };
    if (range.e.r - range.s.r + 1 > MAX_ROWS + 1 + HEADER_SEARCH_ROWS)
      throw new ReadError("demasiadas_filas", TOO_MANY_ROWS_MESSAGE);
    const matrix = XLSX.utils.sheet_to_json<Cell[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
      range,
    });
    return { name, lines: toLines(matrix, range.s.r) };
  });
}

/** Límites reales según las celdas presentes: el `!ref` del archivo es declarativo y puede ser forjado. */
function realRange(ws: XLSX.WorkSheet): XLSX.Range | null {
  let range: XLSX.Range | null = null;
  for (const key of Object.keys(ws)) {
    if (key.startsWith("!")) continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (!range) range = { s: { r, c }, e: { r, c } };
    else {
      range.s.r = Math.min(range.s.r, r);
      range.s.c = Math.min(range.s.c, c);
      range.e.r = Math.max(range.e.r, r);
      range.e.c = Math.max(range.e.c, c);
    }
  }
  if (range) range.e.c = Math.min(range.e.c, range.s.c + MAX_COLUMNS - 1);
  return range;
}

export function readFile(bytes: Uint8Array, fileName: string): ParsedFile {
  const ext = extensionOf(fileName);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new ReadError(
      "formato_no_soportado",
      `Formato no soportado (${ext || "sin extensión"}). Usá un archivo .csv, .xlsx o .xls.`,
    );
  }
  const sheets = (ext === ".csv" ? readCsv(bytes) : readExcel(bytes)).filter(
    (s) => s.lines.length > 0,
  );
  if (sheets.length === 0) {
    throw new ReadError(
      "archivo_vacio",
      "El archivo está vacío: no encontré ninguna fila con datos.",
    );
  }
  if (sheets.some((s) => s.lines.length - 1 > MAX_ROWS)) {
    throw new ReadError("demasiadas_filas", TOO_MANY_ROWS_MESSAGE);
  }
  return { fileName, sheets };
}
