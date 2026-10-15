import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { ValidationReportCard } from '@/components/validation-report';
import { buildInstructions } from '@/lib/agent/prompt';
import { FileStore } from '@/lib/files/store';
import { ProgressStore } from '@/lib/onboarding/state';
import { createProgressTools } from '@/lib/tools/progress';
import { runValidation, summarizeForModel } from '@/lib/tools/validate';
import { parsed } from '../helpers';

let files: FileStore;
let progress: ProgressStore;
const lab = 'prueba';
const opts = { toolCallId: 't1', messages: [] } as never;
const OS_HDR = ['Código', 'Nombre', 'Valor UB'];

async function validar(fileName: string, rows: unknown[][], tipo?: never) {
  const id = files.put(parsed(fileName, rows as never));
  return runValidation({ files, progress, lab }, { fileId: id, tipo });
}

async function completarObrasSociales() {
  const out = await validar('2026-10-14_ObrasSociales.csv', [OS_HDR, ['OS01', 'OSDE', 1500], ['OS02', 'Swiss', 1400]]);
  expect(out).toMatchObject({ status: 'validado', report: { ok: true } });
  await createProgressTools({ progress, lab }).marcar_paso.execute!({ paso: 'obras_sociales' }, opts);
}

beforeEach(async () => {
  files = new FileStore();
  progress = new ProgressStore();
});

describe('1 · validar no es cargar en Optacost', () => {
  it('las instrucciones prohíben decir que los datos se cargaron en la plataforma', () => {
    const s = buildInstructions({ docsAvailable: true });
    expect(s).toContain('Validar no es cargar');
    expect(s).toMatch(/equipo de Optacost/);
  });

  it('marcar_paso, al completar el último paso, aclara que todavía no se cargó nada', async () => {
    const tools = createProgressTools({ progress, lab });
    const p = await progress.load(lab);
    for (const id of Object.keys(p.steps)) {
      await progress.recordValidation(lab, id as never, { fileName: `${id}.csv`, ok: true, errorCount: 0, warningCount: 0 });
      await tools.marcar_paso.execute!({ paso: id as never }, opts);
    }
    const last = (await tools.marcar_paso.execute!({ paso: 'matching_codigos' }, opts)) as { todosCompletos?: boolean; mensaje: string };
    expect(last.todosCompletos).toBe(true);
    expect(last.mensaje).toMatch(/no se carg/i);
  });
});

describe('2 · un archivo con errores no descompleta un paso completo', () => {
  it('el paso sigue completo con el archivo anterior y se registra el intento fallido', async () => {
    await completarObrasSociales();
    const out = await validar('datos.csv', [['Código', 'Nombre'], ['X1', 'Algo']], 'obras_sociales' as never);
    expect(out).toMatchObject({ status: 'validado', report: { ok: false }, pasoCompleto: { archivo: '2026-10-14_ObrasSociales.csv' } });
    const s = (await progress.load(lab)).steps.obras_sociales;
    expect(s).toMatchObject({ status: 'completo', lastFile: '2026-10-14_ObrasSociales.csv', errors: 0 });
    expect(s.lastAttempt).toMatchObject({ fileName: 'datos.csv', errors: 1 });
  });

  it('el modelo recibe que el paso ya estaba completo y no se reemplazó', async () => {
    await completarObrasSociales();
    const out = await validar('datos.csv', [['Código', 'Nombre'], ['X1', 'Algo']], 'obras_sociales' as never);
    expect(summarizeForModel(out)).toMatchObject({ pasoYaCompleto: { archivoActual: '2026-10-14_ObrasSociales.csv', seReemplaza: false } });
  });
});

describe('3 · reemplazar un paso completo requiere confirmación', () => {
  it('un archivo válido nuevo queda pendiente y no reemplaza al anterior hasta confirmar', async () => {
    await completarObrasSociales();
    const out = await validar('planilla_final.csv', [OS_HDR, ['OS03', 'IOMA', 1300]]);
    expect(out).toMatchObject({ status: 'validado', report: { ok: true } });
    let s = (await progress.load(lab)).steps.obras_sociales;
    expect(s).toMatchObject({ status: 'completo', lastFile: '2026-10-14_ObrasSociales.csv' });
    expect(s.pending).toMatchObject({ fileName: 'planilla_final.csv', rows: 1 });

    const tools = createProgressTools({ progress, lab });
    const sinConfirmar = await tools.marcar_paso.execute!({ paso: 'obras_sociales' }, opts);
    expect(sinConfirmar).toMatchObject({ ok: false });
    expect((await progress.load(lab)).steps.obras_sociales.lastFile).toBe('2026-10-14_ObrasSociales.csv');

    const confirmado = await tools.marcar_paso.execute!({ paso: 'obras_sociales', reemplazar: true }, opts);
    expect(confirmado).toMatchObject({ ok: true });
    s = (await progress.load(lab)).steps.obras_sociales;
    expect(s).toMatchObject({ status: 'completo', lastFile: 'planilla_final.csv', rows: 1 });
    expect(s.pending).toBeUndefined();
  });

  it('avisa qué códigos se pierden si se confirma el reemplazo', async () => {
    await completarObrasSociales();
    const out = await validar('planilla_final.csv', [OS_HDR, ['OS03', 'IOMA', 1300]]);
    expect(summarizeForModel(out)).toMatchObject({
      pasoYaCompleto: { archivoActual: '2026-10-14_ObrasSociales.csv', filasActuales: 2, seReemplaza: false, codigosQueSeQuitan: ['OS01', 'OS02'] },
    });
  });

  it('el catálogo no cambia hasta confirmar el reemplazo', async () => {
    await completarObrasSociales();
    await validar('planilla_final.csv', [OS_HDR, ['OS03', 'IOMA', 1300]]);
    expect([...((await progress.catalogs(lab)).obras_sociales ?? [])]).toEqual(['os01', 'os02']);
  });

  it('módulos por obra social avisa si un encabezado no está en el listado de obras sociales', async () => {
    await completarObrasSociales();
    const out = await validar('2026-10-14_ModulosPorObraSocial.xlsx', [
      ['Código de práctica', 'Descripción de práctica', 'OS01', 'OS09'],
      ['475', 'Glucemia', 3, 2],
    ]);
    if (out.status !== 'validado') throw new Error(out.status);
    const w = out.report.warnings.find((x) => x.rule === 'codigo_no_en_catalogo' && x.value === 'OS09');
    expect(w?.message).toContain('Obras sociales');
  });
});

describe('4 · el usuario no ve instrucciones internas para el modelo', () => {
  it('archivo ambiguo: la tarjeta muestra un aviso para el usuario', async () => {
    const out = await validar('datos.csv', [['Código', 'Nombre'], ['X1', 'Algo']]);
    expect(out.status).toBe('ambiguo');
    const html = renderToStaticMarkup(createElement(ValidationReportCard, { output: out }));
    expect(html).not.toMatch(/Preguntale|volvé a llamar|tipo"/);
    expect(html).toContain('Convenios de derivación');
  });

  it('archivo desconocido y expirado tampoco muestran instrucciones internas', async () => {
    const unk = await validar('x.csv', [['foo'], ['1']]);
    const exp = await runValidation({ files, progress, lab }, { fileId: 'f_nada' });
    for (const out of [unk, exp]) {
      const html = renderToStaticMarkup(createElement(ValidationReportCard, { output: out }));
      expect(html).not.toMatch(/Preguntale|Pedile|volvé a llamar|"tipo"/);
    }
  });
});
