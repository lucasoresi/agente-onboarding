import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { FileStore } from '@/lib/files/store';
import { ProgressStore } from '@/lib/onboarding/state';
import { createProgressTools } from '@/lib/tools/progress';
import { runValidation, summarizeForModel } from '@/lib/tools/validate';
import { parsed } from '../helpers';

let files: FileStore;
let progress: ProgressStore;
const lab = 'prueba';
const opts = { toolCallId: 't1', messages: [] } as never;

beforeEach(async () => {
  files = new FileStore();
  progress = new ProgressStore(await mkdtemp(join(tmpdir(), 'tools-')));
});

describe('runValidation', () => {
  it('valida, registra el progreso y guarda el catálogo', async () => {
    const id = files.put(parsed('2026-07-15_Practicas.xlsx', [['Código de práctica', 'Nombre de práctica', 'Derivación'], ['45', 'Hemograma', 10]]));
    const out = await runValidation({ files, progress, lab }, { fileId: id });
    expect(out).toMatchObject({ status: 'validado', report: { ok: true, schemaId: 'practicas' } });
    expect((await progress.load(lab)).steps.practicas.status).toBe('validado');
    expect([...((await progress.catalogs(lab)).practicas ?? [])]).toEqual(['45']);
  });

  it('usa el catálogo validado en archivos posteriores', async () => {
    await progress.recordValidation(lab, 'practicas', { fileName: 'p', ok: true, errorCount: 0, warningCount: 0 }, { name: 'practicas', codes: ['45'] });
    const id = files.put(parsed('2026-07-15_Facturacion.xlsx', [
      ['Código de práctica', 'Nombre de práctica', 'Código de convenio', 'Nombre de convenio', 'Sede', 'Cantidad facturada', 'Bruto facturado'],
      ['99', 'X', 'C1', 'OSDE', 'Centro', 3, 100],
    ]));
    const out = await runValidation({ files, progress, lab }, { fileId: id });
    if (out.status !== 'validado') throw new Error(out.status);
    expect(out.report.warnings.map((w) => w.rule)).toEqual(['codigo_no_en_catalogo']);
  });

  it('archivo expirado, ambiguo y desconocido', async () => {
    expect((await runValidation({ files, progress, lab }, { fileId: 'f_nada' })).status).toBe('expirado');
    const amb = files.put(parsed('export.csv', [['Código', 'Nombre'], ['1', 'X']]));
    const outAmb = await runValidation({ files, progress, lab }, { fileId: amb });
    expect(outAmb.status).toBe('ambiguo');
    const unk = files.put(parsed('export.csv', [['foo'], ['1']]));
    expect((await runValidation({ files, progress, lab }, { fileId: unk })).status).toBe('desconocido');
    const forced = await runValidation({ files, progress, lab }, { fileId: amb, tipo: 'convenios' });
    expect(forced).toMatchObject({ status: 'validado', report: { schemaId: 'convenios' } });
  });
});

describe('summarizeForModel', () => {
  it('trunca errores y advertencias para el modelo', async () => {
    const rows = [['Nombre completo', 'Email', 'Rol'], ...Array.from({ length: 30 }, () => ['Usuario', '', 'Editor'])];
    const id = files.put(parsed('2026-07-15_Usuarios.xlsx', rows));
    const s = summarizeForModel(await runValidation({ files, progress, lab }, { fileId: id })) as {
      totalErrores: number;
      errores: unknown[];
    };
    expect(s.totalErrores).toBe(30);
    expect(s.errores).toHaveLength(20);
  });
});

describe('herramientas de progreso', () => {
  it('marcar_paso rechaza sin validación OK y acepta con ella', async () => {
    const tools = createProgressTools({ progress, lab });
    const r1 = await tools.marcar_paso.execute!({ paso: 'usuarios' }, opts);
    expect(r1).toMatchObject({ ok: false });
    await progress.recordValidation(lab, 'usuarios', { fileName: 'u', ok: true, errorCount: 0, warningCount: 0 });
    const r2 = await tools.marcar_paso.execute!({ paso: 'usuarios' }, opts);
    expect(r2).toMatchObject({ ok: true, siguiente: { id: 'sedes' } });
  });

  it('ver_progreso devuelve los 14 pasos y el siguiente', async () => {
    const tools = createProgressTools({ progress, lab });
    const r = (await tools.ver_progreso.execute!({}, opts)) as { total: number; siguiente: { id: string } };
    expect(r.total).toBe(14);
    expect(r.siguiente.id).toBe('usuarios');
  });
});
