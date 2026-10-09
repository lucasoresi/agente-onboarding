import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { normalizeHeader } from '@/lib/validation/normalize';
import { SCHEMAS } from '@/lib/validation/schemas';
import type { Level } from '@/lib/validation/types';

// Plantillas oficiales de Optacost (carpetas "Templates" de "Optacost — Onboarding Labmedicina").
// Son la fuente de verdad de la estructura: cada esquema tiene que coincidir con su plantilla.
const DIR = join(__dirname, '..', 'fixtures', 'templates');

type TemplateColumn = { header: string; level?: Level };

function readTemplate(file: string): { sheetName: string; columns: TemplateColumn[] } {
  const wb = XLSX.read(readFileSync(join(DIR, file)), { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  const columns: TemplateColumn[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })] as XLSX.CellObject | undefined;
    if (!cell || cell.v === undefined || String(cell.v).trim() === '') continue;
    const note = (cell.c ?? []).map((x) => x.t ?? '').join(' ');
    const level: Level | undefined = /Obligatorio/.test(note)
      ? 'required'
      : /Recomendado/.test(note)
        ? 'recommended'
        : /Opcional/.test(note)
          ? 'optional'
          : undefined;
    columns.push({ header: String(cell.v).trim(), level });
  }
  return { sheetName, columns };
}

describe('esquemas vs. plantillas oficiales', () => {
  it('hay una plantilla por esquema y ninguna de más', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.xlsx')).sort();
    expect(SCHEMAS.map((s) => s.templateFile).sort()).toEqual(files);
  });

  for (const schema of SCHEMAS) {
    describe(schema.id, () => {
      const template = readTemplate(schema.templateFile);
      const isPlaceholder = (h: string) => /[[\]]/.test(h);
      const fixed = template.columns.filter((c) => !isPlaceholder(c.header));
      const dynamic = template.columns.filter((c) => isPlaceholder(c.header));

      it('la hoja se reconoce', () => {
        expect(schema.sheetNames.map(normalizeHeader)).toContain(normalizeHeader(template.sheetName));
      });

      it('las columnas fijas coinciden en nombre y orden', () => {
        expect(schema.columns.map((c) => c.label)).toEqual(fixed.map((c) => c.header));
      });

      it('la obligatoriedad coincide con los comentarios de la plantilla', () => {
        for (const [i, col] of fixed.entries()) {
          if (col.level) expect(schema.columns[i].level, col.header).toBe(col.level);
        }
      });

      it('las columnas dinámicas coinciden', () => {
        if (dynamic.length === 0) {
          expect(schema.dynamic).toBeUndefined();
          return;
        }
        expect(schema.dynamic).toBeDefined();
        for (const col of dynamic) expect(schema.dynamic!.placeholder.test(normalizeHeader(col.header)), col.header).toBe(true);
        if (dynamic[0].level) expect(schema.dynamic!.firstRequired).toBe(dynamic[0].level === 'required');
      });
    });
  }
});
