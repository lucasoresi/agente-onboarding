import type { Cell } from './types';

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeHeader(s: string): string {
  return normalizeText(s).replace(/[\s:.*]+$/, '').trim();
}

export function isEmpty(v: Cell | undefined): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

export function cellToText(v: Cell | undefined): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** Códigos comparables: sin mayúsculas/tildes y sin ceros a la izquierda si son numéricos. */
export function normalizeCode(v: Cell | undefined): string {
  const t = normalizeText(cellToText(v));
  return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : t;
}

export function parseNumber(v: Cell | undefined, decimalComma: boolean): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[$\s]/g, '');
  if (s === '') return null;
  let m: string | null = null;
  if (/^-?\d+$/.test(s)) m = s;
  else if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) m = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(s)) m = s.replace(/,/g, '');
  else if (/^-?\d+,\d+$/.test(s)) m = s.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) m = s.replace(/\./g, '');
  else if (/^-?\d{1,3}\.\d{3}$/.test(s)) m = decimalComma ? s.replace('.', '') : s;
  else if (/^-?\d+\.\d+$/.test(s)) m = s;
  else if (/^-?\d{1,3}(,\d{3}){2,}$/.test(s)) m = s.replace(/,/g, '');
  return m === null ? null : Number(m);
}

export function detectDecimalComma(values: (Cell | undefined)[]): boolean {
  return values.some((v) => typeof v === 'string' && /^-?\$?\s*[\d.]*\d,\d+$/.test(v.trim()));
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function utcDate(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

export function parseDate(v: Cell | undefined): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    return v >= 1 && v < 2958466 ? new Date(EXCEL_EPOCH + Math.floor(v) * 86_400_000) : null;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return utcDate(+m[3], +m[2], +m[1]);
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  if (m) return utcDate(+m[1], +m[2], +m[3]);
  return null;
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

const TRUE_VALUES = new Set(['si', 's', '1', 'true', 'verdadero', 'x']);
const FALSE_VALUES = new Set(['no', 'n', '0', 'false', 'falso']);

export function parseBoolean(v: Cell | undefined): boolean | null {
  if (typeof v === 'boolean') return v;
  const t = normalizeText(cellToText(v));
  if (TRUE_VALUES.has(t)) return true;
  if (FALSE_VALUES.has(t)) return false;
  return null;
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function matchEnum(value: string, allowed: string[]): { match?: string; suggestion?: string } {
  const n = normalizeText(value);
  const exact = allowed.find((a) => normalizeText(a) === n);
  if (exact) return { match: exact };
  if (n === '') return {};
  const suggestion = allowed.find((a) => {
    const na = normalizeText(a);
    return na.startsWith(n) || na.includes(n) || n.includes(na) || levenshtein(n, na) <= 2;
  });
  return suggestion ? { suggestion } : {};
}

export function checkFileNameConvention(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}_[^/\\]+\.(xlsx|xls|csv)$/i.test(name);
}
