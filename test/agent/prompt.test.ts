import { describe, expect, it } from 'vitest';
import { buildInstructions } from '@/lib/agent/prompt';
import { STEPS } from '@/lib/onboarding/steps';

describe('buildInstructions', () => {
  it('incluye los 14 pasos, la convención de adjuntos y la skill', () => {
    const s = buildInstructions({ docsAvailable: true, skill: 'GUIA-XYZ' });
    for (const step of STEPS) expect(s).toContain(step.title);
    expect(s).toContain('fileId');
    expect(s).toContain('GUIA-XYZ');
    expect(s).toContain('https://www.optacost.com/docs');
    expect(s).toContain('https://www.optacost.com/docs/onboarding/checklist-datos');
    expect(s).not.toContain('no está disponible');
  });
  it('es genérico para cualquier laboratorio cliente: no nombra a ninguno', () => {
    const s = buildInstructions({ docsAvailable: true });
    expect(s).toContain('laboratorio cliente nuevo');
    expect(s.toLowerCase()).not.toContain('labmedicina');
  });
  it('avisa cuando la documentación no está disponible', () => {
    expect(buildInstructions({ docsAvailable: false })).toContain('no está disponible');
  });
});

describe('prompt: tipo detectado', () => {
  it('explica tipoCorregido y pide no mandar tipo para el paso esperado', () => {
    const p = buildInstructions({ docsAvailable: true });
    expect(p).toContain('tipoCorregido');
    expect(p).toContain('No mandes "tipo" para indicar el paso que esperás');
  });
});
