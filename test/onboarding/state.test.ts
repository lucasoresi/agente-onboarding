import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProgress, normalizeProgress, ProgressStore } from '@/lib/onboarding/state';
import { nextPendingStep, progressView } from '@/lib/onboarding/steps';

let store: ProgressStore;
const ok = { fileName: '2026-07-15_Usuarios.xlsx', ok: true, errorCount: 0, warningCount: 1 };
const bad = { fileName: '2026-07-15_Usuarios.xlsx', ok: false, errorCount: 3, warningCount: 0 };

beforeEach(() => {
  store = new ProgressStore({ now: () => new Date('2026-10-09T12:00:00Z') });
});

describe('ProgressStore', () => {
  it('arranca con todos los pasos pendientes', async () => {
    const p = await store.load('labmedicina');
    expect(Object.values(p.steps).every((s) => s.status === 'pendiente')).toBe(true);
    expect(nextPendingStep(p)?.id).toBe('usuarios');
  });

  it('registra validaciones y las devuelve en el snapshot', async () => {
    await store.recordValidation('labmedicina', 'usuarios', bad);
    expect((await store.load('labmedicina')).steps.usuarios).toMatchObject({ status: 'con_errores', errors: 3 });
    await store.recordValidation('labmedicina', 'usuarios', ok);
    const raw = JSON.parse(JSON.stringify(store.snapshot('labmedicina')));
    expect(raw.steps.usuarios).toMatchObject({ status: 'validado', lastFile: ok.fileName, validatedAt: '2026-10-09T12:00:00.000Z' });
  });

  it('marcar completo exige una validación OK', async () => {
    const r1 = await store.markComplete('labmedicina', 'usuarios');
    expect(r1).toMatchObject({ ok: false });
    await store.recordValidation('labmedicina', 'usuarios', bad);
    const r2 = await store.markComplete('labmedicina', 'usuarios');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toContain('3 errores');
    await store.recordValidation('labmedicina', 'usuarios', ok);
    const r3 = await store.markComplete('labmedicina', 'usuarios');
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(nextPendingStep(r3.progress)?.id).toBe('sedes');
  });

  it('revalidar un paso completo lo mantiene completo, con OK o con errores', async () => {
    await store.recordValidation('labmedicina', 'usuarios', ok);
    await store.markComplete('labmedicina', 'usuarios');
    await store.recordValidation('labmedicina', 'usuarios', ok);
    expect((await store.load('labmedicina')).steps.usuarios.status).toBe('completo');
    await store.recordValidation('labmedicina', 'usuarios', bad);
    expect((await store.load('labmedicina')).steps.usuarios.status).toBe('completo');
  });

  it('guarda catálogos solo de validaciones OK', async () => {
    await store.recordValidation('labmedicina', 'practicas', { ...bad, fileName: 'p.xlsx' }, { name: 'practicas', codes: ['1'] });
    expect((await store.catalogs('labmedicina')).practicas).toBeUndefined();
    await store.recordValidation('labmedicina', 'practicas', { ...ok, fileName: 'p.xlsx' }, { name: 'practicas', codes: ['1', '2'] });
    expect([...((await store.catalogs('labmedicina')).practicas ?? [])]).toEqual(['1', '2']);
  });

  it('serializa escrituras concurrentes', async () => {
    await Promise.all([
      store.recordValidation('labmedicina', 'usuarios', ok),
      store.recordValidation('labmedicina', 'sedes', ok),
      store.recordValidation('labmedicina', 'sectores', ok),
    ]);
    const p = await store.load('labmedicina');
    expect([p.steps.usuarios.status, p.steps.sedes.status, p.steps.sectores.status]).toEqual(['validado', 'validado', 'validado']);
  });

  it('rechaza ids de laboratorio inválidos', async () => {
    await expect(store.load('../etc')).rejects.toThrow('inválido');
  });

  it('arranca desde el progreso que manda el navegador y no lo modifica', async () => {
    const initial = emptyProgress('labmedicina');
    initial.steps.usuarios = { status: 'completo', lastFile: 'u.xlsx' };
    const s2 = new ProgressStore({ initial: [initial] });
    await s2.recordValidation('labmedicina', 'sedes', ok);
    expect(s2.snapshot('labmedicina').steps).toMatchObject({ usuarios: { status: 'completo' }, sedes: { status: 'validado' } });
    expect(initial.steps.sedes.status).toBe('pendiente');
  });
});

describe('progressView', () => {
  it('lista los 14 pasos con categoría y conteo', async () => {
    await store.recordValidation('labmedicina', 'usuarios', ok);
    await store.markComplete('labmedicina', 'usuarios');
    const v = progressView(await store.load('labmedicina'));
    expect(v.total).toBe(14);
    expect(v.completos).toBe(1);
    expect(v.pasos[0]).toMatchObject({ id: 'usuarios', categoria: '01', categoriaTitulo: 'Estructura y equipo', estado: 'completo' });
  });
});

describe('normalizeProgress', () => {
  it('cualquier cosa inválida da progreso vacío', () => {
    for (const raw of [undefined, null, 'x', 3, [], { lab: 'otro' }]) {
      expect(normalizeProgress(raw, 'labmedicina')).toEqual(emptyProgress('labmedicina'));
    }
  });

  it('conserva pasos y catálogos válidos e ignora el resto', () => {
    const p = normalizeProgress(
      {
        lab: 'labmedicina',
        steps: { usuarios: { status: 'completo', lastFile: 'u.xlsx' }, sedes: { status: 'raro' }, inventado: { status: 'completo' } },
        catalogs: { practicas: ['1', '2'], insumos: [1], otro: ['x'] },
      },
      'labmedicina',
    );
    expect(p.steps.usuarios).toEqual({ status: 'completo', lastFile: 'u.xlsx' });
    expect(p.steps.sedes.status).toBe('pendiente');
    expect('inventado' in p.steps).toBe(false);
    expect(p.catalogs).toEqual({ practicas: ['1', '2'] });
  });
});
